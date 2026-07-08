# Codify Door Inspection App — Project Handoff

This document is the source of truth for the state, history, and direction of
the Codify Door Inspection app. It exists so that any future Claude session
(chat, Claude Code, or otherwise) can pick up work without losing context,
and so Derek can re-orient himself after time away from the project.

Read this document before touching any code.

---

## 1. Who this is for

**Derek Smith** — Vice President of Codify Consulting LLC. Works remotely
from Tallahassee, Florida.

Derek is **not a developer**. He directs the work in plain language; an AI
coding tool (currently Claude Code) executes it in his local repo. This means:

- Instructions should be exact and copy-pasteable, not conceptual.
- Explanations should be short, plain, and land the bottom line first.
- When Derek pushes back or says something is wrong, believe him — he has
  domain context the model doesn't.
- Ask specific yes/no or menu-style questions when clarification is needed,
  not open-ended prompts.

### Derek's communication preferences

Baked into every reply, not optional:

- Be direct and concise. Lead with the bottom line, then the reasoning.
  Keep reasoning to 1–2 sentences.
- Cut filler, throat-clearing, and hollow corporate language.
- Plain language at a 12th-grade reading level. Define jargon in a few
  words if it must be used.
- Don't flatter or agree by default. Push back with reasons when a better
  approach exists. Say plainly when Derek's reasoning is sound.
- If something is a bad idea, say so and explain why.
- When a request is ambiguous, ask or state an assumption instead of
  guessing.
- Separate what is known from what is estimated. Flag uncertainty rather
  than presenting a guess as fact.
- In plans, list steps in order. Skip time estimates unless Derek asks.
- No em dashes. Light formatting. Lists only when they earn their place.

### Derek's file delivery preference

When staging files for Derek to commit:
- Subfolder-destination prefixed in the filename
- Followed by a changes table
- Followed by a destinations table
- Followed by full-path git commands in a code block

---

## 2. About Codify Consulting

Small life safety consulting firm serving healthcare clients that need to
meet CMS compliance requirements. Four employees:

- **Scott Fox**, President (owner)
- **Derek Smith**, VP (remote, Tallahassee)
- **Carson Maloney**, field inspector
- **Jeremy Campbell**, field inspector

The firm specializes in:
- Fire door and damper inspections
- Life safety drawings
- Pre-occupancy inspections

---

## 3. Why does this app exist

Codify currently uses **Fieldwire** as its inspection tool. Fieldwire works
for generic construction punch-list workflows but has three limitations
that make it the wrong tool for fire door inspection:

1. **No branch logic.** Fieldwire's checklists are flat — every item is
   independent. Fire door inspection is a decision tree: the right next
   question depends on the previous answer, the assembly type, and the
   facility characteristics.
2. **No real reports.** Fieldwire exports raw CSV. A hospital DPO needs a
   CMS-defensible deliverable with photos, NFPA code citations, deficiency
   summaries, and a remediation plan. The deliverable is the product
   Codify sells; the inspection is the input.
3. **No repair lifecycle.** Fieldwire stops at "this door failed." Codify's
   Survey-Ready Guarantee depends on closing the loop — tracking what was
   repaired, when, by whom, and verifying it now passes.

The goal for this app is to replace Fieldwire for Codify's team within
about one month. The `InspectionWizard.tsx` decision tree is the core
differentiator; everything else is plumbing around it.

**Explicitly NOT the goal:** recreating Fieldwire feature-for-feature.
Skip anything Fieldwire does well that isn't tied to the three differentiators
above (see Section 8 for the full "don't build this" list).

---

## 4. Companion projects Derek is running in parallel

The door inspection app is one of two major technical builds. Both are
managed through Claude Code because Derek is not a developer.

### 4a. Streamlit Reporting Tool (separate project)

Web-based tool deployed on Render at
`https://codify-report-tool.onrender.com`.

Purpose: ingests a Fieldwire CSV export, runs an AI-powered NFPA review
pipeline (claude-sonnet, batched by door category with rate-limit
retry/backoff), and generates polished PDF inspection reports via a
Node.js docx builder and LibreOffice two-pass rendering. Integrates with
ShareFile for document upload and QR code generation.

