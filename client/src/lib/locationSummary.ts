// Shared Location Summary PDF generator for non-door service lines (ceiling,
// damper). Produces the SAME shape Fieldwire exports so it drops into the
// Reporting Tool's builders/pdf_merge.py unchanged: a cover (dropped as the
// first portrait), one portrait page per icon (a "#N -" header + mini-map +
// photos), then the plan drawing pages with pin markers drawn on them. Markers
// and mini-maps are vector graphics on the real plan pages (pdf-lib), so the
// drawings stay crisp. Ceiling/damper wrappers pass a LocationSummaryConfig.

import { PDFDocument, PDFPage, PDFEmbeddedPage, PDFFont, PDFImage, StandardFonts, rgb } from 'pdf-lib';
import { getSupabaseConfig, downloadPlanPDF } from './supabase';
import { DoorPin } from '@/types';

const PAGE_W = 612; // US letter portrait, points
const PAGE_H = 792;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface LocationSummaryRec {
  iconNo?: string;
  floorNo?: string;
  gridBlock?: string;
  inspectorName?: string;
  photos?: string[];
  additionalComments?: string;
  completedTime?: string;
  pinId?: string;
  x?: number;
  y?: number;
  [k: string]: any;
}

export interface LocationSummaryConfig {
  title: string;             // e.g. "Damper Location Summary"
  itemLabel: string;         // cover count label, e.g. "Dampers"
  tag: string;               // e.g. "#damper_checklist"
  filenamePrefix: string;    // e.g. "codify_damper_location_summary"
  coverBlurb: string;
  subheader: (rec: LocationSummaryRec) => string;   // "Status | Inspector | Category"
  detailLines: (rec: LocationSummaryRec) => string[]; // e.g. ["Deficiencies:", " - ..."]
  markerColor: (rec: LocationSummaryRec) => [number, number, number];
}

export interface LocationSummaryResult {
  ok: boolean; icons: number; photos: number; drawings: number; message?: string;
}

// ── IndexedDB plan cache (mirrors App.tsx's store) ──────────────────────────
function idbPlanFiles(project: string): Promise<File[]> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('codify_floorplan', 1);
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        try {
          const store = req.result.transaction('files', 'readonly').objectStore('files');
          const get = store.get(`floorplans__${project}`);
          get.onsuccess = () => resolve((get.result?.files || []).map((f: any) => f.file).filter(Boolean));
          get.onerror = () => resolve([]);
        } catch { resolve([]); }
      };
    } catch { resolve([]); }
  });
}

async function loadPlanBytes(project: string): Promise<Uint8Array[]> {
  const files = await idbPlanFiles(project);
  if (files.length > 0) return Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.key && navigator.onLine) {
    const blob = await downloadPlanPDF(cfg, project);
    if (blob) return [new Uint8Array(await blob.arrayBuffer())];
  }
  return [];
}

async function embedPhoto(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes);
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes);
    try { return await doc.embedJpg(bytes); } catch { /* fall through */ }
    try { return await doc.embedPng(bytes); } catch { return null; }
  } catch { return null; }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines;
}

// Map a pin's (xPct,yPct) — percent from the DISPLAYED page's top-left — to a
// point in the page's unrotated user space (origin bottom-left).
export function pinToUserSpace(W: number, H: number, rotation: number, xPct: number, yPct: number) {
  const a = ((rotation % 360) + 360) % 360;
  const dispW = a % 180 === 0 ? W : H;
  const dispH = a % 180 === 0 ? H : W;
  const Dx = (xPct / 100) * dispW;
  const DyBL = dispH - (yPct / 100) * dispH;
  switch (a) {
    case 90: return { x: W - DyBL, y: Dx };
    case 180: return { x: W - Dx, y: H - DyBL };
    case 270: return { x: DyBL, y: H - Dx };
    default: return { x: Dx, y: DyBL };
  }
}

function drawMarker(page: PDFPage, x: number, y: number, radius: number, color: [number, number, number], label: string, font: PDFFont) {
  page.drawCircle({ x, y, size: radius, color: rgb(...color), borderColor: rgb(1, 1, 1), borderWidth: Math.max(1, radius * 0.15) });
  const size = radius * 1.1;
  const tw = font.widthOfTextAtSize(label, size);
  page.drawText(label, { x: x - tw / 2, y: y - size / 2.6, size, font, color: rgb(1, 1, 1) });
}

