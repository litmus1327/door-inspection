import { useState, useEffect, useMemo } from 'react';
import { DoorPin, DoorStatus } from '@/types';
import { syncInspections, exportBackup } from '@/lib/sync';
import { usePinStatus } from '@/hooks/usePinStatus';
import { getSupabaseConfig } from '@/lib/supabase';
import { exportFieldwireCsv } from '@/lib/fieldwireExport';
import { ASSEMBLY_TYPE_LABELS } from '@/lib/inspectionRules';
import { recordYear } from '@/lib/inspectionYear';
import {
  DoorRecord, loadDoorInspections, historyForPin,
  upsertRecords, deleteRecords, buildStatusRecord,
} from '@/lib/doorRecords';

interface RecordsTabProps {
  projectName: string;
}

// A display row is either a saved record or a synthetic "not inspected" pin.
interface Row extends DoorRecord {
  _uninspected?: boolean;
  _pin?: DoorPin;
}

type StatusKey = 'pass' | 'fail' | 'conditional' | 'inaccessible' | 'not_inspected';

// Unified status for filtering, counts, and the status pill.
function statusOf(r: Row): StatusKey {
  if (r._uninspected || !r.completedTime) return 'not_inspected';
  const s = (r.overallStatus || r.postInspectionStatus || '') as string;
  if (s === 'inaccessible') return 'inaccessible';
  if (s === 'fail') return 'fail';
  if (s === 'conditional') return 'conditional';
  if (s === 'pass') return 'pass';
  return 'not_inspected';
}

const STATUS_LABEL: Record<StatusKey, string> = {
  pass: 'PASS', fail: 'FAIL', conditional: 'CONDITIONAL',
  inaccessible: 'INACCESSIBLE', not_inspected: 'NOT INSPECTED',
};
const STATUS_PILL: Record<StatusKey, string> = {
  pass: 'bg-green-500/15 text-green-600 dark:text-green-400',
  fail: 'bg-red-500/15 text-red-600 dark:text-red-400',
  // Cyan, matching the pin colour in PDFViewer. It was the same yellow as
  // NOT INSPECTED, so the two were indistinguishable at a glance in the one
  // place a conditional door was visible at all.
  conditional: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  inaccessible: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  not_inspected: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
};

// Fields the Tasks page can edit in bulk (identity corrections).
const BULK_FIELDS = [
  { key: 'floorNo', label: 'Floor' },
  { key: 'gridBlock', label: 'Grid Block' },
  { key: 'assetId', label: 'Asset ID' },
  { key: 'doorRating', label: 'Door Rating (min, 0 = non-rated)' },
] as const;

const ratingLabel = (v?: string) => (v === '0' ? 'Non-Rated' : v ? `${v} min` : '—');

