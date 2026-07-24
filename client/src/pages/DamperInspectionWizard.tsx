import { useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getSupabaseConfig, uploadPhotoToSupabase, uploadInspectionRecord } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompress';
import { DamperInspection } from '@/types';
import { DAMPER_CATEGORIES, DAMPER_DEFICIENCIES, DamperCategory, DamperStatus } from '@/lib/damperChecklist';
import { recordId, dedupeForSave } from '@/lib/inspectionYear';

export interface DamperSelectedPin {
  pinId?: string;
  iconNo: string;
  floor: string;
  grid: string;
  x?: number;
  y?: number;
}

interface DamperWizardProps {
  selectedPin: DamperSelectedPin | null;
  onClear?: () => void;
  onPinInspected?: (pinId: string, status: string) => void;
}

const STATUS_STYLE: Record<DamperStatus, string> = {
  pass: 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400',
  fail: 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
  inaccessible: 'border-slate-500 bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

export default function DamperInspectionWizard({ selectedPin, onClear, onPinInspected }: DamperWizardProps) {
  const [inspectorName] = useLocalStorage('inspectorName', '');
  const activeProject = (typeof localStorage !== 'undefined' && localStorage.getItem('activeProject')) || '';

  const [category, setCategory] = useState<DamperCategory | ''>('');
  const [status, setStatus] = useState<DamperStatus | ''>('');
  const [noDamperPresent, setNoDamperPresent] = useState(false);
  const [defs, setDefs] = useState<Set<string>>(new Set());
  const [assetId, setAssetId] = useState('');
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleDef = (d: string) => setDefs((prev) => {
    const next = new Set(prev);
    next.has(d) ? next.delete(d) : next.add(d);
    // Selecting a deficiency implies a Fail.
    if (next.size > 0) setStatus('fail');
    return next;
  });

  const handleAddPhotos = async (files: FileList) => {
    setPhotoUploading(true);
    const cfg = getSupabaseConfig();
    const id = selectedPin?.pinId || selectedPin?.iconNo || 'unknown';
    for (const f of Array.from(files)) {
      let localUrl = '';
      try { localUrl = await compressImage(f); } catch { /* skip unreadable */ }
      if (!localUrl) continue;
      setPhotos((prev) => [...prev, localUrl]);
      if (cfg.url && cfg.key && navigator.onLine) {
        const remote = await uploadPhotoToSupabase(cfg, f, id);
        if (remote) setPhotos((prev) => prev.map((p) => (p === localUrl ? remote : p)));
      }
    }
    setPhotoUploading(false);
  };

  // Ready to save: either no damper present, or a category + a resolved status
  // (a Fail needs at least one deficiency).
  const canSave = noDamperPresent
    ? true
    : !!category && !!status && (status !== 'fail' || defs.size > 0);

  const complete = async () => {
    if (!canSave) return;
    setSaving(true);
    const inspectionYear = new Date().getFullYear();
    const effStatus: DamperStatus = noDamperPresent ? 'pass' : (status as DamperStatus);
    const record: DamperInspection = {
      id: selectedPin?.pinId
        ? recordId('dinsp' as any, selectedPin.pinId, inspectionYear)
        : `dinsp_${Date.now().toString(36)}`,
      pinId: selectedPin?.pinId,
      inspectionType: 'fire_smoke_damper',
      inspectionYear,
      iconNo: selectedPin?.iconNo || '—',
      floorNo: selectedPin?.floor || '—',
      gridBlock: selectedPin?.grid || '',
      x: selectedPin?.x,
      y: selectedPin?.y,
      category: category || '—',
      status: effStatus,
      deficiencies: Array.from(defs),
      noDamperPresent: noDamperPresent || undefined,
      assetId: assetId.trim() || undefined,
      inspectorName: inspectorName || '—',
      projectName: activeProject || '—',
      completedTime: new Date().toISOString(),
      additionalComments: comment.trim() || undefined,
      photos,
      synced: false,
    };

    // Save to the shared record store; replace only this pin's record for THIS year.
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const deduped = dedupeForSave(existing, record.pinId, inspectionYear);
    deduped.push(record);
    localStorage.setItem('doorInspections', JSON.stringify(deduped));

    // Best-effort immediate cloud upload; else sync.ts flushes later.
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key && navigator.onLine) {
      const ok = await uploadInspectionRecord(cfg, record);
      if (ok) {
        localStorage.setItem('doorInspections', JSON.stringify(
          JSON.parse(localStorage.getItem('doorInspections') || '[]').map((r: any) =>
            r.id === record.id ? { ...r, synced: true } : r
          )
        ));
      }
    }

    if (selectedPin?.pinId) onPinInspected?.(selectedPin.pinId, effStatus === 'fail' ? 'fail' : 'pass');
    setSaving(false);
    onClear?.();
  };

  const setStatusExplicit = (s: DamperStatus) => {
    setStatus(s);
    if (s !== 'fail') setDefs(new Set()); // Pass / Inaccessible clear the checklist
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-sm font-semibold">Damper — Icon #{selectedPin?.iconNo || '—'}</div>
          <div className="text-xs text-muted-foreground">
            {selectedPin?.floor || '—'}{selectedPin?.grid ? ` · Grid ${selectedPin.grid}` : ''}
          </div>
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* No damper present */}
        <button
          onClick={() => setNoDamperPresent((v) => !v)}
          className={`w-full text-left text-sm px-3 py-2 rounded-sm border transition-all ${
            noDamperPresent ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          {noDamperPresent ? '☑' : '☐'} No damper present at this location
        </button>

        {!noDamperPresent && (
          <>
            {/* Category */}
            <div>
              <label className="codify-label">Damper Type</label>
              <div className="flex gap-2">
                {DAMPER_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`flex-1 py-2 rounded-sm border text-sm font-medium transition-all ${
                      category === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="codify-label">Result</label>
              <div className="flex gap-2">
                {(['pass', 'fail', 'inaccessible'] as DamperStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusExplicit(s)}
                    className={`flex-1 py-2 rounded-sm border text-sm font-medium transition-all capitalize ${
                      status === s ? STATUS_STYLE[s] : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Deficiency checklist — shown when Fail */}
            {status === 'fail' && (
              <div>
                <label className="codify-label">Deficiencies</label>
                <div className="space-y-1">
                  {DAMPER_DEFICIENCIES.map((d) => (
                    <button
                      key={d}
                      onClick={() => toggleDef(d)}
                      className={`flex items-start gap-2 w-full text-left text-sm px-3 py-2 rounded-sm border transition-all ${
                        defs.has(d) ? 'border-red-500 bg-red-500/5 text-red-600 dark:text-red-400' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="mt-0.5">{defs.has(d) ? '☑' : '☐'}</span>
                      <span>{d}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Asset ID */}
        <div>
          <label className="codify-label">Asset ID (optional)</label>
          <input value={assetId} onChange={(e) => setAssetId(e.target.value)} className="codify-input w-full" placeholder="e.g. 0038" />
        </div>

        {/* Photos */}
        <div>
          <label className="codify-label">Photos</label>
          <div className="flex items-center gap-2 flex-wrap">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt="" className="w-12 h-12 object-cover rounded-sm border border-border" />
                <button
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] leading-none flex items-center justify-center"
                >×</button>
              </div>
            ))}
            <label className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 cursor-pointer">
              {photoUploading ? 'Uploading…' : '+ Add photo'}
              <input
                type="file" accept="image/*" capture="environment" multiple className="hidden"
                onChange={(e) => { if (e.target.files) handleAddPhotos(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="codify-label">Comment (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Add context for the report…" className="codify-input w-full resize-none" />
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-card flex-shrink-0 flex gap-2">
        <button onClick={onClear} className="codify-btn-secondary flex-1">Cancel</button>
        <button onClick={complete} disabled={!canSave || saving} className="codify-btn-primary flex-1 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Damper'}
        </button>
      </div>
    </div>
  );
}
