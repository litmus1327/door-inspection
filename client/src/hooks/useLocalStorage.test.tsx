// @vitest-environment jsdom
//
// The hook that backs every persisted piece of app state (pins, inspector name,
// floor names). Its updater used to resolve against the render closure, so N
// calls in one tick all started from the SAME value and only the last survived.
//
// The symptom that made this worth fixing: "Clear all pins" in FloorPlanViewer
// does `pinIds.forEach(id => onPinRemoved(id))` -- N synchronous calls, each
// removing one pin from `prev`. The inspection records were deleted in the same
// loop by DIRECT localStorage writes, which re-read fresh every iteration, so
// the two halves disagreed: every record gone, all but one pin still on the
// plan. "Delete selected" has the same shape.
//
// jsdom is scoped to this file by the docblock above rather than switched on
// globally, because the other suites run on `node` and one of them stubs
// localStorage itself.

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useLocalStorage } from './useLocalStorage';

/** Renders the hook once and hands back its current value and setter. */
function mountHook<T>(key: string, initial: T) {
  const box: { value: T; set: (v: T | ((p: T) => T)) => void } = {
    value: initial,
    set: () => {},
  };
  function Probe() {
    const [value, setValue] = useLocalStorage<T>(key, initial);
    box.value = value;
    box.set = setValue;
    return null;
  }
  render(<Probe />);
  return box;
}

describe('useLocalStorage', () => {
  beforeEach(() => localStorage.clear());

  it('chains several updater calls made in one tick', () => {
    // The regression, in its simplest form. Before the fix this ended at 1,
    // because all three calls resolved against the initial 0.
    const box = mountHook<number>('counter', 0);
    act(() => {
      box.set((n) => n + 1);
      box.set((n) => n + 1);
      box.set((n) => n + 1);
    });
    expect(box.value).toBe(3);
    expect(JSON.parse(localStorage.getItem('counter')!)).toBe(3);
  });

  it('removes every pin when they are removed one call at a time', () => {
    // The real caller's shape: one call per pin, all in one tick.
    type Pins = Record<number, { id: string }[]>;
    const ids = ['a', 'b', 'c', 'd', 'e'];
    localStorage.setItem(
      'floorPlanPins',
      JSON.stringify({ 1: ids.map((id) => ({ id })) }),
    );
    const box = mountHook<Pins>('floorPlanPins', {});

    act(() => {
      for (const id of ids) {
        box.set((prev) => {
          const next: Pins = {};
          for (const page of Object.keys(prev)) {
            next[Number(page)] = (prev[Number(page)] || []).filter((p) => p.id !== id);
          }
          return next;
        });
      }
    });

    expect(box.value[1]).toEqual([]);
    // The stored copy has to agree with state, or a refresh resurrects them.
    expect(JSON.parse(localStorage.getItem('floorPlanPins')!)[1]).toEqual([]);
  });

  it('still accepts a plain value, not just an updater', () => {
    const box = mountHook<string>('inspectorName', '');
    act(() => box.set('Derek Smith'));
    expect(box.value).toBe('Derek Smith');
    expect(JSON.parse(localStorage.getItem('inspectorName')!)).toBe('Derek Smith');
  });

  it('keeps two components watching the same key in step', () => {
    // Six components call this hook with 'inspectorName'. Each owns a useState
    // whose initialiser runs once at mount, so changing the inspector on the
    // Projects page left App and Header serving the value they read when they
    // mounted -- new pins were stamped with the PREVIOUS inspector's name.
    const a = mountHook<string>('inspectorName', '');
    const b = mountHook<string>('inspectorName', '');

    act(() => a.set('Carson Maloney'));

    expect(a.value).toBe('Carson Maloney');
    expect(b.value).toBe('Carson Maloney');
    expect(JSON.parse(localStorage.getItem('inspectorName')!)).toBe('Carson Maloney');
  });

  it('propagates an updater result to the other watchers too', () => {
    const a = mountHook<number>('counter', 0);
    const b = mountHook<number>('counter', 0);
    act(() => {
      a.set((n) => n + 1);
      a.set((n) => n + 1);
    });
    expect(b.value).toBe(2);
  });

  it('does not cross-talk between different keys', () => {
    const a = mountHook<string>('inspectorName', '');
    const other = mountHook<string>('activeProject', '');
    act(() => a.set('Derek Smith'));
    expect(other.value).toBe('');
  });

  it('reads an existing value on mount and migrates the legacy pin array', () => {
    // Pins were once stored as a flat array; the hook migrates them onto page 1.
    localStorage.setItem('floorPlanPins', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    const box = mountHook<Record<number, { id: string }[]>>('floorPlanPins', {});
    expect(box.value[1]).toHaveLength(2);
  });

  it('falls back to the raw string when the stored value is not JSON', () => {
    localStorage.setItem('networkMode', 'offline');
    const box = mountHook<string>('networkMode', 'online');
    expect(box.value).toBe('offline');
  });
});
