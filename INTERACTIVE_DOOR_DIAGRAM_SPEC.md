# Interactive Door Diagram — Build Spec

Status: draft for review. Nothing is built yet. This is the handoff document that drives the build.

## 1. What we're building, in one sentence

When an inspector clicks a door pin on the floor plan, they get an interactive elevation drawing of that door. Clicking a part of the door (top gap, hinge edge, latch edge, sill, closer, vision panel, frame, and so on) opens the deficiency items for that part so the inspector logs findings by pointing at the door instead of scrolling a long checklist.

## 2. Honest reality check (read this first)

The Anthropic use-case page builds an anatomy explorer from a ready-made SVG (the anatomogram) that already has every organ drawn as a separate shape with an ID baked in. Clicking works because the shapes and IDs were authored by someone else.

Your app has no equivalent. Floor plans are uploaded PDFs, not tagged SVGs, so there is nothing per-door to click inside the plan itself. That means:

- The "magic imported SVG" trick from the demo does not apply to your floor plans. Ignore any advice to feed a plan in and get clickable doors out.
- The diagram we build is a **door**, not a floor plan. A door is simple geometry (a rectangle in a frame with a few labeled zones), so we author the SVG ourselves. This is less exotic than the demo but far more reliable, because we control every shape and ID.
- The genuinely reusable idea from the demo is the interaction pattern: hover a zone to see what it is, click a zone to drill in, color zones by state. That pattern transfers cleanly.

The reason this is a good fit for your app specifically: your `InspectionWizard` already encodes every door component as a checklist item with a stable ID (`gap_hinge`, `pl_fire_pin`, `sc_slamming`, and so on). The diagram is a **visual front-end to item IDs you already have.** We are not inventing inspection logic. We are drawing a door and wiring each zone to the existing IDs.

## 3. The crosswalk (the core design artifact)

Each clickable zone maps to a set of existing item IDs from `getApplicableItems`. This table is the contract. Everything else is plumbing. IDs below are real, pulled from `InspectionWizard.tsx`. Lock this table before writing code.

| Zone (data-zone) | Door part | Maps to item IDs |
|---|---|---|
| `head_gap` | Top edge clearance | `gap_top` |
| `hinge_stile` | Hinge edge | `gap_hinge`, `pi_laminate_hinge`, `pi_hinge_filler`, `pi_hinge_missing`, `pi_screws` |
| `latch_stile` | Latch edge | `gap_latch`, `pi_laminate_latch` |
| `sill_gap` | Bottom clearance | `gap_bottom_3_4`, `gap_bottom_1`, `gap_sweep`, `pi_sweep`, `sc_rub_floor`, `sc_sweep_dragging` |
| `meeting_stile` | Between leaves (pairs only) | `gap_meeting`, `gap_astragal`, `pi_astragal`, `gap_fire_pin`, `pl_fire_pin`, `pl_bottom_fails`, `pl_floor_strike_missing`, `lock_overlap_independent` |
| `leaf_face` | Door face | `gap_face`, `pi_door_damaged`, `pi_holes`, `pi_prep`, `pi_dissimilar`, `pi_laminate_face`, `pi_hydraulic`, `label_door`, `rating_door` |
| `frame` | Frame | `pi_frame`, `label_frame`, `rating_frame` |
| `closer` | Closer / operator (top of leaf) | `sc_closer_missing`, `sc_arm_disconnected`, `sc_slamming`, `sc_maladjusted`, `sc_hold_open`, `sc_air_pressure`, `sc_rub_adjacent`, `sc_rub_frame`, `sc_coordinator_missing`, `sc_coordinator_failing` |
| `latch_hw` | Lockset / latch hardware | `hw_latch_missing`, `pl_latch_sticks`, `pl_latch_fails`, `pl_defeated`, `pl_hw_damaged`, `pl_electric_strike`, `pl_mechanical_hw`, `pi_latching_hw`, `lock_locked_egress`, `lock_illegitimate_arrangement` |
| `panic_hw` | Panic / exit device | `lock_panic_actuating`, `pi_panic_endcap`, `lock_delayed_failure`, `lock_delayed_sprinkler`, `lock_deadbolt`, `lock_motion_fails`, `lock_pte_fails`, `lock_pte_distance`, `lock_pte_missing` |
| `vision_panel` | Vision lite (if present) | `rating_vision`, `vp_missing`, `sign_vision` |
| `gasketing` | Perimeter seals | `pi_gasketing` |
| `signage` | Applied signage | `sign_delayed_egress`, `sign_coat_rack`, `sign_mech_fastened`, `sign_5pct` |

