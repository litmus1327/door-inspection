# Multi-Project Architecture Plan

This document defines the multi-project feature for the Codify Door Inspection
app. It is the source of truth for the build order, data model, and scope. Any
deviation from this plan should be discussed and the document updated before
implementation.

## Why this is being built

Codify currently uses Fieldwire as its inspection tool. Fieldwire works for
generic construction punch-list workflows but has three limitations that make
it the wrong tool for fire door inspection:

1. **No branch logic.** Fieldwire's checklists are flat — every item is
   independent. Fire door inspection is a decision tree: the right next
   question depends on the previous answer, the assembly type, and the
   facility characteristics. This app already encodes that tree in
   `InspectionWizard.tsx`.
2. **No real reports.** Fieldwire exports raw CSV. A hospital DPO needs a
   CMS-defensible deliverable with photos, NFPA code citations, deficiency
   summaries, and a remediation plan. The deliverable is the product Codify
   sells; the inspection is the input.
3. **No repair lifecycle.** Fieldwire stops at "this door failed." Codify's
   Survey-Ready Guarantee depends on closing the loop — tracking what was
   repaired, when, by whom, and verifying it now passes.

Multi-project support is a prerequisite for replacing Fieldwire because
without it the app cannot be used for more than one client at a time.

## Goals for the v1 scope

The v1 of multi-project is intentionally minimal. Every feature listed below
is in scope; everything else is deferred.

**In scope for v1:**

- A home screen that lists all projects the user has created.
- Creating a project with two fields: name (text) and type (one of
  `Door Inspection`, `Door Repairs`, `Pre-Occupancy`, `MEP`).
- Clicking a project loads that project's pins, PDFs, and inspections.
- Deleting a project (with confirmation), which cleanly removes its data.
- All project data is stored in Supabase with localStorage as a
  read-through cache for offline use.
- The user's existing single-project data is preserved as an "Untitled
  Project" on first load after the migration ships.

**Explicitly out of scope for v1:**

- Sort, filter, or search on the project list. Codify will have 5–25
  projects, not hundreds. Scrolling is fine.
- Favoriting, archiving, or pinning projects.
- Sharing projects between users / per-project permissions / collaborator
  badges. The four Codify employees will all see all projects.
- Project templates or duplication.
- Auto-fill of project metadata from the uploaded PDF title block. This
  feature sounds small and is actually large (OCR, varying title block
  formats, ambiguity between architect vs. facility addresses). It belongs
  in a later phase, likely combined with the photo-capture / vision-model
  work already on the roadmap.
- Activity feeds, audit logs, change history.
- Project-level fields beyond name and type. Address, client contact, etc.
  are deferred until the report-generator phase, where they actually become
  necessary.

## Data model

### Project

```ts
interface Project {
  id: string;              // UUID, generated client-side at creation
  name: string;            // user-supplied, required, max 120 chars
  type: ProjectType;       // enum, required
  createdAt: string;       // ISO 8601 timestamp
  updatedAt: string;       // ISO 8601 timestamp, bumped on any project edit
  ownerId: string;         // Supabase auth user id, set server-side
}

type ProjectType =
  | 'door_inspection'
  | 'door_repairs'
  | 'pre_occupancy'
  | 'mep';
```

### Project-scoped data

Every existing piece of inspection data becomes scoped to a project. The
current localStorage keys are flat (e.g. `floorPlanPins`); they need to be
namespaced by project id.

