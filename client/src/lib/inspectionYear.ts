// Annual inspection cycles.
//
// A hospital's doors (and ceiling/damper icons) are inspected every year in the
// SAME project, and we keep a running per-icon history. To do that, each record
// carries an `inspectionYear` and its id includes that year, so re-inspecting a
// pin in a new year ADDS a record instead of overwriting last year's. Within one
// year a re-inspection still replaces (you don't want two 2026 records for one
// door). See types.ts (DoorInspection / CeilingInspection) and the wizard save
// paths that use these helpers.

/** Calendar year of an ISO timestamp, or the current year if missing/invalid. */
export function yearOf(iso?: string | null): number {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
}

/** The inspection year for any record: the explicit `inspectionYear` when set,
 *  otherwise derived from `completedTime`. This lets legacy records (saved before
 *  the field existed) slot into their year with no migration step. */
export function recordYear(r: any): number {
  if (r && typeof r.inspectionYear === 'number') return r.inspectionYear;
  return yearOf(r?.completedTime);
}

/** Stable per-pin, per-year record id. Same pin + same year → same id (upsert);
 *  a new year → a new id (added alongside prior years). */
export function recordId(prefix: 'insp' | 'cinsp', pinId: string, year: number): string {
  return `${prefix}_${pinId}_${year}`;
}

/** Drop any existing record for the same pin AND the same inspection year, so a
 *  re-inspection within the year replaces it while other years are retained.
 *  Records with no pinId are left untouched (they can't be re-identified). */
export function dedupeForSave<T extends { pinId?: string }>(
  existing: T[],
  pinId: string | undefined,
  year: number,
): T[] {
  if (!pinId) return existing;
  return existing.filter((r: any) => !(r.pinId === pinId && recordYear(r) === year));
}
