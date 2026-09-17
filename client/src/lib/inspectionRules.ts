/**
 * Declarative inspection rule tables — the data that drives the door-inspection
 * decision tree. Edit these to change inspection rules (assembly types, rating
 * minimums, hardware list, blocking prompts) WITHOUT touching the load-bearing
 * logic functions (getApplicableItems / getBranchResult / BranchUI) that live in
 * InspectionWizard.tsx and consume these tables.
 */

export const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  '3hr_fire': '3-Hour Fire Barrier',
  '2hr_fire': '2-Hour Fire Barrier',
  '1hr_fire': '1-Hour Fire Barrier',
  '1hr_partition': '1-Hour Partition',
  'smoke_barrier': 'Smoke Barrier',
  'smoke_partition': 'Smoke Partition',
  'suite_perimeter': 'Suite Perimeter',
};

// Plain-language descriptions shown under the assembly-type picker.
export const ASSEMBLY_TYPE_DESCRIPTIONS: Record<string, string> = {
  '3hr_fire': 'Associated with building separations and transformer vaults.',
  '2hr_fire': 'Associated with stairs, horizontal exits, building separations, construction type separations, and occupancy separations.',
  '1hr_fire': 'Associated with stairs that connect three or fewer floors and hazardous areas.',
  '1hr_partition': 'Associated with atrium separations and tenant separations.',
  'smoke_barrier': 'Use for smoke compartmentation in health care and ambulatory occupancy.',
  'smoke_partition': 'Associated with non-rated hazardous areas and separations between suites and adjacent spaces that are not the egress corridor.',
  'suite_perimeter': 'Associated with the boundary of a suite of rooms (healthcare context).',
};

export const FIRE_RATED = ['3hr_fire', '2hr_fire', '1hr_fire', '1hr_partition'];

// Assembly-type precedence, highest priority first. Used by the on-drop
// auto-detect (lib/wallDetect.ts): when an icon lands where two calibrated wall
// colors run parallel (e.g. a fire barrier beside a smoke barrier), the
// higher-precedence type wins. Every fire-rated wall outranks every smoke/suite
// wall; among fire walls the higher hour-rating wins.
export const ASSEMBLY_PRECEDENCE = [
  '3hr_fire',
  '2hr_fire',
  '1hr_fire',
  '1hr_partition',
  'smoke_barrier',
  'smoke_partition',
  'suite_perimeter',
];

export const MIN_RATINGS: Record<string, number | null> = {
  '3hr_fire': 180,
  '2hr_fire': 90,
  '1hr_fire': 45,
  '1hr_partition': 20,
  'smoke_barrier': 20,
  'smoke_partition': null,
  'suite_perimeter': null,
};

export interface MinRatingContext {
  isStairDoor?: boolean | null;
  isDualEgressSwing?: boolean | null;
  isCrossCorridor?: boolean | null;
  isHealthCareOccupancy?: boolean | null;
  isCorridorDoor?: boolean | null;
  construction?: string; // 'existing' | 'new'
}

/**
 * The minimum door/frame rating (minutes) required for an assembly type, given
 * context. This used to be computed independently in two places —
 * getApplicableItems's `show` condition and InspectionWizard's startInspection
 * auto-flag logic — and they drifted: startInspection knew an existing-
 * construction smoke barrier needs no rating, getApplicableItems didn't. That
 * let a rating checklist row show as needing attention while never being
 * auto-flagged, so the inspector had to manually clear a row that never had a
 * real issue. One function, called from both places, so they can't disagree.
 */
export function minRequiredRating(assemblyType: string, ctx: MinRatingContext): number | null {
  let minRequired = MIN_RATINGS[assemblyType] ?? null;
  if (assemblyType === '1hr_fire' && ctx.isStairDoor) minRequired = 60;
  if (assemblyType === 'smoke_barrier' && ctx.isDualEgressSwing && ctx.isCrossCorridor && ctx.isHealthCareOccupancy) minRequired = 0;
  // Smoke barrier doors need no fire rating in Existing Occupancy; the 20-min
  // minimum applies only to New Occupancy.
  if (assemblyType === 'smoke_barrier' && ctx.construction === 'existing') minRequired = 0;
  // 1-Hour Partition corridor doors require a 45-min minimum (IBC).
  if (assemblyType === '1hr_partition' && ctx.isCorridorDoor) minRequired = 45;
  return minRequired;
}