| Current key            | New shape                                              |
|------------------------|--------------------------------------------------------|
| `inspectorName`        | Stays global (it's the user, not the project)          |
| `activeProject`        | Becomes `activeProjectId: string \| null`              |
| `floorPlanPins`        | Per-project: `floorPlanPins:<projectId>`               |
| `doorInspections`      | Per-project: `doorInspections:<projectId>`             |
| `hiddenPages`          | Per-project: `hiddenPages:<projectId>`                 |
| `supabaseUrl`/`Key`    | Stays global (Supabase config is user-level)           |
| `syncStatus`           | Becomes `syncStatus:<projectId>`                       |

The IndexedDB `codify_floorplan` database, currently storing one PDF blob
under key `floorplan`, becomes a store keyed by project id:
`floorplan:<projectId>`.

## Supabase schema

Three tables. Row-level security enforces that users can only access their
own projects.

### `projects`

| Column      | Type                  | Notes                              |
|-------------|-----------------------|------------------------------------|
| id          | uuid (primary key)    | Generated client-side              |
| name        | text not null         |                                    |
| type        | text not null         | Check constraint to the four enum values |
| owner_id    | uuid not null         | References `auth.users.id`         |
| created_at  | timestamptz default now() |                                |
| updated_at  | timestamptz default now() | Trigger to bump on update      |

### `door_pins`

| Column         | Type                  | Notes                          |
|----------------|-----------------------|--------------------------------|
| id             | uuid (primary key)    | The existing `pinId`           |
| project_id     | uuid not null         | Foreign key to `projects.id`   |
| icon_no        | integer not null      | Global pin sequence within project |
| page_number    | integer not null      | Floor plan global page number  |
| x              | float not null        | Pin coordinate                 |
| y              | float not null        | Pin coordinate                 |
| grid_block     | text                  | Optional grid label            |
| status         | text                  | pass / fail / inaccessible     |
| created_at     | timestamptz default now() |                            |

### `door_inspections`

| Column         | Type                  | Notes                          |
|----------------|-----------------------|--------------------------------|
| id             | uuid (primary key)    |                                |
| pin_id         | uuid not null         | Foreign key to `door_pins.id`  |
| project_id     | uuid not null         | Denormalized for query speed   |
| assembly_type  | text                  |                                |
| hardware_state | jsonb                 | The full HW_STATE map          |
| answers        | jsonb                 | Branch answers and checklist results |
| deficiencies   | jsonb                 | Array of deficiency records by item id |
| updated_at     | timestamptz default now() |                            |

The PDF blob continues to live in IndexedDB on the client. Storing PDFs in
Supabase Storage is a v2 concern — for v1 the user re-uploads the PDF if
they switch devices. This is a deliberate scope cut.

## Migration strategy

A one-shot migration runs on first load after the new code ships. It is
gated by a localStorage flag `multiProjectMigrationComplete:v1` that is set
once the migration succeeds.

The migration logic, in plain English:

1. Check the migration flag. If set, skip everything below.
2. Read the existing flat keys: `floorPlanPins`, `doorInspections`,
   `hiddenPages`, and any IndexedDB floor plan blob.
3. If any of that data exists, create a project record locally:
   - `id`: new UUID
   - `name`: "Untitled Project"
   - `type`: `door_inspection` (the safe default)
   - Timestamps: now
4. Move the data into project-scoped keys using the new project's id.
5. Delete the old flat keys.
6. Set `activeProjectId` to the new project's id so the user lands in the
   migrated project on first load and sees their work intact.
7. Set the migration flag.
8. The next time Supabase sync runs, push the project record up.

If any step fails, the migration flag is NOT set, so it can be retried on
next load. The old flat keys are deleted last to ensure no data is lost
mid-migration.

## Build order

The work is sequenced so each session ends with something visibly working,
even if the full feature isn't done. Sessions are sized for 1–2 hours each.

### Session 1: Supabase setup, no UI changes

- Install `@supabase/supabase-js` (already in the project? verify).
- Create the three tables in Supabase using the schema above.
- Configure row-level security policies.
- Add a typed Supabase client wrapper at `client/src/lib/supabase.ts`
  (file already exists — extend rather than replace).
- Build a `useProjects()` hook that lists/creates/deletes projects against
  Supabase. No UI yet — verify with React DevTools or `console.log`.
- Acceptance: from the browser console, `useProjects` can fetch an empty
  list, create a project, and delete it. Round-trip works end-to-end.

### Session 2: Data scoping migration, no new UI

- Implement the one-shot migration described above. Run only on first
  load when the flag is unset.
- Update `useLocalStorage` to support project-scoped keys via a
  `projectId` argument.
- Update `App.tsx` to read `activeProjectId` and pass it down.
- Update all the existing pin/inspection/hidden-page code paths to use
  project-scoped storage.
- Acceptance: existing app still works exactly as before. Refresh the
  page — your pins are still there. Open DevTools → Application →
  LocalStorage and verify the keys are now `floorPlanPins:<uuid>`.

### Session 3: Project list home screen (read-only)

- New route: `/` shows the project list. Use `wouter` (already
  installed) — finally a real reason to wire up routing.
- Project tiles: name, type badge with color, click to open.
- Empty state: "No projects yet — create one to begin."
- The "open" action sets `activeProjectId` and navigates to the existing
  Plans tab.
- Acceptance: with one project (the migrated Untitled Project), the home
  screen shows it, clicking it loads the existing data.

### Session 4: Create / delete projects

- "New Project" button → modal with name and type fields.
- Type selector: four colored pill buttons matching the screenshots.
- "Delete" action via three-dot menu on each project tile.
- Delete confirmation modal. On confirm, deletes Supabase record AND all
  local data (localStorage scoped keys, IndexedDB blob).
- Acceptance: can create a second project, switch between them, see
  independent pins per project, delete one without affecting the other.

### Session 5: Polish and rough edges

- Project tile hover states and visual polish.
- Loading states (the project list is async now).
- Error handling: what happens if Supabase is unreachable? App should
  fall back to local data and show a sync status indicator.
- "Rename project" via three-dot menu.
- Update `CLAUDE.md` to reflect the new architecture.
- Acceptance: feels like a real product, not a prototype.

After session 5, multi-project is shippable. Move on to the report
generator (the actual product differentiator) in subsequent sessions.

## What we are explicitly NOT doing in this work

These are tempting and they don't belong in this phase:

- Recreating Fieldwire's task sidebar with filters, watchers, assignees,
  and per-task chat. The inspection wizard already represents the task —
  we don't need a parallel UI for it.
- Recreating Fieldwire's plan organization with folders and subfolders.
  Codify projects have one or two PDFs; flat is fine.
- Adding photo capture, OCR, AI hardware detection, or the existing
  construction wizard. Each is its own roadmap item, sequenced after
  this work.
- Refactoring `InspectionWizard.tsx`. CLAUDE.md forbids it without
  explicit ask, and this work doesn't require it.
- Removing the Manus Vite plugins. CLAUDE.md says leave them. This work
  doesn't need them changed.

## Open questions to resolve before Session 1

These need a decision from Derek before Session 1 starts. They block
nothing today but will block later if left ambiguous.

1. **Auth model.** Codify has four users. Does each create their own
   Supabase account, or is there one shared Codify account everyone uses?
   Affects row-level security policy design.
2. **Project type colors.** The Fieldwire screenshot shows red for Door
   Repairs, blue for Pre-Occupancy, etc. Should we match those, or pick
   our own brand-aligned palette?
3. **What happens when a project is deleted with completed inspections
   in it?** Hard delete (data gone forever) or soft delete (archive
   flag, hidden from UI but recoverable)? Hard delete is simpler;
   soft delete is safer for a real consulting firm.

## Document maintenance

- This plan is committed to the repo at `MULTI_PROJECT_PLAN.md`.
- Update it when scope changes, before changing the code.
- Mark sections done as sessions complete.
- When all five sessions are complete and shipped, archive this file by
  renaming it to `docs/MULTI_PROJECT_PLAN_v1_complete.md` and starting a
  new plan for the next phase (report generator).
