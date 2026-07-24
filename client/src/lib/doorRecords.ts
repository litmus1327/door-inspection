// Door inspection record operations for the Tasks page (edit / bulk-edit /
// delete / per-icon history). All records live in the single 'doorInspections'
// localStorage array (door + ceiling, discriminated by inspectionType); these
// helpers touch only door records and keep the cloud in step.

import { getSupabaseConfig, uploadInspectionRecord, deleteInspectionRecord } from './supabase';
import { recordYear, recordId } from './inspectionYear';
import { DoorPin } from '@/types';

const KEY = 'doorInspections';

// Loose record shape — door records are stored as plain objects (see
// InspectionWizard save). Editable identity fields are the ones the Tasks page
// lets you correct in bulk or per-record.
export interface DoorRecord {
  id: string;
  pinId?: string;
  iconNo?: string;
  assetId?: string;
  floorNo?: string;
  gridBlock?: string;
  assemblyType?: string;
  doorRating?: string;
  inspectorName?: string;
  projectName?: string;
  completedTime?: string;
  inspectionYear?: number;
  overallStatus?: string;
  postInspectionStatus?: string;
  deficiencies?: any[];
  synced?: boolean;
  [k: string]: any;
}

/** Fields the Tasks page allows editing (per-record and in bulk). */
export type EditableField = 'assetId' | 'floorNo' | 'gridBlock' | 'assemblyType' | 'doorRating';

export function loadDoorInspections(): DoorRecord[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

export function saveDoorInspections(records: DoorRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(records));
}

/** Every record for a pin across years, newest first — the per-icon history. */
export function historyForPin(all: DoorRecord[], pinId: string): DoorRecord[] {
  return all
    .filter((r) => r.pinId === pinId)
    .sort(
      (a, b) =>
        recordYear(b) - recordYear(a) ||
        new Date(b.completedTime || 0).getTime() - new Date(a.completedTime || 0).getTime(),
    );
}

/** Merge the given records into the store by id (mark them unsynced), persist,
 *  and best-effort push each to the cloud. Used for per-record edits, bulk field
 *  edits, and bulk status changes (including creating records for pins that were
 *  never inspected). Returns the updated array. */
export async function upsertRecords(records: DoorRecord[]): Promise<DoorRecord[]> {
  if (records.length === 0) return loadDoorInspections();
  const byId = new Map(records.map((r) => [r.id, { ...r, synced: false }]));
  const all = loadDoorInspections();
  const merged: DoorRecord[] = all.map((r) => byId.get(r.id) || r);
  // Append any records that weren't already in the store (e.g. newly created).
  const existingIds = new Set(all.map((r) => r.id));
  for (const r of Array.from(byId.values())) if (!existingIds.has(r.id)) merged.push(r);
  saveDoorInspections(merged);

  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.key && navigator.onLine) {
    await Promise.allSettled(
      Array.from(byId.values()).map(async (r) => {
        const ok = await uploadInspectionRecord(cfg, r);
        if (ok) markSynced(r.id);
      }),
    );
  }
  return loadDoorInspections();
}

/** Build a minimal door record that just carries a status, for a pin that was
 *  never inspected (e.g. bulk-marking an inaccessible wing). */
export function buildStatusRecord(
  pin: DoorPin,
  projectName: string,
  inspectorName: string,
  status: string,
  year: number,
): DoorRecord {
  return {
    id: recordId('insp', pin.id, year),
    pinId: pin.id,
    inspectionYear: year,
    iconNo: pin.iconNo || '—',
    assetId: pin.assetId || '—',
    floorNo: '—',
    gridBlock: pin.gridBlock || '—',
    assemblyType: pin.assemblyType || '—',
    doorRating: '—',
    inspectorName: inspectorName || '—',
    projectName,
    completedTime: new Date().toISOString(),
    overallStatus: status,
    postInspectionStatus: status,
    deficiencies: [],
    findings: {},
    synced: false,
  };
}

/** Delete the given records locally and from the cloud. Returns the remaining array. */
export async function deleteRecords(ids: Set<string>): Promise<DoorRecord[]> {
  const all = loadDoorInspections();
  const next = all.filter((r) => !ids.has(r.id));
  saveDoorInspections(next);

  const cfg = getSupabaseConfig();
  if (cfg.url && cfg.key && navigator.onLine) {
    await Promise.allSettled(Array.from(ids).map((id) => deleteInspectionRecord(cfg, id)));
  }
  return next;
}

/** Re-read, flip one record to synced, and persist (used after a cloud push). */
function markSynced(id: string): void {
  const all = loadDoorInspections();
  saveDoorInspections(all.map((r) => (r.id === id ? { ...r, synced: true } : r)));
}
