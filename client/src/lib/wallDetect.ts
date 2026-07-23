/**
 * Wall / assembly-type auto-detection from a vector PDF floor plan.
 *
 * Life Safety drawings draw each assembly type as a thick, saturated-color
 * line (red / green / blue / orange) over the thin black+gray architecture.
 * The exact colors vary per drawing, so the inspector calibrates once per
 * project (tap a line for each type, or mark it N/A). After that, dropping an
 * icon reads the color of the nearest calibrated wall line and assigns the
 * matching assembly type — and when two calibrated lines run parallel, the
 * higher-precedence type wins (see ASSEMBLY_PRECEDENCE in inspectionRules.ts).
 *
 * Coordinate space: strokes are normalized to PERCENT (0–100) of the page, the
 * same space DoorPin.x / DoorPin.y use, so a pin and a stroke are directly
 * comparable regardless of zoom.
 */
import * as pdfjsLib from 'pdfjs-dist';
import { ASSEMBLY_PRECEDENCE } from './inspectionRules';

export type RGB = [number, number, number];

export interface WallStroke {
  rgb: RGB;
  width: number; // stroke line width in page units (rough; metadata only)
  points: number[]; // flattened [x0,y0,x1,y1,...] in percent (0–100)
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY] percent
}

// A stroke only counts as an assembly-type line if its color is clearly
// chromatic — this drops the black/gray/white architecture in one test
// (grays have max(rgb) - min(rgb) ≈ 0).
const SATURATION_MIN = 40; // 0–255
// Cap so a pathological page can't exhaust memory. Saturated strokes are a
// small fraction of the total, so this is generous.
const MAX_STROKES = 40000;

// ── affine matrix helpers (same convention as pdfjs Util.transform) ──────────
type Mat = number[]; // [a, b, c, d, e, f]
function matMul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}
function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function saturation(rgb: RGB): number {
  return Math.max(...rgb) - Math.min(...rgb);
}

export function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Extract the saturated (assembly-type) wall strokes from one PDF page, in
 * percent coordinates. Returns [] for a non-vector page or on any error — the
 * caller then simply falls back to manual assembly-type selection.
 */
export async function extractWallStrokes(page: any): Promise<WallStroke[]> {
  const OPS = pdfjsLib.OPS;
  try {
    const viewport = page.getViewport({ scale: 1 });
    const vp = viewport.transform as Mat; // PDF user space → device (scale 1)
    const W = viewport.width;
    const H = viewport.height;
    const opList = await page.getOperatorList();

    const strokes: WallStroke[] = [];
    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const stack: Mat[] = [];
    let color: RGB = [0, 0, 0];
    let width = 1;
    let path: Array<[number, number]> = []; // current path points, page-user space

    const STROKE_PAINT = new Set<number>([
      OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke,
      OPS.closeFillStroke, OPS.closeEOFillStroke,
    ]);

    const emit = () => {
      if (path.length < 2) { path = []; return; }
      if (saturation(color) < SATURATION_MIN) { path = []; return; }
      if (strokes.length >= MAX_STROKES) { path = []; return; }
      // Map path points → device (scale-1) → percent of page.
      const full = matMul(vp, ctm);
      const pts: number[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [px, py] of path) {
        const [dx, dy] = apply(full, px, py);
        const xPct = (dx / W) * 100;
        const yPct = (dy / H) * 100;
        pts.push(xPct, yPct);
        if (xPct < minX) minX = xPct; if (xPct > maxX) maxX = xPct;
        if (yPct < minY) minY = yPct; if (yPct > maxY) maxY = yPct;
      }
      strokes.push({ rgb: color, width, points: pts, bbox: [minX, minY, maxX, maxY] });
      path = [];
    };

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];
      switch (fn) {
        case OPS.save: stack.push(ctm.slice()); break;
        case OPS.restore: if (stack.length) ctm = stack.pop() as Mat; break;
        case OPS.transform: ctm = matMul(ctm, args as Mat); break;
        case OPS.setLineWidth: width = args[0]; break;
        case OPS.setStrokeRGBColor: color = [args[0], args[1], args[2]]; break;
        case OPS.setStrokeGray: { const v = Math.round(args[0] * 255); color = [v, v, v]; break; }
        case OPS.setStrokeCMYKColor: {
          const [c, m, y, k] = args as number[];
          color = [
            Math.round(255 * (1 - c) * (1 - k)),
            Math.round(255 * (1 - m) * (1 - k)),
            Math.round(255 * (1 - y) * (1 - k)),
          ];
          break;
        }
        case OPS.constructPath: appendPath(path, args, OPS); break;
        case OPS.endPath: path = []; break;
        default:
          if (STROKE_PAINT.has(fn)) emit();
          else if (fn === OPS.fill || fn === OPS.eoFill) path = []; // fills aren't wall lines
      }
    }
    return strokes;
  } catch {
    return [];
  }
}

// Append the endpoints of a constructPath op to the running path (page-user
// space). We keep line endpoints and curve endpoints — enough for a
// point-to-polyline distance test; we don't need full curve fidelity.
function appendPath(path: Array<[number, number]>, args: any, OPS: any) {
  const opsArr: number[] = args[0];
  const coords: number[] = args[1];
  let c = 0;
  for (const op of opsArr) {
    switch (op) {
      case OPS.moveTo:
      case OPS.lineTo:
        path.push([coords[c], coords[c + 1]]); c += 2; break;
      case OPS.curveTo:
        path.push([coords[c + 4], coords[c + 5]]); c += 6; break;
      case OPS.curveTo2:
      case OPS.curveTo3:
        path.push([coords[c + 2], coords[c + 3]]); c += 4; break;
      case OPS.rectangle: {
        const x = coords[c], y = coords[c + 1], w = coords[c + 2], h = coords[c + 3];
        path.push([x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]); c += 4; break;
      }
      case OPS.closePath: break;
      default: break; // unknown segment op — stop consuming to stay aligned
    }
  }
}

