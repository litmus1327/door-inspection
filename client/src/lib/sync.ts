import {
  getSupabaseConfig,
  uploadInspectionRecord,
  fetchInspectionRecords,
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

  // 1. Push unsynced records.
  for (const rec of local) {
    if (rec && rec.synced === true) continue;
    if (!rec || !rec.id) continue;
    const ok = await uploadInspectionRecord(config, rec);
    if (ok) {
      rec.synced = true;
      uploaded++;
    }
  }
  saveLocal(local);

  // 2. Pull and merge cloud records we don't have.
  let downloaded = 0;
  const cloud = await fetchInspectionRecords(config);
  if (cloud === null) {
    return { ok: uploaded > 0, uploaded, downloaded, error: 'Could not reach Supabase to download' };
  }
  const localIds = new Set(local.map((r: any) => r && r.id).filter(Boolean));
  for (const rec of cloud) {
    if (rec && rec.id && !localIds.has(rec.id)) {
      local.push({ ...rec, synced: true });
      localIds.add(rec.id);
      downloaded++;
    }
  }
  if (downloaded > 0) saveLocal(local);

  return { ok: true, uploaded, downloaded };
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
