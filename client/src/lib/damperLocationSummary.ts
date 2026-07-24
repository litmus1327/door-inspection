// Damper Location Summary PDF — a thin wrapper over the shared generator in
// lib/locationSummary.ts.

import { generateLocationSummary, LocationSummaryResult, LocationSummaryRec } from './locationSummary';

const STATUS_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', inaccessible: 'Inaccessible' };
const STATUS_RGB: Record<string, [number, number, number]> = {
  pass: [0.16, 0.55, 0.16],
  fail: [0.86, 0.15, 0.15],
  inaccessible: [0.42, 0.42, 0.42],
};

export async function generateDamperLocationSummary(
  projectName: string,
  records: LocationSummaryRec[],
): Promise<LocationSummaryResult> {
  return generateLocationSummary(projectName, records, {
    title: 'Damper Location Summary',
    itemLabel: 'Dampers',
    tag: '#damper_checklist',
    filenamePrefix: 'codify_damper_location_summary',
    coverBlurb: 'Use this location summary alongside the damper inspection report to locate dampers of interest.',
    subheader: (r) => [STATUS_LABEL[r.status] || r.status, r.inspectorName, r.category].filter(Boolean).join('  |  '),
    detailLines: (r) => {
      const out: string[] = [];
      if (r.noDamperPresent) out.push('No damper present.');
      const defs: string[] = r.deficiencies || [];
      if (defs.length > 0) {
        out.push('Deficiencies:');
        for (const d of defs) out.push(` - ${d}`);
      } else if (!r.noDamperPresent && r.status === 'pass') {
        out.push('No deficiencies.');
      }
      return out;
    },
    markerColor: (r) => STATUS_RGB[r.status] || [0.86, 0.15, 0.15],
  });
}
