import { useEffect, useState } from 'react';
import { DoorPin, CeilingInspection } from '@/types';
import { syncInspections, exportBackup } from '@/lib/sync';
import { getSupabaseConfig } from '@/lib/supabase';
import { exportCeilingCsv } from '@/lib/ceilingExport';
import { generateCeilingLocationSummary } from '@/lib/ceilingLocationSummary';

// Records view for Above & Below Ceiling projects. Ceiling has no pass/fail —
// every icon is a finding — so the table shows Category / Finding / Priority
// instead of the door tab's pass/fail + assembly columns. Sibling to
// pages/RecordsTab.tsx (doors); App renders whichever fits the open project.

interface Props {
  projectName: string;
}

const PRIORITY_BADGE: Record<string, string> = {
  'Priority 1': 'bg-red-500/15 text-red-600 dark:text-red-400',
  'Priority 2': 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  'Priority 3': 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
};

export default function CeilingRecordsTab({ projectName }: Props) {
  const [records, setRecords] = useState<CeilingInspection[]>([]);
  const [selected, setSelected] = useState<CeilingInspection | null>(null);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');

  const loadRecords = () => {
    const allPins = Object.values(
      JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
    ).flat() as DoorPin[];
    const validPinIds = new Set(allPins.map((p) => p.id));

    const all = JSON.parse(localStorage.getItem('doorInspections') || '[]') as any[];
    const mine = all.filter(
      (r) =>
        r &&
        r.inspectionType === 'above_below_ceiling' &&
        r.projectName === projectName &&
        (!r.pinId || validPinIds.has(r.pinId))
    );
    // Latest per pin.
    const byPin = new Map<string, CeilingInspection>();
    for (const r of mine) {
      const key = r.pinId || r.id;
      const cur = byPin.get(key);
      if (!cur || new Date(r.completedTime) > new Date(cur.completedTime)) byPin.set(key, r);
    }
    setRecords(Array.from(byPin.values()).sort((a, b) => (Number(a.iconNo) || 0) - (Number(b.iconNo) || 0)));
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

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    const r = await syncInspections();
    setSyncMsg(r.ok ? `Synced: ${r.uploaded} up, ${r.downloaded} down` : (r.error || 'Sync failed'));
    loadRecords();
    setSyncing(false);
  };

  const handleLocationSummary = async () => {
    setPdfBusy(true);
    setPdfMsg('');
    try {
      const r = await generateCeilingLocationSummary(projectName, records);
      setPdfMsg(
        r.ok
          ? `PDF: ${r.icons} icons, ${r.photos} photos, ${r.drawings} drawings${r.message ? ` — ${r.message}` : ''}`
          : (r.message || 'Nothing to export')
      );
    } catch (e: any) {
      setPdfMsg(`PDF failed: ${e?.message || 'error'}`);
    }
    setPdfBusy(false);
  };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.iconNo?.toLowerCase().includes(s) ||
      r.floorNo?.toLowerCase().includes(s) ||
      r.category?.toLowerCase().includes(s) ||
      r.finding?.toLowerCase().includes(s) ||
      r.inspectorName?.toLowerCase().includes(s)
    );
  });

  const stats = {
    total: records.length,
    p1: records.filter((r) => r.priority === 'Priority 1').length,
    p2: records.filter((r) => r.priority === 'Priority 2').length,
    p3: records.filter((r) => r.priority === 'Priority 3').length,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
          {[
            { label: 'Findings', value: stats.total, color: 'text-foreground' },
            { label: 'Priority 1', value: stats.p1, color: 'text-red-600 dark:text-red-400' },
            { label: 'Priority 2', value: stats.p2, color: 'text-orange-600 dark:text-orange-400' },
            { label: 'Priority 3', value: stats.p3, color: 'text-yellow-600 dark:text-yellow-400' },
          ].map((s) => (
            <div key={s.label} className="bg-card px-4 py-3 text-center">
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex gap-2 p-3 border-b border-border bg-card flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search icon, floor, category, finding, inspector…"
            className="flex-1 min-w-40 px-3 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground"
          />
          <button
            onClick={() => exportCeilingCsv(projectName)}
            title="Export the Fieldwire-format CSV the Codify Reporting Tool ingests (Above & Below Ceiling)."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all"
          >
            Export CSV
          </button>
          <button
            onClick={handleLocationSummary}
            disabled={pdfBusy}
            title="Generate the Location Summary PDF (photos + plan drawings) to upload alongside the CSV in the Reporting Tool."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all disabled:opacity-50"
          >
            {pdfBusy ? 'Building PDF…' : 'Location Summary PDF'}
          </button>
          <button
            onClick={exportBackup}
            title="Save a local backup (.json) of all inspections and pins on this device."
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all"
          >
            Download Backup
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 border border-primary/50 rounded-sm text-xs font-mono uppercase tracking-wide text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : 'Sync to Cloud'}
          </button>
          {syncMsg && <span className="text-xs font-mono text-muted-foreground self-center">{syncMsg}</span>}
          {pdfMsg && <span className="text-xs font-mono text-muted-foreground self-center">{pdfMsg}</span>}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-4xl mb-4">🏗️</div>
              <p className="font-mono text-sm text-muted-foreground">No ceiling findings yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  {['Icon', 'Floor', 'Grid', 'Category', 'Finding', 'Priority', 'Inspector', 'Date'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.pinId || r.id}
                    onClick={() => setSelected(r)}
                    className={`border-b border-border/50 cursor-pointer transition-all ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.iconNo || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.floorNo || '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.gridBlock || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{r.category}</td>
                    <td className="px-3 py-2 text-xs max-w-md">{r.finding}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${PRIORITY_BADGE[r.priority] || 'bg-secondary text-muted-foreground'}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.inspectorName || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {r.completedTime ? new Date(r.completedTime).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 md:static md:z-auto w-full md:w-80 border-l border-border bg-card overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider">Icon #{selected.iconNo}</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>
          <div className="p-4 space-y-4">
            <div className={`px-3 py-2 rounded-sm text-center font-mono font-bold text-sm ${PRIORITY_BADGE[selected.priority] || 'bg-secondary text-muted-foreground'}`}>
              {selected.priority}
            </div>
            {[
              { label: 'Category', value: selected.category },
              { label: 'Finding', value: selected.finding },
              { label: 'Floor', value: selected.floorNo },
              { label: 'Grid Block', value: selected.gridBlock },
              { label: 'Inspector', value: selected.inspectorName },
              { label: 'Project', value: selected.projectName },
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
