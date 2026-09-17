import { describe, it, expect } from 'vitest';
import { recordToRow } from './supabase';
import { recordType } from './inspectionYear';

// recordToRow's inspection_type column and inspectionYear.ts's recordType()
// used to derive the service line independently. They agreed by coincidence;
// this pins them to the single shared function so a future edit to one
// without the other fails here instead of drifting silently again.
describe('recordToRow inspection_type', () => {
  it('agrees with recordType() for a legacy door record (no inspectionType)', () => {
    const record = { id: 'insp_a_2026', projectName: 'Test' };
    expect(recordToRow(record).inspection_type).toBe(recordType(record));
    expect(recordToRow(record).inspection_type).toBe('fire_smoke_doors');
  });

  it('agrees with recordType() for a ceiling record', () => {
    const record = { id: 'cinsp_a_2026', inspectionType: 'above_below_ceiling' };
    expect(recordToRow(record).inspection_type).toBe(recordType(record));
    expect(recordToRow(record).inspection_type).toBe('above_below_ceiling');
  });

  it('agrees with recordType() for a damper record', () => {
    const record = { id: 'dinsp_a_2026', inspectionType: 'fire_smoke_damper' };
    expect(recordToRow(record).inspection_type).toBe(recordType(record));
    expect(recordToRow(record).inspection_type).toBe('fire_smoke_damper');
  });
});
