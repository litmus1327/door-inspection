// Ceiling Location Summary PDF — a thin wrapper over the shared generator in
// lib/locationSummary.ts. See that file for the Fieldwire-format structure.

import { generateLocationSummary, LocationSummaryResult, LocationSummaryRec } from './locationSummary';

// Re-export so existing imports/tests (ceilingLocationSummary.test.ts) keep working.
export { pinToUserSpace } from './locationSummary';

const PRIORITY_RGB: Record<string, [number, number, number]> = {
  'Priority 1': [0.86, 0.15, 0.15],
  'Priority 2': [0.90, 0.45, 0.10],
  'Priority 3': [0.85, 0.65, 0.13],
};

export async function generateCeilingLocationSummary(
  projectName: string,
  records: LocationSummaryRec[],
): Promise<LocationSummaryResult> {
  const recs = records.filter((r) => r && r.finding);
  return generateLocationSummary(projectName, recs, {
    title: 'Above & Below Ceiling Location Summary',
    itemLabel: 'Findings',
    tag: '#above_below_ceiling_checklist',
    filenamePrefix: 'codify_ceiling_location_summary',
    coverBlurb: 'Use this location summary alongside the ceiling inspection report to locate icons of interest.',
    subheader: (r) => [r.priority, r.inspectorName, r.category].filter(Boolean).join('  |  '),
    detailLines: (r) => [`Finding: ${r.finding || ''}`],
    markerColor: (r) => PRIORITY_RGB[r.priority || ''] || [0.86, 0.15, 0.15],
  });
}
