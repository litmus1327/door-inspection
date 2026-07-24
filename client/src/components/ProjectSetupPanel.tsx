import { useState } from 'react';
import { ProjectSetup, Construction, GapStandard, emptyProjectSetup } from '@/lib/projectSetup';

interface ProjectSetupPanelProps {
  initial: ProjectSetup;
  onSave: (setup: ProjectSetup) => void; // called with configured:true + annualYear set
  onCancel?: () => void;                  // only when re-editing an already-configured project
  // 'full' = first-time setup (all questions). 'annual' = yearly re-ask of just the
  // gap standard + the two client-preference questions (construction/sprinklered
  // are answered once and stay sticky). Defaults to 'full'.
  mode?: 'full' | 'annual';
}

const GAP_OPTIONS: { value: GapStandard; label: string }[] = [
  { value: 'codify', label: 'CODIFY (1/4")' },
  { value: 'nfpa80', label: 'NFPA 80' },
  { value: 'preoccupancy', label: 'Pre-Occupancy' },
  { value: 'surveyreadiness', label: 'Survey Readiness' },
];

export default function ProjectSetupPanel({ initial, onSave, onCancel, mode = 'full' }: ProjectSetupPanelProps) {
  const [s, setS] = useState<ProjectSetup>({ ...emptyProjectSetup(), ...initial });
  const isAnnual = mode === 'annual';

  const Segment = <T,>(props: { value: T; set: (v: T) => void; options: { v: T; label: string }[] }) => (
    <div className="flex gap-2">
      {props.options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => props.set(o.v)}
          className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors ${
            props.value === o.v ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary border-border hover:bg-secondary/80'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3">
      <div className="w-full sm:max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold tracking-tight">
            {isAnnual ? "Confirm this year's inspection settings" : 'Project setup'}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isAnnual
              ? 'Confirm the gap standard and client preferences for this year. Required before dropping pins.'
              : 'Answer these once for this project. They shape every inspection. Required before dropping pins.'}
          </p>
        </div>

        <div className="px-4 py-3 space-y-4 max-h-[60vh] overflow-y-auto">
          {!isAnnual && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Construction</label>
              <div className="mt-1">
                <Segment<Construction>
                  value={s.construction}
                  set={(v) => setS({ ...s, construction: v })}
                  options={[{ v: 'existing', label: 'Existing' }, { v: 'new', label: 'New' }]}
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Corridor gap standard</label>
            <select
              value={s.gapStandard}
              onChange={(e) => setS({ ...s, gapStandard: e.target.value as GapStandard })}
              className="mt-1 w-full bg-secondary border border-border rounded-md px-2 py-2 text-sm"
            >
              {GAP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {!isAnnual && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fully sprinklered?</label>
              <div className="mt-1">
                <Segment<boolean>
                  value={s.sprinklered}
                  set={(v) => setS({ ...s, sprinklered: v })}
                  options={[{ v: true, label: 'Yes' }, { v: false, label: 'No' }]}
                />
              </div>
            </div>
          )}

          {/* Client preferences — re-asked every year */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client does NOT want us to cite astragals and sweeps?</label>
            <div className="mt-1">
              <Segment<boolean>
                value={s.noCiteAstragalSweep}
                set={(v) => setS({ ...s, noCiteAstragalSweep: v })}
                options={[{ v: true, label: 'Yes' }, { v: false, label: 'No' }]}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client does NOT want us to cite laminate damage on non-fire door assemblies?</label>
            <div className="mt-1">
              <Segment<boolean>
                value={s.noCiteLaminateNonFire}
                set={(v) => setS({ ...s, noCiteLaminateNonFire: v })}
                options={[{ v: true, label: 'Yes' }, { v: false, label: 'No' }]}
              />
            </div>
          </div>

          {!isAnnual && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assisted mode</label>
              <p className="text-xs text-muted-foreground mt-0.5">On = guided for newer inspectors (reference photos, and you must review every area before finishing a door). Off = fast mode for seasoned inspectors.</p>
              <div className="mt-1">
                <Segment<boolean>
                  value={s.assisted}
                  set={(v) => setS({ ...s, assisted: v })}
                  options={[{ v: true, label: 'On' }, { v: false, label: 'Off' }]}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 codify-btn-secondary text-sm">Cancel</button>}
          <button
            onClick={() => onSave({ ...s, configured: true, annualYear: new Date().getFullYear() })}
            className="flex-1 rounded-sm bg-primary text-primary-foreground font-medium py-2 px-3 text-sm"
          >
            Save & continue
          </button>
        </div>
      </div>
    </div>
  );
}
