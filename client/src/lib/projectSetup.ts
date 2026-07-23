/**
 * Per-project inspection setup: the answers that shape the whole inspection
 * (construction type, corridor-gap standard, sprinklered, assisted mode). These
 * used to be GLOBAL localStorage keys ('projectVars', 'assistedMode'), which
 * leaked settings across projects. They're now stored per project (mirroring the
 * per-project wall calibration) and the inspector is required to answer them
 * once, before dropping pins.
 */
export type Construction = 'existing' | 'new';
export type GapStandard = 'codify' | 'nfpa80' | 'preoccupancy' | 'surveyreadiness';

export interface ProjectSetup {
  construction: Construction;
  gapStandard: GapStandard;   // 'codify' = CODIFY 1/4" (the default)
  sprinklered: boolean;
  assisted: boolean;          // "training wheels" — enforces full review + verbose UI
  configured: boolean;        // true once the inspector has answered
}

export function emptyProjectSetup(): ProjectSetup {
  return { construction: 'existing', gapStandard: 'codify', sprinklered: true, assisted: true, configured: false };
}

const KEY = (project: string) => `projectSetup:${project}`;

export function loadProjectSetup(project: string): ProjectSetup {
  const base = emptyProjectSetup();
  if (!project) return base;
  try {
    const raw = localStorage.getItem(KEY(project));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...base, ...parsed };
    }
  } catch { /* ignore */ }
  return base;
}

export function saveProjectSetup(project: string, setup: ProjectSetup): void {
  if (!project) return;
  try { localStorage.setItem(KEY(project), JSON.stringify(setup)); } catch { /* ignore */ }
}
