import { DoorPin, CeilingInspection } from '@/types';
import { initials, cell, isoDate, buildCsvText, downloadCsv } from './fieldwireCsv';

/**
 * Export Above & Below Ceiling findings as a Fieldwire-format CSV the Codify
 * Reporting Tool ingests (service line: above_below_ceiling). Contract lives in
 * the Reporting Tool's pipelines/above_below_ceiling.py:
 *   - UTF-16 LE, tab-separated, 4-line preamble (banner/facility/timestamp/header).
 *   - Required columns: ID, Status, Category, Floor, Grid Block.
 *   - Status holds a PRIORITY label ("Priority 2"), not pass/fail.
 *   - Exactly ONE Checklist column per icon: "Yes: <Category>: <Detail> (INI) - DATE".
 *   - Message columns hold the surveyor comment and photo =HYPERLINK(...) cells.
 *   - X pos (%) / Y pos (%) let the tool auto-compute Grid Block, so X/Y is enough.
 *
 * Ceiling records live in the SAME localStorage key as door records
 * ('doorInspections'); we filter by inspectionType + project so a door export
 * and a ceiling export never mix. One reportable row per RECORDED pin — there is
 * no pass/fail here, so pins with no finding are simply not exported.
 */
export function exportCeilingCsv(projectName?: string): void {
  const project = projectName || localStorage.getItem('activeProject') || '';

  const pins = Object.values(
    JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
  ).flat() as DoorPin[];
  const pinById = new Map(pins.map((p) => [p.id, p]));

  const allRecords: any[] = JSON.parse(localStorage.getItem('doorInspections') || '[]');

  // Ceiling records for THIS project only. Keep the latest per pin.
  const latestByPin = new Map<string, CeilingInspection>();
  for (const r of allRecords) {
    if (!r || r.inspectionType !== 'above_below_ceiling') continue;
    if (project && r.projectName !== project) continue;
    if (!r.finding) continue; // no finding chosen -> nothing reportable
    const key = r.pinId || r.id;
    const cur = latestByPin.get(key);
    if (!cur || new Date(r.completedTime) > new Date(cur.completedTime)) {
      latestByPin.set(key, r);
    }
  }

  // Build one row per recorded pin.
  const rows = Array.from(latestByPin.values()).map((rec) => {
    const pin = rec.pinId ? pinById.get(rec.pinId) : undefined;
    const ini = initials(rec.inspectorName);
    const date = isoDate(rec.completedTime);
    const checklist = `Yes: ${cell(rec.category)}: ${cell(rec.finding)} (${ini}) - ${date}`;

    // First message = surveyor comment; remaining = one photo hyperlink each.
    // Only remote (http) photo URLs become =HYPERLINK cells — offline data: URLs
    // are skipped (they carry no linkable URL and would bloat the file); they get
    // swapped for remote URLs by flushPendingPhotos once back online.
    const messages: string[] = [];
    if (rec.additionalComments && rec.additionalComments.trim()) {
      messages.push(`${cell(rec.inspectorName)}: ${cell(rec.additionalComments)}`);
    }
    for (const p of rec.photos || []) {
      if (typeof p === 'string' && /^https?:\/\//i.test(p)) {
        messages.push(`=HYPERLINK("${p}")`);
      }
    }

    const x = rec.x ?? (pin as any)?.x;
    const y = rec.y ?? (pin as any)?.y;

    return {
      ID: cell(rec.iconNo || pin?.iconNo),
      Title: `${cell(rec.category)}: ${cell(rec.finding)}`,
      Status: cell(rec.priority),
      Category: cell(rec.category),
      Assignee: cell(rec.inspectorName),
      Plan: cell(rec.floorNo),
      'X pos (%)': x == null ? '' : String(x),
      'Y pos (%)': y == null ? '' : String(y),
      Floor: cell(rec.floorNo),
      'Grid Block': cell(rec.gridBlock),
      'Last Updated': cell(rec.completedTime),
      checklist,
      messages,
    };
  });

  const maxMessages = rows.reduce((m, r) => Math.max(m, r.messages.length), 0);

  const baseCols = [
    'ID', 'Title', 'Status', 'Category', 'Assignee', 'Plan',
    'X pos (%)', 'Y pos (%)', 'Floor', 'Grid Block', 'Last Updated',
  ];
  const messageCols = Array.from({ length: maxMessages }, (_, i) => `Message ${i + 1}`);
  const header = [...baseCols, 'Checklist 1', ...messageCols];

  const dataLines = rows.map((r) => {
    const base = baseCols.map((c) => (r as any)[c] ?? '');
    const msgs = Array.from({ length: maxMessages }, (_, i) => r.messages[i] || '');
    return [...base, r.checklist, ...msgs].join('\t');
  });

  const content = buildCsvText(project, header, dataLines);
  downloadCsv(content, `codify_ceiling_export_${new Date().toISOString().split('T')[0]}.csv`);
}
