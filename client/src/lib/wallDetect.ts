/**
 * Wall / assembly-type auto-detection from a vector PDF floor plan.
 *
 * Life Safety drawings draw each assembly type as a thick, saturated-color line
 * over the thin black+gray architecture. The exact colors vary per drawing, so
 * the inspector calibrates once per project (tap a line for each type, or mark
 * N/A). Dropping an icon then reads the color — and, when two types share a
 * color, the LINE STYLE (solid vs dashed) — of the nearest calibrated wall line
 * and assigns the matching assembly type. When two calibrated lines run parallel
 * the higher-precedence type wins (see ASSEMBLY_PRECEDENCE in inspectionRules).
 *
 * Line style: these drawings encode dashes as many short broken segments (not a
 * PDF dash array), so "dashed vs solid" is read from geometry — the fraction of
 * the line that's inked vs gapped near the point.
 *
 * Coordinate space: everything is PERCENT (0-100) of the page, the same space
 * DoorPin.x / DoorPin.y use, so a pin and a stroke are directly comparable.
 */
import * as pdfjsLib from 'pdfjs-dist';
import { ASSEMBLY_PRECEDENCE } from './inspectionRules';

export type RGB = [number, number, number];
export type LineStyle = 'solid' | 'dashed';

export interface WallStroke {
  rgb: RGB;
  width: number;
  // Straight segments in percent coords: each [x1, y1, x2, y2]. Segments do NOT
  // cross subpath (moveTo) breaks, so dash gaps stay gaps.
  segments: number[][];
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY] percent
}

// A chromatic stroke only (drops black/gray/white architecture in one test).
const SATURATION_MIN = 40;
const MAX_SEGMENTS = 120000;

// Line-style (coverage) tuning, in percent of page.
const COVERAGE_W_PCT = 0.7;     // half-window sampled along the line
const COVERAGE_PERP_PCT = 0.12; // how close a segment must be to count as "this line"

// ── affine matrix helpers (pdfjs Util.transform convention) ──────────────────
type Mat = number[];
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
function saturation(rgb: RGB): number { return Math.max(...rgb) - Math.min(...rgb); }
export function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
// distance² from point to segment
function distSqToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}
function ccw(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}
// Do segments AB and CD intersect?
function segsIntersect(a: number[], b: number[]): boolean {
  const [ax, ay, bx, by] = a, [cx, cy, dx, dy] = b;
  const d1 = ccw(cx, cy, dx, dy, ax, ay), d2 = ccw(cx, cy, dx, dy, bx, by);
  const d3 = ccw(ax, ay, bx, by, cx, cy), d4 = ccw(ax, ay, bx, by, dx, dy);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
// min distance² between two segments (0 if they cross).
function segSegMinDistSq(a: number[], b: number[]): number {
  if (segsIntersect(a, b)) return 0;
  return Math.min(
    distSqToSeg(a[0], a[1], b[0], b[1], b[2], b[3]),
    distSqToSeg(a[2], a[3], b[0], b[1], b[2], b[3]),
    distSqToSeg(b[0], b[1], a[0], a[1], a[2], a[3]),
    distSqToSeg(b[2], b[3], a[0], a[1], a[2], a[3]),
  );
}

/**
 * Extract saturated (assembly-type) wall strokes from one PDF page, in percent
 * coordinates, preserving per-segment structure. [] for a non-vector page or on
 * error — the caller then falls back to manual assembly-type selection.
 */
export async function extractWallStrokes(page: any): Promise<WallStroke[]> {
  const OPS = pdfjsLib.OPS;
  try {
    const viewport = page.getViewport({ scale: 1 });
    const vp = viewport.transform as Mat;
    const W = viewport.width, H = viewport.height;
    const opList = await page.getOperatorList();

    const strokes: WallStroke[] = [];
    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const stack: Mat[] = [];
    let color: RGB = [0, 0, 0];
    let width = 1;
    let subpaths: Array<Array<[number, number]>> = []; // page-user space
    let segCount = 0;

    const STROKE_PAINT = new Set<number>([
      OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke,
      OPS.closeFillStroke, OPS.closeEOFillStroke,
    ]);

    const emit = () => {
      if (saturation(color) < SATURATION_MIN || segCount >= MAX_SEGMENTS) { subpaths = []; return; }
      const full = matMul(vp, ctm);
      const segments: number[][] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const sp of subpaths) {
        // Map each subpath's points to percent, then connect consecutive ones.
        const pts: Array<[number, number]> = sp.map(([px, py]) => {
          const [dx, dy] = apply(full, px, py);
          const xPct = (dx / W) * 100, yPct = (dy / H) * 100;
          if (xPct < minX) minX = xPct; if (xPct > maxX) maxX = xPct;
          if (yPct < minY) minY = yPct; if (yPct > maxY) maxY = yPct;
          return [xPct, yPct];
        });
        for (let i = 0; i + 1 < pts.length; i++) {
          segments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
        }
      }
      subpaths = [];
      if (segments.length === 0) return;
      segCount += segments.length;
      strokes.push({ rgb: color, width, segments, bbox: [minX, minY, maxX, maxY] });
    };

    const addPath = (args: any) => {
      const ops: number[] = args[0];
      const co: number[] = args[1];
      let c = 0;
      let cur: Array<[number, number]> | null = null;
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = [[co[c], co[c + 1]]]; subpaths.push(cur); c += 2; }
        else if (op === OPS.lineTo) { if (!cur) { cur = []; subpaths.push(cur); } cur.push([co[c], co[c + 1]]); c += 2; }
        else if (op === OPS.curveTo) { if (cur) cur.push([co[c + 4], co[c + 5]]); c += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { if (cur) cur.push([co[c + 2], co[c + 3]]); c += 4; }
        else if (op === OPS.rectangle) {
          const x = co[c], y = co[c + 1], w = co[c + 2], h = co[c + 3];
          subpaths.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]); c += 4;
        } else if (op === OPS.closePath) { /* leave as-is */ }
      }
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
          ]; break;
        }
        case OPS.constructPath: addPath(args); break;
        case OPS.endPath: subpaths = []; break;
        default:
          if (STROKE_PAINT.has(fn)) emit();
          else if (fn === OPS.fill || fn === OPS.eoFill) subpaths = [];
      }
    }
    return strokes;
  } catch {
    return [];
  }
}

