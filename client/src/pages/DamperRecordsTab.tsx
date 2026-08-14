import { useEffect, useMemo, useState } from 'react';
import { DoorPin, DoorStatus, DamperInspection } from '@/types';
import { syncInspections, exportBackup } from '@/lib/sync';
import { usePinStatus } from '@/hooks/usePinStatus';
import { getSupabaseConfig } from '@/lib/supabase';
import { exportDamperCsv } from '@/lib/damperExport';
import { generateDamperLocationSummary } from '@/lib/damperLocationSummary';
import { recordYear } from '@/lib/inspectionYear';
import { loadDoorInspections, upsertRecords, deleteRecords, historyForPin } from '@/lib/doorRecords';
import { DAMPER_CATEGORIES, DAMPER_STATUS_LABEL, DamperStatus } from '@/lib/damperChecklist';

// Tasks page for Fire & Smoke Damper projects. Mirrors the ceiling/door Tasks
// pages but keys on Pass/Fail/Inaccessible + Category (Fire/Smoke/Combination).

interface Props { projectName: string; }

// A display row is either a saved damper record or a synthetic "not inspected"
// pin. Rows were built from RECORDS ALONE, so a damper pin nobody had inspected
// yet produced no row: it was absent from the list, from every status bucket and
// from Total, which is the one number an inspector uses to see what is left.
// The door Tasks page has always done this; this is parity with it.
interface Row extends DamperInspection {
  _uninspected?: boolean;
  _pin?: DoorPin;
}

type StatusKey = DamperStatus | 'not_inspected';

// The row's status for counts, filters and the pill. `_uninspected` is checked
// FIRST and deliberately: a synthetic row carries a placeholder `status`, and
// reading that field directly would count a damper nobody has looked at as a
// PASS -- the same defect as "no damper present" being recorded as a pass.
function statusOf(r: Row): StatusKey {
  if (r._uninspected || !r.completedTime) return 'not_inspected';
  return r.status;
}

const STATUS_PILL: Record<DamperStatus, string> = {
  pass: 'bg-green-500/15 text-green-600 dark:text-green-400',
  fail: 'bg-red-500/15 text-red-600 dark:text-red-400',
  inaccessible: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  // A location with no damper, not an inspection outcome. Not offered by the
  // batch picker or the per-record picker; set by the wizard's checkbox.
  no_damper: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
};

// Pills and labels including the synthetic "not inspected" state, which is not
// a DamperStatus and so is absent from DAMPER_STATUS_LABEL/STATUS_PILL.
const PILL: Record<string, string> = {
  ...STATUS_PILL,
  not_inspected: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
};
const LABEL: Record<string, string> = {
  ...DAMPER_STATUS_LABEL,
  not_inspected: 'Not Inspected',
};

const BULK_FIELDS = [
  { key: 'floorNo', label: 'Floor' },
  { key: 'gridBlock', label: 'Grid Block' },
] as const;