export const HARDWARE_VARS = [
  { id: 'hw_automatic_operator',   label: 'Automatic Operator',     default: false },
  { id: 'hw_closer',               label: 'Closer',                 default: false },
  { id: 'hw_continuous_hinge',     label: 'Continuous Hinge',       default: false },
  { id: 'hw_coordinator',          label: 'Coordinator',            default: false },
  { id: 'hw_deadbolt',             label: 'Deadbolt',               default: false },
  { id: 'hw_delayed_egress',       label: 'Delayed Egress Device',  default: false },
  { id: 'hw_electric_strike',      label: 'Electric Strike',        default: false },
  { id: 'hw_flush_bolts_auto',     label: 'Flush Bolts (Automatic)',default: false },
  { id: 'hw_flush_bolts_manual',   label: 'Flush Bolts (Manual)',   default: false },
  { id: 'hw_lockset_cylindrical',  label: 'Lockset (Cylindrical)',  default: false },
  { id: 'hw_lockset_mortise',      label: 'Lockset (Mortise)',      default: false },
  { id: 'hw_magnetic_lock',        label: 'Magnetic Lock',          default: false },
  { id: 'hw_motion_sensor',        label: 'Motion Sensor',          default: false },
  { id: 'hw_overlapping_astragal', label: 'Overlapping Astragal',   default: false },
  { id: 'hw_panic_device',         label: 'Panic Device',           default: false },
  { id: 'hw_protective_plate',     label: 'Protective Plate(s)',    default: false },
  { id: 'hw_push_to_exit',         label: 'PUSH TO EXIT Button',    default: false },
  { id: 'hw_signage',              label: 'Signage',                default: false },
  { id: 'hw_sweep',                label: 'Sweep',                  default: false },
  { id: 'hw_vision_panel',         label: 'Vision Panel',           default: false },
];

export const DEFAULT_HW_STATE: Record<string, boolean> = HARDWARE_VARS.reduce(
  (acc, v) => ({ ...acc, [v.id]: v.default }),
  {} as Record<string, boolean>,
);

// Reference photo + plain-language description per hardware type (setup page 2).
export const HARDWARE_META: Record<string, { desc: string; img?: string; img2?: string; imgNote?: string }> = {
  hw_automatic_operator: { desc: 'Powered arm that opens the door on its own.', img: '/hardware/hw_automatic_operator.webp' },
  hw_closer: { desc: 'Arm at the top that pulls the door shut on its own.', img: '/hardware/hw_closer.webp' },
  hw_continuous_hinge: { desc: 'Full-height hinge along the entire door edge.', img: '/hardware/hw_continuous_hinge.webp' },
  hw_coordinator: { desc: 'Bar on a pair that closes the leaves in order.', img: '/hardware/hw_coordinator.jpeg', img2: '/hardware/hw_coordinator_gravity.webp', imgNote: 'Bar and gravity types both count.' },
  hw_deadbolt: { desc: 'Separate bolt above the handle (thumb-turn or key).', img: '/hardware/hw_deadbolt.jpg' },
  hw_delayed_egress: { desc: 'Lock that releases a short delay after pushing.', img: '/hardware/hw_delayed_egress.webp' },
  hw_electric_strike: { desc: 'Electrified strike in the frame that releases the latch.', img: '/hardware/hw_electric_strike.jpg' },
  hw_flush_bolts_auto: { desc: 'Self-retracting rods on the inactive leaf.', img: '/hardware/hw_flush_bolts_auto.jpeg' },
  hw_flush_bolts_manual: { desc: 'Hand-operated rods pinning the inactive leaf.', img: '/hardware/hw_flush_bolts_manual.jpg' },
  hw_lockset_cylindrical: { desc: 'Handle with a round bored hole through the door.', img: '/hardware/hw_lockset_cylindrical.webp' },
  hw_lockset_mortise: { desc: 'Handle set into a pocket in the door edge.', img: '/hardware/hw_lockset_mortise.webp' },
  hw_magnetic_lock: { desc: 'Plate at the top held by an electromagnet.', img: '/hardware/hw_magnetic_lock.webp' },
  hw_motion_sensor: { desc: 'Sensor that releases the lock on approach.', img: '/hardware/hw_motion_sensor.jpg' },
  hw_overlapping_astragal: { desc: 'Strip on one leaf covering the meeting-edge gap.', img: '/hardware/hw_overlapping_astragal.webp' },
  hw_panic_device: { desc: 'Horizontal push bar across the door.', img: '/hardware/hw_panic_device.webp' },
  hw_protective_plate: { desc: 'Metal kick plate on the lower door face.', img: '/hardware/hw_protective_plate.jpg' },
  hw_push_to_exit: { desc: 'Button that releases the lock to exit.', img: '/hardware/hw_push_to_exit.jpg' },
  hw_signage: { desc: 'Applied signs or labels on the door.', img: '/hardware/hw_signage.png' },
  hw_sweep: { desc: 'Strip along the bottom of the door.', img: '/hardware/hw_sweep.webp' },
  hw_vision_panel: { desc: 'Window in the door.', img: '/hardware/hw_vision_panel.webp' },
};

