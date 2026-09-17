// Client for POST /api/dictate — see that file for the full request/response
// contract. This module has no inspection-type-specific knowledge; each
// wizard builds its own `candidates` list and interprets `matches` itself.

export interface DictationCandidate {
  id: string;
  label: string;
  section?: string;
}

export interface DictationMatch {
  id: string;
  note?: string;
  status?: string;
  priority?: string;
}

export interface DictationResult {
  transcript: string;
  matches: DictationMatch[];
  category?: string;
  status?: string;
}

export type DictationInspectionType = 'door' | 'ceiling' | 'damper';

export async function requestDictation(
  inspectionType: DictationInspectionType,
  candidates: DictationCandidate[],
  audioBase64: string,
  mimeType: string
): Promise<DictationResult> {
  const res = await fetch('/api/dictate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionType, candidates, audioBase64, mimeType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Dictation request failed (${res.status})`);
  }
  return res.json();
}