Notes:

- An item can appear under more than one zone if that reads naturally to an inspector. Decide per item during Phase 0; don't over-optimize.
- Some IDs carry a `branch` (`x1`–`x14`) that opens a follow-up question. The diagram does not need to know about branches. It just opens the item; the wizard's existing branch UI handles the rest.
- If a new item ID is added to the wizard later, it must be added to this table or it silently won't be reachable from the diagram. Treat the table as part of the wizard's public surface.

## 4. Architecture

Keep the diagram as a **new, self-contained component**. Do not fold it into the wizard's core logic.

- `client/src/components/DoorDiagram.tsx` — renders a hand-authored SVG door elevation. Each zone is an SVG shape with `data-zone="hinge_stile"` etc. Emits `onZoneClick(zone)` and `onZoneHover(zone)`. Presentational only; no inspection logic inside.
- `client/src/lib/doorZones.ts` — exports the crosswalk (`ZONE_TO_ITEM_IDS`), zone labels, and a helper `zoneForItemId(id)`. Single source of truth for the mapping. This is the only new "logic," and it's just a lookup table.
- Integration point in `InspectionWizard.tsx` — **additive and small.** The diagram is the primary surface for a door. On open, render `<DoorDiagram>`. Clicking a zone sets a local `zoneFilter` state and reveals **only that zone's applicable items** in a panel (drawer or inline section) for the inspector to mark. Recording a deficiency flows through the **existing** state exactly as it does today.

Diagram-first flow (per your decision on Q1):

1. Inspector clicks a pin on the plan → door diagram opens.
2. Inspector clicks a zone on the door → the applicable items for that zone appear.
3. Inspector marks findings; the diagram zone recolors to reflect them.
4. Repeat per zone until the door is done.

No-regression safeguard: some applicable items may not map to any zone, and an inspector may want the full list. Keep a persistent **"All remaining items"** control that shows every applicable item not yet reviewed, regardless of zone. This guarantees nothing in `getApplicableItems` becomes unreachable just because it isn't pinned to a drawn part.

Why this shape: it respects your working rules. The diagram never touches `getApplicableItems`, `getBranchResult`, or `BranchUI`. It reads their output (the visible item list) and filters it by zone. If we ever find we can't avoid editing those three functions, we stop and ask you first (your rule 2).

Zone color state, derived from current wizard findings, no new storage:

- grey — no applicable items in this zone have been touched
- red — at least one item in this zone is marked deficient
- amber — at least one advisory, none deficient
- green — all applicable items in this zone reviewed and passing

Door variants (later phase): show/hide zones from the same flags `getApplicableItems` already computes. `meeting_stile` and the second leaf appear only for pairs (`notSingleDoor`). `vision_panel` appears only when `hw_vision_panel` is set. `closer` styling reflects `hw_closer` / operator. Reuse those flags; don't recompute door type in the diagram.

## 5. Build phases

Each phase ends with a screenshot check and one commit (conventional-commits message, no push — your rule 8).

Phase 0 — Lock the crosswalk
Confirm the Section 3 table with you. Decide double-listed items. Output: agreed table, no code.

Phase 1 — Static diagram, single leaf
Author the SVG elevation for a single door in a frame with all common zones. Hover shows the zone label; click logs the zone to the console. No wizard wiring yet. Verify by screenshot.

Phase 2 — Live color state
Color each zone from current findings using the rules above. Still standalone (feed it a sample door). Verify the four states render correctly.

Phase 3 — Wire into the wizard (diagram-first)
Make the diagram the primary surface. Zone click reveals that zone's applicable items in a panel; add the persistent "All remaining items" control. Confirm recording a deficiency behaves identically to today. No edits to the three protected functions.