Recent context worth knowing:
- A persistent ShareFile 401 authentication bug was root-caused. Two
  layered issues:
  1. `_get_access_token()` was discarding the rotated refresh token after
     each refresh cycle. Fix: persist rotated token to
     `/var/data/sharefile_refresh_token.txt`.
  2. Render's environment variable storage collapses `$$` to `$` during
     shell processing. ShareFile tokens contain literal `$$` delimiters.
     Workaround: store the refresh token in Render with `$$$$` (four
     dollar signs), which Render collapses to `$$` in the actual env var.
     Verified working.
- Diagnostic reminder: for any env var containing `$`, `\`, or backticks,
  always inspect on the server with `print(repr(t))` to see every
  character unambiguously. Do not trust visual display.

This is a different codebase from the inspection app. If Derek references
"the report tool" or "Render," this is what he means.

### 4b. Door Inspection App (THIS project)

React / TypeScript / Vite app. Focus of this handoff.

---

## 5. Door Inspection App — technical state

### 5a. Repository

- **Host:** GitHub, `https://github.com/litmus1327/door-inspection`
- **Owner account:** `litmus1327`
- **Visibility:** Public (as of the last check)
- **Default branch:** `main`
- **Local clone location:** `C:\Users\Derek\Desktop\door-inspection`

### 5b. Tech stack

- **React 19** (single-page app)
- **TypeScript 5.6**
- **Vite 7** (dev server + build tool; port **3000** not the default 5173)
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **Radix UI + shadcn/ui** (style "new-york", base color "neutral")
- **wouter** for routing (installed but currently unused — the app uses
  local tab state in `App.tsx` instead of URL routes)
- **Express** server (`server/index.ts`) — thin static file server, only
  used in production build
- **pnpm** as the package manager (pinned to 10.4.1 in `packageManager`,
  actual installed version is 10.33.2 which is backward compatible)
- **Supabase** client library is installed and configured optionally, but
  currently the app runs fully offline against localStorage + IndexedDB

### 5c. Local development environment (Derek's Windows machine)

Installed and verified working:
- Node.js v24.15.0
- npm 11.12.1
- Git 2.54.0
- pnpm 10.33.2
- Claude Code 2.1.126
- PowerShell execution policy set to `RemoteSigned` for CurrentUser

Startup ritual for a work session:
```
# Window 1 (dev server)
cd $env:USERPROFILE\Desktop\door-inspection
pnpm run dev
# App runs on http://localhost:3000

# Window 2 (Claude Code)
cd $env:USERPROFILE\Desktop\door-inspection
claude
```

Ctrl+C to stop the dev server. `/exit` in Claude Code to close it.

### 5d. Project structure

Key directories and files:
```
door-inspection/
  client/                     # Vite root — entry is client/index.html
    src/
      pages/
        InspectionWizard.tsx  # ~2,125 lines. Domain core. HANDLE WITH CARE.
      hooks/
        useLocalStorage.ts    # Custom hook with legacy-format migration
      lib/
        supabase.ts           # Optional cloud sync
      types.ts                # Client-side type definitions
      App.tsx                 # Controller — holds all global state
    index.html
  server/
    index.ts                  # Express static server (production only)
  shared/
    types.ts                  # DIVERGED from client/src/types.ts — see below
  patches/
    wouter@3.7.1.patch        # Applied by pnpm — do not remove
  drizzle/
  CLAUDE.md                   # Rules and context for Claude Code (see 5f)
  MULTI_PROJECT_PLAN.md       # Architecture plan for next phase
  DEVELOPMENT_NOTES.md        # Historical rule tweaks
  ZOOM_DEBUG_SUMMARY.md       # Five failed attempts at zoom-to-cursor
  PHASE1_README.md            # Original product brief (partially outdated)
  package.json
  pnpm-lock.yaml
  vite.config.ts
```

Path aliases (in `vite.config.ts` and `tsconfig.json`):
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

### 5e. State and persistence (no backend DB yet)

All inspection state currently lives in the browser:

**localStorage keys:**
- `inspectorName`
- `activeProject`
- `floorPlanPins` (a `Record<pageNumber, DoorPin[]>`)
- `doorInspections`
- `hiddenPages`
- `supabaseUrl`, `supabaseKey` (config)
- `syncStatus`

The `useLocalStorage` hook contains a one-shot migration: if
`floorPlanPins` is read as a flat `DoorPin[]` (legacy format), it's
rewrapped to `{ 1: [...] }`. Follow this pattern for future migrations.

**IndexedDB:** `codify_floorplan` database, `files` store. The uploaded
floor plan PDF blob is stored under key `floorplan`. Open/save helpers are
inlined in `App.tsx`.

