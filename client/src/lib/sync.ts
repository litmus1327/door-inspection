import {
  getSupabaseConfig,
  uploadInspectionRecord,
  fetchInspectionRecords,
  uploadPhotoToSupabase,
} from './supabase';

export interface SyncResult {
  ok: boolean;
  uploaded: number;
  downloaded: number;
  error?: string;
}

function loadLocal(): any[] {
  try {
    return JSON.parse(localStorage.getItem('doorInspections') || '[]');
  } catch {
    return [];
  }
}

function saveLocal(records: any[]) {
  localStorage.setItem('doorInspections', JSON.stringify(records));
}

/**
 * Apply a change to whatever is in localStorage RIGHT NOW.
 *
 * Everything here awaits the network between reading and writing, and both
 * entry points run in the background (App triggers them on reconnect and on
 * focus) while the inspector keeps working. Loading the array once, awaiting an
 * upload per record, then writing that stale array back deleted every
 * inspection saved during the loop. `flushPendingPhotos` is worse: it can await
 * a photo upload per photo, for minutes.
 *
 * So no caller writes a snapshot it captured before an await. Each re-reads and
 * applies only its own delta.
 */
function updateLocal(apply: (records: any[]) => boolean): void {
  const current = loadLocal();
  if (apply(current)) saveLocal(current);
}

/**
 * Two-way sync of inspection records with Supabase:
 *  1. Upload every local record not yet marked synced; mark it synced on success.
 *  2. Download cloud records and add any whose id we don't have locally.
 *
 * Records are keyed by their stable `id`. This is add/merge only — it never
 * deletes, and on an id collision the local copy wins (no overwrite). Good
 * enough for per-door records; revisit if two people edit the same door.
 */
export async function syncInspections(): Promise<SyncResult> {
  const config = getSupabaseConfig();
  if (!config.url || !config.key) {
    return { ok: false, uploaded: 0, downloaded: 0, error: 'No Supabase config set (Config tab)' };
  }

  const local = loadLocal();
  let uploaded = 0;
  const sent: string[] = [];

  // 1. Push unsynced records.
  for (const rec of local) {
    if (rec && rec.synced === true) continue;
    if (!rec || !rec.id) continue;
    const ok = await uploadInspectionRecord(config, rec);
    if (ok) {
      sent.push(rec.id);
      uploaded++;
    }
  }
  // Our only change is the synced flag, so apply just that to the CURRENT array
  // rather than writing back the copy loaded before all those awaits.
  if (sent.length) {
    const ids = new Set(sent);
    updateLocal((records) => {
      let changed = false;
      for (const rec of records) {
        if (rec && rec.id && ids.has(rec.id) && rec.synced !== true) {
          rec.synced = true;
          changed = true;
        }
      }
      return changed;
    });
  }

  // 2. Pull and merge cloud records we don't have.
  let downloaded = 0;
  const cloud = await fetchInspectionRecords(config);
  if (cloud === null) {
    return { ok: uploaded > 0, uploaded, downloaded, error: 'Could not reach Supabase to download' };
  }
  updateLocal((records) => {
    const ids = new Set(records.map((r: any) => r && r.id).filter(Boolean));
    for (const rec of cloud) {
      if (rec && rec.id && !ids.has(rec.id)) {
        records.push({ ...rec, synced: true });
        ids.add(rec.id);
        downloaded++;
      }
    }
    return downloaded > 0;
  });

  return { ok: true, uploaded, downloaded };
}

/**
 * Upload any photos captured offline. Photos taken with no signal are stored on
 * the record as data: URLs; this converts each to a file, uploads it, and
 * swaps in the remote URL — keeping localStorage from growing unbounded.
 * Returns the number of photos migrated to the cloud.
 */
export async function flushPendingPhotos(): Promise<number> {
  const config = getSupabaseConfig();
  if (!config.url || !config.key || !navigator.onLine) return 0;
  const records = loadLocal();
  let changed = 0;
  // data: URL -> remote URL, per record id. Collected during the uploads and
  // applied afterwards against a fresh read: this loop can run for minutes on a
  // weak signal, and writing the array captured before it deleted every
  // inspection the wizard saved in the meantime.
  const swaps = new Map<string, Map<string, string>>();

  for (const rec of records) {
    if (!rec || !Array.isArray(rec.photos)) continue;
    for (let i = 0; i < rec.photos.length; i++) {
      const p = rec.photos[i];
      if (typeof p !== 'string' || !p.startsWith('data:')) continue;
      try {
        const blob = await (await fetch(p)).blob();
        const file = new File([blob], `photo_${i}.jpg`, { type: blob.type || 'image/jpeg' });
        const url = await uploadPhotoToSupabase(config, file, rec.pinId || rec.id || 'unknown');
        if (url) {
          const key = rec.id;
          if (!key) continue;
          if (!swaps.has(key)) swaps.set(key, new Map());
          swaps.get(key)!.set(p, url);
          changed++;
        }
      } catch {
        /* keep the local copy; try again next flush */
      }
    }
  }

  if (changed > 0) {
    updateLocal((current) => {
      let touched = false;
      for (const rec of current) {
        const map = rec && rec.id ? swaps.get(rec.id) : undefined;
        if (!map || !Array.isArray(rec.photos)) continue;
        // Swap by VALUE, not by index. A photo added while we were uploading
        // shifts the indexes, and writing rec.photos[i] would then overwrite
        // the wrong photo. Anything we did not upload is left alone.
        rec.photos = rec.photos.map((p: any) =>
          typeof p === 'string' && map.has(p) ? map.get(p)! : p
        );
        touched = true;
      }
      return touched;
    });
  }
  return changed;
}

/** Download a JSON backup of all local inspection data (records + pins). */
export function exportBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    doorInspections: loadLocal(),
    floorPlanPins: JSON.parse(localStorage.getItem('floorPlanPins') || '{}'),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `codify_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
