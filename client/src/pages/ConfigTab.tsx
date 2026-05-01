import { useLocalStorage } from '@/hooks/useLocalStorage';

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

  const updateVar = <K extends keyof ProjectVars>(key: K, value: ProjectVars[K]) => {
    setProjectVars((prev) => ({ ...prev, [key]: value }));
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
      </div>
    </div>
  );
}