**Supabase:** optional cloud sync, configured via the ConfigTab UI. Targets
the `door_inspections` table and `door_inspection_photos` storage bucket.
The app must continue to work fully offline if Supabase is not configured.

### 5f. CLAUDE.md — the rules file

`CLAUDE.md` at the repo root is read automatically by Claude Code at the
start of every session. It contains project context AND ten hard rules
that every session must follow:

1. **Surgical edits only on InspectionWizard.tsx.** No full-file rewrites,
   no large-block refactors, no reformatting passes unless explicitly
   asked. Keep edits as small as possible.
2. **Never modify `getApplicableItems`, `getBranchResult`, or `BranchUI`
   in InspectionWizard.tsx** without asking Derek first and getting a
   yes. Load-bearing inspection logic.
3. **Pre-edit narration.** Before any substantive edit (more than ~10
   lines or any file outside the immediate change), describe the intent
   in plain English first, then edit.
4. **Leave the Manus plumbing alone.** Do not remove or modify
   `vite-plugin-manus-runtime`, `vitePluginManusDebugCollector`, or the
   `.manus-logs/` writes without asking. They look like cruft; they're
   intentionally kept for now.
5. **Type edits go to `client/src/types.ts` first.** If a change should
   also propagate to `shared/types.ts`, call it out explicitly — do not
   silently edit both.
6. **Read `ZOOM_DEBUG_SUMMARY.md`** before changing any zoom or pan logic
   in `PDFViewer.tsx`. Summarize what you learned to Derek before
   editing.
7. **Read the relevant section of `DEVELOPMENT_NOTES.md` and grep
   `InspectionWizard.tsx`** for the affected item id (e.g. `gap_hinge`,
   `pl_fire_pin`) before changing any inspection rule. Surface what
   depends on it before editing.
8. **Commit hygiene.** One commit per logical change with a clear
   conventional-commits message. Stage and commit freely when asked.
   **Never run `git push` unless the user explicitly asks** — pushing is
   Derek's to authorize.
9. **Checkpoint deliverable.** When Derek asks for "a checkpoint" or "a
   zip," produce a zip of changed files only, excluding `node_modules`,
   `.git`, `dist`, `.manus-logs`, and `*.log`. Place at the repo root as
   `checkpoint-YYYY-MM-DD.zip`.
10. **For UI bugs, ask which tab/component is affected** before searching
    the whole repo. The app has narrow scope (Plans, Inspect, Records,
    Config tabs) and a wrong starting point wastes time.

The opening line of the Working Rules section provides an escape hatch:
"Follow them unless explicitly overridden in the current conversation."
This is deliberate — a rule Derek doesn't want to follow for a specific
task can be overridden by saying so.

### 5g. Type duplication caveat

`shared/types.ts` and `client/src/types.ts` both declare `DoorStatus`,
`DoorPin`, and related types, and they have **diverged**:
- `shared/types.ts` uses `'repair_scope'`
- `client/src/types.ts` uses `'inaccessible'` and adds `pageNumber` and
  `gridBlock` fields to `DoorPin`

The client code imports from `@/types`. Do not assume the two files are
kept in sync. When editing types, prefer `client/src/types.ts` for
client-facing changes and flag any propagation to `shared/types.ts`
explicitly.

### 5h. Top-level data flow

`App.tsx` is the controller. It holds all global state:
- `pdfEntries`, `pdfDocuments`
- `pins`
- `floorNames`
- `currentPage`
- `selectedDoor`

Callbacks are passed down. `InspectionWizard` opens as a centered overlay
when `selectedDoor` is non-null; clicking the backdrop or the wizard's
`onClear` returns control to `Plans`.

**Pin numbering is a global sequence:** `handlePinAdded` in `App.tsx`
counts pins across all pages and assigns the next integer as `iconNo`.
Pin removal (`handlePinRemoved`, `handlePinsRemoved`) also purges matching
`doorInspections` records from localStorage by `pinId`. **Preserve this
invariant when touching pin lifecycle code.**

**Multi-PDF support:** each uploaded PDF becomes a `PdfEntry` with a
`pageOffset`. Pages are addressed by a global page number spanning all
PDFs. `resolveGlobalPage()` maps back to `(pdfFile, localPage)`. Pages
labeled "Title Sheet" (extracted via PDF text) auto-clear pins.

### 5i. The InspectionWizard in detail

