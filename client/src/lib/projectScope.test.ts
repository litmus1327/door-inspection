// Project scoping: pins and records for every project share two localStorage
// keys, and most readers never checked which project a row belonged to.
//
// The two escape hatches below are the load-bearing part and both fail OPEN.
// Getting them wrong hides real inspected doors from the plan, which is worse
// than the leak being fixed.

import { describe, it, expect, beforeEach } from 'vitest';

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

import {
  inProject,
  pinMapInProject,
  pinsInProject,
  recordsInProject,
  activeProject,
} from './projectScope';

const pin = (id: string, projectName?: string, page = 1) =>
  ({ id, projectName, pageNumber: page, x: 0, y: 0, iconNo: id, assetId: null, status: 'pass' } as any);

describe('inProject', () => {
  it('matches a row belonging to the project', () => {
    expect(inProject({ projectName: 'A' }, 'A')).toBe(true);
    expect(inProject({ projectName: 'B' }, 'A')).toBe(false);
  });

  it('matches everything when no project is selected', () => {
    // The app is usable from the Projects home; scoping must not blank it.
    expect(inProject({ projectName: 'B' }, '')).toBe(true);
  });

  it('matches a row with no projectName, in any project', () => {
    // Pins predating the field cannot be attributed. Showing them everywhere is
    // the OLD behaviour for those rows and is visible and recoverable; hiding
    // them would make real inspected doors disappear with no way back.
    expect(inProject({}, 'A')).toBe(true);
    expect(inProject({ projectName: '   ' }, 'A')).toBe(true);
    expect(inProject(undefined, 'A')).toBe(true);
  });
});

describe('pinMapInProject', () => {
  const pins = {
    1: [pin('a', 'Hospital A'), pin('b', 'Hospital B'), pin('legacy')],
    2: [pin('c', 'Hospital B', 2)],
  };

  it('keeps only the project\'s pins, plus unattributed ones', () => {
    const scoped = pinMapInProject(pins, 'Hospital A');
    expect(scoped[1].map((p: any) => p.id)).toEqual(['a', 'legacy']);
  });

  it('drops a page that ends up empty', () => {
    // Page 2 holds only Hospital B's pin.
    expect(pinMapInProject(pins, 'Hospital A')[2]).toBeUndefined();
  });

  it('returns everything untouched when no project is selected', () => {
    expect(pinMapInProject(pins, '')).toBe(pins);
  });

  it('does not mutate the source map', () => {
    pinMapInProject(pins, 'Hospital A');
    expect(pins[1]).toHaveLength(3);
  });
});

describe('reading from localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('activeProject', 'Hospital A');
    localStorage.setItem(
      'floorPlanPins',
      JSON.stringify({ 1: [pin('a', 'Hospital A'), pin('b', 'Hospital B')] }),
    );
  });

  it('reads the active project', () => {
    expect(activeProject()).toBe('Hospital A');
  });

  it('returns only this project\'s pins, flat', () => {
    expect(pinsInProject().map((p) => p.id)).toEqual(['a']);
  });

  it('survives a corrupt pin store rather than throwing', () => {
    // A throw here would take down the export and the plan view.
    localStorage.setItem('floorPlanPins', 'not json');
    expect(pinsInProject()).toEqual([]);
  });

  it('scopes records the same way', () => {
    const records = [
      { id: '1', projectName: 'Hospital A' },
      { id: '2', projectName: 'Hospital B' },
      { id: '3' }, // legacy, unattributed
    ];
    expect(recordsInProject(records).map((r) => r.id)).toEqual(['1', '3']);
  });
});
