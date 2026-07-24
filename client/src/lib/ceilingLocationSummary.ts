// App-generated Location Summary PDF for Above & Below Ceiling inspections.
//
// Purpose: produce the SAME PDF shape Fieldwire exports, so it drops into the
// Reporting Tool's existing merge (builders/pdf_merge.py) with no changes. That
// merge classifies pages by geometry:
//   - portrait, letter-size pages that start with a "#N -" header  → Inspection
//     Photos (the FIRST portrait page is always dropped as the cover)
//   - landscape / large-format pages                               → Inspection
//     Drawings (appended at the end)
// So this builder emits: [cover] + [one portrait page per icon, "#N -" header +
// photos] + [the project's plan drawing pages]. Mini-maps and pins-drawn-on-the
// -plan are deliberately NOT in this first version (the merge doesn't need them;
// they're a later cosmetic pass).

import { PDFDocument, PDFFont, PDFImage, StandardFonts, rgb } from 'pdf-lib';
import { getSupabaseConfig, downloadPlanPDF } from './supabase';

const PAGE_W = 612; // US letter portrait, points
const PAGE_H = 792;
const MARGIN = 44;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface CeilingRec {
  iconNo?: string;
  floorNo?: string;
  gridBlock?: string;
  category?: string;
  finding?: string;
  priority?: string;
  inspectorName?: string;
  projectName?: string;
  photos?: string[];
  additionalComments?: string;
  inspectionType?: string;
  completedTime?: string;
}

// ── IndexedDB plan cache (mirrors App.tsx's store) ──────────────────────────
function idbPlanFiles(project: string): Promise<File[]> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('codify_floorplan', 1);
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const store = db.transaction('files', 'readonly').objectStore('files');
          const get = store.get(`floorplans__${project}`);
          get.onsuccess = () => {
            const rec = get.result;
            const files = (rec?.files || []).map((f: any) => f.file).filter(Boolean);
            resolve(files);
          };
          get.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      };
    } catch {
      resolve([]);
    }
  });
}

// Load the project's plan PDF bytes: local IndexedDB first, cloud fallback.
async function loadPlanBytes(project: string): Promise<Uint8Array[]> {
  const files = await idbPlanFiles(project);
  if (files.length > 0) {
    return Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  }
  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.key && navigator.onLine) {
    const blob = await downloadPlanPDF(cfg, project);
    if (blob) return [new Uint8Array(await blob.arrayBuffer())];
  }
  return [];
}

// Embed a photo (http(s) or data: URL) into the doc. Returns null on failure.
async function embedPhoto(doc: PDFDocument, url: string): Promise<PDFImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await doc.embedJpg(bytes); // JPEG
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await doc.embedPng(bytes); // PNG
    try { return await doc.embedJpg(bytes); } catch { /* fall through */ }
    try { return await doc.embedPng(bytes); } catch { return null; }
  } catch {
    return null;
  }
}

