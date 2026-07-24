import { describe, it, expect } from 'vitest';
import { getApplicableItems } from '../InspectionWizard';

// Regression coverage for the load-bearing inspection decision tree. These lock
// in the rating minimums and the branch/override wirings so future rule edits
// can't silently break them.

const pv = { construction: 'existing' as const, gapStandard: 'codify' as const, sprinklered: true };
const noHw = {} as any;

// Ids of items that are actually visible for the given inputs.
function shownIds(...args: Parameters<typeof getApplicableItems>): Set<string> {
  return new Set(getApplicableItems(...args).filter((i) => i.show).map((i) => i.id));
}
function item(id: string, ...args: Parameters<typeof getApplicableItems>) {
  return getApplicableItems(...args).find((i) => i.id === id);
}

describe('getApplicableItems — rating minimums', () => {
  it('hides door/frame rating items for a smoke partition (no rating required)', () => {
    const ids = shownIds('smoke_partition', noHw, 'single', pv, false, '0', '0');
    expect(ids.has('rating_door')).toBe(false);
    expect(ids.has('rating_frame')).toBe(false);
  });

  it('does NOT flag a 45-min 1-hour fire door when it is not a stair door', () => {
    // Base minimum for 1hr_fire is 45, so 45 is adequate.
    const ids = shownIds('1hr_fire', noHw, 'single', pv, false, '45', '45', true, false, false, false);
    expect(ids.has('rating_door')).toBe(false);
  });

  it('flags a 45-min 1-hour fire STAIR door (60-min minimum applies)', () => {
    const ids = shownIds('1hr_fire', noHw, 'single', pv, false, '45', '45', true, false, true, false);
    expect(ids.has('rating_door')).toBe(true);
  });

  it('does NOT flag a 20-min 1-hour partition door when it is not a corridor door', () => {
    const ids = shownIds('1hr_partition', noHw, 'single', pv, false, '20', '20', true, false, false, false);
    expect(ids.has('rating_door')).toBe(false);
  });

  it('flags a 20-min 1-hour partition CORRIDOR door (45-min minimum applies)', () => {
    const ids = shownIds('1hr_partition', noHw, 'single', pv, false, '20', '20', true, false, false, true);
    expect(ids.has('rating_door')).toBe(true);
  });
});

describe('getApplicableItems — hardware-driven items', () => {
  it('shows the slamming-closer check only when a closer is present', () => {
    const withCloser = shownIds('1hr_fire', { hw_closer: true } as any, 'single', pv, false, '90', '90');
    const withoutCloser = shownIds('1hr_fire', noHw, 'single', pv, false, '90', '90');
    expect(withCloser.has('sc_slamming')).toBe(true);
    expect(withoutCloser.has('sc_slamming')).toBe(false);
  });
});

describe('getApplicableItems — dormant branch wiring', () => {
  it('attaches the damaged-astragal branch (x5) to pi_astragal on pairs', () => {
    expect(item('pi_astragal', '1hr_fire', noHw, 'dbl_pair', pv, false, '90', '90')?.branch).toBe('x5');
  });

  it('attaches the damaged-sweep branch (x9) to pi_sweep when a sweep is present', () => {
    expect(item('pi_sweep', '1hr_fire', { hw_sweep: true } as any, 'single', pv, false, '90', '90')?.branch).toBe('x9');
  });
});

describe('getApplicableItems — client-preference suppression', () => {
  const pvNoAstragal = { ...pv, noCiteAstragalSweep: true };
  const pvNoLaminate = { ...pv, noCiteLaminateNonFire: true };

  it('suppresses the astragal/sweep gap citations when the client opts out', () => {
    const shownDefault = shownIds('1hr_fire', { hw_sweep: true } as any, 'dbl_pair', pv, false, '90', '90');
    expect(shownDefault.has('gap_astragal')).toBe(true);
    expect(shownDefault.has('gap_sweep')).toBe(true);
    const shownOptOut = shownIds('1hr_fire', { hw_sweep: true } as any, 'dbl_pair', pvNoAstragal, false, '90', '90');
    expect(shownOptOut.has('gap_astragal')).toBe(false);
    expect(shownOptOut.has('gap_sweep')).toBe(false);
  });

  it('suppresses laminate on NON-fire assemblies but keeps it on fire assemblies when opted out', () => {
    // Smoke barrier is non-fire → suppressed when opted out.
    expect(shownIds('smoke_barrier', noHw, 'single', pvNoLaminate, false, '0', '0').has('pi_laminate_face')).toBe(false);
    // 1-hour fire is fire-rated → still cited even when opted out.
    expect(shownIds('1hr_fire', noHw, 'single', pvNoLaminate, false, '90', '90').has('pi_laminate_face')).toBe(true);
    // Default (opt-in) → laminate cited on non-fire too.
    expect(shownIds('smoke_barrier', noHw, 'single', pv, false, '0', '0').has('pi_laminate_face')).toBe(true);
  });
});
