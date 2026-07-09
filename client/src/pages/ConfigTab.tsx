import { useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { getSupabaseConfig, setSupabaseConfig, testSupabaseConnection } from '@/lib/supabase';

interface ProjectVars {
  construction: 'existing' | 'new';
  gapStandard: 'codify' | 'nfpa80' | 'preoccupancy' | 'surveyreadiness';
  sprinklered: boolean;
}

export default function ConfigTab() {
  const [projectVars, setProjectVars] = useLocalStorage<ProjectVars>('projectVars', {
    construction: 'existing',
    gapStandard: 'codify',
    sprinklered: true,
  });

  const [assistedMode, setAssistedMode] = useLocalStorage('assistedMode', true);

  const updateVar = <K extends keyof ProjectVars>(key: K, value: ProjectVars[K]) => {
    setProjectVars((prev) => ({ ...prev, [key]: value }));
  };

  const initialSb = getSupabaseConfig();
  const [sbUrl, setSbUrl] = useState(initialSb.url);
  const [sbKey, setSbKey] = useState(initialSb.key);
  const [sbMsg, setSbMsg] = useState('');

  const saveSupabase = () => {
    setSupabaseConfig(sbUrl.trim(), sbKey.trim());
    setSbMsg('Saved.');
  };
  const testSupabase = async () => {
    setSbMsg('Testing…');
    setSupabaseConfig(sbUrl.trim(), sbKey.trim());
    const ok = await testSupabaseConnection({ url: sbUrl.trim(), key: sbKey.trim() });
    setSbMsg(ok ? 'Connected ✓' : 'Could not connect — check the URL/key and that the schema was run.');
  };

  const gapStandardOptions = [
    { value: 'codify', label: 'CODIFY 1/4"' },
    { value: 'nfpa80', label: 'NFPA 80 1/8" ±1/16"' },
    { value: 'preoccupancy', label: 'Pre-Occupancy 3/16"' },
    { value: 'surveyreadiness', label: 'Survey Readiness 3/8"' },
  ];

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">Project Settings</h1>

      <div className="space-y-8">
        {/* Assisted Mode */}
        <div>
          <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Assisted Mode
          </label>
          <div className="flex gap-2">
            {([true, false] as const).map((on) => (
              <button
                key={String(on)}
                onClick={() => setAssistedMode(on)}
                className={`px-4 py-2 rounded border transition-all font-medium ${
                  assistedMode === on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:border-primary/50'
                }`}
              >
                {on ? 'On' : 'Off'}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 max-w-md">
            On shows reference photos, plain-language descriptions, and the door diagram by default — best for learning. Off is a faster, compact layout for experienced inspectors. Inspection rules and checks are identical either way.
          </p>
        </div>

        {/* Construction Type */}
        <div>
          <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Construction Type
          </label>
          <div className="flex gap-2">
            {(['existing', 'new'] as const).map((type) => (
              <button
                key={type}
                onClick={() => updateVar('construction', type)}
                className={`px-4 py-2 rounded border transition-all font-medium ${
                  projectVars.construction === type
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:border-primary/50'
                }`}
              >
                {type === 'existing' ? 'Existing' : 'New'}
              </button>
            ))}
          </div>
        </div>

        {/* Perimeter Gap Standard */}
        <div>
          <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Perimeter Gap Standard
          </label>
          <select
            value={projectVars.gapStandard}
            onChange={(e) => updateVar('gapStandard', e.target.value as ProjectVars['gapStandard'])}
            className="w-full px-4 py-2 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {gapStandardOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Sprinkler System */}
        <div>
          <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Is the building fully sprinklered?
          </label>
          <div className="flex gap-2">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                onClick={() => updateVar('sprinklered', value)}
                className={`px-4 py-2 rounded border transition-all font-medium ${
                  projectVars.sprinklered === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:border-primary/50'
                }`}
              >
                {value ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        </div>

        {/* Cloud Sync (Supabase) */}
        <div>
          <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
            Cloud Sync (Supabase)
          </label>
          <p className="text-xs text-muted-foreground mb-3">
            Paste your Supabase Project URL and anon public key to sync inspection records. Use the anon public key, not the service_role key.
          </p>
          <input
            value={sbUrl}
            onChange={(e) => setSbUrl(e.target.value)}
            placeholder="https://your-project.supabase.co"
            className="w-full px-4 py-2 mb-2 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            value={sbKey}
            onChange={(e) => setSbKey(e.target.value)}
            placeholder="anon public key"
            type="password"
            className="w-full px-4 py-2 mb-3 rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={saveSupabase}
              className="px-4 py-2 rounded border border-primary bg-primary text-primary-foreground font-medium"
            >
              Save
            </button>
            <button
              onClick={testSupabase}
              className="px-4 py-2 rounded border border-border text-foreground hover:border-primary/50 font-medium"
            >
              Test connection
            </button>
            {sbMsg && <span className="text-sm text-muted-foreground">{sbMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