export default function DamperRecordsTab({ projectName }: Props) {
  const [allRecords, setAllRecords] = useState<DamperInspection[]>([]);
  const [pins, setPins] = useState<DoorPin[]>([]);
  const [selected, setSelected] = useState<DamperInspection | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [floorFilter, setFloorFilter] = useState<'all' | string>('all');
  const [yearFilter, setYearFilter] = useState<'latest' | number>('latest');

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [batchPanel, setBatchPanel] = useState<null | 'status' | 'edit'>(null);
  const [batchField, setBatchField] = useState<string>('floorNo');
  const [batchValue, setBatchValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<DamperInspection>>({});

  const applyPinStatuses = usePinStatus();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');

  const loadRecords = () => {
    const allPins = Object.values(JSON.parse(localStorage.getItem('floorPlanPins') || '{}')).flat() as DoorPin[];
    const validPinIds = new Set(allPins.map((p) => p.id));
    const recs = loadDoorInspections().filter(
      (r: any) => r && r.inspectionType === 'fire_smoke_damper' &&
        r.projectName === projectName && (!r.pinId || validPinIds.has(r.pinId))
    );
    setAllRecords(recs as DamperInspection[]);
    setPins(allPins.filter((p) => p.projectName === projectName));
  };

  useEffect(() => {
    (async () => {
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.key) { try { await syncInspections(); } catch { /* offline */ } }
      loadRecords();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  const key = (r: DamperInspection) => r.pinId || r.id;

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of allRecords) ys.add(recordYear(r));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allRecords]);

  const rows = useMemo<Row[]>(() => {
    const scoped = yearFilter === 'latest' ? allRecords : allRecords.filter((r) => recordYear(r) === yearFilter);
    const byPin = new Map<string, DamperInspection>();
    for (const r of scoped) {
      const cur = byPin.get(key(r));
      const newer = !cur || recordYear(r) > recordYear(cur) ||
        (recordYear(r) === recordYear(cur) && new Date(r.completedTime || 0).getTime() > new Date(cur.completedTime || 0).getTime());
      if (newer) byPin.set(key(r), r);
    }
    const recordRows: Row[] = Array.from(byPin.values());
    const inspected = new Set(recordRows.map((r) => r.pinId));

    // Only in the Latest view: in a past year, a pin that did not exist then
    // should not be reported as unfinished work for that year.
    const uninspected: Row[] = yearFilter === 'latest'
      ? pins.filter((p) => !inspected.has(p.id)).map((p) => ({
          id: `uninspected_${p.id}`, pinId: p.id, iconNo: p.iconNo,
          inspectionType: 'fire_smoke_damper' as const,
          floorNo: '—', gridBlock: p.gridBlock || '', category: '—',
          // Placeholder only; statusOf never reads it (see _uninspected).
          status: 'pass' as DamperStatus, deficiencies: [],
          inspectorName: '—', projectName, completedTime: '',
          synced: false, _uninspected: true, _pin: p,
        }))
      : [];

    return [...recordRows, ...uninspected]
      .sort((a, b) => (Number(a.iconNo) || 0) - (Number(b.iconNo) || 0));
  }, [allRecords, pins, yearFilter, projectName]);

  const floorOptions = useMemo(() => {
    const fs = new Set<string>();
    for (const r of rows) if (r.floorNo && r.floorNo !== '—') fs.add(r.floorNo);
    return Array.from(fs).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'all' && statusOf(r) !== statusFilter) return false;
    if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
    if (floorFilter !== 'all' && r.floorNo !== floorFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.iconNo || '').toLowerCase().includes(s) || (r.floorNo || '').toLowerCase().includes(s) ||
        (r.category || '').toLowerCase().includes(s) || (r.inspectorName || '').toLowerCase().includes(s) ||
        (r.deficiencies || []).some((d) => d.toLowerCase().includes(s));
    }
    return true;
  }), [rows, statusFilter, categoryFilter, floorFilter, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    pass: rows.filter((r) => statusOf(r) === 'pass').length,
    fail: rows.filter((r) => statusOf(r) === 'fail').length,
    inaccessible: rows.filter((r) => statusOf(r) === 'inaccessible').length,
    notInspected: rows.filter((r) => statusOf(r) === 'not_inspected').length,
    // These used to be counted as passes, which is the bug that made a location
    // with no damper look like a damper that passed. Giving them their own
    // bucket rather than none: a record that lands in `total` and in no bucket
    // is invisible on this tab, which is the same defect wearing a new hat.
    noDamper: rows.filter((r) => statusOf(r) === 'no_damper').length,
  }), [rows]);

  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allFilteredChecked = filteredIds.length > 0 && filteredIds.every((id) => checked.has(id));
  const toggleAll = () => setChecked((prev) => {
    const next = new Set(prev);
    if (allFilteredChecked) filteredIds.forEach((id) => next.delete(id));
    else filteredIds.forEach((id) => next.add(id));
    return next;
  });
  const toggleOne = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => { setChecked(new Set()); setBatchPanel(null); setBatchValue(''); };
  const selectedRows = useMemo(
    // Synthetic rows are excluded: there is no record behind them to update or
    // delete, and their id matches nothing in storage.
    () => rows.filter((r) => checked.has(r.id) && !r._uninspected),
    [rows, checked],
  );

  const applyBatchStatus = async (status: DamperStatus) => {
    setBusy(true);
    // Clearing the deficiencies is part of setting the status, exactly as in the
    // wizard's setStatusExplicit. Without it, bulk-marking failed dampers as Pass
    // saved records reading Pass while still carrying their deficiency list --
    // which the Reporting Tool parses as real findings on a passing damper.
    const updated = selectedRows.map((r) => ({
      ...r,
      status,
      deficiencies: status === 'fail' ? r.deficiencies : [],
      // The flag and the status have to agree; they are two views of one fact.
      noDamperPresent: status === 'no_damper' ? true : undefined,
    }));
    await upsertRecords(updated as any);
    // Repaint the plan. A damper with no damper present has nothing to inspect,
    // so its pin reads not_inspected rather than claiming an outcome.
    applyPinStatuses(new Map(
      updated
        .filter((r) => r.pinId)
        .map((r) => [
          r.pinId as string,
          (status === 'no_damper' ? 'not_inspected' : status) as DoorStatus,
        ]),
    ));
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
    if (!confirm(`Delete ${ids.size} damper record(s)? This cannot be undone.`)) return;
    setBusy(true);
    const clearedPins = selectedRows.filter((r) => r.pinId).map((r) => r.pinId as string);
    await deleteRecords(ids);
    applyPinStatuses(new Map(clearedPins.map((id) => [id, 'not_inspected' as DoorStatus])));
    if (selected && ids.has(selected.id)) setSelected(null);
    loadRecords(); clearSelection(); setBusy(false);
  };

  const startEdit = () => {
    if (!selected) return;
    setEditForm({ category: selected.category, status: selected.status, floorNo: selected.floorNo, gridBlock: selected.gridBlock, additionalComments: selected.additionalComments });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    const updated = { ...selected, ...editForm } as DamperInspection;
    await upsertRecords([updated] as any);
    loadRecords(); setSelected(updated); setEditing(false); setBusy(false);
  };

  const history = useMemo(() => (selected?.pinId ? historyForPin(loadDoorInspections(), selected.pinId) : []), [selected]);

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
      const r = await generateDamperLocationSummary(projectName, rows as any);
      setPdfMsg(r.ok ? `PDF: ${r.icons} dampers, ${r.photos} photos, ${r.drawings} drawings${r.message ? ` — ${r.message}` : ''}` : (r.message || 'Nothing to export'));
    } catch (e: any) { setPdfMsg(`PDF failed: ${e?.message || 'error'}`); }
    setPdfBusy(false);
  };

  const selectedCount = selectedRows.length;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Status counts (clickable filters) */}
        <div className="grid grid-cols-6 gap-px border-b border-border bg-border">
          {[
            { label: 'Total', value: counts.total, color: 'text-foreground', key: 'all' as const },
            { label: 'Pass', value: counts.pass, color: 'text-green-600 dark:text-green-400', key: 'pass' as const },
            { label: 'Fail', value: counts.fail, color: 'text-red-600 dark:text-red-400', key: 'fail' as const },
            { label: 'Inaccessible', value: counts.inaccessible, color: 'text-slate-600 dark:text-slate-300', key: 'inaccessible' as const },
            { label: 'No Damper', value: counts.noDamper, color: 'text-slate-600 dark:text-slate-300', key: 'no_damper' as const },
            { label: 'Not Insp.', value: counts.notInspected, color: 'text-yellow-600 dark:text-yellow-400', key: 'not_inspected' as const },
          ].map((s) => (
            <button key={s.label} onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
              className={`bg-card px-4 py-3 text-center transition-all ${statusFilter === s.key ? 'ring-1 ring-inset ring-primary' : 'hover:bg-muted/40'}`}>
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters toolbar */}
        <div className="flex gap-2 p-3 border-b border-border bg-card flex-wrap items-center">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search icon, floor, type, deficiency, inspector…"
            className="flex-1 min-w-40 px-3 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Types</option>
            {DAMPER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Floors</option>
            {floorOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={String(yearFilter)} onChange={(e) => setYearFilter(e.target.value === 'latest' ? 'latest' : Number(e.target.value))} className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="latest">Latest year</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => exportDamperCsv(projectName)} title="Export the Fieldwire-format CSV the Codify Reporting Tool ingests (Fire & Smoke Damper)."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">Export CSV</button>
          <button onClick={handleLocationSummary} disabled={pdfBusy} title="Generate the Location Summary PDF (photos + plan drawings) to upload alongside the CSV."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all disabled:opacity-50">{pdfBusy ? 'Building PDF…' : 'Location Summary PDF'}</button>
          <button onClick={exportBackup} title="Save a local backup (.json) of all inspections and pins on this device."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">Download Backup</button>
          <button onClick={handleSync} disabled={syncing} className="px-3 py-1.5 border border-primary/50 rounded-sm text-xs font-mono uppercase tracking-wide text-primary hover:bg-primary/10 transition-all disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync to Cloud'}</button>
          {syncMsg && <span className="text-xs font-mono text-muted-foreground self-center">{syncMsg}</span>}
          {pdfMsg && <span className="text-xs font-mono text-muted-foreground self-center">{pdfMsg}</span>}
        </div>

        {/* Batch action bar */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
            <span className="text-xs font-mono text-muted-foreground">{selectedCount} selected</span>
            <button onClick={() => setBatchPanel(batchPanel === 'status' ? null : 'status')} className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50">Set status</button>
            <button onClick={() => setBatchPanel(batchPanel === 'edit' ? null : 'edit')} className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50">Edit fields</button>
            <button onClick={applyBatchDelete} disabled={busy} className="px-3 py-1.5 border border-red-500/50 text-red-600 dark:text-red-400 rounded-sm text-xs font-mono uppercase tracking-wide hover:bg-red-500/10 disabled:opacity-40">Delete</button>
            <button onClick={clearSelection} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground">Clear</button>
            {batchPanel === 'status' && (
              <div className="flex items-center gap-2 ml-2">
                {(['pass', 'fail', 'inaccessible'] as DamperStatus[]).map((s) => (
                  <button key={s} onClick={() => applyBatchStatus(s)} disabled={busy} className="px-2.5 py-1 rounded-sm text-xs font-mono uppercase border border-border hover:border-primary/50 disabled:opacity-40">{DAMPER_STATUS_LABEL[s]}</button>
                ))}
              </div>
            )}
            {batchPanel === 'edit' && (
              <div className="flex items-center gap-2 ml-2">
                <select value={batchField} onChange={(e) => setBatchField(e.target.value)} className="px-2 py-1 text-xs bg-background border border-border rounded-sm">
                  {BULK_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <input value={batchValue} onChange={(e) => setBatchValue(e.target.value)} placeholder="New value" className="px-2 py-1 text-xs bg-background border border-border rounded-sm w-32" />
                <button onClick={applyBatchEdit} disabled={busy} className="px-2.5 py-1 rounded-sm text-xs font-mono uppercase bg-primary/10 border border-primary/40 text-primary disabled:opacity-40">Apply</button>
                <span className="text-xs text-muted-foreground">to {selectedCount} record(s)</span>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-4xl mb-4">🔲</div>
              <p className="font-mono text-sm text-muted-foreground">No damper records match these filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} /></th>
                  {['Icon', 'Floor', 'Grid', 'Type', 'Status', 'Deficiencies', 'Inspector', 'Year'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`border-b border-border/50 transition-all ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleOne(r.id)} /></td>
                    <td className="px-3 py-2 font-mono text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.iconNo || '—'}</td>
                    <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.floorNo || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.gridBlock || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.noDamperPresent ? '— (no damper)' : r.category}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${PILL[statusOf(r)] || ''}`}>{LABEL[statusOf(r)] || statusOf(r)}</span></td>
                    <td className="px-3 py-2 text-xs">{(r.deficiencies || []).length > 0 ? <span className="text-red-600 dark:text-red-400">{r.deficiencies.length} deficiencies</span> : <span className="text-green-600 dark:text-green-400">None</span>}</td>
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
              {!editing && <button onClick={startEdit} className="text-xs font-mono uppercase tracking-wide border border-border rounded-sm px-2 py-1 hover:border-primary/50">Edit</button>}
              <button onClick={() => { setSelected(null); setEditing(false); }} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className={`px-3 py-2 rounded-sm text-center font-mono font-bold text-sm ${STATUS_PILL[selected.status] || ''}`}>{DAMPER_STATUS_LABEL[selected.status] || selected.status}</div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Type</label>
                  <select value={editForm.category ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground">
                    {DAMPER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Status</label>
                  <div className="flex gap-2 mt-0.5">
                    {(['pass', 'fail', 'inaccessible'] as DamperStatus[]).map((s) => (
                      <button key={s} onClick={() => setEditForm((f) => ({ ...f, status: s }))} className={`flex-1 py-1.5 rounded-sm border text-xs font-medium capitalize ${editForm.status === s ? STATUS_PILL[s] + ' border-current' : 'border-border text-muted-foreground'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                {[{ key: 'floorNo', label: 'Floor' }, { key: 'gridBlock', label: 'Grid Block' }].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</label>
                    <input value={(editForm as any)[f.key] ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))} className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Comment</label>
                  <textarea value={editForm.additionalComments ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, additionalComments: e.target.value }))} rows={2} className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} disabled={busy} className="flex-1 px-3 py-2 rounded-sm text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-sm text-sm border border-border">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: 'Type', value: selected.noDamperPresent ? 'No damper present' : selected.category },
                  { label: 'Floor', value: selected.floorNo },
                  { label: 'Grid Block', value: selected.gridBlock },
                  { label: 'Asset ID', value: selected.assetId },
                  { label: 'Inspector', value: selected.inspectorName },
                  { label: 'Completed', value: selected.completedTime ? new Date(selected.completedTime).toLocaleString() : '—' },
                  { label: 'Synced', value: selected.synced ? 'Yes' : 'Pending' },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</p>
                    <p className="text-sm text-foreground mt-0.5">{f.value || '—'}</p>
                  </div>
                ))}
                {(selected.deficiencies || []).length > 0 && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Deficiencies</p>
                    <div className="space-y-1">
                      {selected.deficiencies.map((d, i) => (
                        <div key={i} className="p-2 rounded-sm border border-red-500/30 bg-red-500/5 text-red-300 text-xs">{d}</div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.additionalComments && (
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Comment</p>
                    <p className="text-sm text-foreground mt-0.5 italic">{selected.additionalComments}</p>
                  </div>
                )}
              </div>
            )}

            {history.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">History ({history.length} year{history.length !== 1 ? 's' : ''})</p>
                <div className="space-y-1">
                  {history.map((h: any) => {
                    const isSel = h.id === selected.id;
                    return (
                      <button key={h.id} onClick={() => { setSelected(h as DamperInspection); setEditing(false); }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm border text-xs transition-all ${isSel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                        <span className="font-mono">{recordYear(h)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-mono font-semibold ${STATUS_PILL[h.status as DamperStatus] || ''}`}>{DAMPER_STATUS_LABEL[h.status as DamperStatus] || h.status || '—'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