// distance² from point (px,py) to segment (ax,ay)-(bx,by)
function distSqToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** Nearest saturated stroke to a point, within radius (all in percent). */
export function nearestWallColorAt(
  strokes: WallStroke[], xPct: number, yPct: number, radiusPct: number
): { rgb: RGB; dist: number; width: number } | null {
  const r2 = radiusPct * radiusPct;
  let best: { rgb: RGB; dist: number; width: number } | null = null;
  for (const s of strokes) {
    // bbox reject (expanded by radius)
    if (xPct < s.bbox[0] - radiusPct || xPct > s.bbox[2] + radiusPct ||
        yPct < s.bbox[1] - radiusPct || yPct > s.bbox[3] + radiusPct) continue;
    const p = s.points;
    let md2 = Infinity;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const d2 = distSqToSeg(xPct, yPct, p[i], p[i + 1], p[i + 2], p[i + 3]);
      if (d2 < md2) md2 = d2;
    }
    if (md2 <= r2 && (!best || md2 < best.dist * best.dist)) {
      best = { rgb: s.rgb, dist: Math.sqrt(md2), width: s.width };
    }
  }
  return best;
}

// ── calibration types + matching ─────────────────────────────────────────────

export type CalibrationEntry = { rgb: RGB; width: number } | 'na';
export interface ProjectCalibration {
  types: Record<string, CalibrationEntry>; // assembly-type key → color or 'na'
  calibrated: boolean;
}

export function emptyCalibration(): ProjectCalibration {
  return { types: {}, calibrated: false };
}

// Per-project calibration persistence. Keyed by project name so each drawing's
// color→type map is independent. Local-first; a cloud mirror can come later.
const CAL_KEY = (project: string) => `wallCalibration:${project}`;

export function loadCalibration(project: string): ProjectCalibration {
  if (!project) return emptyCalibration();
  try {
    const raw = localStorage.getItem(CAL_KEY(project));
    if (!raw) return emptyCalibration();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.types) return parsed as ProjectCalibration;
    return emptyCalibration();
  } catch {
    return emptyCalibration();
  }
}

export function saveCalibration(project: string, cal: ProjectCalibration): void {
  if (!project) return;
  try {
    localStorage.setItem(CAL_KEY(project), JSON.stringify(cal));
  } catch { /* ignore quota/serialize errors */ }
}

/** The calibrated assembly-type whose color is closest to `rgb`, within
 *  tolerance. Ignores N/A entries. */
export function matchCalibratedType(
  rgb: RGB, cal: ProjectCalibration, tolerance: number
): string | null {
  let bestType: string | null = null;
  let bestDist = Infinity;
  for (const [type, entry] of Object.entries(cal.types)) {
    if (entry === 'na') continue;
    const d = rgbDistance(rgb, entry.rgb);
    if (d <= tolerance && d < bestDist) { bestDist = d; bestType = type; }
  }
  return bestType;
}

const PRECEDENCE_INDEX: Record<string, number> =
  Object.fromEntries(ASSEMBLY_PRECEDENCE.map((t, i) => [t, i]));

/**
 * Auto-detect the assembly type for a dropped pin. Looks at every calibrated
 * wall line within `radiusPct` of the drop point; of the types found, returns
 * the highest-precedence one (fire beats smoke for parallel runs). Returns null
 * when nothing calibrated is close enough — the inspector then picks manually.
 */
export function detectAssemblyType(
  strokes: WallStroke[],
  xPct: number, yPct: number,
  cal: ProjectCalibration,
  opts: { radiusPct: number; tolerance: number }
): string | null {
  if (!cal.calibrated) return null;
  const r2 = opts.radiusPct * opts.radiusPct;
  const found = new Set<string>();
  for (const s of strokes) {
    if (saturation(s.rgb) < SATURATION_MIN) continue;
    if (xPct < s.bbox[0] - opts.radiusPct || xPct > s.bbox[2] + opts.radiusPct ||
        yPct < s.bbox[1] - opts.radiusPct || yPct > s.bbox[3] + opts.radiusPct) continue;
    const p = s.points;
    let md2 = Infinity;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const d2 = distSqToSeg(xPct, yPct, p[i], p[i + 1], p[i + 2], p[i + 3]);
      if (d2 < md2) md2 = d2;
    }
    if (md2 > r2) continue;
    const t = matchCalibratedType(s.rgb, cal, opts.tolerance);
    if (t) found.add(t);
  }
  if (found.size === 0) return null;
  // Highest precedence = lowest index.
  let winner: string | null = null;
  let bestIdx = Infinity;
  Array.from(found).forEach((t) => {
    const idx = PRECEDENCE_INDEX[t] ?? Infinity;
    if (idx < bestIdx) { bestIdx = idx; winner = t; }
  });
  return winner;
}

// Default tuning (overridable from ConfigTab later).
export const DEFAULT_RADIUS_PCT = 1.2;
export const DEFAULT_TOLERANCE = 60;
