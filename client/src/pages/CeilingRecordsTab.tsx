import { useEffect, useMemo, useState } from 'react';
import { DoorPin, CeilingInspection } from '@/types';
import { syncInspections, exportBackup } from '@/lib/sync';
import { getSupabaseConfig } from '@/lib/supabase';
import { exportCeilingCsv } from '@/lib/ceilingExport';
import { generateCeilingLocationSummary } from '@/lib/ceilingLocationSummary';
import { recordYear } from '@/lib/inspectionYear';
import { loadDoorInspections, upsertRecords, deleteRecords, historyForPin } from '@/lib/doorRecords';
import { CEILING_CATEGORIES } from '@/lib/ceilingFindings';

// Tasks page for Above & Below Ceiling projects. Ceiling has no pass/fail — every
// icon is a finding with a Priority — so this mirrors the door Tasks page
// (pages/RecordsTab.tsx) but keys on Priority/Category instead of pass/fail.

interface Props {
  projectName: string;
}

const PRIORITIES = ['Priority 1', 'Priority 2', 'Priority 3'] as const;

const PRIORITY_BADGE: Record<string, string> = {
  'Priority 1': 'bg-red-500/15 text-red-600 dark:text-red-400',
  'Priority 2': 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'Priority 3': 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
};

// Identity fields the Tasks page can bulk-edit.
const BULK_FIELDS = [
  { key: 'floorNo', label: 'Floor' },
  { key: 'gridBlock', label: 'Grid Block' },
] as const;