export const SECTIONS = ['Rating', 'Gaps', 'Self-Closing', 'Positive Latching', 'Physical Integrity', 'Signage', 'Locking'];

// ── Checklist panel grouping (display only) ─────────────────────────────────
// Clusters similar checklist items into collapsible panels so a section with
// many items (Physical Integrity has 18) doesn't force a long flat scroll on
// mobile. Purely a rendering concern: it has no effect on which items
// getApplicableItems() decides apply to a door, their wording, or their
// toggle/note/branch behavior — those are still driven entirely by the
// existing ChecklistItem list. An item id not listed anywhere in a section's
// entry here renders as a plain standalone row, same as before this existed —
// a deliberate fallback so a future new item that isn't added here doesn't
// silently disappear.
export interface ChecklistPanelDef {
  title: string;
  itemIds: string[];
}
export interface ChecklistGroupDef {
  // Outer collapsible wrapper phrased as a diagnostic question, containing
  // multiple panels — used only where a section has one underlying question
  // ("what's causing this?") with several distinct possible causes.
  title: string;
  panels: ChecklistPanelDef[];
}
export type ChecklistBlock = ChecklistPanelDef | ChecklistGroupDef;
export function isChecklistGroup(block: ChecklistBlock): block is ChecklistGroupDef {
  return Array.isArray((block as ChecklistGroupDef).panels);
}

