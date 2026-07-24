// Inspection service-line dispatch.
//
// A project carries a `category` (set on the Projects page). The inspect flow
// uses that category to decide which wizard + exporter to run. Today there are
// two engines: the door branch-logic wizard and the ceiling catalog wizard.
// This is deliberately a thin switch, not a full template registry — it is
// trivially promotable to one when a third service line is built.

export type ServiceLine = 'fire_smoke_doors' | 'above_below_ceiling' | 'fire_smoke_damper';

// The exact project category strings that route to each non-door engine.
// Must match FIXED_CATEGORIES in pages/ProjectsPage.tsx.
export const CEILING_CATEGORY = 'Above & Below Ceiling Inspection';
export const DAMPER_CATEGORY = 'Fire & Smoke Damper';

/** Map a project category to its service line. Anything that isn't a recognized
 *  non-door category falls through to the door engine (the app's original one). */
export function serviceLineForCategory(category?: string | null): ServiceLine {
  if (category === CEILING_CATEGORY) return 'above_below_ceiling';
  if (category === DAMPER_CATEGORY) return 'fire_smoke_damper';
  return 'fire_smoke_doors';
}

export function isCeilingCategory(category?: string | null): boolean {
  return category === CEILING_CATEGORY;
}

export function isDamperCategory(category?: string | null): boolean {
  return category === DAMPER_CATEGORY;
}

/** True for any non-door service line (ceiling or damper). These skip the
 *  door-only setup gate and wall-color calibration. */
export function isNonDoorCategory(category?: string | null): boolean {
  return isCeilingCategory(category) || isDamperCategory(category);
}

/** Look up a project's category from the offline projects cache written by
 *  ProjectsPage (localStorage 'cachedProjectsV2'). Returns undefined if the
 *  cache is missing the project (e.g. created on another device, not yet
 *  synced) — callers should treat undefined as the default door service line. */
export function categoryForProject(projectName: string): string | undefined {
  if (!projectName) return undefined;
  try {
    const cached = JSON.parse(localStorage.getItem('cachedProjectsV2') || '[]');
    if (Array.isArray(cached)) {
      const hit = cached.find((p: any) => p && p.name === projectName);
      if (hit && typeof hit.category === 'string') return hit.category;
    }
  } catch {
    /* ignore malformed cache */
  }
  return undefined;
}

/** Convenience: the service line for the currently open project. */
export function activeServiceLine(projectName: string): ServiceLine {
  return serviceLineForCategory(categoryForProject(projectName));
}
