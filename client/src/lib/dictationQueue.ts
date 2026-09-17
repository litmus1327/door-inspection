// Offline queueing for dictation recordings, mirroring flushPendingPhotos in
// sync.ts: a recording made with no signal is stored locally and processed
// once connectivity returns, rather than lost or blocked on.
//
// A recording captured offline can't be transcribed there — Whisper/Claude are
// both server calls — so it can't be reviewed at record time either. Once
// flushed, the result (transcript + proposed matches, no audio) is stashed in
// a small per-pin "ready to review" inbox in localStorage; the wizard for that
// pin picks it up and shows the same review dialog it would have shown online,
// the next time it's opened. This keeps the apply step running inside the
// wizard's own state/logic instead of a background process reimplementing it.

import { DictationCandidate, DictationInspectionType, DictationResult, requestDictation } from './dictation';
import { blobToBase64 } from '../hooks/useAudioRecorder';

interface QueuedDictation {
  id: string;
  pinId: string;
  inspectionType: DictationInspectionType;
  candidates: DictationCandidate[];
  audioBase64: string;
  mimeType: string;
  createdAt: string;
}

const DB_NAME = 'codify_dictation';
const STORE = 'queue';
const READY_KEY = 'dictationReady';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueDictation(
  pinId: string,
  inspectionType: DictationInspectionType,
  candidates: DictationCandidate[],
  blob: Blob,
  mimeType: string
): Promise<void> {
  const audioBase64 = await blobToBase64(blob);
  const entry: QueuedDictation = {
    id: `dict_${pinId}_${Date.now().toString(36)}`,
    pinId,
    inspectionType,
    candidates,
    audioBase64,
    mimeType,
    createdAt: new Date().toISOString(),
  };
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(entry);
  });
}

async function listQueued(): Promise<QueuedDictation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
}

interface ReadyMap { [pinId: string]: DictationResult & { createdAt: string } }

function loadReady(): ReadyMap {
  try { return JSON.parse(localStorage.getItem(READY_KEY) || '{}'); } catch { return {}; }
}
function saveReady(map: ReadyMap): void {
  try { localStorage.setItem(READY_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** A dictation queued offline for this pin, waiting to be reviewed. */
export function getReadyDictation(pinId: string): (DictationResult & { createdAt: string }) | null {
  if (!pinId) return null;
  return loadReady()[pinId] || null;
}

/** Clears a pin's ready entry once the inspector has reviewed it (accepted or dismissed). */
export function clearReadyDictation(pinId: string): void {
  const map = loadReady();
  if (!(pinId in map)) return;
  delete map[pinId];
  saveReady(map);
}

/**
 * Processes everything queued offline: transcribes + interprets each, and
 * stashes the result under its pin for the wizard to pick up next time it
 * opens that pin. A failure (network blip, API outage) leaves the recording
 * queued for the next flush rather than discarding it — same discipline as
 * flushPendingPhotos.
 */
export async function flushPendingDictations(): Promise<number> {
  if (!navigator.onLine) return 0;
  let queued: QueuedDictation[];
  try { queued = await listQueued(); } catch { return 0; }
  if (queued.length === 0) return 0;

  let processed = 0;
  const ready = loadReady();
  for (const item of queued) {
    try {
      const result = await requestDictation(item.inspectionType, item.candidates, item.audioBase64, item.mimeType);
      ready[item.pinId] = { ...result, createdAt: item.createdAt };
      await removeQueued(item.id);
      processed++;
    } catch {
      /* keep it queued; try again next flush */
    }
  }
  if (processed > 0) saveReady(ready);
  return processed;
}
