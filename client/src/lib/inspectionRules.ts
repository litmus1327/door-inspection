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
  '3hr_fire': 'Highest-rated separation; major hazard divisions or between buildings.',
  '2hr_fire': 'Heavy separation, e.g. exit stair enclosures in taller buildings.',
  '1hr_fire': 'Common fire separation: corridors, stairwells, mechanical/electrical rooms.',
  '1hr_partition': 'Lighter 1-hour separation, often tenant or corridor partitions.',
  'smoke_barrier': 'Limits smoke spread between compartments; common in healthcare.',
  'smoke_partition': 'Resists smoke passage but is not rated for fire.',
  'suite_perimeter': 'Boundary of a suite of rooms (healthcare context).',
};

export const FIRE_RATED = ['3hr_fire', '2hr_fire', '1hr_fire', '1hr_partition'];

export const MIN_RATINGS: Record<string, number | null> = {
  '3hr_fire': 180,
  '2hr_fire': 90,
  '1hr_fire': 45,
  '1hr_partition': 20,
  'smoke_barrier': 20,
  'smoke_partition': null,
  'suite_perimeter': null,
};

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
