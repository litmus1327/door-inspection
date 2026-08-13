import { DoorPin, DamperInspection } from '@/types';
import { initials, cell, isoDate, buildCsvText, downloadCsv } from './fieldwireCsv';
import { recordYear } from './inspectionYear';

/**
 * Export Fire & Smoke Damper findings as a Fieldwire-format CSV the Reporting
 * Tool ingests (pipelines/dampers.py). Contract:
 *   - UTF-16 LE, tab-separated, 4-line preamble.
 *   - Required columns: ID, Status, Category.
 *   - Status is Pass / Fail / Inaccessible; Category is Fire / Smoke / Combination.
 *   - Deficiencies are FLAT sentences (no "Category:" prefix) in Checklist cells:
 *       "Yes: <sentence>. (INI) - DATE"
 *   - "No Damper Present" has its own column.
 *   - Messages carry the surveyor comment and photo =HYPERLINK(...) cells.
 *
 * Damper records share the `doorInspections` localStorage key; we filter by
 * inspectionType + project. Latest record per pin (by year, then time).
 */
export function exportDamperCsv(projectName?: string): void {
  const project = projectName || localStorage.getItem('activeProject') || '';

  const pins = Object.values(
    JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
  ).flat() as DoorPin[];
  const pinById = new Map(pins.map((p) => [p.id, p]));

  const allRecords: any[] = JSON.parse(localStorage.getItem('doorInspections') || '[]');

  // Latest damper record per pin for THIS project.
  const latestByPin = new Map<string, DamperInspection>();
  for (const r of allRecords) {
    if (!r || r.inspectionType !== 'fire_smoke_damper') continue;
    if (project && r.projectName !== project) continue;
    const key = r.pinId || r.id;
    const cur = latestByPin.get(key);
    const newer = !cur ||
      recordYear(r) > recordYear(cur) ||
      (recordYear(r) === recordYear(cur) && new Date(r.completedTime) > new Date(cur.completedTime));
    if (newer) latestByPin.set(key, r);
  }

  // 'No Damper' is not one of the three inspection outcomes; it says no damper
  // exists at the location. See DamperStatus in lib/damperChecklist.ts. The
  // Reporting Tool does not canonicalise this value yet, so such a row parses
  // with an unrecognised status and is left uncoloured in the Excel sibling
  // (builders/excel_report_damper._status_fill returns None) rather than being
  // counted as a passing damper. Visibly odd beats invisibly wrong.
  const STATUS_LABEL: Record<string, string> = {
    pass: 'Pass',
    fail: 'Fail',
    inaccessible: 'Inaccessible',
    no_damper: 'No Damper',
  };

  const rows = Array.from(latestByPin.values()).map((rec) => {
    const pin = rec.pinId ? pinById.get(rec.pinId) : undefined;
    const ini = initials(rec.inspectorName);
    const date = isoDate(rec.completedTime);

    // One "Yes:" checklist cell per deficiency (flat sentence, no category prefix).
    const checklist = (rec.deficiencies || []).map((d) => `Yes: ${cell(d)} (${ini}) - ${date}`);

    const messages: string[] = [];
    if (rec.additionalComments && rec.additionalComments.trim()) {
      messages.push(`${cell(rec.inspectorName)}: ${cell(rec.additionalComments)}`);
    }
    for (const p of rec.photos || []) {
      if (typeof p === 'string' && /^https?:\/\//i.test(p)) messages.push(`=HYPERLINK("${p}")`);
    }

    const x = rec.x ?? (pin as any)?.x;
    const y = rec.y ?? (pin as any)?.y;

    return {
      ID: cell(rec.iconNo || pin?.iconNo),
      Title: 'Icon No.',
      // Derived from the flag, not the stored status, because records saved by
      // an older build carry `status: 'pass'` alongside `noDamperPresent: true`
      // and are already on devices and in the cloud. The exporter is the one
      // choke point every data path passes through, so fixing it here closes
      // the finding for history as well as for new saves.
      //
      // Never default to Pass either: a record whose status is absent,
      // misspelled, or written by a different build must not be exported as a
      // passing damper. fieldwireExport.mapStatus makes the same safe choice.
      Status: rec.noDamperPresent
        ? STATUS_LABEL.no_damper
        : (STATUS_LABEL[rec.status] || 'Not Inspected'),
      Category: cell(rec.category),
      Assignee: cell(rec.inspectorName),
      Plan: cell(rec.floorNo),
      'X pos (%)': x == null ? '' : String(x),
      'Y pos (%)': y == null ? '' : String(y),
      Floor: cell(rec.floorNo),
      'Grid Block': cell(rec.gridBlock),
      'Asset ID': cell(rec.assetId),
      'No Damper Present': rec.noDamperPresent ? 'Yes' : '',
      'Last Updated': cell(rec.completedTime),
      checklist,
      messages,
    };
  });

  const maxChecks = Math.max(1, ...rows.map((r) => r.checklist.length));
  const maxMsgs = Math.max(0, ...rows.map((r) => r.messages.length));

  const baseCols = [
    'ID', 'Title', 'Status', 'Category', 'Assignee', 'Plan',
    'X pos (%)', 'Y pos (%)', 'Floor', 'Grid Block', 'Asset ID',
    'No Damper Present', 'Last Updated',
  ];
  const checklistCols = Array.from({ length: maxChecks }, (_, i) => `Checklist ${i + 1}`);
  const messageCols = Array.from({ length: maxMsgs }, (_, i) => `Message ${i + 1}`);
  const header = [...baseCols, ...checklistCols, ...messageCols];

  const dataLines = rows.map((r) => {
    const base = baseCols.map((c) => (r as any)[c] ?? '');
    const checks = Array.from({ length: maxChecks }, (_, i) => r.checklist[i] || '');
    const msgs = Array.from({ length: maxMsgs }, (_, i) => r.messages[i] || '');
    return [...base, ...checks, ...msgs].join('\t');
  });

  const content = buildCsvText(project, header, dataLines);
  downloadCsv(content, `codify_damper_export_${new Date().toISOString().split('T')[0]}.csv`);
}