`client/src/pages/InspectionWizard.tsx` is ~2,125 lines and intentionally
monolithic. It encodes the door-inspection decision tree. Key structures:

- `ASSEMBLY_TYPE_LABELS`, `FIRE_RATED`, `MIN_RATINGS` — assembly-type →
  minimum-rating-minutes mapping. To change inspection rules, edit these
  tables. Do NOT scatter the logic across files.
- `HARDWARE_VARS` — canonical list of door hardware checkboxes.
  `DEFAULT_HW_STATE` is derived from it, so adding a hardware variable
  only requires touching this array.
- `BLOCKING_PROMPTS` — gating questions (deadbolt, mag-lock without
  sensor, manual flush bolts, inactive leaf without closer) that must be
  answered before the rest of the checklist is shown. Each maps to a
  branch id (`x11`–`x14`).
- `getApplicableItems()` builds the visible checklist from
  `(assemblyType, hwState, swing, projectVars, isCrossCorridor, doorRating,
  frameRating, isHealthCareOccupancy, x14Compliant)`. It enforces several
  non-obvious overrides documented in `DEVELOPMENT_NOTES.md`:
  - 1-hour fire barriers require a 60-min minimum ONLY when
    `hw_stair_door` is set.
  - Dual-egress smoke barriers in cross-corridor healthcare occupancy
    have a 0-minute minimum.
- Items can carry a `branch` (`x1`–`x14`) that opens a follow-up
  question, an `autoFlag: true` to mark deficient by default, and a
  `hint` displayed inline.

When changing inspection rules, search this file for the relevant `id`
(e.g. `gap_hinge`, `pl_fire_pin`). Every checklist item has a stable id
used as the key in saved deficiencies.

### 5j. Leftover Manus tooling

The app was originally built in Manus AI. That tooling is still present:
- `vite-plugin-manus-runtime` (npm package)
- `vitePluginManusDebugCollector` (defined in `vite.config.ts`)
- `.manus-logs/` writes at dev time

CLAUDE.md forbids removing these without asking. The plan is to clean them
up after a few weeks of confirmed-working Claude Code development. Do NOT
propose removing them proactively.

---

## 6. History — what has already happened

Rough timeline of the project so far.

### 6a. Original build in Manus

The app was built iteratively in Manus AI over multiple sessions.
Delivered as `codify-door-inspection-final (6).zip` and re-delivered
byte-identically as `codify-door-inspection-final (7).zip`. Contains the
full React/Vite/TypeScript codebase including the completed
InspectionWizard.

### 6b. Migration from Manus to Claude Code (July 8, 2026)

Manus pushed a broken commit that emptied the GitHub repo. Recovery
required:
- Confirming Node.js, installing Git, npm, pnpm, and Claude Code on
  Derek's Windows machine
- Setting the PowerShell `RemoteSigned` execution policy
- Cloning the empty repo locally
- Extracting the Manus zip into the local clone
- `pnpm install`, `pnpm run dev` — app booted on `localhost:3000`
- `git add`, commit, push — repo restored with full source
- `claude` first-run, auth, trust prompt, model check (Opus 4.7 on Claude
  Max)
- `/init` generated a solid draft `CLAUDE.md`
- Ten Working Rules were appended to `CLAUDE.md` (see 5f)
- `CLAUDE.md` committed and pushed

### 6c. First real Claude Code task (July 8, 2026)

Swing-type button icons added to `InspectionWizard.tsx`:
- Five architectural door icons (Single, Pair Swing, Dual Egress, Active,
  Inactive)
- Inline SVG using `currentColor` so icons inherit button color state
- Opacity 100 when selected, 70 when not
- Pair Swing: leaves have a visible gap between tips
- Existing large preview SVG block below buttons removed as redundant
- Yellow helper notes for Active/Inactive preserved

Verified visually, typecheck passed, committed with message *"Add
architectural swing-type icons and remove redundant preview block"* and
pushed to GitHub. This served as the proof of the Chat → Claude Code
workflow end to end.

### 6d. Multi-project planning (July 8, 2026)

Derek asked to recreate Fieldwire's project list / plans / tasks flow.
After conversation, scope was cut aggressively:
- **In scope:** minimal project list (name + type), project switching,
  Supabase-backed storage, migrate existing single-project data as
  "Untitled Project"
- **Out of scope:** sort/filter/search, favorites, sharing,
  auto-fill-from-PDF-title-block, activity feeds, per-project permissions

