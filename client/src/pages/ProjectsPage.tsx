import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  getSupabaseConfig,
  listProjects,
  createProject as createProjectRow,
  archiveProject as archiveProjectRow,
  unarchiveProject as unarchiveProjectRow,
  deleteProject as deleteProjectRow,
  listInspectors,
  addInspector as addInspectorRow,
} from '@/lib/supabase';

// Built-in service-line categories. The user can also type their own in the
// New Project form; those are remembered in localStorage ('projectCategories').
const FIXED_CATEGORIES = [
  'Door Inspection',
  'Door Repairs',
  'Above & Below Ceiling Inspection',
  'Fire & Smoke Damper',
  'Battery Light Testing',
];

// A cached project carries its category + archived flag so the list, badges,
// and Archived view all work offline.
interface CachedProject {
  name: string;
  category?: string;
  archived?: boolean;
}

interface ProjectsPageProps {
  onSelectProject: (name: string) => void;
  onCreateProject: (name: string, plan: File) => void;
  // Local cleanup (IndexedDB plan) when a project is permanently deleted.
  onDeleteProject?: (name: string) => void;
}

export default function ProjectsPage({ onSelectProject, onCreateProject, onDeleteProject }: ProjectsPageProps) {
  const [inspectorName, setInspectorName] = useLocalStorage('inspectorName', '');
  // Cached lists so the picker still works offline after a first online load.
  // v2 upgrades the old string[] cache to objects (name + category + archived).
  const [projects, setProjects] = useLocalStorage<CachedProject[]>('cachedProjectsV2', []);
  const [inspectors, setInspectors] = useLocalStorage<string[]>('cachedInspectors', []);
  const [customCategories, setCustomCategories] = useLocalStorage<string[]>('projectCategories', []);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPlan, setNewPlan] = useState<File | null>(null);
  const [addingInspector, setAddingInspector] = useState(false);
  const [newInspector, setNewInspector] = useState('');
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);   // which card's ⋯ menu is open
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const cfg = getSupabaseConfig();
  const connected = !!(cfg.url && cfg.key);

  // One-time migration from the old 'cachedProjects' (string[]) cache so
  // existing devices don't show an empty list before the online load lands.
  useEffect(() => {
    if (projects.length === 0) {
      try {
        const old = JSON.parse(localStorage.getItem('cachedProjects') || '[]');
        if (Array.isArray(old) && old.length) {
          setProjects(
            old
              .map((n: any) => (typeof n === 'string' ? { name: n } : n))
              .filter((x: any) => x && x.name)
          );
        }
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (connected) {
        const [p, i] = await Promise.all([listProjects(cfg), listInspectors(cfg)]);
        if (p) {
          setProjects(
            p
              .map((r) => ({ name: r.name, category: r.category ?? undefined, archived: !!r.archived }))
              .filter((x) => x.name)
          );
        }
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

  // Full category list for the datalist: built-in + anything the user has typed
  // before + anything already in use on a project.
  const allCategories = Array.from(
    new Set([
      ...FIXED_CATEGORIES,
      ...customCategories,
      ...projects.map((p) => p.category).filter(Boolean) as string[],
    ])
  );

  const submitNewProject = () => {
    const name = newName.trim();
    if (!name) { setError('Give the project a name.'); return; }
    if (!newPlan) { setError('Choose a floor-plan PDF.'); return; }
    if (!isPdf(newPlan)) { setError('That file isn’t a PDF.'); return; }
    const category = newCategory.trim();
    if (!projects.some((p) => p.name === name)) {
      setProjects([{ name, category: category || undefined, archived: false }, ...projects]);
    }
    // Remember a newly typed category for next time.
    if (category && !FIXED_CATEGORIES.includes(category) && !customCategories.includes(category)) {
      setCustomCategories([...customCategories, category]);
    }
    if (connected) createProjectRow(cfg, name, category || undefined).catch(() => {});
    onCreateProject(name, newPlan);
  };

  const setArchived = (name: string, archived: boolean) => {
    setProjects(projects.map((p) => (p.name === name ? { ...p, archived } : p)));
    if (connected) (archived ? archiveProjectRow : unarchiveProjectRow)(cfg, name).catch(() => {});
    setMenuFor(null);
  };

  const doDelete = (name: string) => {
    setProjects(projects.filter((p) => p.name !== name));
    if (connected) deleteProjectRow(cfg, name).catch(() => {});
    onDeleteProject?.(name);          // clear the local IndexedDB plan
    setConfirmDelete(null);
    setMenuFor(null);
  };

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const renderCard = (p: CachedProject) => (
    <div
      key={p.name}
      role="button"
      tabIndex={0}
      onClick={() => onSelectProject(p.name)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProject(p.name); } }}
      className="relative flex flex-col justify-between min-h-32 rounded-lg border border-border bg-card p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer"
    >
      <span className="block text-base font-semibold text-foreground pr-7">{p.name}</span>

      {/* Footer: category chip stacked directly above the open line */}
      <div className="mt-3 flex flex-col items-start gap-1.5">
        {p.category && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
            {p.category}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {p.archived ? 'Archived' : 'Tap to open →'}
        </span>
      </div>

      {/* ⋯ actions menu — stopPropagation so it never opens the project */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === p.name ? null : p.name); }}
        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Project actions"
      >
        <span className="text-lg leading-none">⋯</span>
      </button>
      {menuFor === p.name && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuFor(null); }} />
          <div className="absolute top-9 right-2 z-20 w-36 bg-card border border-border rounded-md shadow-lg py-1 text-sm" onClick={(e) => e.stopPropagation()}>
            {p.archived ? (
              <button
                onClick={(e) => { e.stopPropagation(); setArchived(p.name, false); }}
                className="block w-full text-left px-3 py-1.5 hover:bg-secondary"
              >
                Unarchive
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setArchived(p.name, true); }}
                className="block w-full text-left px-3 py-1.5 hover:bg-secondary"
              >
                Archive
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.name); setMenuFor(null); }}
              className="block w-full text-left px-3 py-1.5 text-red-500 hover:bg-secondary"
            >
              Delete…
            </button>
          </div>
        </>
      )}
    </div>
  );

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
          <h1 className="text-2xl font-bold tracking-tight">Home</h1>
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

            {active.map(renderCard)}
          </div>
        )}

        {!loading && active.length === 0 && (
          <p className="text-sm text-muted-foreground mt-4">
            No projects yet. Tap <span className="text-primary font-medium">New Project</span> to add one with its floor plan.
          </p>
        )}

        {/* Archived section */}
        {!loading && archived.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showArchived ? '▾' : '▸'} Archived ({archived.length})
            </button>
            {showArchived && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 opacity-80">
                {archived.map(renderCard)}
              </div>
            )}
          </div>
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
              <label className="codify-label">Category / Service Line</label>
              <input
                list="category-options"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Pick one or type your own"
                className="codify-input w-full"
              />
              <datalist id="category-options">
                {allCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold tracking-tight text-red-500">Delete “{confirmDelete}”?</h2>
            <p className="text-sm text-muted-foreground">
              This permanently removes the project and its cloud data — the floor plan, all pins, and all
              inspection records. This can’t be undone. If you only want to hide it, use Archive instead.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 codify-btn-secondary">Cancel</button>
              <button
                onClick={() => doDelete(confirmDelete)}
                className="flex-1 rounded-sm bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-3 text-sm"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
