import { ASSEMBLY_TYPE_LABELS, ASSEMBLY_PRECEDENCE } from '@/lib/inspectionRules';
import { ProjectCalibration } from '@/lib/wallDetect';

interface WallCalibrationProps {
  calibration: ProjectCalibration;
  armedType: string | null;              // type currently waiting for a tap
  lastPickFailed: boolean;               // last tap found no line
  onArm: (type: string | null) => void;  // arm a type for tapping (or disarm)
  onSetNA: (type: string) => void;
  onClear: (type: string) => void;       // reset a type back to unset
  onFinish: () => void;
  onCancel?: () => void;                  // dismiss when re-calibrating an already-done project
}

// Display order follows assembly-type precedence (fire first, smoke/suite last).
const TYPES = ASSEMBLY_PRECEDENCE;

export default function WallCalibration({
  calibration, armedType, lastPickFailed, onArm, onSetNA, onClear, onFinish, onCancel,
}: WallCalibrationProps) {
  const resolved = TYPES.filter((t) => calibration.types[t] !== undefined).length;
  const allResolved = resolved === TYPES.length;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 sm:bottom-4 sm:right-4 sm:left-auto sm:w-96 pointer-events-none">
      <div className="pointer-events-auto m-2 sm:m-0 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight">Set up wall colors</h2>
            <span className="text-xs text-muted-foreground">{resolved}/{TYPES.length}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {armedType
              ? <>Tap a <b>{ASSEMBLY_TYPE_LABELS[armedType]}</b> line on the plan.</>
              : 'For each wall type, tap a matching line on the plan, or mark it N/A. Required before dropping pins.'}
          </p>
          {armedType && lastPickFailed && (
            <p className="text-xs text-red-500 mt-1">No line found there — tap directly on a colored wall line.</p>
          )}
        </div>

        <div className="max-h-[42vh] overflow-y-auto divide-y divide-border">
          {TYPES.map((type) => {
            const entry = calibration.types[type];
            const isArmed = armedType === type;
            const color = entry && entry !== 'na' ? entry.rgb : null;
            const style = entry && entry !== 'na' ? (entry.style || 'solid') : null;
            return (
              <div
                key={type}
                className={`flex items-center gap-3 px-4 py-2.5 ${isArmed ? 'bg-primary/10' : ''} ${armedType && !isArmed ? 'opacity-50' : ''}`}
              >
                {/* swatch: a short line in the captured color + style (solid/dashed) */}
                {color ? (
                  <span className="shrink-0 w-6 flex items-center" aria-hidden>
                    <span
                      className="w-full"
                      style={{
                        borderTopWidth: 3,
                        borderTopStyle: style === 'dashed' ? 'dashed' : 'solid',
                        borderTopColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                      }}
                    />
                  </span>
                ) : (
                  <span className="shrink-0 w-6 flex items-center justify-center">
                    <span className="w-5 h-5 rounded-full border border-border" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ASSEMBLY_TYPE_LABELS[type]}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry === 'na' ? 'Not on this plan' : color ? `Color set · ${style}` : 'Not set'}
                  </div>
                </div>
                {/* actions */}
                {entry === undefined ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onArm(isArmed ? null : type)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${isArmed ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
                    >
                      {isArmed ? 'Tap plan…' : 'Tap a line'}
                    </button>
                    <button
                      onClick={() => onSetNA(type)}
                      className="px-2.5 py-1 rounded text-xs bg-secondary hover:bg-secondary/80"
                    >
                      N/A
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onClear(type)}
                    className="shrink-0 px-2.5 py-1 rounded text-xs bg-secondary hover:bg-secondary/80"
                  >
                    Change
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-border flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="flex-1 codify-btn-secondary text-sm">Cancel</button>
          )}
          <button
            onClick={onFinish}
            disabled={!allResolved}
            className="flex-1 rounded-sm bg-primary text-primary-foreground font-medium py-2 px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {allResolved ? 'Finish' : `Set all ${TYPES.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
