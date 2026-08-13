import { DoorPin } from '@/types';
import { initials, cell, buildCsvText, downloadCsv } from './fieldwireCsv';
import { recordYear } from './inspectionYear';

/**
 * Export completed inspections as a Fieldwire-style file the Codify Reporting
 * Tool can ingest: UTF-16 LE, tab-separated, with a 4-line preamble and one
 * row per door. Deficiencies go in `Checklist N` columns as
 *   Yes: <Category>: <Detail> (INITIALS) - YYYY-MM-DD
 * See the Reporting Tool's pipelines/fire_smoke_doors.py for the contract.
 * Shared UTF-16/tab primitives live in fieldwireCsv.ts (also used by ceilingExport.ts).
 */

// App assembly-type code -> Reporting Tool Category string (note: no "Barrier").
const CATEGORY_MAP: Record<string, string> = {
  '3hr_fire': '3-Hour Fire',
  '2hr_fire': '2-Hour Fire',
  '1hr_fire': '1-Hour Fire',
  '1hr_partition': '1-Hour Partition',
  'smoke_barrier': 'Smoke Barrier',
  'smoke_partition': 'Smoke Partition',
  'suite_perimeter': 'Suite Perimeter',
};

function mapRating(r: string | undefined): string {
  if (!r) return '';
  if (r === '0') return 'Non-Rated';
  if (r === 'label_illegible') return ''; // unknown rating; label deficiency carries it
  if (/^\d+$/.test(r)) return `${r} Minute`;
  return '';
}

function mapStatus(overall: string | undefined, hasRecord: boolean): string {
  if (!hasRecord) return 'Not Inspected';
  if (overall === 'fail') return 'Fail';
  if (overall === 'pass' || overall === 'conditional') return 'Pass';
  // 'inaccessible' (and any unknown status) report as Not Inspected — the door
  // was reached but couldn't be evaluated, so it isn't a pass or a fail.
  return 'Not Inspected';
}

const defsOf = (rec: any): any[] =>
  (rec?.deficiencies || []).filter((d: any) => d && (d.status === 'deficient' || d.status === 'advisory'));

/** The door CSV as text. Split out from the download so the app-to-report
 *  contract can be asserted in a test: the columns here are read by name in
 *  pipelines/fire_smoke_doors.py, and four of them went missing for months
 *  without either side erroring. See fieldwireExport.test.ts. */