// nearest matched-color info at a point (percent), within radius.
export function nearestWallColorAt(
  strokes: WallStroke[], xPct: number, yPct: number, radiusPct: number
): { rgb: RGB; dist: number; width: number } | null {
  const r2 = radiusPct * radiusPct;
  let best: { rgb: RGB; dist: number; width: number } | null = null;
  for (const s of strokes) {
    if (xPct < s.bbox[0] - radiusPct || xPct > s.bbox[2] + radiusPct ||
        yPct < s.bbox[1] - radiusPct || yPct > s.bbox[3] + radiusPct) continue;
    for (const g of s.segments) {
      const d2 = distSqToSeg(xPct, yPct, g[0], g[1], g[2], g[3]);
      if (d2 <= r2 && (!best || d2 < best.dist * best.dist)) {
        best = { rgb: s.rgb, dist: Math.sqrt(d2), width: s.width };
      }
    }
  }
  return best;
}

/**
 * Read the line style (solid vs dashed) of the matched-color wall at a point.
 * Projects nearby same-color segments onto the local line direction and measures
 * inked coverage vs the line's extent: ~1.0 = solid, ~0.5 = dashed. 'unknown'
 * when there isn't enough to tell.
 */
export function styleAt(
  strokes: WallStroke[], rgb: RGB, xPct: number, yPct: number, tolerance: number
): LineStyle | 'unknown' {
  const W = COVERAGE_W_PCT, PERP = COVERAGE_PERP_PCT;
  const matched: number[][] = [];
  let nd = Infinity, dir: [number, number] | null = null;
  for (const s of strokes) {
    if (rgbDistance(s.rgb, rgb) > tolerance) continue;
    if (s.bbox[0] > xPct + W || s.bbox[2] < xPct - W || s.bbox[1] > yPct + W || s.bbox[3] < yPct - W) continue;
    for (const g of s.segments) {
      matched.push(g);
      const d = distSqToSeg(xPct, yPct, g[0], g[1], g[2], g[3]);
      if (d < nd) {
        nd = d;
        const dx = g[2] - g[0], dy = g[3] - g[1], L = Math.hypot(dx, dy) || 1;
        dir = [dx / L, dy / L];
      }
    }
  }
  if (!dir || matched.length < 2) return 'unknown';
  const perp: [number, number] = [-dir[1], dir[0]];
  const intervals: Array<[number, number]> = [];
  for (const g of matched) {
    const ta = (g[0] - xPct) * dir[0] + (g[1] - yPct) * dir[1];
    const pa = (g[0] - xPct) * perp[0] + (g[1] - yPct) * perp[1];
    const tb = (g[2] - xPct) * dir[0] + (g[3] - yPct) * dir[1];
    const pb = (g[2] - xPct) * perp[0] + (g[3] - yPct) * perp[1];
    if (Math.abs(pa) > PERP && Math.abs(pb) > PERP) continue; // not on this line
    const lo = Math.max(Math.min(ta, tb), -W);
    const hi = Math.min(Math.max(ta, tb), W);
    if (hi > lo) intervals.push([lo, hi]);
  }
  if (intervals.length < 1) return 'unknown';
  intervals.sort((a, b) => a[0] - b[0]);
  let unionLen = 0, curLo = intervals[0][0], curHi = intervals[0][1];
  let minT = intervals[0][0], maxT = intervals[0][1];
  for (let i = 1; i < intervals.length; i++) {
    const [lo, hi] = intervals[i];
    maxT = Math.max(maxT, hi);
    if (lo > curHi) { unionLen += curHi - curLo; curLo = lo; curHi = hi; }
    else curHi = Math.max(curHi, hi);
  }
  unionLen += curHi - curLo;
  const extent = maxT - minT;
  if (extent < 0.15) return 'unknown'; // too little of the line to judge
  const cov = unionLen / extent;
  if (cov >= 0.8) return 'solid';
  if (cov <= 0.7) return 'dashed';
  return 'unknown';
}

