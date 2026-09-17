# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `packageManager` field in `package.json`).

- `pnpm dev` — Vite dev server on port 3000 (`--host` exposes on LAN).
- `pnpm build` — `vite build` writes the client to `dist/public/`, then `esbuild` bundles `server/index.ts` to `dist/index.js` (ESM, externals).
- `pnpm start` — runs the production server. The script uses POSIX `NODE_ENV=production node dist/index.js`; on Windows PowerShell run `$env:NODE_ENV='production'; node dist/index.js` instead.
- `pnpm preview` — `vite preview` to serve the built client without the Express server.
- `pnpm check` — `tsc --noEmit` typecheck across `client/src`, `shared`, `server`.
- `pnpm format` — Prettier write across the repo (config in `.prettierrc`: 2 spaces, double quotes, semicolons, 80 col).

- `pnpm test` — `vitest run`. Eleven suites, 101 tests, runs in about a second: `pages/__tests__/getApplicableItems.test.ts` (the door checklist logic), `lib/inspectionYear.test.ts`, `lib/wallDetect.test.ts` (includes per-page calibration), `lib/ceilingFindings.test.ts`, `lib/ceilingLocationSummary.test.ts`, `lib/sync.test.ts`, `lib/supabase.test.ts`, `lib/fieldwireExport.test.ts`, `lib/projectScope.test.ts`, plus two hook suites. Coverage stops there — nothing exercises the dictation feature (it needs a browser mic and real API keys) — so a green run is not proof a UI change works, but always run it after touching inspection rules, annual cycles, wall calibration, or sync.

## Architecture

This is a React 19 + Vite + TypeScript single-page app for life-safety inspections (Codify Door Inspection). The entire user-facing app lives client-side; the Express server (`server/index.ts`) is a thin static file server used only in production. The one exception is `api/dictate.ts` (see "Dictation" below) — a Vercel serverless function, the app's only server-side code that does anything besides serve static files.

### Three service lines, one shell

The app started as doors only and now covers three inspection types. The project's service line decides which wizard and which records tab open; the tabs, the pin/floor-plan machinery and the persistence layer are shared.

| Service line value | Wizard | Records |
|---|---|---|
| doors (default) | `InspectionWizard.tsx` | `RecordsTab.tsx` (Tasks page: filters, batch edit, history) |
| `above_below_ceiling` | `CeilingInspectionWizard.tsx` | `CeilingRecordsTab.tsx` |
| `fire_smoke_damper` | `DamperInspectionWizard.tsx` | `DamperRecordsTab.tsx` |

The branch that picks them is in `App.tsx` (search for `CeilingInspectionWizard`). Ceiling projects skip the door setup gate and wall calibration.

Also present and not obvious from the tab list: `ProjectsPage.tsx` (multiple projects, `activeProject` in localStorage) and annual inspection cycles, which keep a per-icon inspection history across years rather than overwriting last year's result.

### Layout & build wiring

- Vite `root` is `client/` (so `client/index.html` is the entry, not the repo root). `outDir` is `dist/public` relative to the repo root.
- Path aliases (defined in both `vite.config.ts` and `tsconfig.json`): `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets/*` → `attached_assets/*`.
- Tailwind v4 via `@tailwindcss/vite`. shadcn/ui in `client/src/components/ui/` (style "new-york", base color "neutral" — see `components.json`).
- Routing: `wouter` is installed but `App.tsx` currently uses local tab state (`activeTab` of `'plans' | 'inspect' | 'records' | 'config'`), not URL routes. Pages are rendered conditionally as overlays over a persistent `<Plans>` background.
- Manus tooling: `vite-plugin-manus-runtime` and the in-repo `vitePluginManusDebugCollector` (in `vite.config.ts`) write browser logs to `.manus-logs/`. Leave these plugins in place; they're load-bearing for the Manus dev environment.
- A patch is applied to `wouter@3.7.1` (see `patches/`); pnpm enforces it via `pnpm.patchedDependencies`.

### State & persistence (no backend DB)

All inspection state is persisted in the browser:

