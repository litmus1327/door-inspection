import {
  getSupabaseConfig,
  uploadInspectionRecord,
  fetchInspectionRecords,
  uploadPhotoToSupabase,
} from './supabase';
import { activeProject } from './projectScope';

export interface SyncResult {
  ok: boolean;
  uploaded: number;
  downloaded: number;
  /** Doors where two devices held different inspections for the same year. */
  conflicts?: number;
  error?: string;
}

/** Superseded inspections, kept rather than discarded. See resolveConflict. */
const SUPERSEDED_KEY = 'supersededInspections';

/**
 * Which of two inspections of the same door, in the same year, is authoritative.
 *
 * Derek's rule, 2026-08-13: the last inspector to touch the door wins. The
 * important part is that "last" means last to INSPECT, not last to sync. Signal
 * comes back at arbitrary times in a hospital, so resolving on arrival order
 * would let an inspector who finished at 9am and synced at 4pm overwrite one who
 * re-inspected at 2pm -- the opposite of the intent. `completedTime` is on every
 * record, so every device reaches the SAME answer no matter who syncs first.
 * That convergence is the point.
 *
 * Caveat, accepted deliberately: completedTime comes from the device clock, so a
 * badly wrong clock wins or loses wrongly. Reconciling clocks costs far more
 * than it saves here, and the superseded copy is kept either way.
 */
export function isNewer(candidate: any, incumbent: any): boolean {
  const t = (r: any) => {
    const ms = new Date(r?.completedTime || 0).getTime();
    return isNaN(ms) ? 0 : ms;
  };
  // Ties keep the incumbent: same timestamp means the same inspection round
  // trip, and churning the local copy for no gain would just re-upload it.
  return t(candidate) > t(incumbent);
}

/** Set aside a record that lost a conflict. Append-only, never read by the app. */
function archiveSuperseded(record: any): void {
  try {
    const prior = JSON.parse(localStorage.getItem(SUPERSEDED_KEY) || '[]');
    prior.push({ ...record, supersededAt: new Date().toISOString() });
    localStorage.setItem(SUPERSEDED_KEY, JSON.stringify(prior));
  } catch {
    /* archiving is best-effort; never block the sync over it */
  }
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
 *  2. Download cloud records, adding new ones and resolving same-door conflicts.
 *
 * Records are keyed by their stable `id` (`insp_<pinId>_<year>`), so two devices
 * inspecting the same door in the same year produce the SAME id. This never
 * deletes; on a collision the later INSPECTION wins (see `isNewer`) and the
 * superseded copy is kept under `supersededInspections`.
 *
 * This docstring used to end "on an id collision the local copy wins (no
 * overwrite) ... revisit if two people edit the same door". That was half the
 * story and the dangerous half: locally the first copy won, but the cloud upsert
 * is `resolution=merge-duplicates`, so up there the last UPLOAD won. The two
 * halves pulled in opposite directions, the devices never converged, and
 * whichever one ran the export decided the client's report.
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
  //
  // Scoped to the active project. `fetchInspectionRecords` has always taken a
  // project (fetchPins is called with one) and this call never passed it, so
  // every device pulled every facility's records into the single unscoped
  // `doorInspections` array. That is what put other projects' records on the
  // device in the first place, ahead of any exporter or tab reading them.
  //
  // With no project selected it still fetches everything, so syncing from the
  // Projects home behaves as before.
  let downloaded = 0;
  const project = activeProject();
  const cloud = await fetchInspectionRecords(config, project || undefined);
  if (cloud === null) {
    return { ok: uploaded > 0, uploaded, downloaded, error: 'Could not reach Supabase to download' };
  }
  // supabase.fetchInspectionRecords sends `Range: 0-9999` and does not check the
  // Content-Range that comes back, so past 10,000 rows the response is silently
  // truncated. Say so rather than letting a partial download look complete.
  if (cloud.length >= 10000) {
    console.warn(
      '[sync] the record download hit its 10,000-row cap, so some records were ' +
      'not downloaded. Work inside a project (which scopes the query) or raise ' +
      'the Range header in supabase.fetchInspectionRecords.'
    );
  }

  // Merge, resolving a same-door conflict by which inspection happened LAST.
  //
  // This step used to skip any id it already held, which meant the two halves of
  // the sync resolved in OPPOSITE directions: the cloud upsert is
  // `resolution=merge-duplicates`, so the last device to UPLOAD won there, while
  // locally the first copy won and never budged. So two devices that inspected
  // the same door never agreed, neither knew, and whichever one happened to run
  // the export decided what the client's report said.
  let conflicts = 0;
  updateLocal((records) => {
    const byId = new Map<string, number>();
    records.forEach((r: any, i: number) => { if (r && r.id) byId.set(r.id, i); });

    for (const rec of cloud) {
      if (!rec || !rec.id) continue;
      const at = byId.get(rec.id);
      if (at === undefined) {
        records.push({ ...rec, synced: true });
        byId.set(rec.id, records.length - 1);
        downloaded++;
        continue;
      }
      const mine = records[at];
      if (isNewer(rec, mine)) {
        // Theirs is the later inspection: take it, keep ours.
        archiveSuperseded(mine);
        records[at] = { ...rec, synced: true };
        conflicts++;
        downloaded++;
      } else if (isNewer(mine, rec)) {
        // Ours is later, so the cloud is holding the stale one. Mark it
        // unsynced so the next upload pushes ours and the other device
        // converges; without this the cloud keeps the older inspection and
        // every other device keeps reading it.
        if (mine.synced === true) mine.synced = false;
        conflicts++;
      }
    }
    return true;
  });

  if (conflicts > 0) {
    console.warn(
      `[sync] ${conflicts} door(s) were inspected on more than one device this ` +
      `year. The later inspection wins; the replaced copy is kept in ` +
      `localStorage under "${SUPERSEDED_KEY}".`
    );
  }

  return { ok: true, uploaded, downloaded, conflicts };
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