A `MULTI_PROJECT_PLAN.md` was drafted (5 sessions of work, data model,
Supabase schema, migration strategy, build order). It exists as a file in
Derek's Downloads folder as of this handoff — not yet in the repo.

### 6e. Prior sessions (context only, no active work)

Historical context Derek has built on:
- **Streamlit Reporting Tool** — separate project, deployed on Render,
  handles Fieldwire CSV → PDF report generation with AI review pipeline
  and ShareFile integration (see Section 4a)
- **Vanderbilt Wilson County Hospital report** — 13-page fire and smoke
  door inspection report built with a Node.js docx script and Python
  two-pass TOC renderer
- **Codify HR document library** — 46-section employee handbook, Field
  Inspector job description, FLSA and Tennessee employment law
  considerations
- **Grand Slam Offer** — Alex Hormozi framework applied to Codify, sales
  PDF, formal DOCX proposal, Survey-Ready Guarantee
- **Pre-inspection phone call script** — for field inspectors
- **NFPA 80 perimeter clearance and smoke barrier categorization**
  guidance emails

None of this is on the active workstream. Reference only.

---

## 7. What is next — the roadmap

In priority order:

### 7a. Multi-project support (next up)

Execute `MULTI_PROJECT_PLAN.md`. Five sessions:
1. Supabase setup, schema, `useProjects` hook, verify from console
2. Data scoping migration, no new UI, existing app still works
3. Project list home screen (read-only)
4. Create / delete projects
5. Polish, error handling, rename support

The plan explicitly defers Supabase Storage for PDFs — PDFs continue to
live in IndexedDB for v1. Switching devices means re-uploading the PDF.
This is a deliberate scope cut.

Three open questions to resolve before Session 1:
- Auth model: one shared Codify account or per-user accounts?
- Project type badge colors: match Fieldwire's palette or brand-align?
- Delete semantics: hard delete or soft delete? Soft is safer for a
  consulting firm.

### 7b. Report generator (the actual product differentiator)

Once multi-project ships, this is the priority. The inspection report is
what makes the tool worth building — CSV export is not a deliverable, a
PDF report is. Rough shape:
- Pull design from the Vanderbilt Wilson County report and the Streamlit
  Reporting Tool
- Generate directly from app state (no CSV round-trip)
- Include NFPA citations, deficiency summaries, photos, remediation plan
- Branded, CMS-defensible

### 7c. Repair tracking

The other half of the Survey-Ready Guarantee promise. Each deficiency
becomes a repair item with:
- Status (open / in progress / fixed / verified)
- Who fixed it
- When
- Photo evidence of completion
- Re-inspection outcome

### 7d. Existing construction wizard

Separate wizard flow for pre-occupancy inspections. On the roadmap but
lower priority than 7a–7c.

### 7e. Photo capture with AI-assisted hardware detection

Vision model reads a photo of a door hardware set and pre-populates the
`HARDWARE_VARS` checkboxes in the wizard. This is where the PDF title-
block auto-fill work (deferred from multi-project v1) may re-emerge.

### 7f. Service worker for offline-first capability

Was on the original roadmap. Reassess priority after Supabase is wired
up — offline behavior gets more complex with cloud sync in the picture.

### 7g. Remaining UI bugs

Bucket of small polish work. Not currently listed anywhere formal;
gathered as they surface.

### 7h. Housekeeping (low urgency)

- Delete the 20+ stale zip variants in Derek's Downloads folder
- Remove Manus Vite plugins once confidence in Claude Code workflow is
  established (a few weeks)
- Run `pnpm approve-builds` to enable Tailwind oxide CSS engine
- Consider `.gitattributes` for Windows line-ending handling if the CRLF
  warnings become annoying

---

## 8. What NOT to build

These are tempting and they do not belong in this app:

- Fieldwire's task sidebar with filters, watchers, assignees, per-task
  chat. The inspection wizard already represents the task.
- Fieldwire's plan organization with folders and subfolders. Codify
  projects have one or two PDFs. Flat is fine.
- Multi-user collaboration UI (assignees, comments, notifications). Four
  employees; everyone sees everything.
- Forms, 3D models, specifications, tags, related tasks. Skip.
- Version control on plans. Skip.
- Auto-fill of project fields from PDF title block. Deferred until vision
  model work.
- Sorting, filtering, searching the project list at v1.

---

## 9. Working with Claude Code — practical patterns

### 9a. Daily startup

