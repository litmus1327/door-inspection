import { useState, useEffect } from 'react';
import { DoorPin } from '@/types';

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  '3hr_fire': '3-Hour Fire Barrier',
  '2hr_fire': '2-Hour Fire Barrier',
  '1hr_fire': '1-Hour Fire Barrier',
  '1hr_partition': '1-Hour Partition',
  'smoke_barrier': 'Smoke Barrier',
  'smoke_partition': 'Smoke Partition',
  'suite_perimeter': 'Suite Perimeter',
};

interface Deficiency {
  category: string;
  deficiency: string;
  note?: string;
  status: string;
}

interface InspectionRecord {
  id: string;
  pinId?: string;
  iconNo: string;
  assetId: string;
  floorNo: string;
  gridBlock: string;
  assemblyType: string;
  doorRating: string;
  inspectorName: string;
  projectName: string;
  completedTime: string;
  overallStatus: 'pass' | 'fail';
  deficiencies: Deficiency[];
  synced: boolean;
}

export default function RecordsTab() {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [selected, setSelected] = useState<InspectionRecord | null>(null);
  const [filter, setFilter] = useState<'all' | 'pass' | 'fail'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Load current pins (source of truth for what exists)
    const allPins = Object.values(
      JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
    ).flat() as DoorPin[];

    const validPinIds = new Set(allPins.map((p: any) => p.id));

    // Load inspection records — only keep those whose pinId still exists
    const allRecords = JSON.parse(localStorage.getItem('doorInspections') || '[]')
      .filter((r: any) => r.pinId && validPinIds.has(r.pinId));

    // Deduplicate by pinId — keep only the most recent record per pin
    const recordsByPin = new Map<string, any>();
    for (const record of allRecords) {
      const existing = recordsByPin.get(record.pinId);
      if (!existing || new Date(record.completedTime) > new Date(existing.completedTime)) {
        recordsByPin.set(record.pinId, record);
      }
    }
    const dedupedRecords = Array.from(recordsByPin.values());

    // Build a set of pinIds that already have a record
    const inspectedPinIds = new Set(dedupedRecords.map((r: any) => r.pinId));

    // For pins with no record yet, generate a "Not Inspected" placeholder row
    const uninspectedRows = allPins
      .filter((p: any) => !inspectedPinIds.has(p.id))
      .map((p: any) => ({
        pinId: p.id,
        iconNo: p.iconNo,
        floorNo: '—',
        gridBlock: '—',
        assetId: p.assetId || '—',
        assemblyType: '—',
        doorRating: '—',
        postInspectionStatus: 'not_inspected',
        deficiencies: [],
        additionalComments: '',
        inspectorName: '—',
        completedTime: null,
      }));

    const tableRows = [...dedupedRecords, ...uninspectedRows];
    setRecords(tableRows.slice().reverse());
  }, []);

  const filtered = records.filter(r => {
    if (filter !== 'all' && r.overallStatus !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.assetId?.toLowerCase().includes(s) ||
        r.iconNo?.toLowerCase().includes(s) ||
        r.floorNo?.toLowerCase().includes(s) ||
        r.inspectorName?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const stats = {
    total: records.length,
    pass: records.filter(r => r.overallStatus === 'pass').length,
    fail: records.filter(r => r.overallStatus === 'fail').length,
    pending: records.filter(r => !r.synced).length,
  };

  const exportCSV = () => {
    const headers = ['Icon No.', 'Asset ID', 'Floor', 'Grid', 'Assembly Type', 'Rating', 'Inspector', 'Date', 'Status', 'Deficiencies'];
    const rows = records.map(r => [
      r.iconNo, r.assetId, r.floorNo, r.gridBlock,
      ASSEMBLY_TYPE_LABELS[r.assemblyType] || r.assemblyType,
      r.doorRating === '0' ? 'Non-Rated' : (r.doorRating + ' min'),
      r.inspectorName,
      new Date(r.completedTime).toLocaleDateString(),
      r.overallStatus,
      (r.deficiencies || []).map(d => d.deficiency).join(' | '),
    ].map(v => `"${String(v || '').replace(/"/g, '""')}"`));
    const csv = [headers.map(h => `"${h}"`).join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspections_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Records list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground' },
            { label: 'Pass', value: stats.pass, color: 'text-green-400' },
            { label: 'Fail', value: stats.fail, color: 'text-red-400' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-400' },
          ].map(s => (
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search asset ID, icon, inspector..."
            className="flex-1 min-w-40 px-3 py-1.5 text-sm bg-background border border-border rounded-sm text-foreground"
          />
          <div className="flex gap-1">
            {(['all', 'pass', 'fail'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide border transition-all ${
                  filter === f
                    ? f === 'pass' ? 'border-green-500 bg-green-500/10 text-green-400' :
                      f === 'fail' ? 'border-red-500 bg-red-500/10 text-red-400' :
                      'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={exportCSV}
            className="px-3 py-1.5 border border-border rounded-sm text-xs font-mono uppercase tracking-wide text-muted-foreground hover:border-primary/50 transition-all"
          >
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="text-4xl mb-4">🚪</div>
              <p className="font-mono text-sm text-muted-foreground">No inspection records yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  {['Icon', 'Asset ID', 'Floor', 'Grid', 'Type', 'Rating', 'Post Inspection Status', 'Deficiencies', 'Inspector', 'Date'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap border-b border-border">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const defCount = (r.deficiencies || []).filter(d => d.status === 'deficient').length;
                  return (
                    <tr
                      key={r.pinId || r.id}
                      onClick={() => setSelected(r)}
                      className={`border-b border-border/50 cursor-pointer transition-all ${
                        selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.iconNo || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-primary">{r.assetId || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.floorNo || '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.gridBlock || '—'}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{ASSEMBLY_TYPE_LABELS[r.assemblyType] || r.assemblyType || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono">{r.doorRating === '0' ? 'Non-Rated' : r.doorRating ? r.doorRating + ' min' : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${
                          r.overallStatus === 'pass' ? 'bg-green-500/15 text-green-400' :
                          r.overallStatus === 'fail' ? 'bg-red-500/15 text-red-400' :
                          'bg-yellow-500/15 text-yellow-400'
                        }`}>
                          {r.overallStatus === 'pass' ? 'PASS' : r.overallStatus === 'fail' ? 'FAIL' : 'NOT INSPECTED'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {defCount > 0 ? <span className="text-red-400">{defCount} deficiencies</span> : <span className="text-green-400">None</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.inspectorName || '—'}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {r.completedTime ? new Date(r.completedTime).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      {selected && (
        <div className="w-80 border-l border-border bg-card overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-mono text-sm font-semibold uppercase tracking-wider">Icon #{selected.iconNo}</h3>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
          </div>

          <div className="p-4 space-y-4">
            {/* Status */}
            <div className={`px-3 py-2 rounded-sm text-center font-mono font-bold text-sm ${
              selected.overallStatus === 'pass' ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
              selected.overallStatus === 'fail' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
              'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
            }`}>
              {selected.overallStatus.toUpperCase()}
            </div>

            {/* Details */}
            {[
              { label: 'Asset ID', value: selected.assetId },
              { label: 'Floor', value: selected.floorNo },
              { label: 'Grid Block', value: selected.gridBlock },
              { label: 'Assembly Type', value: ASSEMBLY_TYPE_LABELS[selected.assemblyType] || selected.assemblyType },
              { label: 'Door Rating', value: selected.doorRating === '0' ? 'Non-Rated' : (selected.doorRating + ' min') },
              { label: 'Inspector', value: selected.inspectorName },
              { label: 'Project', value: selected.projectName },
              { label: 'Completed', value: selected.completedTime ? new Date(selected.completedTime).toLocaleString() : '—' },
              { label: 'Synced', value: selected.synced ? 'Yes' : 'Pending' },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{f.label}</p>
                <p className="text-sm text-foreground mt-0.5">{f.value || '—'}</p>
              </div>
            ))}

            {/* Deficiencies */}
            {(selected.deficiencies || []).length > 0 && (
              <div>
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Deficiencies</p>
                <div className="space-y-2">
                  {selected.deficiencies.map((d, i) => (
                    <div key={i} className={`p-2 rounded-sm border text-xs ${
                      d.status === 'deficient' ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'
                    }`}>
                      <p className="font-mono opacity-60 mb-0.5">{d.category}</p>
                      <p>{d.deficiency}</p>
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
