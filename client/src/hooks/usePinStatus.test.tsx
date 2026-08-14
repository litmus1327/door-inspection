// @vitest-environment jsdom
//
// The Tasks pages could change a door's status in bulk, or delete its record,
// and the pin on the plan kept its old colour forever. Nothing reconciled them,
// so the list and the plan disagreed permanently.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  getSupabaseConfig: () => ({ url: 'https://example.test', key: 'anon' }),
  upsertPin: vi.fn(async () => true),
}));

import { usePinStatus } from './usePinStatus';
import { upsertPin } from '@/lib/supabase';
import { DoorStatus } from '@/types';

function mountHook() {
  const box: { apply: (u: Map<string, DoorStatus>) => void } = { apply: () => {} };
  function Probe() {
    box.apply = usePinStatus();
    return null;
  }
  render(<Probe />);
  return box;
}

const pins = () => JSON.parse(localStorage.getItem('floorPlanPins') || '{}');

describe('usePinStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'floorPlanPins',
      JSON.stringify({
        1: [
          { id: 'a', iconNo: '1', status: 'fail', projectName: 'P', x: 0, y: 0, assetId: null },
          { id: 'b', iconNo: '2', status: 'pass', projectName: 'P', x: 0, y: 0, assetId: null },
        ],
        2: [{ id: 'c', iconNo: '3', status: 'not_inspected', projectName: 'P', x: 0, y: 0, assetId: null }],
      }),
    );
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('writes the new status across pages and leaves other pins alone', () => {
    const box = mountHook();
    act(() => box.apply(new Map<string, DoorStatus>([['a', 'pass'] as const, ['c', 'conditional'] as const])));

    const out = pins();
    expect(out[1].find((p: any) => p.id === 'a').status).toBe('pass');
    expect(out[1].find((p: any) => p.id === 'b').status).toBe('pass'); // untouched
    expect(out[2][0].status).toBe('conditional');
  });

  it('pushes each changed pin to the cloud so other devices agree', () => {
    const box = mountHook();
    act(() => box.apply(new Map<string, DoorStatus>([['a', 'pass']])));
    expect(vi.mocked(upsertPin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertPin).mock.calls[0][1]).toMatchObject({ id: 'a', status: 'pass' });
  });

  it('does nothing when the status is already what was asked for', () => {
    const box = mountHook();
    const before = localStorage.getItem('floorPlanPins');
    act(() => box.apply(new Map<string, DoorStatus>([['b', 'pass']])));
    expect(localStorage.getItem('floorPlanPins')).toBe(before);
    expect(vi.mocked(upsertPin)).not.toHaveBeenCalled();
  });

  it('ignores a pin id that does not exist', () => {
    const box = mountHook();
    act(() => box.apply(new Map<string, DoorStatus>([['nope', 'fail']])));
    expect(vi.mocked(upsertPin)).not.toHaveBeenCalled();
  });

  it('does not reach the network when offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const box = mountHook();
    act(() => box.apply(new Map<string, DoorStatus>([['a', 'pass']])));
    // The local change still lands; only the upload is skipped.
    expect(pins()[1].find((p: any) => p.id === 'a').status).toBe('pass');
    expect(vi.mocked(upsertPin)).not.toHaveBeenCalled();
  });
});
