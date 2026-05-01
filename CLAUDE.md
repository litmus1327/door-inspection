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

There is no test runner wired up — `vitest` is installed as a devDependency but no tests exist and there is no `test` script.

## Architecture

This is a React 19 + Vite + TypeScript single-page app for fire/smoke door inspections (Codify Door Inspection). The entire user-facing app lives client-side; the Express server (`server/index.ts`) is a thin static file server used only in production.

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
- **IndexedDB** (`codify_floorplan` DB, `files` store) stores the uploaded floor-plan PDF blob under key `floorplan`. Open/save helpers are inlined in `App.tsx`.
- **Supabase** is optional cloud sync, configured via UI in `ConfigTab` and accessed through `client/src/lib/supabase.ts`. Records target the `door_inspections` table and `door_inspection_photos` storage bucket. The app must work fully offline if no Supabase config is set.

### Top-level data flow

`App.tsx` is the controller and holds all global state — `pdfEntries`, `pdfDocuments`, `pins`, `floorNames`, `currentPage`, `selectedDoor` — and passes callbacks down. `InspectionWizard` opens as a centered overlay when `selectedDoor` is non-null; clicking the backdrop or the wizard's `onClear` returns control to `Plans`.

Pin numbering is a **global sequence**: `handlePinAdded` in `App.tsx` counts pins across all pages and assigns the next integer as `iconNo`. Pin removal (`handlePinRemoved` / `handlePinsRemoved`) also purges matching `doorInspections` records from localStorage by `pinId` — keep this invariant when touching pin lifecycle code.

PDFs: multiple PDFs can be uploaded; each becomes a `PdfEntry` with a `pageOffset`. The app addresses pages by a **global page number** that spans all PDFs; `resolveGlobalPage()` maps it back to `(pdfFile, localPage)`. Pages labeled "Title Sheet" (extracted via PDF text) auto-clear pins.

### The inspection wizard

`client/src/pages/InspectionWizard.tsx` (~2100 lines) is the domain core and intentionally monolithic. It encodes the door-inspection decision tree:

- `ASSEMBLY_TYPE_LABELS`, `FIRE_RATED`, `MIN_RATINGS` — assembly-type → minimum-rating-minutes mapping. Edit these tables to change inspection rules; do **not** scatter the logic across files.
- `HARDWARE_VARS` — the canonical list of door hardware checkboxes. `DEFAULT_HW_STATE` is derived from it, so adding a hardware var only requires touching this array.
- `BLOCKING_PROMPTS` — gating questions (deadbolt, mag-lock w/o sensor, manual flush bolts, inactive leaf w/o closer) that must be answered before the rest of the checklist is shown. Each maps to a branch id (`x11`–`x14`).
- `getApplicableItems()` builds the visible checklist from `(assemblyType, hwState, swing, projectVars, isCrossCorridor, doorRating, frameRating, isHealthCareOccupancy, x14Compliant)`. It enforces several non-obvious overrides documented in `DEVELOPMENT_NOTES.md`: 1-hour fire barriers require a 60-min minimum **only** when `hw_stair_door` is set, and dual-egress smoke barriers in cross-corridor healthcare occupancy have a 0-minute minimum.
- Items can carry a `branch` (`x1`–`x14`) that opens a follow-up question, an `autoFlag: true` to mark deficient by default, and a `hint` displayed inline.

When changing inspection rules, search this file for the relevant `id` (e.g. `gap_hinge`, `pl_fire_pin`) — every checklist item has a stable id used as the key in saved deficiencies.

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

10. **For UI bugs, ask which tab/component is affected** before searching the whole repo. The app has narrow scope — Plans, Inspect, Records, Config — and a wrong starting point wastes time.
