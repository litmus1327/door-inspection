import { useMemo, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getSupabaseConfig, uploadPhotoToSupabase, uploadInspectionRecord } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompress';
import { CeilingInspection } from '@/types';
import {
  CEILING_CATEGORIES,
  CEILING_PRIORITIES,
  CeilingCategory,
  CeilingFinding,
  getFinding,
  searchFindings,
} from '@/lib/ceilingFindings';
import CeilingWalkthrough from '@/components/CeilingWalkthrough';

export interface CeilingSelectedPin {
  pinId?: string;
  iconNo: string;
  floor: string;
  grid: string;
  x?: number;
  y?: number;
}

interface CeilingWizardProps {
  selectedPin: CeilingSelectedPin | null;
  onClear?: () => void;
  // Marks the pin on the plan. Ceiling has no pass/fail — every pin is a finding,
  // so we flag it (reuses the door 'fail'/red marker as "finding logged").
  onPinInspected?: (pinId: string, status: string) => void;
}

const PRIORITY_STYLE: Record<string, string> = {
  'Priority 1': 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
  'Priority 2': 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  'Priority 3': 'border-yellow-500 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

export default function CeilingInspectionWizard({ selectedPin, onClear, onPinInspected }: CeilingWizardProps) {
  const [inspectorName] = useLocalStorage('inspectorName', '');
  const activeProject = (typeof localStorage !== 'undefined' && localStorage.getItem('activeProject')) || '';

  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<CeilingCategory | 'all'>('all');
  const [findingId, setFindingId] = useState('');
  const [priority, setPriority] = useState('Priority 2');
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedFinding = findingId ? getFinding(findingId) : undefined;

  const results = useMemo(() => {
    let list = searchFindings(query);
    if (catFilter !== 'all') list = list.filter((f) => f.category === catFilter);
    return list;
  }, [query, catFilter]);

  // Group results by category for the list view.
  const grouped = useMemo(() => {
    const map = new Map<CeilingCategory, CeilingFinding[]>();
    for (const f of results) {
      const arr = map.get(f.category) || [];
      arr.push(f);
      map.set(f.category, arr);
    }
    return Array.from(map.entries());
  }, [results]);

  const pickFinding = (f: CeilingFinding) => {
    setFindingId(f.id);
    setPriority(f.defaultPriority);
  };

  const handleAddPhotos = async (files: FileList) => {
    setPhotoUploading(true);
    const cfg = getSupabaseConfig();
    const id = selectedPin?.pinId || selectedPin?.iconNo || 'unknown';
    for (const f of Array.from(files)) {
      let localUrl = '';
      try { localUrl = await compressImage(f); } catch { /* skip unreadable file */ }
      if (!localUrl) continue;
      setPhotos((prev) => [...prev, localUrl]);
      if (cfg.url && cfg.key && navigator.onLine) {
        const remote = await uploadPhotoToSupabase(cfg, f, id);
        if (remote) setPhotos((prev) => prev.map((p) => (p === localUrl ? remote : p)));
      }
    }
    setPhotoUploading(false);
  };

  const complete = async () => {
    if (!selectedFinding) return;
    setSaving(true);
    const record: CeilingInspection = {
      id: selectedPin?.pinId ? `cinsp_${selectedPin.pinId}` : `cinsp_${Date.now().toString(36)}`,
      pinId: selectedPin?.pinId,
      inspectionType: 'above_below_ceiling',
      iconNo: selectedPin?.iconNo || '—',
      floorNo: selectedPin?.floor || '—',
      gridBlock: selectedPin?.grid || '',
      x: selectedPin?.x,
      y: selectedPin?.y,
      findingId: selectedFinding.id,
      category: selectedFinding.category,
      finding: selectedFinding.detail,
      priority,
      inspectorName: inspectorName || '—',
      projectName: activeProject || '—',
      completedTime: new Date().toISOString(),
      additionalComments: comment.trim() || undefined,
      photos,
      synced: false,
    };

    // Save to the shared record store (deduped per pin), same key door records use.
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const deduped = record.pinId ? existing.filter((r: any) => r.pinId !== record.pinId) : existing;
    deduped.push(record);
    localStorage.setItem('doorInspections', JSON.stringify(deduped));

    // Best-effort immediate cloud upload; otherwise sync.ts flushes it later.
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key && navigator.onLine) {
      const ok = await uploadInspectionRecord(cfg, record);
      if (ok) {
        record.synced = true;
        localStorage.setItem('doorInspections', JSON.stringify(
          JSON.parse(localStorage.getItem('doorInspections') || '[]').map((r: any) =>
            r.id === record.id ? { ...r, synced: true } : r
          )
        ));
      }
    }

    if (selectedPin?.pinId) onPinInspected?.(selectedPin.pinId, 'fail');
    setSaving(false);
    onClear?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card flex-shrink-0">
        <div>
          <div className="text-sm font-semibold">Ceiling Finding — Icon #{selectedPin?.iconNo || '—'}</div>
          <div className="text-xs text-muted-foreground">
            {selectedPin?.floor || '—'}{selectedPin?.grid ? ` · Grid ${selectedPin.grid}` : ''}
          </div>
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground text-xl leading-none">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {!selectedFinding ? (
          <>
            {/* Guide toggle */}
            <button
              onClick={() => setShowGuide((v) => !v)}
              className="w-full text-left text-xs font-mono uppercase tracking-wide px-3 py-2 rounded-sm border border-border text-muted-foreground hover:border-primary/50"
            >
              {showGuide ? '▾' : '▸'} Where to look — guided walkthrough
            </button>
            {showGuide && (
              <CeilingWalkthrough
                onPick={(id) => { const f = getFinding(id); if (f) pickFinding(f); }}
              />
            )}

            {/* Search */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search findings (e.g. penetration, sprinkler, eyewash)…"
              className="codify-input w-full"
              autoFocus
            />

            {/* Category chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCatFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  catFilter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                All
              </button>
              {CEILING_CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    catFilter === c ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Finding list */}
            <div className="space-y-4">
              {grouped.length === 0 && (
                <p className="text-sm text-muted-foreground">No findings match. Try a different word.</p>
              )}
              {grouped.map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">{cat}</p>
                  <div className="space-y-1">
                    {items.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => pickFinding(f)}
                        className="block w-full text-left text-sm px-3 py-2 rounded-sm border border-border hover:border-primary hover:bg-primary/5 transition-all"
                      >
                        {f.detail}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Selected finding + reference */}
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{selectedFinding.category}</p>
                  <p className="text-sm font-medium mt-0.5">{selectedFinding.detail}</p>
                </div>
                <button
                  onClick={() => setFindingId('')}
                  className="text-xs font-mono uppercase tracking-wide text-muted-foreground border border-border rounded-sm px-2 py-1 hover:border-primary/50 whitespace-nowrap"
                >
                  Change
                </button>
              </div>
            </div>

            {/* SME reference card */}
            <div className="rounded-md border border-border bg-card p-3 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">What to look for</p>
              <p className="text-sm">{selectedFinding.whatToLookFor}</p>
              {selectedFinding.codeRef && (
                <p className="text-xs text-muted-foreground"><span className="font-semibold">Code basis:</span> {selectedFinding.codeRef}</p>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="codify-label">Priority</label>
              <div className="flex gap-2">
                {CEILING_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-sm border text-sm font-medium transition-all ${
                      priority === p ? PRIORITY_STYLE[p] : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
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
                    >
                      ×
                    </button>
                  </div>
                ))}
                <label className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 cursor-pointer">
                  {photoUploading ? 'Uploading…' : '+ Add photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleAddPhotos(e.target.files); e.target.value = ''; }}
                  />
                </label>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="codify-label">Comment (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add context for the report…"
                className="codify-input w-full resize-none"
              />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-card flex-shrink-0 flex gap-2">
        <button onClick={onClear} className="codify-btn-secondary flex-1">Cancel</button>
        <button
          onClick={complete}
          disabled={!selectedFinding || saving}
          className="codify-btn-primary flex-1 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Finding'}
        </button>
      </div>
    </div>
  );
}
