import { useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface SetupPageProps {
  onComplete: () => void;
}

export default function SetupPage({ onComplete }: SetupPageProps) {
  const [inspectorName, setInspectorName] = useLocalStorage('inspectorName', '');
  const [projectName, setProjectName] = useLocalStorage('activeProject', '');
  const [supabaseUrl, setSupabaseUrl] = useLocalStorage('supabaseUrl', '');
  const [supabaseKey, setSupabaseKey] = useLocalStorage('supabaseKey', '');
  const [step, setStep] = useState<'inspector' | 'project' | 'supabase' | 'complete'>('inspector');

  const handleNext = () => {
    if (step === 'inspector' && !inspectorName.trim()) return;
    if (step === 'project' && !projectName.trim()) return;
    
    if (step === 'inspector') setStep('project');
    else if (step === 'project') setStep('supabase');
    else if (step === 'supabase') setStep('complete');
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <h1 className="codify-logo text-3xl mb-2">
            CODIFY<span className="codify-logo-accent">.</span>
          </h1>
          <p className="text-muted-foreground">Door Inspection System</p>
        </div>

        {/* Card */}
        <div className="codify-card">
          {step === 'inspector' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Welcome</h2>
                <p className="text-sm text-muted-foreground">Let's set up your inspector profile.</p>
              </div>

              <div>
                <label className="codify-label">Inspector Name</label>
                <input
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  placeholder="Your name"
                  className="codify-input"
                  autoFocus
                />
              </div>

              <button
                onClick={handleNext}
                disabled={!inspectorName.trim()}
                className="w-full codify-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}

          {step === 'project' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Project</h2>
                <p className="text-sm text-muted-foreground">Which project are you inspecting?</p>
              </div>

              <div>
                <label className="codify-label">Project / Facility Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g., AdventHealth Redmond"
                  className="codify-input"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('inspector')}
                  className="flex-1 codify-btn-secondary"
                >
                  ← Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!projectName.trim()}
                  className="flex-1 codify-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'supabase' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Cloud Sync (Optional)</h2>
                <p className="text-sm text-muted-foreground">
                  Connect to Supabase to sync inspections across your team. You can skip this for now.
                </p>
              </div>

              <div>
                <label className="codify-label">Supabase URL</label>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="codify-input"
                />
              </div>

              <div>
                <label className="codify-label">Supabase Anon Key</label>
                <input
                  type="password"
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="Your anon key"
                  className="codify-input"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('project')}
                  className="flex-1 codify-btn-secondary"
                >
                  ← Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 codify-btn-primary"
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-6 text-center">
              <div>
                <div className="text-4xl mb-4">✓</div>
                <h2 className="text-xl font-bold text-foreground mb-2">All Set!</h2>
                <p className="text-sm text-muted-foreground">
                  You're ready to start inspecting doors. Upload a floor plan PDF to begin.
                </p>
              </div>

              <button
                onClick={handleComplete}
                className="w-full codify-btn-primary"
              >
                Start Inspecting →
              </button>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mt-8 flex gap-2 justify-center">
          {['inspector', 'project', 'supabase', 'complete'].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                ['inspector', 'project', 'supabase', 'complete'].indexOf(s) <
                ['inspector', 'project', 'supabase', 'complete'].indexOf(step)
                  ? 'bg-primary'
                  : s === step
                    ? 'bg-primary'
                    : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
