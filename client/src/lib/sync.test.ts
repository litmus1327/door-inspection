// Background sync must not overwrite work saved while it was awaiting.
//
// Both entry points here run in the background (App triggers them on reconnect
// and on window focus) while the inspector keeps completing doors. They used to
// load `doorInspections` once, await one network call per record, then write
// that stale array back -- so every inspection saved during the loop was
// deleted. flushPendingPhotos is the worse one: it awaits a photo upload per
// photo, which on a weak signal is minutes.
//
// These tests save a new record from "the wizard" midway through the awaits and
// assert it survives.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Stub localStorage: this suite runs on the `node` environment.
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

const KEY = 'doorInspections';
const read = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const write = (r: any[]) => localStorage.setItem(KEY, JSON.stringify(r));

/** What the wizard does mid-sync: append a record to whatever is stored now. */
function saveFromWizard(id: string) {
  const all = read();
  all.push({ id, pinId: id, synced: false, completedTime: '2026-08-13T12:00:00Z' });
  write(all);
}

vi.mock('./supabase', () => ({
  getSupabaseConfig: () => ({ url: 'https://example.test', key: 'anon-key' }),
  uploadInspectionRecord: vi.fn(),
  fetchInspectionRecords: vi.fn(),
  uploadPhotoToSupabase: vi.fn(),
}));

import { syncInspections, flushPendingPhotos } from './sync';
import {
  uploadInspectionRecord,
  fetchInspectionRecords,
  uploadPhotoToSupabase,
} from './supabase';

describe('syncInspections', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchInspectionRecords).mockResolvedValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it('keeps a record saved while the upload loop was awaiting', async () => {
    write([
      { id: 'a', pinId: 'a', synced: false },
      { id: 'b', pinId: 'b', synced: false },
    ]);
    // The wizard finishes a door between the two uploads.
    let calls = 0;
    vi.mocked(uploadInspectionRecord).mockImplementation(async () => {
      if (++calls === 1) saveFromWizard('mid-sync');
      return true;
    });

    await syncInspections();

    const ids = read().map((r: any) => r.id).sort();
    expect(ids).toEqual(['a', 'b', 'mid-sync']);
  });

  it('marks uploaded records synced without clobbering the rest', async () => {
    write([
      { id: 'a', pinId: 'a', synced: false },
      { id: 'b', pinId: 'b', synced: false },
    ]);
    // 'a' uploads, 'b' fails: only 'a' may be marked synced, or 'b' is never
    // retried and exists nowhere but this device.
    vi.mocked(uploadInspectionRecord).mockImplementation(async (_c: any, rec: any) =>
      rec.id === 'a',
    );

    await syncInspections();

    const byId = Object.fromEntries(read().map((r: any) => [r.id, r]));
    expect(byId.a.synced).toBe(true);
    expect(byId.b.synced).toBe(false);
  });

  it('keeps a record saved while the download was in flight', async () => {
    write([{ id: 'a', pinId: 'a', synced: true }]);
    vi.mocked(uploadInspectionRecord).mockResolvedValue(true);
    vi.mocked(fetchInspectionRecords).mockImplementation(async () => {
      saveFromWizard('mid-download');
      return [{ id: 'cloud-1', pinId: 'z' }] as any;
    });

    await syncInspections();

    const ids = read().map((r: any) => r.id).sort();
    expect(ids).toEqual(['a', 'cloud-1', 'mid-download']);
  });
});

describe('flushPendingPhotos', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('navigator', { onLine: true });
    // The implementation fetches the data: URL to make a Blob.
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x']) })));
    vi.stubGlobal('File', class { constructor(_p: any, _n: string, _o: any) {} } as any);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps a record saved during a long photo upload', async () => {
    write([{ id: 'a', pinId: 'a', photos: ['data:image/jpeg;base64,AAA'] }]);
    vi.mocked(uploadPhotoToSupabase).mockImplementation(async () => {
      saveFromWizard('mid-flush');
      return 'https://cdn.test/a.jpg';
    });

    const changed = await flushPendingPhotos();

    expect(changed).toBe(1);
    const all = read();
    expect(all.map((r: any) => r.id).sort()).toEqual(['a', 'mid-flush']);
    expect(all.find((r: any) => r.id === 'a').photos).toEqual(['https://cdn.test/a.jpg']);
  });

  it('swaps the uploaded photo by value, not by index', async () => {
    // A photo added during the upload shifts the indexes. Writing photos[i]
    // would then overwrite the wrong entry.
    write([{ id: 'a', pinId: 'a', photos: ['data:image/jpeg;base64,AAA'] }]);
    vi.mocked(uploadPhotoToSupabase).mockImplementation(async () => {
      const all = read();
      const rec = all.find((r: any) => r.id === 'a');
      rec.photos.unshift('https://cdn.test/added-meanwhile.jpg');
      write(all);
      return 'https://cdn.test/a.jpg';
    });

    await flushPendingPhotos();

    expect(read().find((r: any) => r.id === 'a').photos).toEqual([
      'https://cdn.test/added-meanwhile.jpg',
      'https://cdn.test/a.jpg',
    ]);
  });
});