// Wrap text to a width, returning lines.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Generate and download the ceiling Location Summary PDF for a project. */
export async function generateCeilingLocationSummary(
  projectName: string,
  records: CeilingRec[],
): Promise<{ ok: boolean; icons: number; photos: number; drawings: number; message?: string }> {
  const recs = records
    .filter((r) => r && r.finding)
    .slice()
    .sort((a, b) => (Number(a.iconNo) || 0) - (Number(b.iconNo) || 0));

  if (recs.length === 0) {
    return { ok: false, icons: 0, photos: 0, drawings: 0, message: 'No ceiling findings to export.' };
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.1, 0.1, 0.1);

  const created = new Date().toLocaleDateString();

  // ── Cover page (portrait; the merge drops the first portrait page) ─────────
  {
    const p = doc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 120;
    p.drawText(projectName || 'Facility', { x: MARGIN, y, size: 20, font: bold, color: dark });
    y -= 30;
    p.drawText('Above & Below Ceiling Location Summary', { x: MARGIN, y, size: 15, font, color: dark });
    y -= 40;
    p.drawText(`Created: ${created}`, { x: MARGIN, y, size: 11, font, color: gray });
    y -= 18;
    p.drawText(`Findings: ${recs.length}`, { x: MARGIN, y, size: 11, font, color: gray });
    y -= 40;
    for (const line of wrapText(
      'Use this location summary alongside the ceiling inspection report to locate icons of interest.',
      font, 11, CONTENT_W,
    )) { p.drawText(line, { x: MARGIN, y, size: 11, font, color: gray }); y -= 16; }
  }

  // ── Per-icon photo pages ───────────────────────────────────────────────────
  let photoCount = 0;
  for (const r of recs) {
    const icon = r.iconNo || '—';
    const images: PDFImage[] = [];
    for (const url of r.photos || []) {
      const img = await embedPhoto(doc, url);
      if (img) images.push(img);
    }
    photoCount += images.length;

    // Page a header + attribute block, then flow photos (4 per page, 2x2). Extra
    // photos spill onto continuation pages that keep the "#N -" header so the
    // merge still files them under this icon.
    const perPage = 4;
    const chunks: PDFImage[][] = [];
    if (images.length === 0) chunks.push([]);
    for (let i = 0; i < images.length; i += perPage) chunks.push(images.slice(i, i + perPage));

    chunks.forEach((chunk, pageIdx) => {
      const p = doc.addPage([PAGE_W, PAGE_H]);
      let y = PAGE_H - MARGIN;

      // "#N -" header is REQUIRED — the Reporting Tool parses the icon number
      // from it and links the report's camera icons to this page.
      const header = pageIdx === 0 ? `#${icon} - Icon No.` : `#${icon} - Icon No. (cont.)`;
      p.drawText(header, { x: MARGIN, y, size: 15, font: bold, color: dark });
      y -= 22;

      if (pageIdx === 0) {
        const sub = [r.priority, r.inspectorName, r.category].filter(Boolean).join('  |  ');
        p.drawText(sub, { x: MARGIN, y, size: 10, font, color: gray });
        y -= 22;
        const attrs = [
          `Plan: ${r.floorNo || '—'}`,
          `Tags: #above_below_ceiling_checklist`,
          `Floor: ${r.floorNo || '—'}`,
          `Asset ID: ${icon}`,
          `Grid Block: ${r.gridBlock || '—'}`,
        ];
        for (const a of attrs) { p.drawText(a, { x: MARGIN, y, size: 10, font, color: dark }); y -= 15; }
        y -= 4;
        for (const line of wrapText(`Finding: ${r.finding || ''}`, font, 10, CONTENT_W)) {
          p.drawText(line, { x: MARGIN, y, size: 10, font, color: dark }); y -= 14;
        }
        if (r.additionalComments) {
          for (const line of wrapText(`Comment: ${r.additionalComments}`, font, 10, CONTENT_W)) {
            p.drawText(line, { x: MARGIN, y, size: 10, font, color: gray }); y -= 14;
          }
        }
        y -= 6;
        p.drawText('Photos', { x: MARGIN, y, size: 11, font: bold, color: dark }); y -= 4;
        p.drawText(String(images.length), { x: MARGIN, y: y - 10, size: 10, font, color: gray });
        y -= 22;
      }

      // 2-column photo grid in the remaining space.
      if (chunk.length > 0) {
        const gap = 12;
        const cellW = (CONTENT_W - gap) / 2;
        const cellH = (y - MARGIN - gap) / 2;
        chunk.forEach((img, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cx = MARGIN + col * (cellW + gap);
          const cyTop = y - row * (cellH + gap);
          const scale = Math.min(cellW / img.width, cellH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          p.drawImage(img, { x: cx + (cellW - w) / 2, y: cyTop - h, width: w, height: h });
        });
      }

      p.drawText(
        `Above & Below Ceiling Location Summary  ·  Icon #${icon}`,
        { x: MARGIN, y: 24, size: 8, font, color: gray },
      );
    });
  }

  // ── Append plan drawing pages (landscape / large-format only) ──────────────
  let drawingCount = 0;
  const planBytesList = await loadPlanBytes(projectName);
  for (const bytes of planBytesList) {
    try {
      const src = await PDFDocument.load(bytes);
      const indices = src.getPageIndices();
      // Only copy pages that will classify as "drawings" in the merge: landscape
      // (w>h) or larger than letter (>990pt). Skips portrait letter sheets (e.g.
      // a title page) that would otherwise be mis-filed as photo pages.
      const keep = indices.filter((i) => {
        const { width, height } = src.getPage(i).getSize();
        return width > height || Math.max(width, height) > 990;
      });
      if (keep.length === 0) continue;
      const copied = await doc.copyPages(src, keep);
      copied.forEach((pg) => { doc.addPage(pg); drawingCount++; });
    } catch {
      /* skip an unreadable plan file */
    }
  }

  const out = await doc.save();
  const blob = new Blob([out], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `codify_ceiling_location_summary_${new Date().toISOString().split('T')[0]}.pdf`;
  a.click();
  URL.revokeObjectURL(url);

  const message = drawingCount === 0
    ? 'Generated photo pages, but no plan drawing pages were found to append (upload/keep the plan for this project to include drawings).'
    : undefined;
  return { ok: true, icons: recs.length, photos: photoCount, drawings: drawingCount, message };
}
