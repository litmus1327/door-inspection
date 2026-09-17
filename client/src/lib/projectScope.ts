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
 *  - No project selected: everything matches. The app is usable before a
 *    project is chosen and this must not blank the screen.
 *  - A specific project IS selected: only an exact `projectName` match
 *    counts. A blank/missing `projectName` used to match every project too
 *    (meant to keep old pre-attribution pins visible somewhere), but that
 *    "somewhere" turned out to be EVERY project, forever — a brand new
 *    project immediately showed unrelated old test pins, repeatedly, with no
 *    way to tell them apart from real data. Every pin that's ever fallen into
 *    that bucket on a real device had zero inspection records attached, so an
 *    untagged pin is orphaned debris, not a recoverable inspection. This
 *    function still never deletes anything — an untagged pin just no longer
 *    surfaces inside a project it was never tagged as belonging to.
 */
export function inProject(row: { projectName?: string } | null | undefined,
                          project: string): boolean {
  if (!project) return true;
  const owner = (row?.projectName || '').trim();
  return owner === project;
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