// ── calibration ──────────────────────────────────────────────────────────────

export type CalibrationEntry = { rgb: RGB; width: number; style?: LineStyle } | 'na';
export interface ProjectCalibration {
  types: Record<string, CalibrationEntry>;
  calibrated: boolean;
}
export interface WallPick { rgb: RGB; style: LineStyle | 'unknown'; }

export function emptyCalibration(): ProjectCalibration {
  return { types: {}, calibrated: false };
}

const CAL_KEY = (project: string) => `wallCalibration:${project}`;
export function loadCalibration(project: string): ProjectCalibration {
  if (!project) return emptyCalibration();
  try {
    const raw = localStorage.getItem(CAL_KEY(project));
    if (!raw) return emptyCalibration();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.types) return parsed as ProjectCalibration;
    return emptyCalibration();
  } catch { return emptyCalibration(); }
}
export function saveCalibration(project: string, cal: ProjectCalibration): void {
  if (!project) return;
  try { localStorage.setItem(CAL_KEY(project), JSON.stringify(cal)); } catch { /* ignore */ }
}

// All calibrated types whose color is within tolerance of rgb (ignores N/A).
function calibratedTypesForColor(rgb: RGB, cal: ProjectCalibration, tolerance: number): string[] {
  const out: string[] = [];
  for (const [type, entry] of Object.entries(cal.types)) {
    if (entry === 'na') continue;
    if (rgbDistance(rgb, entry.rgb) <= tolerance) out.push(type);
  }
  return out;
}

/** Back-compat single-color match (nearest calibrated color within tolerance). */
export function matchCalibratedType(rgb: RGB, cal: ProjectCalibration, tolerance: number): string | null {
  let best: string | null = null, bestDist = Infinity;
  for (const [type, entry] of Object.entries(cal.types)) {
    if (entry === 'na') continue;
    const d = rgbDistance(rgb, entry.rgb);
    if (d <= tolerance && d < bestDist) { bestDist = d; best = type; }
  }
  return best;
}

const PRECEDENCE_INDEX: Record<string, number> =
  Object.fromEntries(ASSEMBLY_PRECEDENCE.map((t, i) => [t, i]));

/**
 * Auto-detect the assembly type for a dropped pin. A door icon is a balloon
 * whose tip is at (xPct, yPct) and whose body sits ABOVE the tip — and doors
 * sit in the GAP of a wall, so the tip often lands in the opening while the
 * balloon body covers the wall line. So detection considers every calibrated
 * line touching the whole balloon footprint (the capsule from the tip up to the
 * head, when headOffsetPct is given), not just the tip point. Each line resolves
 * to a type by color (a shared color disambiguated by line style); of the types
 * touched, the highest-precedence wins (fire beats smoke). null when nothing
 * calibrated is close enough, or a shared color's style can't be read.
 */