export async function generateLocationSummary(
  projectName: string,
  records: LocationSummaryRec[],
  cfg: LocationSummaryConfig,
): Promise<LocationSummaryResult> {
  const recs = records.slice().sort((a, b) => (Number(a.iconNo) || 0) - (Number(b.iconNo) || 0));
  if (recs.length === 0) return { ok: false, icons: 0, photos: 0, drawings: 0, message: 'Nothing to export.' };

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.1, 0.1, 0.1);
  const created = new Date().toLocaleDateString();

  const allPins = Object.values(JSON.parse(localStorage.getItem('floorPlanPins') || '{}')).flat() as DoorPin[];
  const projectPins = allPins.filter((p) => p.projectName === projectName);
  const pinById = new Map(projectPins.map((p) => [p.id, p]));
  const pinsByGlobalPage = new Map<number, DoorPin[]>();
  for (const p of projectPins) {
    const g = p.pageNumber || 1;
    const arr = pinsByGlobalPage.get(g) || []; arr.push(p); pinsByGlobalPage.set(g, arr);
  }

  const planBytesList = await loadPlanBytes(projectName);
  const planDocs: { doc: PDFDocument; offset: number; count: number }[] = [];
  let offset = 0;
  for (const bytes of planBytesList) {
    try {
      const d = await PDFDocument.load(bytes);
      const count = d.getPageCount();
      planDocs.push({ doc: d, offset, count });
      offset += count;
    } catch { /* skip unreadable plan */ }
  }
  const resolveGlobalPage = (globalPage: number) => {
    for (const pd of planDocs) {
      if (globalPage > pd.offset && globalPage <= pd.offset + pd.count) {
        return { doc: pd.doc, localIndex: globalPage - pd.offset - 1 };
      }
    }
    return null;
  };
  const embeddedCache = new Map<string, PDFEmbeddedPage>();
  const embedPlanPage = async (srcDoc: PDFDocument, localIndex: number): Promise<PDFEmbeddedPage | null> => {
    const k = `${planDocs.findIndex((p) => p.doc === srcDoc)}:${localIndex}`;
    if (embeddedCache.has(k)) return embeddedCache.get(k)!;
    try {
      const [embedded] = await doc.embedPdf(await srcDoc.save(), [localIndex]);
      embeddedCache.set(k, embedded);
      return embedded;
    } catch { return null; }
  };

  // ── Cover page (dropped by the merge as the first portrait) ────────────────
  {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 120;
    p.drawText(projectName || 'Facility', { x: MARGIN, y, size: 20, font: bold, color: dark }); y -= 30;
    p.drawText(cfg.title, { x: MARGIN, y, size: 15, font, color: dark }); y -= 40;
    p.drawText(`Created: ${created}`, { x: MARGIN, y, size: 11, font, color: gray }); y -= 18;
    p.drawText(`${cfg.itemLabel}: ${recs.length}`, { x: MARGIN, y, size: 11, font, color: gray }); y -= 40;
    for (const line of wrapText(cfg.coverBlurb, font, 11, CONTENT_W)) {
      p.drawText(line, { x: MARGIN, y, size: 11, font, color: gray }); y -= 16;
    }
  }

  // ── Per-icon photo pages (with mini-map) ───────────────────────────────────
  let photoCount = 0;
  for (const r of recs) {
    const icon = r.iconNo || '—';
    const images: PDFImage[] = [];
    for (const url of r.photos || []) { const img = await embedPhoto(doc, url); if (img) images.push(img); }
    photoCount += images.length;

    const perPage = 4;
    const chunks: PDFImage[][] = [];
    if (images.length === 0) chunks.push([]);
    for (let i = 0; i < images.length; i += perPage) chunks.push(images.slice(i, i + perPage));

    for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
      const chunk = chunks[pageIdx];
      const p = doc.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - MARGIN;

      p.drawText(pageIdx === 0 ? `#${icon} - Icon No.` : `#${icon} - Icon No. (cont.)`,
        { x: MARGIN, y, size: 15, font: bold, color: dark });
      y -= 22;

      if (pageIdx === 0) {
        p.drawText(cfg.subheader(r), { x: MARGIN, y, size: 10, font, color: gray });
        y -= 20;

        const pin = r.pinId ? pinById.get(r.pinId) : undefined;
        const xPct = r.x ?? (pin as any)?.x;
        const yPct = r.y ?? (pin as any)?.y;
        const globalPage = pin?.pageNumber || 1;
        const resolved = resolveGlobalPage(globalPage);
        const mapDrawn = resolved && typeof xPct === 'number' && typeof yPct === 'number';
        if (mapDrawn) {
          const embedded = await embedPlanPage(resolved!.doc, resolved!.localIndex);
          if (embedded) {
            const boxW = 210, boxH = 150;
            const boxX = PAGE_W - MARGIN - boxW, boxY = y - boxH + 6;
            const scale = Math.min(boxW / embedded.width, boxH / embedded.height);
            const dw = embedded.width * scale, dh = embedded.height * scale;
            const dx = boxX + (boxW - dw) / 2, dy = boxY + (boxH - dh) / 2;
            p.drawRectangle({ x: dx, y: dy, width: dw, height: dh, borderColor: gray, borderWidth: 0.5 });
            p.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
            const mkX = dx + (xPct / 100) * dw;
            const mkY = dy + dh - (yPct / 100) * dh;
            drawMarker(p, mkX, mkY, 6, cfg.markerColor(r), icon, font);
            p.drawText('Location', { x: dx, y: dy - 11, size: 7, font, color: gray });
          }
        }

        const attrMaxW = mapDrawn ? CONTENT_W - 230 : CONTENT_W;
        for (const a of [
          `Plan: ${r.floorNo || '—'}`, `Tags: ${cfg.tag}`,
          `Floor: ${r.floorNo || '—'}`, `Asset ID: ${r.assetId || icon}`, `Grid Block: ${r.gridBlock || '—'}`,
        ]) { p.drawText(a, { x: MARGIN, y, size: 10, font, color: dark }); y -= 15; }
        y -= 4;
        for (const detail of cfg.detailLines(r)) {
          for (const line of wrapText(detail, font, 10, attrMaxW)) {
            p.drawText(line, { x: MARGIN, y, size: 10, font, color: dark }); y -= 14;
          }
        }
        if (r.additionalComments) {
          for (const line of wrapText(`Comment: ${r.additionalComments}`, font, 10, attrMaxW)) {
            p.drawText(line, { x: MARGIN, y, size: 10, font, color: gray }); y -= 14;
          }
        }
        y = Math.min(y, PAGE_H - MARGIN - 22 - 20 - 156);
        y -= 6;
        p.drawText('Photos', { x: MARGIN, y, size: 11, font: bold, color: dark });
        p.drawText(String(images.length), { x: MARGIN + 50, y, size: 10, font, color: gray });
        y -= 18;
      }

      if (chunk.length > 0) {
        const gap = 12;
        const cellW = (CONTENT_W - gap) / 2;
        const cellH = (y - MARGIN - gap) / 2;
        chunk.forEach((img, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const cx = MARGIN + col * (cellW + gap);
          const cyTop = y - row * (cellH + gap);
          const scale = Math.min(cellW / img.width, cellH / img.height);
          const w = img.width * scale, h = img.height * scale;
          p.drawImage(img, { x: cx + (cellW - w) / 2, y: cyTop - h, width: w, height: h });
        });
      }

      p.drawText(`${cfg.title}  ·  Icon #${icon}`, { x: MARGIN, y: 24, size: 8, font, color: gray });
    }
  }

  // ── Append plan drawing pages with pin markers ─────────────────────────────
  let drawingCount = 0;
  for (const pd of planDocs) {
    for (let i = 0; i < pd.count; i++) {
      const src = pd.doc.getPage(i);
      const { width, height } = src.getSize();
      const rotation = src.getRotation().angle || 0;
      const dispW = rotation % 180 === 0 ? width : height;
      const dispH = rotation % 180 === 0 ? height : width;
      const isDrawing = dispW > dispH || Math.max(width, height) > 990;
      if (!isDrawing) continue;

      const [copied] = await doc.copyPages(pd.doc, [i]);
      doc.addPage(copied);
      drawingCount++;

      const globalPage = pd.offset + i + 1;
      const pins = pinsByGlobalPage.get(globalPage) || [];
      const markerR = Math.max(10, Math.min(width, height) * 0.012);
      for (const pin of pins) {
        const xPct = (pin as any).x, yPct = (pin as any).y;
        if (typeof xPct !== 'number' || typeof yPct !== 'number') continue;
        const { x, y } = pinToUserSpace(width, height, rotation, xPct, yPct);
        drawMarker(copied, x, y, markerR, [0.86, 0.15, 0.15], pin.iconNo || '•', bold);
      }
    }
  }

  const out = await doc.save();
  const blob = new Blob([out], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cfg.filenamePrefix}_${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  const message = drawingCount === 0
    ? 'Generated photo pages, but no plan drawing pages were found to append.'
    : undefined;
  return { ok: true, icons: recs.length, photos: photoCount, drawings: drawingCount, message };
}
