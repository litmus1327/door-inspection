import { useState, useEffect } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getSupabaseConfig, listInspectors, addInspector } from '@/lib/supabase';

// One-time "who are you?" gate. Shown when this device has no inspector name yet.
// Once picked, the name persists on the device and is stamped on pins/records
// automatically — no per-project prompt, no login.
export default function InspectorGate({ onDone }: { onDone: (name: string) => void }) {
  const [inspectors, setInspectors] = useLocalStorage<string[]>('cachedInspectors', []);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const cfg = getSupabaseConfig();
  const connected = !!(cfg.url && cfg.key);

  useEffect(() => {
    (async () => {
      if (connected) {
        const i = await listInspectors(cfg);
        if (i) setInspectors(i);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitNew = () => {
    const n = newName.trim();
    if (!n) return;
    if (!inspectors.includes(n)) setInspectors([...inspectors, n].sort());
    if (connected) addInspector(cfg, n).catch(() => {});
    onDone(n);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center px-4 h-14 border-b-2 border-primary bg-card">
        <div className="codify-logo text-lg">CODIFY<span className="codify-logo-accent">.</span></div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-lg p-5 space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Who's inspecting?</h1>
            <p className="text-sm text-muted-foreground mt-1">We'll remember you on this device and record your name automatically. You can switch later from the Projects screen.</p>
          </div>

          {!adding ? (
            <>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                {inspectors.map((n) => (
                  <button
                    key={n}
                    onClick={() => onDone(n)}
                    className="w-full text-left px-3 py-2.5 rounded-md border border-border bg-secondary hover:border-primary hover:bg-secondary/80 transition-colors"
                  >
                    {n}
                  </button>
                ))}
                {inspectors.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No names yet — add yours below.</p>
                )}
              </div>
              <button onClick={() => setAdding(true)} className="w-full codify-btn-secondary">＋ Add me</button>
            </>
          ) : (
            <div className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNew()}
                placeholder="Your full name"
                className="codify-input w-full"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className="flex-1 codify-btn-secondary">Back</button>
                <button onClick={submitNew} className="flex-1 codify-btn-primary">Continue</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