Two PowerShell windows, in this order:
```powershell
# Window 1
cd $env:USERPROFILE\Desktop\door-inspection
pnpm run dev

# Window 2
cd $env:USERPROFILE\Desktop\door-inspection
claude
```

The dev server hot-reloads on file save. Refresh the browser to see UI
changes; no restart needed unless you touch `vite.config.ts` or dependencies.

### 9b. Approval discipline

Claude Code will ask permission for every new file read, edit, or shell
command. On day one (and still now):
- Approve read-only commands one at a time (`git status`, `git diff`,
  `git log`, file reads)
- Approve writes and edits one at a time until confidence is high
- **Do NOT accept "allow all edits during this session"** yet — the
  friction is what catches mistakes
- **Do NOT accept blanket `git *` approval** — that would rubber-stamp
  `git push`, `git reset --hard`, `git rebase`, and other commands that
  can destroy work

### 9c. Commit / push discipline

Claude Code follows CLAUDE.md Rule 8: it will stage and commit when
asked, but will never push without explicit authorization. To authorize:
> "Push to GitHub."

Or bake it into a task prompt when committing:
> "I'm authorizing the push for this commit."

### 9d. Prompt structure that works well

Structure Claude Code prompts as:
1. **Why** — what problem this solves
2. **What** — concrete change requested
3. **Constraints** — what NOT to touch, what must be preserved
4. **Plan-before-code** — explicit request to summarize the plan and wait
   for approval before writing

Example from the swing-type icon session:
> "I want to add visual icons to the SWING TYPE selection buttons so the
> door type is visually distinguishable, not just text-labeled. Five icons
> needed [descriptions]. Design constraints [details]. Critical: do not
> touch the yellow helper notes below the buttons. Before editing: 1)
> locate the file, 2) read the current section, 3) tell me your plan in
> 2-3 sentences, 4) wait for my approval."

### 9e. When things go wrong

- **Uncommitted work you don't like:** `git reset --hard HEAD` reverts to
  the last commit. Ask Claude Code to run this if unsure.
- **Committed work you don't like:** `git reset --hard HEAD~1` (one
  commit back). Only safe if you haven't pushed yet.
- **Pushed work you don't like:** don't rewrite history if others are
  using the repo. Add a corrective commit.
- **App won't start:** likely a dependency mismatch. Delete `node_modules`
  and run `pnpm install` again.
- **App boots but page is blank:** open browser DevTools (F12) Console
  tab and screenshot the red errors.

---

## 10. Current state at handoff

As of the last active session:

**Repository state:**
- `main` branch is clean and pushed to GitHub
- Latest commits: swing-type icons, CLAUDE.md, initial React/Vite app
  restoration
- 25 total commits

**Uncommitted files on Derek's machine:**
- None known

**Uncommitted files in Derek's Downloads:**
- `MULTI_PROJECT_PLAN.md` — needs to be reviewed by Derek, then copied
  into the repo root and committed with message *"Add multi-project
  architecture plan"*

**Active session state:**
- Dev server stopped
- Claude Code session ended cleanly
- Both PowerShell windows closed

**Open decisions blocking Session 1 of multi-project work:**
- Supabase auth model (shared vs per-user)
- Project type badge colors
- Delete semantics (hard vs soft)

---

## 11. First moves for a new Claude session

If this document is being read by a new Claude:

1. Confirm you understand the scope constraints in Section 8 — the goal
   is NOT to recreate Fieldwire. Push back if Derek's requests drift that
   direction.
2. Read `CLAUDE.md` in the repo. If any rule there conflicts with this
   handoff, `CLAUDE.md` wins (it is the actively enforced source of
   truth).
3. Read `MULTI_PROJECT_PLAN.md` (in the repo, or Derek's Downloads if not
   yet committed) before starting any multi-project work.
4. When Derek describes a UI bug or change, ask which tab it affects
   before searching the codebase (Rule 10).
5. Default to surgical edits. Full-file changes require an explicit
   request.
6. When in doubt about a rule: it's probably meant to prevent past
   mistakes, not restrict capability. Ask.

---

## 12. What to update in this document

This is a living document. When state changes materially, update the
relevant section. Specifically:

- Section 6 (History) after any major session
- Section 7 (Roadmap) when priorities shift or items complete
- Section 10 (Current state) at the end of every work session
- Section 5c (Environment) if tooling versions change

Commit updates with the message *"Update HANDOFF.md"*.
