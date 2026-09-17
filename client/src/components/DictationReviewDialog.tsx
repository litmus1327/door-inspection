import { useState } from 'react';

export interface DictationReviewRow {
  id: string;
  label: string;
  /** Human-readable proposed value, e.g. "Deficient", "Priority 1". */
  proposedValue?: string;
  proposedNote?: string;
}

interface DictationReviewDialogProps {
  transcript: string;
  rows: DictationReviewRow[];
  /** Called with the accepted rows (possibly hand-edited) when the inspector confirms. */
  onConfirm: (rows: DictationReviewRow[]) => void;
  onCancel: () => void;
}

/**
 * Draft-and-confirm review for a dictation's proposed checklist updates.
 * Nothing here is applied until the inspector explicitly confirms — this is a
 * proposed diff, editable and rejectable per item, never a silent auto-save.
 */
export default function DictationReviewDialog({ transcript, rows, onConfirm, onCancel }: DictationReviewDialogProps) {
  const [accepted, setAccepted] = useState<Set<string>>(new Set(rows.map((r) => r.id)));
  const [notes, setNotes] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.id, r.proposedNote || '']))
  );

  const toggle = (id: string) => setAccepted((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const confirm = () => {
    onConfirm(rows.filter((r) => accepted.has(r.id)).map((r) => ({ ...r, proposedNote: notes[r.id] })));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-lg sm:rounded-lg max-h-[85vh] flex flex-col border border-border shadow-lg">
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <p className="text-sm font-semibold">Review dictation</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Confirm or edit what was heard before it's applied. Uncheck anything that's wrong.
          </p>
        </div>

        <div className="overflow-auto flex-1 p-4 space-y-4">
          {transcript && (
            <div className="rounded-sm border border-border bg-secondary/40 p-2.5">
              <p className="codify-label mb-1">What was heard</p>
              <p className="text-sm italic text-muted-foreground">{transcript}</p>
            </div>
          )}

          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing in the recording matched a checklist item. Nothing will be changed.
            </p>
          )}

          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className={`rounded-sm border p-2.5 transition-opacity ${accepted.has(r.id) ? 'border-border' : 'border-border opacity-50'}`}>
                <button
                  onClick={() => toggle(r.id)}
                  className="flex items-start gap-2 w-full text-left"
                >
                  <span className="mt-0.5">{accepted.has(r.id) ? '☑' : '☐'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{r.label}</span>
                    {r.proposedValue && (
                      <span className="ml-2 text-xs font-mono uppercase tracking-wide text-primary">{r.proposedValue}</span>
                    )}
                  </span>
                </button>
                {accepted.has(r.id) && (
                  <textarea
                    value={notes[r.id] || ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    rows={2}
                    placeholder="Note (optional)…"
                    className="codify-input w-full resize-none mt-2 text-xs"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-border flex-shrink-0 flex gap-2">
          <button onClick={onCancel} className="codify-btn-secondary flex-1">Discard</button>
          <button onClick={confirm} className="codify-btn-primary flex-1">
            Apply {accepted.size > 0 ? `${accepted.size} ` : ''}finding{accepted.size === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
