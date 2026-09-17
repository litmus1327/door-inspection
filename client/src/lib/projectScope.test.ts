// Project scoping: pins and records for every project share two localStorage
// keys, and most readers never checked which project a row belonged to.
//
// Only the "no project selected" case fails OPEN now. A row with no
// projectName used to match every project too (meant to keep old
// pre-attribution pins visible somewhere), but every device this was checked
// against had exactly zero inspection records on any such pin -- it's
// orphaned test debris, not a recoverable inspection -- and it kept
// resurfacing old junk inside brand-new projects. See git history on this
// file for the incident.

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

  it('does NOT match a row with no projectName once a specific project is selected', () => {
    // This used to fail open (return true) so pre-attribution legacy pins
    // stayed visible -- but that meant an untagged pin showed up in every
    // project forever, including a brand new one that had never seen it.
    expect(inProject({}, 'A')).toBe(false);
    expect(inProject({ projectName: '   ' }, 'A')).toBe(false);
    expect(inProject(undefined, 'A')).toBe(false);
  });
});

describe('pinMapInProject', () => {
  const pins = {
    1: [pin('a', 'Hospital A'), pin('b', 'Hospital B'), pin('legacy')],
    2: [pin('c', 'Hospital B', 2)],
  };

  it('keeps only the project\'s own pins, not unattributed ones', () => {
    const scoped = pinMapInProject(pins, 'Hospital A');
    expect(scoped[1].map((p: any) => p.id)).toEqual(['a']);
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
      { id: '3' }, // unattributed -- no longer shown inside a specific project
    ];
    expect(recordsInProject(records).map((r) => r.id)).toEqual(['1']);
  });
});
