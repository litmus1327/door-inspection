// The app-to-report contract for the door CSV.
//
// These columns are read BY NAME in the Reporting Tool
// (pipelines/fire_smoke_doors.py `_cell(row, header_index, "...")`). Nothing
// errors when one goes missing: the CSV still parses, the report still renders,
// and the value silently becomes None. "Plan", "X pos (%)", "Y pos (%)" and
// "Last Updated" were absent from the door export for months that way, which
// left every door with no x_pct/y_pct, so `apply_grids` never ran and any door
// whose Grid Block was not typed by hand had no location in the report.
//
// Damper and ceiling both emitted them the whole time, so this is the test that
// keeps the three service lines in step.

import { describe, it, expect, beforeEach } from 'vitest';
import { buildFieldwireCsvText } from './fieldwireExport';

// vitest runs on the `node` environment here (the other suites are all pure
// functions), so localStorage does not exist. A stub keeps this test free of a
// jsdom dependency; the exporter only ever calls getItem/setItem/clear.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

/** Columns pipelines/fire_smoke_doors.py looks up by name. */
const REQUIRED_COLUMNS = [
  'ID', 'Status', 'Category', 'Assignee', 'Plan',
  'X pos (%)', 'Y pos (%)', 'Floor', 'Grid Block', 'Asset ID',
  'Door Rating', 'Last Updated',
];

const PIN = {
  id: 'pin-1',
  x: 42.5,
  y: 17.25,
  iconNo: '7',
  assetId: '0038',
  status: 'pass',
  projectName: 'Test Hospital',
  pageNumber: 1,
  gridBlock: '',
};

const RECORD = {
  id: 'insp_pin-1_2026',
  pinId: 'pin-1',
  inspectionYear: 2026,
  iconNo: '7',
  assetId: '0038',
  floorNo: 'Level 1',
  gridBlock: '',
  assemblyType: 'fire_door',
  doorRating: '90',
  inspectorName: 'Derek Smith',
  projectName: 'Test Hospital',
  completedTime: '2026-08-13T14:30:00.000Z',
  overallStatus: 'fail',
  deficiencies: [
    { id: 'gap_hinge', status: 'deficient', text: 'Gaps: Hinge gap is excessive.' },
  ],
  findings: {},
  additionalComments: '',
};

/** The header row. buildCsvText writes 3 preamble lines, then the header. */
function headerOf(csv: string): string[] {
  return csv.split('\n')[3].replace(/\r$/, '').split('\t');
}

function rowsOf(csv: string): string[][] {
  return csv
    .split('\n')
    .slice(4)
    .filter((l) => l.trim())
    .map((l) => l.replace(/\r$/, '').split('\t'));
}

function valueOf(csv: string, row: string[], column: string): string {
  const i = headerOf(csv).indexOf(column);
  return i === -1 ? '' : row[i] ?? '';
}

describe('door CSV contract with pipelines/fire_smoke_doors.py', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('activeProject', 'Test Hospital');
    localStorage.setItem('floorPlanPins', JSON.stringify({ '1': [PIN] }));
    localStorage.setItem('doorInspections', JSON.stringify([RECORD]));
  });

  it('emits every column the parser reads by name', () => {
    const header = headerOf(buildFieldwireCsvText());
    for (const col of REQUIRED_COLUMNS) {
      expect(header, `missing column "${col}"`).toContain(col);
    }
  });

  it('carries the pin coordinates that drive the auto-grid overlay', () => {
    // The regression: these parsed as None for every door, so _tasks_by_plan
    // came out empty and apply_grids never ran.
    const csv = buildFieldwireCsvText();
    const row = rowsOf(csv)[0];
    expect(valueOf(csv, row, 'X pos (%)')).toBe('42.5');
    expect(valueOf(csv, row, 'Y pos (%)')).toBe('17.25');
    expect(valueOf(csv, row, 'Plan')).toBe('Level 1');
    expect(valueOf(csv, row, 'Last Updated')).toBeTruthy();
  });

  it('tags a deficiency with initials the roster can resolve', () => {
    // pipelines/fire_smoke_doors._DEFICIENCY_PATTERN wants "(INI)" of 2-4 chars,
    // and the roster must be able to turn that back into a full name. The app
    // derives "DS" from "Derek Smith" while config/inspectors.json says "DSM",
    // which is why inspector_roster.load_inspector_lookup now carries both.
    const csv = buildFieldwireCsvText();
    const row = rowsOf(csv)[0];
    const checklist = valueOf(csv, row, 'Checklist 1');
    expect(checklist).toMatch(/^Yes:\s+.+\s+\([A-Z]{2,4}\)\s+-\s+\d{4}-\d{2}-\d{2}$/);
    expect(checklist).toContain('(DS)');
  });

  // KNOWN FAILING, deliberately. `it.fails` passes only while the body throws,
  // so this goes green the moment the bug is fixed and tells you to delete the
  // marker. A skipped test rots silently; this one cannot.
  //
  // The bug: the record filter is `!== 'above_below_ceiling'` (fieldwireExport
  // line ~58) and RecordsTab.tsx has the same one-sided shape, so every service
  // line added after ceiling opts into the DOOR path by default.
  // `fire_smoke_damper` passes it today. Combined with the export not being
  // project-scoped, a device holding both a door project and a damper project
  // emits damper records as door rows.
  //
  // Not fixed here: it is Tier 3 in the remediation plan, outside the approved
  // Phase 1. Fixing it means a positive filter (`=== 'fire_smoke_door'`) plus
  // project scoping, which changes what every existing device exports.
  it.fails('keeps a damper record out of the door export', () => {
    // A REALISTIC damper record: it has `status`, not `overallStatus`, and its
    // deficiencies are flat strings rather than objects. Spreading the door
    // fixture here would give it an `overallStatus` no damper record has, and
    // the test would then "catch" the bug through an input that cannot occur.
    localStorage.setItem(
      'doorInspections',
      JSON.stringify([
        RECORD,
        {
          id: 'dinsp_pin-2_2026',
          pinId: 'pin-2',
          inspectionType: 'fire_smoke_damper',
          inspectionYear: 2026,
          iconNo: '8',
          floorNo: 'Level 1',
          category: 'Fire',
          status: 'fail',
          deficiencies: ['Damper does not fully close.'],
          inspectorName: 'Derek Smith',
          projectName: 'Test Hospital',
          completedTime: '2026-08-13T10:00:00.000Z',
          additionalComments: 'Fusible link replaced on site.',
        },
      ]),
    );
    localStorage.setItem(
      'floorPlanPins',
      JSON.stringify({ '1': [PIN, { ...PIN, id: 'pin-2', iconNo: '8' }] }),
    );
    const csv = buildFieldwireCsvText();
    // The observable leak: the damper's surveyor comment is written into the
    // door row's Message columns, where pipelines/fire_smoke_doors.py reads it
    // as a door comment and it lands in the door report.
    expect(csv, 'a damper comment must not appear in the door CSV')
      .not.toContain('Fusible link replaced on site.');
  });
});