export function detectAssemblyType(
  strokes: WallStroke[],
  xPct: number, yPct: number,
  cal: ProjectCalibration,
  opts: { radiusPct: number; tolerance: number; headOffsetPct?: number }
): string | null {
  if (!cal.calibrated) return null;
  const r = opts.radiusPct, r2 = r * r;
  const useCapsule = !!opts.headOffsetPct && opts.headOffsetPct > 0;
  const headY = yPct - (opts.headOffsetPct || 0);
  const axis = [xPct, yPct, xPct, headY]; // balloon centerline (tip → head)
  const midY = (yPct + headY) / 2;
  // bbox window covering the whole balloon.
  const boxTop = Math.min(yPct, headY) - r, boxBot = Math.max(yPct, headY) + r;

  const found = new Set<string>();
  // Best (lowest) precedence index among touched same-color lines we could NOT
  // resolve (style unreadable). Used as a safeguard below.
  let bestUnresolvedIdx = Infinity;

  for (const s of strokes) {
    if (saturation(s.rgb) < SATURATION_MIN) continue;
    if (xPct < s.bbox[0] - r || xPct > s.bbox[2] + r || boxBot < s.bbox[1] || boxTop > s.bbox[3]) continue;
    let near = false;
    for (const g of s.segments) {
      const d2 = useCapsule ? segSegMinDistSq(g, axis) : distSqToSeg(xPct, yPct, g[0], g[1], g[2], g[3]);
      if (d2 <= r2) { near = true; break; }
    }
    if (!near) continue;
    const matches = calibratedTypesForColor(s.rgb, cal, opts.tolerance);
    if (matches.length === 0) continue;
    if (matches.length === 1) { found.add(matches[0]); continue; }
    // Same color → disambiguate by line style. Read at a few points across the
    // balloon (head, tip, middle) and take the majority — more robust at door
    // openings where the line is broken.
    const reads = useCapsule
      ? [styleAt(strokes, s.rgb, xPct, headY, opts.tolerance),
         styleAt(strokes, s.rgb, xPct, yPct, opts.tolerance),
         styleAt(strokes, s.rgb, xPct, midY, opts.tolerance)]
      : [styleAt(strokes, s.rgb, xPct, yPct, opts.tolerance)];
    const dashed = reads.filter((v) => v === 'dashed').length;
    const solid = reads.filter((v) => v === 'solid').length;
    const st = dashed > solid ? 'dashed' : solid > dashed ? 'solid' : 'unknown';
    if (st === 'unknown') {
      // Couldn't tell which of the same-color types — remember its best possible
      // precedence so we don't hand the pin to a strictly lower-priority line.
      const bi = Math.min(...matches.map((t) => PRECEDENCE_INDEX[t] ?? Infinity));
      if (bi < bestUnresolvedIdx) bestUnresolvedIdx = bi;
      continue;
    }
    const pick = matches.find((t) => {
      const e = cal.types[t];
      return e !== 'na' && e.style === st;
    });
    if (pick) found.add(pick);
  }
  if (found.size === 0) return null;
  let winner: string | null = null, bestIdx = Infinity;
  Array.from(found).forEach((t) => {
    const idx = PRECEDENCE_INDEX[t] ?? Infinity;
    if (idx < bestIdx) { bestIdx = idx; winner = t; }
  });
  // Safeguard: a touched same-color line we couldn't resolve could outrank the
  // winner (e.g. a Smoke Barrier we read as "unknown" vs a Suite Perimeter we
  // did resolve). Rather than assign the lower-priority type, leave it blank.
  if (bestUnresolvedIdx < bestIdx) return null;
  return winner;
}

/**
 * Diagnostic: what did the balloon touch, and what did we choose? Enable on
 * device with `localStorage.detectDebug = '1'` and watch the console on drop.
 * Helps tune adjacency cases (e.g. a pin that reads Smoke Partition when the
 * nearby Smoke Barrier was intended).
 */
export function explainDetection(
  strokes: WallStroke[],
  xPct: number, yPct: number,
  cal: ProjectCalibration,
  opts: { radiusPct: number; tolerance: number; headOffsetPct?: number }
): { chosen: string | null; touched: { rgb: RGB; type: string | null; style?: LineStyle | 'unknown' }[] } {
  const chosen = detectAssemblyType(strokes, xPct, yPct, cal, opts);
  const r2 = opts.radiusPct * opts.radiusPct;
  const useCapsule = !!opts.headOffsetPct && opts.headOffsetPct > 0;
  const headY = yPct - (opts.headOffsetPct || 0);
  const axis = [xPct, yPct, xPct, headY];
  const touched: { rgb: RGB; type: string | null; style?: LineStyle | 'unknown' }[] = [];
  const seen = new Set<string>();
  for (const s of strokes) {
    if (saturation(s.rgb) < SATURATION_MIN) continue;
    let near = false;
    for (const g of s.segments) {
      const d2 = useCapsule ? segSegMinDistSq(g, axis) : distSqToSeg(xPct, yPct, g[0], g[1], g[2], g[3]);
      if (d2 <= r2) { near = true; break; }
    }
    if (!near) continue;
    const key = s.rgb.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const matches = calibratedTypesForColor(s.rgb, cal, opts.tolerance);
    let type: string | null = matches.length === 1 ? matches[0] : null;
    let style: LineStyle | 'unknown' | undefined;
    if (matches.length > 1) {
      style = styleAt(strokes, s.rgb, xPct, useCapsule ? headY : yPct, opts.tolerance);
      type = matches.find((t) => { const e = cal.types[t]; return e !== 'na' && e.style === style; }) || null;
    }
    touched.push({ rgb: s.rgb, type, style });
  }
  return { chosen, touched };
}

// Default tuning (overridable from ConfigTab later).
export const DEFAULT_RADIUS_PCT = 1.2;
export const DEFAULT_TOLERANCE = 60;