- **localStorage** keys: `inspectorName`, `activeProject`, `floorPlanPins` (a `Record<pageNumber, DoorPin[]>`), `doorInspections`, `hiddenPages`, `supabaseUrl`, `supabaseKey`, `syncStatus`. Mediated by the `useLocalStorage` hook in `client/src/hooks/useLocalStorage.ts`, which contains a one-shot migration: if `floorPlanPins` is read as a flat `DoorPin[]` (legacy format), it's rewrapped to `{ 1: [...] }`.
- **IndexedDB** (`codify_floorplan` DB, `files` store) stores the uploaded floor-plan PDF blob under key `floorplan`. Open/save helpers are inlined in `App.tsx`. A second DB, `codify_dictation` (`lib/dictationQueue.ts`), queues voice memos recorded offline until they can be transcribed — see "Dictation" below.
- **Supabase** is optional cloud sync, configured via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` if set, otherwise via UI in `ConfigTab`, and accessed through `client/src/lib/supabase.ts`. Records target the `door_inspections` table and `door_inspection_photos` storage bucket. The app must work fully offline if no Supabase config is set.
- **There is only one Supabase project, and no test instance.** The app is still in development and no inspector has used it in the field, so the data at risk is Derek's own test data rather than real inspection records. Still, `pnpm dev` in a browser writes to the same project the deployed app uses: creating projects, dropping pins and uploading photos all land in the real database and storage bucket. Use throwaway project names, keep track of what you create, and get approval before deleting anything. This bullet needs revisiting the moment the app goes live with inspectors, because the stakes change that day.
- **`db/supabase_reset.sql` drops `door_inspections` and recreates it.** Its header says "safe to run now because no inspection data has synced yet," which was written early and carries no date, so it is not evidence about the table today. Ask Derek before running it. The other `db/*.sql` files are additive schema scripts applied by hand in the Supabase SQL editor; the repo has no migration runner and no record of which have been applied, so check the table rather than assuming.

### Top-level data flow

`App.tsx` is the controller and holds all global state — `pdfEntries`, `pdfDocuments`, `pins`, `floorNames`, `currentPage`, `selectedDoor` — and passes callbacks down. `InspectionWizard` opens as a centered overlay when `selectedDoor` is non-null; clicking the backdrop or the wizard's `onClear` returns control to `Plans`.

Pin numbering is a **global-per-project sequence**: `handlePinAdded` in `App.tsx` counts pins across all pages *strictly tagged with the active project* (`p.projectName === activeProject`) and assigns the next integer as `iconNo`. This is deliberately NOT the same filter `pinMapInProject`/`inProject()` use for display (which treats a blank `projectName` as belonging to every project, to keep unattributed legacy pins visible) — feeding that fails-open filter into numbering let leftover blank-project pins from old/deleted projects inflate a brand new project's first icon number (e.g. starting at 16 instead of 1). Pin removal (`handlePinRemoved` / `handlePinsRemoved`) also purges matching `doorInspections` records from localStorage by `pinId` — keep this invariant when touching pin lifecycle code. Deleting a project (`handleDeleteProjectLocal`) purges that project's pins and records from local storage by `projectName`, in addition to its cloud row and cached PDF — it used to leave local pins/records behind forever, which is where that leftover blank/orphaned data comes from on an established device.

PDFs: multiple PDFs can be uploaded; each becomes a `PdfEntry` with a `pageOffset`. The app addresses pages by a **global page number** that spans all PDFs; `resolveGlobalPage()` maps it back to `(pdfFile, localPage)`. Pages labeled "Title Sheet" (extracted via PDF text) auto-clear pins.

Wall-color calibration (`lib/wallDetect.ts`) is per-project by default but can be overridden per-page: `FloorPlanViewer.tsx` checks each page's extracted strokes against the active calibration and offers a dismissible per-page recalibration banner on a mismatch (a second building or a redrawn floor using different line colors), storing that override under `wallCalibration:${project}:${page}`. Single-drawing-set projects never see this — it only fires on an actual mismatch.

### The inspection wizard

`client/src/pages/InspectionWizard.tsx` (~2100 lines) is the domain core and intentionally monolithic. It encodes the door-inspection decision tree:

- `ASSEMBLY_TYPE_LABELS`, `FIRE_RATED`, `MIN_RATINGS` — assembly-type → minimum-rating-minutes mapping. Edit these tables to change inspection rules; do **not** scatter the logic across files.
- `HARDWARE_VARS` — the canonical list of door hardware checkboxes. `DEFAULT_HW_STATE` is derived from it, so adding a hardware var only requires touching this array.
- `BLOCKING_PROMPTS` — gating questions (deadbolt, mag-lock w/o sensor, manual flush bolts, inactive leaf w/o closer) that must be answered before the rest of the checklist is shown. Each maps to a branch id (`x11`–`x14`).
- `getApplicableItems()` builds the visible checklist from `(assemblyType, hwState, swing, projectVars, isCrossCorridor, doorRating, frameRating, isHealthCareOccupancy, x14Compliant)`. It enforces several non-obvious overrides documented in `DEVELOPMENT_NOTES.md`: 1-hour fire barriers require a 60-min minimum **only** when `hw_stair_door` is set, and dual-egress smoke barriers in cross-corridor healthcare occupancy have a 0-minute minimum.
- Items can carry a `branch` (`x1`–`x14`) that opens a follow-up question, an `autoFlag: true` to mark deficient by default, and a `hint` displayed inline.

When changing inspection rules, search this file for the relevant `id` (e.g. `gap_hinge`, `pl_fire_pin`) — every checklist item has a stable id used as the key in saved deficiencies.

**Rating minimums are computed by one shared function.** `minRequiredRating()` in `lib/inspectionRules.ts` is called by both `getApplicableItems`'s `show` condition and `startInspection`'s auto-flag logic — they used to compute this independently and drifted (an existing-construction smoke barrier's 0-min override lived in one but not the other), letting a rating row show as needing attention without ever auto-flagging. Add any new rating-minimum special case there, not in either call site directly.

**Checklist items display in collapsible panels**, defined in `CHECKLIST_PANELS` (`lib/inspectionRules.ts`) — a display-only grouping (which items visually cluster together, and whether a panel nests inside an outer "what's causing this?" wrapper) that has no effect on `getApplicableItems`'s applicability logic. An item id not listed anywhere in its section's entry renders as a plain standalone row. `ChecklistPanel`/`ChecklistGroupPanel` (in `InspectionWizard.tsx`, next to `DeficiencyItem`) do the rendering; adding a new checklist item does NOT require adding it to `CHECKLIST_PANELS` — it'll just show standalone until someone decides it belongs in a panel.

### Dictation

An inspector can record one voice memo per pin ("dictate this location") in any of the three wizards instead of tapping through every item. `DictationRecorder.tsx` captures audio (MediaRecorder, WebM/Opus); on stop, it POSTs to `api/dictate.ts`, a Vercel serverless function — the only server code in the app that isn't a static file server, because it's the only place holding the OpenAI/Anthropic keys a browser-exposed `VITE_*` var can't hold.

- `api/dictate.ts` transcribes the clip (OpenAI Whisper) then asks Claude (tool-use / structured output) to map the transcript onto whatever checklist candidates the client sent — it has no static knowledge of `inspectionRules.ts`/`ceilingFindings.ts`/`damperChecklist.ts`, so it never needs to be kept in sync with them. **Requires `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` set as plain (non-`VITE_`) Vercel environment variables** — dictation returns a 500 with no keys set, everything else in the app is unaffected.
- The door wizard only ever sends dictation the **flat checklist items** (`dictationCandidates` filters out anything with a `branch`) — it never tries to resolve the x11–x14 blocking prompts; those stay a manual tap-through, consistent with the "don't touch branch logic" rule below.
- Nothing is applied silently: `DictationReviewDialog.tsx` shows the transcript and a proposed diff, accept/edit/reject per item, before any wizard state changes — and it writes through the same setters (`setDeficiencies`, `setAddedFindings`, `setDefs`/`setDefNotes`) manual entry already uses.
- Offline: a recording made with no signal queues in IndexedDB (`lib/dictationQueue.ts`, db `codify_dictation`) instead of failing. `App.tsx`'s reconnect handler flushes the queue, transcribes/interprets each, and stashes the result under `dictationReady[pinId]` in localStorage; the wizard for that pin picks it up and shows the review dialog the next time it opens that pin — this keeps the apply step inside the wizard's own logic rather than a background process reimplementing it.
- Raw audio and transcripts are never persisted to Supabase — only the final accepted record (same shape the app already writes) is. A recording is discarded once its result is applied or dismissed.

### Type duplication caveat

`shared/types.ts` and `client/src/types.ts` both declare `DoorStatus`, `DoorPin`, etc., and they have **diverged**: `shared/types.ts` uses `'repair_scope'`; `client/src/types.ts` uses `'inaccessible'` and adds `pageNumber`/`gridBlock` to `DoorPin`. The client code imports from `@/types`. Don't assume the two files are kept in sync; prefer editing `client/src/types.ts` for client-facing changes.

## Reference docs in the repo

- `PHASE1_README.md` — original product brief; describes the localStorage schema and the original Phase-1 scope. Some "coming in Phase 2" features (inspection wizard, records tab) are now built — treat that doc as historical.
- `DEVELOPMENT_NOTES.md` — short rolling log of recent rule tweaks. The user prefers a zipped folder of changed files (excluding `node_modules`, `.git`, `dist`, `.manus-logs`, `*.log`) at each checkpoint.
- `ZOOM_DEBUG_SUMMARY.md` — five failed attempts at zoom-to-cursor in `PDFViewer.tsx`, with the working theory that the PDF.js 2× viewport scale conflicts with CSS-transform pan/zoom. Consult before reworking zoom math.

## Working Rules

These are guardrails the user has set. Follow them unless explicitly overridden in the current conversation.

1. **Surgical edits in `InspectionWizard.tsx`.** No full-file rewrites, no large-block refactors, no reformatting passes unless the user explicitly asks. Keep diffs as small as possible to accomplish the request.

2. **Do not modify `getApplicableItems`, `getBranchResult`, or `BranchUI` in `InspectionWizard.tsx` without asking first and getting a yes.** These are load-bearing inspection logic. If a request seems to require touching them, stop and confirm before proceeding.

3. **Pre-edit narration.** Before any substantive edit (more than ~10 lines, or any file outside the immediate change scope), describe what you intend to change in plain English first, then make the edit.

4. **Leave the Manus plumbing alone.** Do not remove or modify `vite-plugin-manus-runtime`, the in-repo `vitePluginManusDebugCollector`, or the `.manus-logs/` writes without asking. They look like cruft but are intentionally kept.

5. **Type edits go in `client/src/types.ts` first.** If a change should also propagate to `shared/types.ts`, call that out explicitly and ask — do not silently edit both files.

6. **Before changing zoom/pan logic in `PDFViewer.tsx`,** read `ZOOM_DEBUG_SUMMARY.md` first and summarize what you learned to the user before editing.

7. **Before changing any inspection rule** (assembly types, ratings, hardware vars, blocking prompts, branch logic), read the relevant section of `DEVELOPMENT_NOTES.md` and grep `InspectionWizard.tsx` for the affected item id (e.g. `gap_hinge`, `pl_fire_pin`). Surface what depends on it before editing.

8. **Commit hygiene.** One commit per logical change with a clear conventional-commits message. Stage and commit freely when asked; **never run `git push` unless the user explicitly asks** — pushing is theirs to authorize.

9. **Checkpoint deliverable.** When the user asks for "a checkpoint" or "a zip", produce a zip of changed files only, excluding `node_modules`, `.git`, `dist`, `.manus-logs`, and `*.log`. Place it at the repo root as `checkpoint-YYYY-MM-DD.zip`.

10. **For UI bugs, ask which tab and which service line are affected** before searching the whole repo. Four tabs (Plans, Inspect, Records, Config) times three service lines (doors, ceiling, damper) means the same symptom lives in different files. A wrong starting point wastes time, and a fix applied to the door wizard does not reach the ceiling or damper one.
