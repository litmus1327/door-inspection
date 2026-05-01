# CODIFY Door Inspection — Design Brainstorm

## Context
A professional fire & life safety door inspection tool used by up to 4 field inspectors simultaneously.
Must handle: PDF floor plan viewer with pin-dropping, inspection wizard, records dashboard, Supabase sync.
The original app has a strong dark industrial aesthetic we should honor and elevate.

---

<response>
<probability>0.07</probability>
<text>

## Idea A — Industrial Blueprint

**Design Movement:** Technical Blueprint / Industrial CAD
**Core Principles:**
1. Everything references engineering drawings — grid overlays, dimension lines, annotation callouts
2. High information density with zero visual noise — every pixel earns its place
3. Color used exclusively as semantic signal (amber = active, green = pass, red = fail, blue = info)
4. Monospace type for all data; condensed sans-serif for all headings

**Color Philosophy:**
- Background: near-black `#0d0f12` — like a darkened drafting table
- Surface layers: `#151820`, `#1c2030`, `#232840` — subtle blue-grey depth
- Accent amber: `#e8a020` — the only warm color; used for active states, CTAs, CODIFY brand
- Semantic: green `#28c76f`, red `#ea5455`, orange `#ff9f43`
- Text: `#dce3f0` (primary), `#8892aa` (secondary), `#4a5570` (muted)

**Layout Paradigm:**
- Left sidebar (64px collapsed, 240px expanded) for primary navigation
- Main content area with max-width 960px, left-aligned not centered
- Header strip: 56px, sticky, shows project context + sync status
- PDF viewer takes full remaining viewport height

**Signature Elements:**
1. Amber left-border accent on active cards and selected items
2. Monospace data labels in ALL CAPS with letter-spacing
3. Dashed border callout boxes for contextual info (like engineering annotation bubbles)

**Interaction Philosophy:**
- Every action has an immediate visual response — no ambiguous loading states
- Destructive actions require a 3-second countdown with cancel (already in original)
- Keyboard-navigable inspection wizard

**Animation:**
- Slide-in from right for new inspection sections (translateX 12px → 0)
- Fade-in for modals and drawers
- Pulse animation on sync status dot
- Pin drop on PDF: scale from 0 → 1.2 → 1.0 with a brief amber glow

**Typography System:**
- Display/Headings: `Barlow Condensed` 700 — uppercase, letter-spaced
- Body: `Barlow` 300/400/500 — readable at small sizes
- Data/Labels: `Share Tech Mono` — all numeric data, IDs, timestamps

</text>
</response>

<response>
<probability>0.06</probability>
<text>

## Idea B — Field Operations Dark

**Design Movement:** Military/Field Operations HUD
**Core Principles:**
1. Information hierarchy modeled after tactical displays — critical data always visible
2. Asymmetric layout with a persistent status strip at the bottom
3. Heavy use of ruled lines and section dividers as structural elements
4. Status-first design — the overall pass/fail state of a door is always the most prominent element

**Color Philosophy:**
- Near-black with a slight green tint: `#0a0f0d` — night-vision reference
- Accent: `#00e676` green (active/pass), `#ff1744` red (fail), `#ffd600` amber (warning/active)
- Muted surfaces in dark grey-green tones

**Layout Paradigm:**
- Full-bleed header with project name in massive condensed type
- Two-column layout on desktop: narrow left column for door metadata, wide right for inspection content
- Bottom status bar showing inspector name, sync status, current door

**Signature Elements:**
1. Corner-bracket decorations on selected/active cards (CSS clip-path)
2. Scanline texture overlay on header (subtle CSS repeating-linear-gradient)
3. Blinking cursor on active input fields

**Interaction Philosophy:**
- Minimal click depth — most actions accessible within 2 taps
- Swipe gestures on mobile for section navigation

**Animation:**
- Scanline sweep effect on page load
- Status changes: color flood fill animation
- Section transitions: horizontal slide

**Typography System:**
- Display: `Bebas Neue` — ultra-condensed, military feel
- Body: `IBM Plex Mono` — technical, readable
- Labels: `IBM Plex Mono` 400 uppercase

</text>
</response>

<response>
<probability>0.05</probability>
<text>

## Idea C — Precision Instrument

**Design Movement:** Swiss Precision / Scientific Instrument
**Core Principles:**
1. Grid-based but asymmetric — 8px base unit, everything snaps to it
2. Typography does the heavy lifting — minimal decorative elements
3. Color palette is near-monochromatic with a single accent
4. Data tables and forms are the primary UI — no hero sections, no marketing

**Color Philosophy:**
- Off-white background: `#f5f4f0` — like aged technical paper
- Dark ink: `#1a1a1a` — near-black for all text
- Accent: `#c8410a` — burnt orange, like a technical pen
- Surfaces: white cards on warm grey background

**Layout Paradigm:**
- Top navigation with section tabs (no sidebar)
- Full-width content with generous margins
- PDF viewer embedded inline, not in a modal

**Signature Elements:**
1. Red corner marks on active/selected elements (like registration marks)
2. Hairline borders (0.5px) throughout
3. Numbered section headers in large light-weight type

**Interaction Philosophy:**
- Keyboard-first — tab through all form fields
- Minimal animation — only functional transitions

**Animation:**
- Cross-fade between sections
- Subtle scale on button press

**Typography System:**
- Display: `Neue Haas Grotesk` / `DM Sans` — Swiss modernist
- Body: `DM Sans` 400
- Data: `DM Mono` — clean monospace

</text>
</response>

---

## Selected Approach: **Idea A — Industrial Blueprint**

This honors the original app's established visual language while elevating it with:
- A proper React component architecture replacing the monolithic HTML
- Sidebar navigation replacing the top tab bar (better for the PDF viewer's viewport needs)
- Enhanced PDF viewer with pin management
- Photo attachment UI per door
- Improved records table with search/filter
