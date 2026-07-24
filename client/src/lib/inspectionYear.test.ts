import { describe, it, expect } from 'vitest';
import { yearOf, recordYear, recordId, dedupeForSave } from './inspectionYear';

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
  const rec = (pinId: string, inspectionYear: number, tag = '') =>
    ({ pinId, inspectionYear, tag });

  it('replaces the same pin in the same year', () => {
    const existing = [rec('A', 2026, 'old')];
    const kept = dedupeForSave(existing, 'A', 2026);
    expect(kept).toHaveLength(0); // old removed; caller pushes the new one
  });

  it('retains the same pin from a different year', () => {
    const existing = [rec('A', 2025, 'lastyear')];
    const kept = dedupeForSave(existing, 'A', 2026);
    expect(kept).toHaveLength(1);
    expect(kept[0].inspectionYear).toBe(2025);
  });

  it('keeps other pins untouched', () => {
    const existing = [rec('A', 2026), rec('B', 2026)];
    const kept = dedupeForSave(existing, 'A', 2026);
    expect(kept.map((r) => r.pinId)).toEqual(['B']);
  });

  it('treats a legacy record (no inspectionYear) as its completedTime year', () => {
    const legacy = { pinId: 'A', completedTime: '2026-03-01T00:00:00Z' };
    const kept = dedupeForSave([legacy], 'A', 2026);
    expect(kept).toHaveLength(0); // same effective year → replaced
    const keptOtherYear = dedupeForSave([legacy], 'A', 2027);
    expect(keptOtherYear).toHaveLength(1); // different year → retained
  });

  it('leaves records without a pinId untouched', () => {
    const existing = [{ pinId: undefined, inspectionYear: 2026 } as any];
    expect(dedupeForSave(existing, undefined, 2026)).toHaveLength(1);
  });
});