export function buildFieldwireCsvText(): string {
  const pins = Object.values(
    JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
  ).flat() as DoorPin[];
  const allRecords: any[] = JSON.parse(localStorage.getItem('doorInspections') || '[]');

  // All records per pin, across years, oldest -> newest. Door records only.
  const historyByPin = new Map<string, any[]>();
  for (const r of allRecords) {
    if (!r || !r.pinId || r.inspectionType === 'above_below_ceiling') continue;
    const arr = historyByPin.get(r.pinId) || [];
    arr.push(r);
    historyByPin.set(r.pinId, arr);
  }
  for (const arr of Array.from(historyByPin.values())) {
    arr.sort((a, b) =>
      recordYear(a) - recordYear(b) ||
      new Date(a.completedTime || 0).getTime() - new Date(b.completedTime || 0).getTime());
  }

  // Build one row object per pin.
  const rows = pins.map((pin: any) => {
    const history = historyByPin.get(pin.id) || [];
    const rec = history[history.length - 1]; // latest year = current inspection
    const curYear = rec ? recordYear(rec) : 0;
    const ini = initials(rec?.inspectorName);
    const date = rec?.completedTime
      ? new Date(rec.completedTime).toISOString().slice(0, 10)
      : '';
    // Current-year deficiencies -> Checklist columns (as before).
    const checklist = defsOf(rec).map(
      (d) => `Yes: ${cell(d.deficiency || d.text)} (${ini}) - ${date}`
    );

    // Prior-year audit log -> Message columns, in chronological order so the
    // Reporting Tool tags them historical. Each prior-year deficiency/comment
    // becomes an author-prefixed note; a single "Changed status to Prior Year
    // Deficiency" marker follows them (the cycle boundary the pipeline keys on,
    // and the has_prior_year_status signal), then the current-year comment.
    // See pipelines/fire_smoke_doors.py (_second_to_last_terminal_status_index,
    // _has_prior_year_status).
    const priorRecs = history.slice(0, -1).filter((r) => recordYear(r) < curYear);
    const historicalNotes: string[] = [];
    for (const pr of priorRecs) {
      const author = cell(pr.inspectorName) || 'Inspector';
      const yr = recordYear(pr);
      for (const d of defsOf(pr)) {
        historicalNotes.push(`${author}: [${yr}] ${cell(d.deficiency || d.text)}`);
      }
      if (pr.additionalComments) {
        historicalNotes.push(`${author}: [${yr}] ${cell(pr.additionalComments)}`);
      }
    }
    const hasPrior = historicalNotes.length > 0;
    const resetAuthor = cell(rec?.inspectorName) || 'Inspector';
    const currentComment = rec?.additionalComments
      ? `${resetAuthor}: ${cell(rec.additionalComments)}`
      : '';

    const messages: string[] = [
      ...historicalNotes,
      ...(hasPrior ? [`${resetAuthor}: Changed status to Prior Year Deficiency`] : []),
      ...(currentComment ? [currentComment] : []),
    ];

    // Plan + X/Y drive the auto-grid overlay on the drawings appendix and the
    // grid_block fill (app.py's apply_grids block for doors; pipelines/
    // fire_smoke_doors.py reads "Plan", "X pos (%)", "Y pos (%)"). Doors were
    // the ONLY service line not emitting them, so every door parsed with
    // x_pct/y_pct None, _tasks_by_plan came out empty, apply_grids never ran,
    // and any door whose Grid Block the inspector did not type by hand had no
    // location in the report and no fallback. damperExport.ts and
    // ceilingExport.ts are the reference; keep the three in step.
    const x = rec?.x ?? pin.x;
    const y = rec?.y ?? pin.y;

    return {
      ID: cell(rec?.iconNo || pin.iconNo),
      Status: mapStatus(rec?.overallStatus, !!rec),
      Category: rec ? CATEGORY_MAP[rec.assemblyType] || '' : '',
      Assignee: cell(rec?.inspectorName),
      Plan: cell(rec?.floorNo),
      'X pos (%)': x == null ? '' : String(x),
      'Y pos (%)': y == null ? '' : String(y),
      Floor: cell(rec?.floorNo),
      'Grid Block': cell(rec?.gridBlock || pin.gridBlock),
      'Asset ID': cell(rec?.assetId || pin.assetId),
      'Door Rating': mapRating(rec?.doorRating),
      // Read by Post-Repair Mode (pipelines/fire_smoke_doors.py "Last Updated").
      'Last Updated': cell(rec?.completedTime),
      checklist,
      messages,
    };
  });

  const maxDefs = Math.max(1, ...rows.map((r) => r.checklist.length));
  const maxMsgs = Math.max(0, ...rows.map((r) => r.messages.length));

  // Column ORDER is cosmetic — every parser looks cells up by header name — but
  // it is kept aligned with damperExport/ceilingExport so the three exports read
  // the same way side by side.
  const baseCols = [
    'ID', 'Status', 'Category', 'Assignee', 'Plan', 'X pos (%)', 'Y pos (%)',
    'Floor', 'Grid Block', 'Asset ID', 'Door Rating', 'Last Updated',
  ];
  const checklistCols = Array.from({ length: maxDefs }, (_, i) => `Checklist ${i + 1}`);
  const messageCols = Array.from({ length: maxMsgs }, (_, i) => `Message ${i + 1}`);
  const header = [...baseCols, ...checklistCols, ...messageCols];

  const dataLines = rows.map((r) => {
    const base = baseCols.map((c) => (r as any)[c] ?? '');
    const checks = Array.from({ length: maxDefs }, (_, i) => r.checklist[i] || '');
    const msgs = Array.from({ length: maxMsgs }, (_, i) => r.messages[i] || '');
    return [...base, ...checks, ...msgs].join('\t');
  });

  const facility = localStorage.getItem('activeProject') || '';
  return buildCsvText(facility, header, dataLines);
}

/** Build the door CSV and hand it to the browser as a download. */
export function exportFieldwireCsv(): void {
  const content = buildFieldwireCsvText();
  downloadCsv(content, `codify_fieldwire_export_${new Date().toISOString().split('T')[0]}.csv`);
}