export default function CeilingRecordsTab({ projectName }: Props) {
  const [allRecords, setAllRecords] = useState<CeilingInspection[]>([]);
  const [selected, setSelected] = useState<CeilingInspection | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [floorFilter, setFloorFilter] = useState<'all' | string>('all');
  const [yearFilter, setYearFilter] = useState<'latest' | number>('latest');

  // Selection + batch
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [batchPanel, setBatchPanel] = useState<null | 'priority' | 'edit'>(null);
  const [batchField, setBatchField] = useState<string>('floorNo');
  const [batchValue, setBatchValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Per-record edit
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CeilingInspection>>({});

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');

  const loadRecords = () => {
    const allPins = Object.values(
      JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
    ).flat() as DoorPin[];
    const validPinIds = new Set(allPins.map((p) => p.id));
    const recs = loadDoorInspections().filter(
      (r: any) => r && r.inspectionType === 'above_below_ceiling' &&
        r.projectName === projectName && (!r.pinId || validPinIds.has(r.pinId))
    );
    setAllRecords(recs as CeilingInspection[]);
  };

  useEffect(() => {
    (async () => {
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.key) {
        try { await syncInspections(); } catch { /* offline */ }
      }
      loadRecords();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  const key = (r: CeilingInspection) => r.pinId || r.id;

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of allRecords) ys.add(recordYear(r));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allRecords]);

  // Latest record per icon for the selected year.
  const rows = useMemo<CeilingInspection[]>(() => {
    const scoped = yearFilter === 'latest'
      ? allRecords
      : allRecords.filter((r) => recordYear(r) === yearFilter);
    const byPin = new Map<string, CeilingInspection>();
    for (const r of scoped) {
      const cur = byPin.get(key(r));
      const newer = !cur ||
        recordYear(r) > recordYear(cur) ||
        (recordYear(r) === recordYear(cur) &&
          new Date(r.completedTime || 0).getTime() > new Date(cur.completedTime || 0).getTime());
      if (newer) byPin.set(key(r), r);
    }
    return Array.from(byPin.values()).sort((a, b) => (Number(a.iconNo) || 0) - (Number(b.iconNo) || 0));
  }, [allRecords, yearFilter]);

  const floorOptions = useMemo(() => {
    const fs = new Set<string>();
    for (const r of rows) if (r.floorNo && r.floorNo !== '—') fs.add(r.floorNo);
    return Array.from(fs).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (priorityFilter !== 'all' && r.priority !== priorityFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (floorFilter !== 'all' && r.floorNo !== floorFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.iconNo || '').toLowerCase().includes(s) ||
        (r.floorNo || '').toLowerCase().includes(s) ||
        (r.category || '').toLowerCase().includes(s) ||
        (r.finding || '').toLowerCase().includes(s) ||
        (r.inspectorName || '').toLowerCase().includes(s);
    }
    return true;
  }), [rows, priorityFilter, categoryFilter, floorFilter, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    p1: rows.filter((r) => r.priority === 'Priority 1').length,
    p2: rows.filter((r) => r.priority === 'Priority 2').length,
    p3: rows.filter((r) => r.priority === 'Priority 3').length,
  }), [rows]);

  // ── Selection ───────────────────────────────────────────────────────────────
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allFilteredChecked = filteredIds.length > 0 && filteredIds.every((id) => checked.has(id));
  const toggleAll = () => setChecked((prev) => {
    const next = new Set(prev);
    if (allFilteredChecked) filteredIds.forEach((id) => next.delete(id));
    else filteredIds.forEach((id) => next.add(id));
    return next;
  });
  const toggleOne = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => { setChecked(new Set()); setBatchPanel(null); setBatchValue(''); };
  const selectedRows = useMemo(() => rows.filter((r) => checked.has(r.id)), [rows, checked]);

  // ── Batch actions ───────────────────────────────────────────────────────────
  const applyBatchPriority = async (priority: string) => {
    setBusy(true);
    await upsertRecords(selectedRows.map((r) => ({ ...r, priority })) as any);
    loadRecords(); clearSelection(); setBusy(false);
  };
  const applyBatchEdit = async () => {
    if (!batchField) return;
    setBusy(true);
    await upsertRecords(selectedRows.map((r) => ({ ...r, [batchField]: batchValue })) as any);
    loadRecords(); clearSelection(); setBusy(false);
  };
  const applyBatchDelete = async () => {
    const ids = new Set(selectedRows.map((r) => r.id));
    if (ids.size === 0) return;
    if (!confirm(`Delete ${ids.size} finding record(s)? This cannot be undone.`)) return;
    setBusy(true);
    await deleteRecords(ids);
    if (selected && ids.has(selected.id)) setSelected(null);
    loadRecords(); clearSelection(); setBusy(false);
  };

  // ── Per-record edit ─────────────────────────────────────────────────────────
  const startEdit = () => {
    if (!selected) return;
    setEditForm({
      category: selected.category, priority: selected.priority,
      floorNo: selected.floorNo, gridBlock: selected.gridBlock,
      additionalComments: selected.additionalComments,
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    const updated = { ...selected, ...editForm } as CeilingInspection;
    await upsertRecords([updated] as any);
    loadRecords(); setSelected(updated); setEditing(false); setBusy(false);
  };

  const history = useMemo(
    () => (selected?.pinId ? historyForPin(loadDoorInspections(), selected.pinId) : []),
    [selected]
  );

  const handleSync = async () => {
    setSyncing(true); setSyncMsg('');
    const r = await syncInspections();
    // Conflicts are named in the message, not just the console: a door
    // inspected on two devices is worth knowing about even though the sync
    // resolved it (later inspection wins, replaced copy kept).
    setSyncMsg(
      r.ok
        ? `Synced: ${r.uploaded} up, ${r.downloaded} down` +
          (r.conflicts ? ` — ${r.conflicts} door(s) inspected on two devices; kept the later one` : '')
        : (r.error || 'Sync failed')
    );
    loadRecords(); setSyncing(false);
  };

  const handleLocationSummary = async () => {
    setPdfBusy(true); setPdfMsg('');
    try {
      const r = await generateCeilingLocationSummary(projectName, rows as any);
      setPdfMsg(r.ok
        ? `PDF: ${r.icons} icons, ${r.photos} photos, ${r.drawings} drawings${r.message ? ` — ${r.message}` : ''}`
        : (r.message || 'Nothing to export'));
    } catch (e: any) {
      setPdfMsg(`PDF failed: ${e?.message || 'error'}`);
    }
    setPdfBusy(false);
  };

  const selectedCount = selectedRows.length;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Priority counts (clickable filters) */}
        <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
          {[
            { label: 'Findings', value: counts.total, color: 'text-foreground', key: 'all' as const },
            { label: 'Priority 1', value: counts.p1, color: 'text-red-600 dark:text-red-400', key: 'Priority 1' },
            { label: 'Priority 2', value: counts.p2, color: 'text-orange-600 dark:text-orange-400', key: 'Priority 2' },
            { label: 'Priority 3', value: counts.p3, color: 'text-yellow-600 dark:text-yellow-400', key: 'Priority 3' },
          ].map((s) => (
            <button key={s.label}
              onClick={() => setPriorityFilter(priorityFilter === s.key ? 'all' : s.key)}
              className={`bg-card px-4 py-3 text-center transition-all ${priorityFilter === s.key ? 'ring-1 ring-inset ring-primary' : 'hover:bg-muted/40'}`}>
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters toolbar */}
        <div className="flex gap-2 p-3 border-b border-border bg-card flex-wrap items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icon, floor, category, finding, inspector…"
            className="flex-1 min-w-40 px-3 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Categories</option>
            {CEILING_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Floors</option>
            {floorOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={String(yearFilter)}
            onChange={(e) => setYearFilter(e.target.value === 'latest' ? 'latest' : Number(e.target.value))}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="latest">Latest year</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => exportCeilingCsv(projectName)}
            title="Export the Fieldwire-format CSV the Codify Reporting Tool ingests (Above & Below Ceiling)."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">
            Export CSV
          </button>
          <button onClick={handleLocationSummary} disabled={pdfBusy}
            title="Generate the Location Summary PDF (photos + plan drawings) to upload alongside the CSV in the Reporting Tool."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all disabled:opacity-50">
            {pdfBusy ? 'Building PDF…' : 'Location Summary PDF'}
          </button>
          <button onClick={exportBackup}
            title="Save a local backup (.json) of all inspections and pins on this device."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">
            Download Backup
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="px-3 py-1.5 border border-primary/50 rounded-sm text-xs font-mono uppercase tracking-wide text-primary hover:bg-primary/10 transition-all disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync to Cloud'}
          </button>
          {syncMsg && <span className="text-xs font-mono text-muted-foreground self-center">{syncMsg}</span>}
          {pdfMsg && <span className="text-xs font-mono text-muted-foreground self-center">{pdfMsg}</span>}
        </div>

        {/* Batch action bar */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
            <span className="text-xs font-mono text-muted-foreground">{selectedCount} selected</span>
            <button onClick={() => setBatchPanel(batchPanel === 'priority' ? null : 'priority')}
              className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50">Set priority</button>
            <button onClick={() => setBatchPanel(batchPanel === 'edit' ? null : 'edit')}
              className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50">Edit fields</button>
            <button onClick={applyBatchDelete} disabled={busy}
              className="px-3 py-1.5 border border-red-500/50 text-red-600 dark:text-red-400 rounded-sm text-xs font-mono uppercase tracking-wide hover:bg-red-500/10 disabled:opacity-40">Delete</button>
            <button onClick={clearSelection}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground">Clear</button>

            {batchPanel === 'priority' && (
              <div className="flex items-center gap-2 ml-2">
                {PRIORITIES.map((p) => (
                  <button key={p} onClick={() => applyBatchPriority(p)} disabled={busy}
                    className="px-2.5 py-1 rounded-sm text-xs font-mono uppercase border border-border hover:border-primary/50 disabled:opacity-40">{p}</button>
                ))}
              </div>
            )}
            {batchPanel === 'edit' && (
              <div className="flex items-center gap-2 ml-2">
                <select value={batchField} onChange={(e) => setBatchField(e.target.value)}
                  className="px-2 py-1 text-xs bg-background border border-border rounded-sm">
                  {BULK_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <input value={batchValue} onChange={(e) => setBatchValue(e.target.value)}
                  placeholder="New value" className="px-2 py-1 text-xs bg-background border border-border rounded-sm w-32" />
                <button onClick={applyBatchEdit} disabled={busy}
                  className="px-2.5 py-1 rounded-sm text-xs font-mono uppercase bg-primary/10 border border-primary/40 text-primary disabled:opacity-40">Apply</button>
                <span className="text-xs text-muted-foreground">to {selectedCount} record(s)</span>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-4xl mb-4">🏗️</div>
              <p className="font-mono text-sm text-muted-foreground">No findings match these filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} /></th>
                  {['Icon', 'Floor', 'Grid', 'Category', 'Finding', 'Priority', 'Inspector', 'Year'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}
                    className={`border-b border-border/50 transition-all ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleOne(r.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.iconNo || '—'}</td>
                    <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.floorNo || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.gridBlock || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.category}</td>
                    <td className="px-3 py-2 text-xs max-w-md cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.finding}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${PRIORITY_BADGE[r.priority] || 'bg-secondary text-muted-foreground'}`}>{r.priority}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.inspectorName || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.completedTime ? recordYear(r) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 md:static md:z-auto w-full md:w-96 border-l border-border bg-card overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider">Icon #{selected.iconNo}</h3>
            <div className="flex items-center gap-2">
              {!editing && (
                <button onClick={startEdit} className="text-xs font-mono uppercase tracking-wide border border-border rounded-sm px-2 py-1 hover:border-primary/50">Edit</button>
              )}
              <button onClick={() => { setSelected(null); setEditing(false); }} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className={`px-3 py-2 rounded-sm text-center font-mono font-bold text-sm ${PRIORITY_BADGE[selected.priority] || 'bg-secondary text-muted-foreground'}`}>
              {selected.priority}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Category</label>
                  <select value={editForm.category ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground">
                    {CEILING_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Priority</label>
                  <div className="flex gap-2 mt-0.5">
                    {PRIORITIES.map((p) => (
                      <button key={p} onClick={() => setEditForm((f) => ({ ...f, priority: p }))}
                        className={`flex-1 py-1.5 rounded-sm border text-xs font-medium ${editForm.priority === p ? PRIORITY_BADGE[p] + ' border-current' : 'border-border text-muted-foreground'}`}>{p}</button>
                    ))}
                  </div>
                </div>
                {[{ key: 'floorNo', label: 'Floor' }, { key: 'gridBlock', label: 'Grid Block' }].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</label>
                    <input value={(editForm as any)[f.key] ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Comment</label>
                  <textarea value={editForm.additionalComments ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, additionalComments: e.target.value }))}
                    rows={2} className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} disabled={busy} className="flex-1 px-3 py-2 rounded-sm text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-sm text-sm border border-border">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: 'Category', value: selected.category },
                  { label: 'Finding', value: selected.finding },
                  { label: 'Floor', value: selected.floorNo },
                  { label: 'Grid Block', value: selected.gridBlock },
                  { label: 'Inspector', value: selected.inspectorName },
                  { label: 'Completed', value: selected.completedTime ? new Date(selected.completedTime).toLocaleString() : '—' },
                  { label: 'Synced', value: selected.synced ? 'Yes' : 'Pending' },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</p>
                    <p className="text-sm text-foreground mt-0.5">{f.value || '—'}</p>
                  </div>
                ))}
                {selected.additionalComments && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Comment</p>
                    <p className="text-sm text-foreground mt-0.5 italic">{selected.additionalComments}</p>
                  </div>
                )}
              </div>
            )}

            {/* Per-icon year history */}
            {history.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">History ({history.length} year{history.length !== 1 ? 's' : ''})</p>
                <div className="space-y-1">
                  {history.map((h: any) => {
                    const isSel = h.id === selected.id;
                    return (
                      <button key={h.id} onClick={() => { setSelected(h as CeilingInspection); setEditing(false); }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm border text-xs transition-all ${isSel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                        <span className="font-mono">{recordYear(h)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-mono font-semibold ${PRIORITY_BADGE[h.priority] || 'bg-secondary text-muted-foreground'}`}>{h.priority || '—'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photos */}
            {(selected.photos || []).length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Photos</p>
                <div className="flex flex-wrap gap-2">
                  {selected.photos!.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded-sm border border-border" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
