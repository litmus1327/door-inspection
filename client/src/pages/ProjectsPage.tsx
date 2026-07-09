import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  getSupabaseConfig,
  listProjects,
  createProject as createProjectRow,
  listInspectors,
  addInspector as addInspectorRow,
} from '@/lib/supabase';

interface ProjectsPageProps {
  onSelectProject: (name: string) => void;
  onCreateProject: (name: string, plan: File) => void;
}

export default function ProjectsPage({ onSelectProject, onCreateProject }: ProjectsPageProps) {
  const [inspectorName, setInspectorName] = useLocalStorage('inspectorName', '');
  // Cached lists so the picker still works offline after a first online load.
  const [projects, setProjects] = useLocalStorage<string[]>('cachedProjects', []);
  const [inspectors, setInspectors] = useLocalStorage<string[]>('cachedInspectors', []);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlan, setNewPlan] = useState<File | null>(null);
  const [addingInspector, setAddingInspector] = useState(false);
  const [newInspector, setNewInspector] = useState('');
  const [error, setError] = useState('');

  const cfg = getSupabaseConfig();
  const connected = !!(cfg.url && cfg.key);

  useEffect(() => {
    (async () => {
      if (connected) {
        const [p, i] = await Promise.all([listProjects(cfg), listInspectors(cfg)]);
        if (p) setProjects(p.map((r) => r.name).filter(Boolean));
        if (i) setInspectors(i);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickInspector = (name: string) => setInspectorName(name);

  const submitInspector = async () => {
    const name = newInspector.trim();
    if (!name) return;
    if (!inspectors.includes(name)) setInspectors([...inspectors, name].sort());
    setInspectorName(name);
    setNewInspector('');
    setAddingInspector(false);
    if (connected) addInspectorRow(cfg, name).catch(() => {});
  };

  const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

  const submitNewProject = () => {
    const name = newName.trim();
    if (!name) { setError('Give the project a name.'); return; }
    if (!newPlan) { setError('Choose a floor-plan PDF.'); return; }
    if (!isPdf(newPlan)) { setError('That file isn’t a PDF.'); return; }
    if (!projects.includes(name)) setProjects([name, ...projects]);
    if (connected) createProjectRow(cfg, name).catch(() => {});
    onCreateProject(name, newPlan);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar: identity + logo */}
      <header className="flex items-center justify-between px-4 h-14 border-b-2 border-primary bg-card sticky top-0 z-10">
        <div className="codify-logo text-lg">
          CODIFY<span className="codify-logo-accent">.</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground hidden sm:inline">Inspector:</span>
          <select
            value={inspectorName}
            onChange={(e) => {
              if (e.target.value === '__add__') { setAddingInspector(true); return; }
              pickInspector(e.target.value);
            }}
            className="bg-secondary border border-border rounded-sm px-2 py-1.5 text-sm max-w-44"
          >
            <option value="">Choose your name…</option>
            {inspectors.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="__add__">＋ Add me…</option>
          </select>
        </div>
      </header>

      {addingInspector && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="flex gap-2 items-center bg-card border border-border rounded-sm p-3">
            <input
              value={newInspector}
              onChange={(e) => setNewInspector(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitInspector()}
              placeholder="Your full name"
              className="codify-input flex-1"
              autoFocus
            />
            <button onClick={submitInspector} className="codify-btn-primary">Add</button>
            <button onClick={() => setAddingInspector(false)} className="codify-btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          {!connected && (
            <span className="text-xs text-amber-500">Offline — showing saved projects</span>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading projects…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* New project card */}
            <button
              onClick={() => { setCreating(true); setError(''); }}
              className="flex flex-col items-center justify-center gap-2 min-h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/60 text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="text-3xl leading-none">＋</span>
              <span className="text-sm font-medium">New Project</span>
            </button>

            {projects.map((name) => (
              <button
                key={name}
                onClick={() => onSelectProject(name)}
                className="flex flex-col justify-between min-h-32 rounded-lg border border-border bg-card p-4 text-left hover:border-primary hover:shadow-md transition-all"
              >
                <span className="text-base font-semibold text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground mt-2">Tap to open →</span>
              </button>
            ))}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <p className="text-sm text-muted-foreground mt-4">
            No projects yet. Tap <span className="text-primary font-medium">New Project</span> to add one with its floor plan.
          </p>
        )}
      </main>

      {/* New project modal */}
      {creating && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold tracking-tight">New Project</h2>
            <div>
              <label className="codify-label">Project / Facility Name</label>
              <input
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setError(''); }}
                placeholder="e.g., AdventHealth Redmond"
                className="codify-input w-full"
                autoFocus
              />
            </div>
            <div>
              <label className="codify-label">Floor Plan (PDF)</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => { setNewPlan(e.target.files?.[0] || null); setError(''); }}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-sm file:border file:border-border file:bg-secondary file:text-foreground"
              />
              {newPlan && <p className="text-xs text-muted-foreground mt-1">Selected: {newPlan.name}</p>}
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCreating(false)} className="flex-1 codify-btn-secondary">Cancel</button>
              <button onClick={submitNewProject} className="flex-1 codify-btn-primary">Create & Open</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
