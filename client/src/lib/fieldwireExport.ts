import { DoorPin } from '@/types';
import { initials, cell, buildCsvText, downloadCsv } from './fieldwireCsv';

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

export function exportFieldwireCsv() {
  const pins = Object.values(
    JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
  ).flat() as DoorPin[];
  const allRecords: any[] = JSON.parse(localStorage.getItem('doorInspections') || '[]');

  // Latest record per pin.
  const latestByPin = new Map<string, any>();
  for (const r of allRecords) {
    if (!r || !r.pinId) continue;
    const cur = latestByPin.get(r.pinId);
    if (!cur || new Date(r.completedTime) > new Date(cur.completedTime)) {
      latestByPin.set(r.pinId, r);
    }
  }

  // Build one row object per pin.
  const rows = pins.map((pin: any) => {
    const rec = latestByPin.get(pin.id);
    const defs: any[] = (rec?.deficiencies || []).filter(
      (d: any) => d && (d.status === 'deficient' || d.status === 'advisory')
    );
    const ini = initials(rec?.inspectorName);
    const date = rec?.completedTime
      ? new Date(rec.completedTime).toISOString().slice(0, 10)
      : '';
    const checklist = defs.map(
      (d) => `Yes: ${cell(d.deficiency || d.text)} (${ini}) - ${date}`
    );
    return {
      ID: cell(rec?.iconNo || pin.iconNo),
      Status: mapStatus(rec?.overallStatus, !!rec),
      Category: rec ? CATEGORY_MAP[rec.assemblyType] || '' : '',
      Assignee: cell(rec?.inspectorName),
      Floor: cell(rec?.floorNo),
      'Grid Block': cell(rec?.gridBlock || pin.gridBlock),
      'Asset ID': cell(rec?.assetId || pin.assetId),
      'Door Rating': mapRating(rec?.doorRating),
      checklist,
      comment: rec?.additionalComments
        ? `${cell(rec.inspectorName)}: ${cell(rec.additionalComments)}`
        : '',
    };
  });

  const maxDefs = Math.max(1, ...rows.map((r) => r.checklist.length));
  const anyComment = rows.some((r) => r.comment);

  const baseCols = ['ID', 'Status', 'Category', 'Assignee', 'Floor', 'Grid Block', 'Asset ID', 'Door Rating'];
  const checklistCols = Array.from({ length: maxDefs }, (_, i) => `Checklist ${i + 1}`);
  const header = [...baseCols, ...checklistCols, ...(anyComment ? ['Message 1'] : [])];

  const dataLines = rows.map((r) => {
    const base = baseCols.map((c) => (r as any)[c] ?? '');
    const checks = Array.from({ length: maxDefs }, (_, i) => r.checklist[i] || '');
    const msg = anyComment ? [r.comment] : [];
    return [...base, ...checks, ...msg].join('\t');
  });

  const facility = localStorage.getItem('activeProject') || '';
  const content = buildCsvText(facility, header, dataLines);
  downloadCsv(content, `codify_fieldwire_export_${new Date().toISOString().split('T')[0]}.csv`);
}
