import { describe, it, expect } from 'vitest';
import { yearOf, recordYear, recordId, dedupeForSave, recordType } from './inspectionYear';

describe('yearOf', () => {
  it('reads the calendar year from an ISO timestamp', () => {
    expect(yearOf('2024-08-22T14:00:00.000Z')).toBe(2024);
    expect(yearOf('2026-01-02T00:00:00.000Z')).toBe(2026);
  });
  it('falls back to the current year when missing or invalid', () => {
    const now = new Date().getFullYear();
    expect(yearOf(undefined)).toBe(now);
    expect(yearOf('not-a-date')).toBe(now);
  });
});

describe('recordYear', () => {
  it('prefers an explicit inspectionYear', () => {
    expect(recordYear({ inspectionYear: 2025, completedTime: '2026-05-01T00:00:00Z' })).toBe(2025);
  });
  it('derives from completedTime for legacy records with no inspectionYear', () => {
    expect(recordYear({ completedTime: '2024-11-30T12:00:00Z' })).toBe(2024);
  });
});

describe('recordId', () => {
  it('builds a stable per-pin, per-year id', () => {
    expect(recordId('insp', 'pin123', 2026)).toBe('insp_pin123_2026');
    expect(recordId('cinsp', 'pin123', 2027)).toBe('cinsp_pin123_2027');
  });
});

describe('dedupeForSave', () => {
  // Door records carry no `inspectionType` at all, which is why undefined has
  // to mean doors -- see recordType.
  const DOORS = 'fire_smoke_doors';
  const rec = (pinId: string, inspectionYear: number, tag = '') =>
    ({ pinId, inspectionYear, tag });

  it('replaces the same pin in the same year', () => {
    const existing = [rec('A', 2026, 'old')];
    const kept = dedupeForSave(existing, 'A', 2026, DOORS);
    expect(kept).toHaveLength(0); // old removed; caller pushes the new one
  });

  it('retains the same pin from a different year', () => {
    const existing = [rec('A', 2025, 'lastyear')];
    const kept = dedupeForSave(existing, 'A', 2026, DOORS);
    expect(kept).toHaveLength(1);
    expect(kept[0].inspectionYear).toBe(2025);
  });

  it('keeps other pins untouched', () => {
    const existing = [rec('A', 2026), rec('B', 2026)];
    const kept = dedupeForSave(existing, 'A', 2026, DOORS);
    expect(kept.map((r) => r.pinId)).toEqual(['B']);
  });

  it('treats a legacy record (no inspectionYear) as its completedTime year', () => {
    const legacy = { pinId: 'A', completedTime: '2026-03-01T00:00:00Z' };
    const kept = dedupeForSave([legacy], 'A', 2026, DOORS);
    expect(kept).toHaveLength(0); // same effective year → replaced
    const keptOtherYear = dedupeForSave([legacy], 'A', 2027, DOORS);
    expect(keptOtherYear).toHaveLength(1); // different year → retained
  });

  it('leaves records without a pinId untouched', () => {
    const existing = [{ pinId: undefined, inspectionYear: 2026 } as any];
    expect(dedupeForSave(existing, undefined, 2026, DOORS)).toHaveLength(1);
  });

  // All three wizards write into ONE `doorInspections` array, so a save for one
  // service line must not delete another line's record for the same pin+year.
  // It used to: the ids differ (`insp_` vs `dinsp_`), so the cloud kept both,
  // and the next sync re-downloaded the record that had just been deleted --
  // leaving a state neither the save nor the delete intended.
  it('does not delete another service line\'s record for the same pin and year', () => {
    const existing = [
      { pinId: 'A', inspectionYear: 2026, tag: 'door' }, // no type = doors
      { pinId: 'A', inspectionYear: 2026, inspectionType: 'above_below_ceiling', tag: 'ceiling' },
    ];
    const savingADamper = dedupeForSave(existing, 'A', 2026, 'fire_smoke_damper');
    expect(savingADamper.map((r: any) => r.tag)).toEqual(['door', 'ceiling']);

    const savingTheDoor = dedupeForSave(existing, 'A', 2026, DOORS);
    expect(savingTheDoor.map((r: any) => r.tag)).toEqual(['ceiling']);

    const savingTheCeiling = dedupeForSave(existing, 'A', 2026, 'above_below_ceiling');
    expect(savingTheCeiling.map((r: any) => r.tag)).toEqual(['door']);
  });
});

describe('recordType', () => {
  it('reads a record with no inspectionType as the door service line', () => {
    // Not cosmetic: treating undefined as its own group would make every door
    // record fail to match itself and dedupe would never replace anything.
    expect(recordType({ pinId: 'A' })).toBe('fire_smoke_doors');
    expect(recordType({ inspectionType: 'fire_smoke_damper' })).toBe('fire_smoke_damper');
    expect(recordType(undefined)).toBe('fire_smoke_doors');
  });
});
