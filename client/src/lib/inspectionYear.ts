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
 *  a new year → a new id (added alongside prior years).
 *
 *  'dinsp' is the damper prefix. It was missing from this union, so the damper
 *  wizard called `recordId('dinsp' as any, ...)` and cast past the very type
 *  guard the helper exists to provide. */
export function recordId(
  prefix: 'insp' | 'cinsp' | 'dinsp',
  pinId: string,
  year: number,
): string {
  return `${prefix}_${pinId}_${year}`;
}

/** The service line a record belongs to.
 *
 *  Door records carry NO `inspectionType` at all -- see types.ts, "absent on
 *  legacy rows; door service line" -- so undefined has to mean doors. Treating
 *  it as its own group would make every door record fail to match itself. */
export function recordType(r: any): string {
  return (r && r.inspectionType) || 'fire_smoke_doors';
}

/** Drop any existing record for the same pin, the same inspection year AND the
 *  same service line, so a re-inspection within the year replaces it while other
 *  years are retained. Records with no pinId are left untouched (they can't be
 *  re-identified).
 *
 *  The service-line match matters because all three wizards write into ONE
 *  `doorInspections` array. Without it, saving a damper record for a pin
 *  deleted the door record for that same pin and year, even though the two have
 *  different ids -- and since the cloud kept both rows, the next sync
 *  re-downloaded the deleted door record and it silently reappeared alongside
 *  the damper one, a state neither the save nor the delete intended.
 *
 *  `type` is REQUIRED rather than defaulted to doors on purpose: a default is
 *  how a ceiling or damper save would quietly keep behaving as a door save, and
 *  a silent default is the exact shape of the bug this argument fixes. Pass
 *  `recordType(record)` or the literal. */
export function dedupeForSave<T extends { pinId?: string }>(
  existing: T[],
  pinId: string | undefined,
  year: number,
  type: string,
): T[] {
  if (!pinId) return existing;
  return existing.filter(
    (r: any) =>
      !(r.pinId === pinId && recordYear(r) === year && recordType(r) === type),
  );
}