Phase 4 — Door variants
Drive zone visibility from `assemblyType` and `hwState` (pairs, vision panel, closer, swing). Reuse existing flags.

Phase 5 — Polish
Match the Industrial Blueprint tokens from `ideas.md` (amber active, green/red/amber semantics, mono data labels). Keyboard navigation for zones. Optional: subtle click/hover sound, muted by default, as in the demo. Skip sound if it complicates the mobile field use.

## 6. Guardrails baked in from your CLAUDE.md

- Surgical edits only inside `InspectionWizard.tsx`. The diagram is new files; wizard changes are the toggle plus a filter read. (Rule 1)
- Do not modify `getApplicableItems`, `getBranchResult`, or `BranchUI` without asking first. The diagram reads their output; it does not change them. (Rule 2)
- Narrate substantive edits in plain English before making them. (Rule 3)
- Leave the Manus plumbing alone. (Rule 4)
- Type changes go in `client/src/types.ts` first; call out before touching `shared/types.ts`. A `Zone` type will be added here. (Rule 5)
- No changes to zoom/pan in `PDFViewer.tsx` for this feature. The pin click already exists; we hang the diagram off it. (Rule 6)
- Treat item IDs as a contract. Before renaming any ID, grep the wizard and update `doorZones.ts`. (Rule 7)
- One commit per phase, clear message, never push. (Rule 8)

## 7. Phase 0 decisions (settled)

1. **Flow: diagram-first.** Click a zone on the door, then see the applicable items for that zone. Not a toggle beside a default checklist. Reflected in Sections 1, 4, and 5. A persistent "All remaining items" control keeps every applicable item reachable.
2. **Single-leaf MVP first.** Pairs come in Phase 4.
3. **Generic elevation now.** No handing in the drawing for the MVP.
4. **Use the Section 3 table as-is.**

Correction on the Q3 rationale (verified in code): the app does **not** currently require a photo, and the photo UI lives in `InspectionModal.tsx`, not in the `InspectionWizard` used for inspections. So "a required photo will capture handing" is not true today. A generic elevation is still fine for the MVP. If you later want handing captured reliably, we add two things as a separate change: make at least one photo mandatory, and wire photo capture into the wizard. Tracked here, not assumed.

## 8. How to build it: Cowork vs Claude Code

You asked for the tradeoffs rather than a single pick. Bottom line: build this in Cowork, keep Claude Code as an optional escalation for big refactors.

Stay in Cowork (recommended for this feature)
- Pros: screenshots work, which is how you communicate, and this is a heavily visual feature where you'll want to point at the drawing and say "move that zone." Same file access to this repo, can run builds. Lower friction for a non-developer. Clarifying questions and visual iteration are native here.
- Cons: large multi-file refactors are a bit slower than a tight terminal loop. The sandbox is Linux while your run scripts assume Windows (minor; only matters if we run the app rather than just build it). Long build sessions can drift if not committed often.

Hybrid: Cowork + Claude Code
- Pros: iterate visually here, hand bulk edits to Claude Code when a phase touches many files. Git is the shared source of truth.
- Cons: context is split across two tools; you have to keep them in sync via commits, and explain state twice. More overhead to manage for a solo non-developer.

Claude Code only
- Pros: fastest edit/build/test loop, git-native, strong on large diffs.
- Cons: no screenshots, which removes your main way of communicating. You'd describe every visual bug in words. Steeper for a non-developer. Poor fit for a feature that is fundamentally about a picture.

Recommendation: Cowork as the primary tool for this feature, because the whole point is a visual drawing you'll refine by looking at it. Reach for Claude Code only if a phase (likely Phase 4) becomes a large mechanical edit across many files, and even then the plan and review stay here.

## 9. First action after you approve

Phase 0 is settled (Section 7). Next is Phase 1: a static single-leaf door drawing with all zones, hover labels, and click logged to console. You look at it and react before any wizard wiring. One last check before Phase 1: confirm the double-listed items in the Section 3 table read right (e.g. `pl_fire_pin` under `meeting_stile`, latching items split between `latch_stile` and `latch_hw`).