export const CHECKLIST_PANELS: Record<string, ChecklistBlock[]> = {
  Gaps: [
    {
      title: 'Are there any gaps present at the perimeter or bottom of the door?',
      panels: [
        {
          title: 'Perimeter gap is in excess of the applied standard.',
          // Bottom is ¾" or 1" depending on assembly type — the two items are
          // already mutually exclusive by getApplicableItems' show condition,
          // so only whichever applies ever actually appears here.
          itemIds: ['gap_bottom_3_4', 'gap_bottom_1', 'gap_hinge', 'gap_latch', 'gap_top', 'gap_meeting'],
        },
        {
          title: 'Astragal and/or sweep being used for gap mitigation',
          itemIds: ['gap_astragal', 'gap_sweep'],
        },
      ],
    },
    // Not nested under the question above — face gap is a different
    // measurement (door face to frame stop), not a perimeter/bottom one.
    { title: 'Face Gap', itemIds: ['gap_face', 'gap_fire_pin'] },
  ],

  'Self-Closing': [
    {
      title: "What's causing the self-closing issue?",
      panels: [
        { title: 'Closer', itemIds: ['sc_closer_missing', 'sc_arm_disconnected', 'sc_slamming', 'sc_maladjusted'] },
        { title: 'Coordinator', itemIds: ['sc_coordinator_missing', 'sc_coordinator_failing'] },
        {
          title: 'Obstruction',
          itemIds: ['sc_rub_adjacent', 'sc_rub_floor', 'sc_rub_frame', 'sc_air_pressure', 'sc_hold_open', 'sc_sweep_dragging'],
        },
      ],
    },
  ],

  // Grouped by WHERE the door latches, not which brand of hardware — today's
  // items don't distinguish lockset vs. panic device vs. delayed-egress lock,
  // they fire generically whenever any latching hardware is present. Top vs.
  // bottom latching point is the one distinction the data actually makes.
  'Positive Latching': [
    {
      title: 'Top Latching Point',
      itemIds: ['hw_latch_missing', 'pl_latch_sticks', 'pl_latch_fails', 'pl_defeated', 'pl_hw_damaged', 'pl_electric_strike', 'pl_mechanical_hw'],
    },
    {
      title: 'Bottom Latching Point',
      itemIds: ['pl_bottom_fails', 'pl_floor_strike_missing', 'pl_fire_pin', 'pl_flush_bolts_manual'],
    },
  ],

  Rating: [
    {
      title: "What's underrated or illegible?",
      panels: [
        { title: 'Door & Frame', itemIds: ['label_door', 'rating_door', 'label_frame', 'rating_frame'] },
        { title: 'Hardware', itemIds: ['rating_cont_hinge', 'rating_panic', 'rating_plate', 'rating_vision'] },
      ],
    },
  ],

  'Physical Integrity': [
    { title: 'Hinges', itemIds: ['pi_hinge_filler', 'pi_hinge_missing', 'pi_screws'] },
    { title: 'Holes', itemIds: ['pi_holes', 'pi_prep', 'pi_dissimilar'] },
    { title: 'Laminate', itemIds: ['pi_laminate_hinge', 'pi_laminate_latch', 'pi_laminate_top', 'pi_laminate_face'] },
    { title: 'Latching Hardware', itemIds: ['pi_latching_hw', 'pi_panic_endcap'] },
    { title: 'Astragal & Sweep', itemIds: ['pi_astragal', 'pi_sweep'] },
    { title: 'Door/Frame Damage', itemIds: ['pi_frame', 'pi_door_damaged', 'pi_hydraulic'] },
  ],

  Locking: [
    {
      title: 'Motion Sensor & Push-to-Exit',
      itemIds: ['lock_motion_fails', 'lock_pte_fails', 'lock_pte_distance', 'lock_pte_missing', 'lock_illegitimate_arrangement'],
    },
    {
      title: 'Delayed Egress',
      itemIds: ['lock_delayed_failure', 'lock_delayed_sprinkler', 'sign_delayed_egress'],
    },
  ],

  Signage: [
    { title: 'Signage', itemIds: ['sign_coat_rack', 'sign_mech_fastened', 'sign_5pct', 'sign_vision'] },
  ],
};

// Gating questions shown before the rest of the checklist. Each maps to a branch
// id (x11–x14) resolved by getBranchResult in InspectionWizard.tsx.
export const BLOCKING_PROMPTS: Array<{
  id: string;
  section: string;
  condition: (hw: any, swing: string) => boolean;
  branch: string;
  title: string;
}> = [
  {
    id: 'bp_sc_closer_inactive',
    section: 'Self-Closing',
    condition: (hw, swing) => !hw.hw_closer && !hw.hw_automatic_operator && swing === 'dbl_inactive',
    branch: 'x14',
    title: 'Inactive leaf without closer — answer the following before proceeding',
  },
  {
    id: 'bp_flush_bolts',
    section: 'Positive Latching',
    condition: (hw, swing) => hw.hw_flush_bolts_manual && swing === 'dbl_inactive',
    branch: 'x13',
    title: 'Manual flush bolts present — answer the following before proceeding',
  },
  {
    id: 'bp_deadbolt',
    section: 'Locking',
    condition: (hw) => hw.hw_deadbolt,
    branch: 'x11',
    title: 'Deadbolt present — answer the following before proceeding',
  },
  {
    id: 'bp_mag_lock',
    section: 'Locking',
    condition: (hw) => hw.hw_magnetic_lock && !hw.hw_motion_sensor && !hw.hw_push_to_exit,
    branch: 'x12',
    title: 'Magnetic lock without motion sensor or PUSH TO EXIT — answer the following before proceeding',
  },
];