export default function RecordsTab({ projectName }: RecordsTabProps) {
  const [allRecords, setAllRecords] = useState<DoorRecord[]>([]);
  const [pins, setPins] = useState<DoorPin[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [floorFilter, setFloorFilter] = useState<'all' | string>('all');
  const [yearFilter, setYearFilter] = useState<'latest' | number>('latest');

  // Selection + batch
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [batchPanel, setBatchPanel] = useState<null | 'status' | 'edit'>(null);
  const [batchField, setBatchField] = useState<string>('floorNo');
  const [batchValue, setBatchValue] = useState('');
  const [busy, setBusy] = useState(false);

  // Per-record edit
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<DoorRecord>>({});

  const applyPinStatuses = usePinStatus();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const inspectorName = (() => {
    try { return JSON.parse(localStorage.getItem('inspectorName') || '""'); } catch { return ''; }
  })();

  const loadRecords = () => {
    const allPins = Object.values(
      JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
    ).flat() as DoorPin[];
    const projectPins = allPins.filter((p) => p.projectName === projectName);
    const validPinIds = new Set(allPins.map((p) => p.id));

    // Door records for this project whose pin still exists (exclude ceiling).
    const recs = loadDoorInspections().filter(
      (r) => r.pinId && validPinIds.has(r.pinId) &&
        r.projectName === projectName && r.inspectionType !== 'above_below_ceiling'
    );
    setAllRecords(recs);
    setPins(projectPins);
  };

  useEffect(() => {
    (async () => {
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.key) {
        try { await syncInspections(); } catch { /* offline — show local */ }
      }
      loadRecords();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName]);

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of allRecords) ys.add(recordYear(r));
    return Array.from(ys).sort((a, b) => b - a);
  }, [allRecords]);

  // Build display rows: latest record per pin for the selected year, plus
  // "not inspected" pins (only in the Latest view).
  const rows = useMemo<Row[]>(() => {
    const scoped = yearFilter === 'latest'
      ? allRecords
      : allRecords.filter((r) => recordYear(r) === yearFilter);

    const byPin = new Map<string, DoorRecord>();
    for (const r of scoped) {
      const cur = byPin.get(r.pinId!);
      const newer = !cur ||
        recordYear(r) > recordYear(cur) ||
        (recordYear(r) === recordYear(cur) &&
          new Date(r.completedTime || 0).getTime() > new Date(cur.completedTime || 0).getTime());
      if (newer) byPin.set(r.pinId!, r);
    }
    const recordRows: Row[] = Array.from(byPin.values());
    const inspected = new Set(recordRows.map((r) => r.pinId));

    const uninspected: Row[] = yearFilter === 'latest'
      ? pins.filter((p) => !inspected.has(p.id)).map((p) => ({
          id: `uninspected_${p.id}`, pinId: p.id, iconNo: p.iconNo,
          assetId: p.assetId || '—', floorNo: '—', gridBlock: p.gridBlock || '—',
          assemblyType: p.assemblyType || '—', doorRating: '—', inspectorName: '—',
          completedTime: undefined, deficiencies: [], _uninspected: true, _pin: p,
        }))
      : [];

    return [...recordRows, ...uninspected].reverse();
  }, [allRecords, pins, yearFilter]);

  const floorOptions = useMemo(() => {
    const fs = new Set<string>();
    for (const r of rows) if (r.floorNo && r.floorNo !== '—') fs.add(r.floorNo);
    return Array.from(fs).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== 'all' && statusOf(r) !== statusFilter) return false;
    if (typeFilter !== 'all' && r.assemblyType !== typeFilter) return false;
    if (floorFilter !== 'all' && r.floorNo !== floorFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.assetId || '').toLowerCase().includes(s) ||
        (r.iconNo || '').toLowerCase().includes(s) ||
        (r.floorNo || '').toLowerCase().includes(s) ||
        (r.inspectorName || '').toLowerCase().includes(s);
    }
    return true;
  }), [rows, statusFilter, typeFilter, floorFilter, search]);

  const counts = useMemo(() => {
    // `conditional` needs its own bucket. statusOf has always returned it and
    // STATUS_LABEL has always had a pill for it, but there was no counter, so an
    // advisory-only door sat in `total` and in none of the tiles -- present in
    // the list, absent from every total, and impossible to filter to.
    const c = { total: rows.length, pass: 0, conditional: 0, fail: 0, inaccessible: 0, not_inspected: 0 };
    for (const r of rows) {
      const s = statusOf(r);
      if (s === 'pass') c.pass++;
      else if (s === 'conditional') c.conditional++;
      else if (s === 'fail') c.fail++;
      else if (s === 'inaccessible') c.inaccessible++;
      else if (s === 'not_inspected') c.not_inspected++;
    }
    return c;
  }, [rows]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const filteredIds = useMemo(() => filtered.map((r) => r.id), [filtered]);
  const allFilteredChecked = filteredIds.length > 0 && filteredIds.every((id) => checked.has(id));
  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allFilteredChecked) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const toggleOne = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => { setChecked(new Set()); setBatchPanel(null); setBatchValue(''); };

  const selectedRows = useMemo(
    () => rows.filter((r) => checked.has(r.id)),
    [rows, checked]
  );

  // ── Batch actions ───────────────────────────────────────────────────────────
  const applyBatchStatus = async (status: StatusKey) => {
    setBusy(true);
    const year = new Date().getFullYear();
    const toUpsert: DoorRecord[] = [];
    for (const r of selectedRows) {
      if (r._uninspected && r._pin) {
        toUpsert.push(buildStatusRecord(r._pin, projectName, inspectorName, status, year));
      } else {
        toUpsert.push({ ...r, overallStatus: status, postInspectionStatus: status });
      }
    }
    await upsertRecords(toUpsert);
    // Repaint the pins too. Without this the plan kept the old colour for every
    // door touched here, and nothing ever reconciled the two views.
    applyPinStatuses(new Map(
      toUpsert
        .filter((r) => r.pinId)
        .map((r) => [r.pinId as string, status as DoorStatus]),
    ));
    loadRecords();
    clearSelection();
    setBusy(false);
  };

  const applyBatchEdit = async () => {
    if (!batchField) return;
    setBusy(true);
    // Editing identity fields only applies to saved records, not "not inspected" pins.
    const toUpsert = selectedRows
      .filter((r) => !r._uninspected)
      .map((r) => ({ ...r, [batchField]: batchValue }));
    await upsertRecords(toUpsert);
    loadRecords();
    clearSelection();
    setBusy(false);
  };

  const applyBatchDelete = async () => {
    const realIds = new Set(selectedRows.filter((r) => !r._uninspected).map((r) => r.id));
    if (realIds.size === 0) { clearSelection(); return; }
    if (!confirm(`Delete ${realIds.size} inspection record(s)? This cannot be undone.`)) return;
    setBusy(true);
    // Capture the pins BEFORE deleting: afterwards the rows are gone and there
    // is nothing left to map the pin ids from.
    const clearedPins = selectedRows
      .filter((r) => !r._uninspected && r.pinId)
      .map((r) => r.pinId as string);
    await deleteRecords(realIds);
    // A door with no inspection record is not inspected. Leaving the pin on its
    // old colour claimed a verdict that no longer exists anywhere.
    applyPinStatuses(new Map(clearedPins.map((id) => [id, 'not_inspected' as DoorStatus])));
    if (selected && realIds.has(selected.id)) setSelected(null);
    loadRecords();
    clearSelection();
    setBusy(false);
  };

  // ── Per-record edit ─────────────────────────────────────────────────────────
  const startEdit = () => {
    if (!selected) return;
    setEditForm({
      assetId: selected.assetId, floorNo: selected.floorNo, gridBlock: selected.gridBlock,
      assemblyType: selected.assemblyType, doorRating: selected.doorRating,
    });
    setEditing(true);
  };
  const saveEdit = async () => {
    if (!selected) return;
    setBusy(true);
    const updated = { ...selected, ...editForm };
    delete (updated as any)._uninspected;
    delete (updated as any)._pin;
    await upsertRecords([updated]);
    loadRecords();
    setSelected(updated);
    setEditing(false);
    setBusy(false);
  };

  const history = useMemo(
    () => (selected?.pinId ? historyForPin(allRecords, selected.pinId) : []),
    [selected, allRecords]
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
    loadRecords();
    setSyncing(false);
  };

  const selectedCount = selectedRows.length;
  const selectedRealCount = selectedRows.filter((r) => !r._uninspected).length;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Stats / status grouping */}
        <div className="grid grid-cols-6 gap-px border-b border-border bg-border">
          {[
            { label: 'Total', value: counts.total, color: 'text-foreground', key: 'all' as const },
            { label: 'Pass', value: counts.pass, color: 'text-green-600 dark:text-green-400', key: 'pass' as const },
            { label: 'Conditional', value: counts.conditional, color: 'text-cyan-600 dark:text-cyan-400', key: 'conditional' as const },
            { label: 'Fail', value: counts.fail, color: 'text-red-600 dark:text-red-400', key: 'fail' as const },
            { label: 'Inaccessible', value: counts.inaccessible, color: 'text-slate-600 dark:text-slate-300', key: 'inaccessible' as const },
            { label: 'Not Insp.', value: counts.not_inspected, color: 'text-yellow-600 dark:text-yellow-400', key: 'not_inspected' as const },
          ].map((s) => (
            <button
              key={s.label}
              onClick={() => setStatusFilter(statusFilter === s.key ? 'all' : s.key)}
              className={`bg-card px-3 py-3 text-center transition-all ${statusFilter === s.key ? 'ring-1 ring-inset ring-primary' : 'hover:bg-muted/40'}`}
            >
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </button>
          ))}
        </div>

        {/* Filters toolbar */}
        <div className="flex gap-2 p-3 border-b border-border bg-card flex-wrap items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset ID, icon, inspector..."
            className="flex-1 min-w-40 px-3 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground"
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Types</option>
            {Object.entries(ASSEMBLY_TYPE_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <select value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="all">All Floors</option>
            {floorOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={String(yearFilter)}
            onChange={(e) => setYearFilter(e.target.value === 'latest' ? 'latest' : Number(e.target.value))}
            className="px-2 py-1.5 text-xs bg-background border border-border rounded-sm text-foreground">
            <option value="latest">Latest year</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportFieldwireCsv}
            title="Export the Fieldwire-format file that the Codify Reporting Tool ingests."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">
            Export to Reporting Tool
          </button>
          <button onClick={exportBackup}
            title="Save a local backup file (.json) of all inspections and pins on this device."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all">
            Download Backup
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="px-3 py-1.5 border border-primary/50 rounded-sm text-xs font-mono uppercase tracking-wide text-primary hover:bg-primary/10 transition-all disabled:opacity-50">
            {syncing ? 'Syncing…' : 'Sync to Cloud'}
          </button>
          {syncMsg && <span className="text-xs font-mono text-muted-foreground self-center">{syncMsg}</span>}
        </div>

        {/* Batch action bar */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border bg-primary/5">
            <span className="text-xs font-mono text-muted-foreground">{selectedCount} selected</span>
            <button onClick={() => setBatchPanel(batchPanel === 'status' ? null : 'status')}
              className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50">Set status</button>
            <button onClick={() => setBatchPanel(batchPanel === 'edit' ? null : 'edit')}
              disabled={selectedRealCount === 0}
              className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide hover:border-primary/50 disabled:opacity-40">Edit fields</button>
            <button onClick={applyBatchDelete} disabled={busy || selectedRealCount === 0}
              className="px-3 py-1.5 border border-red-500/50 text-red-600 dark:text-red-400 rounded-sm text-xs font-mono uppercase tracking-wide hover:bg-red-500/10 disabled:opacity-40">Delete</button>
            <button onClick={clearSelection}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground">Clear</button>

            {batchPanel === 'status' && (
              <div className="flex items-center gap-2 ml-2">
                {(['pass', 'fail', 'inaccessible'] as StatusKey[]).map((s) => (
                  <button key={s} onClick={() => applyBatchStatus(s)} disabled={busy}
                    className="px-2.5 py-1 rounded-sm text-xs font-mono uppercase border border-border hover:border-primary/50 disabled:opacity-40">
                    {STATUS_LABEL[s]}
                  </button>
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
                <span className="text-xs text-muted-foreground">to {selectedRealCount} record(s)</span>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-4xl mb-4">🚪</div>
              <p className="font-mono text-sm text-muted-foreground">No records match these filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} />
                  </th>
                  {['Icon', 'Asset ID', 'Floor', 'Grid', 'Type', 'Rating', 'Status', 'Deficiencies', 'Inspector', 'Year'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = statusOf(r);
                  const defCount = (r.deficiencies || []).filter((d: any) => d.status === 'deficient').length;
                  return (
                    <tr key={r.id}
                      className={`border-b border-border/50 transition-all ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleOne(r.id)} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.iconNo || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-primary cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.assetId || '—'}</td>
                      <td className="px-3 py-2 text-xs cursor-pointer" onClick={() => { setSelected(r); setEditing(false); }}>{r.floorNo || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.gridBlock || '—'}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{ASSEMBLY_TYPE_LABELS[r.assemblyType || ''] || r.assemblyType || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono">{ratingLabel(r.doorRating)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${STATUS_PILL[st]}`}>{STATUS_LABEL[st]}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {defCount > 0 ? <span className="text-red-600 dark:text-red-400">{defCount} deficiencies</span> : <span className="text-green-600 dark:text-green-400">None</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.inspectorName || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.completedTime ? recordYear(r) : '—'}</td>
                    </tr>
                  );
                })}
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
              {!selected._uninspected && !editing && (
                <button onClick={startEdit} className="text-xs font-mono uppercase tracking-wide border border-border rounded-sm px-2 py-1 hover:border-primary/50">Edit</button>
              )}
              <button onClick={() => { setSelected(null); setEditing(false); }} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Status */}
            <div className={`px-3 py-2 rounded-sm text-center font-mono font-bold text-sm ${STATUS_PILL[statusOf(selected)]}`}>
              {STATUS_LABEL[statusOf(selected)]}
            </div>

            {/* Editable / read-only fields */}
            {editing ? (
              <div className="space-y-3">
                {[
                  { key: 'assetId', label: 'Asset ID' },
                  { key: 'floorNo', label: 'Floor' },
                  { key: 'gridBlock', label: 'Grid Block' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</label>
                    <input value={(editForm as any)[f.key] ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Assembly Type</label>
                  <select value={editForm.assemblyType ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, assemblyType: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground">
                    <option value="">—</option>
                    {Object.entries(ASSEMBLY_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Door Rating (min, 0 = non-rated)</label>
                  <input value={editForm.doorRating ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, doorRating: e.target.value }))}
                    className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={saveEdit} disabled={busy} className="flex-1 px-3 py-2 rounded-sm text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditing(false)} className="px-3 py-2 rounded-sm text-sm border border-border">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { label: 'Asset ID', value: selected.assetId },
                  { label: 'Floor', value: selected.floorNo },
                  { label: 'Grid Block', value: selected.gridBlock },
                  { label: 'Assembly Type', value: ASSEMBLY_TYPE_LABELS[selected.assemblyType || ''] || selected.assemblyType },
                  { label: 'Door Rating', value: ratingLabel(selected.doorRating) },
                  { label: 'Inspector', value: selected.inspectorName },
                  { label: 'Completed', value: selected.completedTime ? new Date(selected.completedTime).toLocaleString() : '—' },
                  { label: 'Synced', value: selected._uninspected ? '—' : (selected.synced ? 'Yes' : 'Pending') },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</p>
                    <p className="text-sm text-foreground mt-0.5">{f.value || '—'}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Per-icon year history */}
            {history.length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">History ({history.length} year{history.length !== 1 ? 's' : ''})</p>
                <div className="space-y-1">
                  {history.map((h) => {
                    const hs = statusOf(h as Row);
                    const isSel = h.id === selected.id;
                    return (
                      <button key={h.id} onClick={() => { setSelected(h as Row); setEditing(false); }}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-sm border text-xs transition-all ${isSel ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                        <span className="font-mono">{recordYear(h)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-mono font-semibold ${STATUS_PILL[hs]}`}>{STATUS_LABEL[hs]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Deficiencies */}
            {(selected.deficiencies || []).length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Deficiencies</p>
                <div className="space-y-2">
                  {selected.deficiencies!.map((d: any, i: number) => (
                    <div key={i} className={`p-2 rounded-sm border text-xs ${d.status === 'deficient' ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'}`}>
                      <p className="font-mono opacity-60 mb-0.5">{d.category}</p>
                      <p>{d.deficiency || d.text}</p>
                      {d.note && <p className="mt-1 opacity-70 italic">{d.note}</p>}
                    </div>
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
