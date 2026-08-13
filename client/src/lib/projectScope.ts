// Which project a pin or a record belongs to.
//
// Pins and inspection records for EVERY project share two localStorage keys,
// `floorPlanPins` and `doorInspections`. Each row carries a `projectName`, but
// most readers never checked it, so one facility's data surfaced inside
// another: project B's plan showed project A's pins, counted them, and
// continued its icon numbering from A's highest number. The door CSV export
// walked every pin on the device regardless of project.
//
// Scoping is done by FILTERING on `projectName`, deliberately, rather than by
// re-keying storage per project. Pins already carry the field (App.handlePinAdded
// sets it, and the comment there says that is what it is for), so filtering needs
// no migration and cannot strand data under an old key. Re-keying would have to
// move every existing device's pins on first launch, and a migration that goes
// wrong on a phone in a hospital basement is not recoverable.

import { DoorPin } from '@/types';

/** The project the app is currently working in. '' when none is selected. */
export function activeProject(): string {
  try {
    return localStorage.getItem('activeProject') || '';
  } catch {
    return '';
  }
}

/**
 * Does this pin or record belong to `project`?
 *
 * Two deliberate escape hatches, both of which fail OPEN (show the data):
 *
 *  - No project selected: everything matches. The app is usable before a
 *    project is chosen and this must not blank the screen.
 *  - The row has no `projectName`: it matches. Pins created before that field
 *    was set cannot be attributed to anyone, and hiding them would make real
 *    inspected doors vanish from the plan with no way to get them back.
 *    Showing them in every project is the old behaviour for those rows only,
 *    which is visible and recoverable; hiding them is neither.
 */
export function inProject(row: { projectName?: string } | null | undefined,
                          project: string): boolean {
  if (!project) return true;
  const owner = (row?.projectName || '').trim();
  return owner === '' || owner === project;
}

/** Every pin on the device, flat, regardless of project. */
export function allPins(): DoorPin[] {
  try {
    return Object.values(
      JSON.parse(localStorage.getItem('floorPlanPins') || '{}')
    ).flat() as DoorPin[];
  } catch {
    return [];
  }
}

/** Every pin belonging to `project` (defaults to the active one), flat. */
export function pinsInProject(project: string = activeProject()): DoorPin[] {
  return allPins().filter((p) => inProject(p, project));
}

/** The page-keyed pin map, filtered to `project`. Pages left empty are dropped. */
export function pinMapInProject(
  pins: Record<number, DoorPin[]>,
  project: string,
): Record<number, DoorPin[]> {
  if (!project) return pins;
  const out: Record<number, DoorPin[]> = {};
  for (const key of Object.keys(pins || {})) {
    const page = Number(key);
    const kept = (pins[page] || []).filter((p) => inProject(p, project));
    if (kept.length) out[page] = kept;
  }
  return out;
}

/** Inspection records belonging to `project` (defaults to the active one). */
export function recordsInProject(
  records: any[],
  project: string = activeProject(),
): any[] {
  return (records || []).filter((r) => inProject(r, project));
}
