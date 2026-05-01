import React, { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface SelectedDoor {
  assetId: string | null;
  iconNo: string;
  floor: string;
  grid: string;
  assemblyType: string;
  doorRating: string;
  pinId?: string;
}

interface InspectionWizardProps {
  selectedDoor?: SelectedDoor | null;
  onClear?: () => void;
}

interface HwState {
  [key: string]: boolean;
}

interface ProjectVars {
  construction: string;
  gapStandard: string;
  sprinklered: boolean;
}

interface BranchAnswers {
  [key: string]: string;
}

interface DeficiencyState {
  status: 'deficient' | 'advisory' | 'compliant';
  text: string;
  category: string;
  note: string;
  branchAnswers: BranchAnswers;
  autoFlagged?: boolean;
}

interface ChecklistItem {
  section: string;
  id: string;
  text: string;
  show: boolean;
  branch?: string | null;
  hint?: string;
  note?: string;
  autoFlag?: boolean;
}

interface CurrentDoor {
  inspectorName: string;
  projectName: string;
  iconNo: string;
  assetId: string;
  floorNo: string;
  gridBlock: string;
  assemblyType: string;
  doorRating: string;
  frameRating: string;
  doorSwingType: string;
  isStairDoor: boolean | null;
  isCrossCorridor: boolean | null;
  isHealthCareOccupancy: boolean;
  hwState: HwState;
  projectVars: ProjectVars;
  startTime: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ASSEMBLY_TYPE_LABELS: Record<string, string> = {
  '3hr_fire': '3-Hour Fire Barrier',
  '2hr_fire': '2-Hour Fire Barrier',
  '1hr_fire': '1-Hour Fire Barrier',
  '1hr_partition': '1-Hour Partition',
  'smoke_barrier': 'Smoke Barrier',
  'smoke_partition': 'Smoke Partition',
  'suite_perimeter': 'Suite Perimeter',
};

const FIRE_RATED = ['3hr_fire', '2hr_fire', '1hr_fire', '1hr_partition'];

const MIN_RATINGS: Record<string, number | null> = {
  '3hr_fire': 180,
  '2hr_fire': 90,
  '1hr_fire': 45,
  '1hr_partition': 20,
  'smoke_barrier': 20,
  'smoke_partition': null,
  'suite_perimeter': null,
};

const HARDWARE_VARS = [
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

const DEFAULT_HW_STATE: HwState = HARDWARE_VARS.reduce((acc, v) => ({ ...acc, [v.id]: v.default }), {});

// ... [rest of constants and helper functions remain the same] ...
// [For brevity, I'll insert the complete file, but the key change is in the setup screen rendering]

// ─── INSPECTION ITEMS & DECISION TREE ──────────────────────────────────────────

const SECTIONS = ['Rating', 'Gaps', 'Self-Closing', 'Positive Latching', 'Physical Integrity', 'Signage', 'Locking'];

const BLOCKING_PROMPTS: Array<{
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

function getApplicableItems(
  atype: string,
  hw: HwState,
  swing: string,
  projVars: ProjectVars,
  isCrossCorridor: boolean = false,
  doorRating: string = '',
  frameRating: string = '',
  isHealthCareOccupancy: boolean = true,
  x14Compliant: boolean = false,
): ChecklistItem[] {
  const sprinklered = projVars.sprinklered !== false;
  const gapStd = projVars.gapStandard || 'codify';
  const minRating = MIN_RATINGS[atype] ?? null;
  const isDualEgressSwing = swing === 'dbl_dual_egress';
  let minRequired = minRating;
  if (atype === '1hr_fire' && swing === 'stair') minRequired = 60;
    if (atype === 'smoke_barrier' && isDualEgressSwing && isCrossCorridor && isHealthCareOccupancy) minRequired = 0;
  const doorRatingNum = doorRating === 'label_illegible' ? -1 : parseInt(doorRating) || 0;
  const frameRatingNum = frameRating === 'label_illegible' ? -1 : parseInt(frameRating) || 0;
  const doorIsUnderrated = minRequired !== null && minRequired > 0 && doorRatingNum < minRequired;
  const frameIsUnderrated = minRequired !== null && minRequired > 0 && frameRatingNum < minRequired;
  const isFire = FIRE_RATED.includes(atype);
  const isSmoke = atype === 'smoke_barrier';
  const isSmokeBarrierNonRated = isSmoke && swing === 'dbl_dual_egress' && isCrossCorridor && isHealthCareOccupancy;
  const isSmokePart = atype === 'smoke_partition';
  const isSuite = atype === 'suite_perimeter';
  const isNotSmokePartOrSuite = !isSmokePart && !isSuite && !isSmokeBarrierNonRated;
  const hasDblSwing = swing !== 'single';
  const isDualEgress = swing === 'dbl_dual_egress';
  const isInactive = swing === 'dbl_inactive';
  const notSingleDoor = hasDblSwing;
  const closerOrAuto = hw.hw_closer || hw.hw_automatic_operator;
  const locksetOrPanic = hw.hw_lockset_cylindrical || hw.hw_lockset_mortise || hw.hw_panic_device || hw.hw_delayed_egress;
  const gapStdText: Record<string, string> = {
    codify: '1/4"', nfpa80: '1/8" ± 1/16"', preoccupancy: '3/16"', survey: '3/8"',
  };
  const gapHint = gapStdText[gapStd] || '1/8" ± 1/16"';
  const items: ChecklistItem[] = [];

  // RATING
  items.push({ section: 'Rating', id: 'label_door', text: 'Labeling: Door label is illegible.', show: isNotSmokePartOrSuite && doorRating === 'label_illegible' });
  items.push({ section: 'Rating', id: 'rating_door', text: 'Rating: Door is underrated for the door assembly type.', show: isNotSmokePartOrSuite && (doorIsUnderrated || doorRating === 'label_illegible') });
  items.push({ section: 'Rating', id: 'label_frame', text: 'Labeling: Frame label is illegible.', show: isNotSmokePartOrSuite && frameRating === 'label_illegible' });
  items.push({ section: 'Rating', id: 'rating_frame', text: 'Rating: Frame is underrated for the door assembly type.', show: isNotSmokePartOrSuite && (frameIsUnderrated || frameRating === 'label_illegible') });
  items.push({ section: 'Rating', id: 'rating_cont_hinge', text: 'Rating: Continuous hinge is underrated for the door assembly type.', show: isNotSmokePartOrSuite && hw.hw_continuous_hinge });
  items.push({ section: 'Rating', id: 'rating_panic', text: 'Rating: Panic device is underrated for the door assembly type.', show: isNotSmokePartOrSuite && hw.hw_panic_device });
  items.push({ section: 'Rating', id: 'rating_plate', text: 'Rating: Protective plate(s) underrated for the door assembly type and extending above 16" from the bottom of the door.', show: isNotSmokePartOrSuite && hw.hw_protective_plate });
  const visionPanelHint = (isSmoke && isDualEgress && isCrossCorridor && hw.hw_vision_panel)
    ? 'Reminder: Vision panels in cross-corridor smoke barrier dual egress doors must be rated for at least 20 min.'
    : undefined;
  items.push({
    section: 'Rating',
    id: 'rating_vision',
    text: 'Rating: Vision panel is underrated for the assembly type.',
    show: (isNotSmokePartOrSuite || isSmoke) && hw.hw_vision_panel,
    hint: visionPanelHint,
  });


  // GAPS
  items.push({ section: 'Gaps', id: 'gap_astragal', text: 'Gap: Astragal is not intended for gap mitigation.', show: notSingleDoor && isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Gaps', id: 'gap_sweep', text: 'Gap: Sweep is not intended for gap mitigation.', show: hw.hw_sweep && !isSmokePart && !isSuite && !(isSmoke && isCrossCorridor && isDualEgress), branch: 'x1' });
  items.push({ section: 'Gaps', id: 'gap_bottom_3_4', text: 'Gap: Bottom clearance is in excess of 3/4".', show: atype !== 'suite_perimeter', hint: 'Standard: 3/4" max' });
  items.push({ section: 'Gaps', id: 'gap_bottom_1', text: 'Gap: Bottom clearance is in excess of 1".', show: isSuite, hint: 'Suite Perimeter standard: 1" max' });
  items.push({ section: 'Gaps', id: 'gap_face', text: 'Gap: Face gap is excessive.', show: true, branch: 'x2' });
  items.push({ section: 'Gaps', id: 'gap_fire_pin', text: 'Gap: Face gap renders fire pin ineffective.', show: notSingleDoor && locksetOrPanic && (isFire || isSmoke), branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Gaps', id: 'gap_hinge', text: 'Gap: Hinge edge gap is in excess of 1/8 ± 1/16".', show: true, hint: `Applied gap standard — ${gapHint}`, branch: isSuite ? 'x3' : null });
  items.push({ section: 'Gaps', id: 'gap_latch', text: 'Gap: Latch edge gap is in excess of 1/8 ± 1/16".', show: true, hint: `Applied gap standard — ${gapHint}`, branch: isSuite ? 'x3' : null });
  items.push({ section: 'Gaps', id: 'gap_top', text: 'Gap: Top edge gap is in excess of 1/8 ± 1/16".', show: true, hint: `Applied gap standard — ${gapHint}`, branch: isSuite ? 'x3' : null });
  items.push({ section: 'Gaps', id: 'gap_meeting', text: 'Gap: Meeting edge gap is in excess of 1/8 ± 1/16".', show: notSingleDoor, hint: 'Reminder: 1/8" for wood doors, 3/16" for metal doors.' });

  // SELF-CLOSING
  items.push({ section: 'Self-Closing', id: 'sc_closer_missing', text: 'Self-Closing: Closer is not provided.', show: !closerOrAuto && atype !== 'suite_perimeter' && !x14Compliant, branch: isInactive ? 'x14' : null, autoFlag: !closerOrAuto && atype !== 'suite_perimeter' });
  items.push({ section: 'Self-Closing', id: 'sc_arm_disconnected', text: 'Self-Closing: Closer arm has been disconnected or removed.', show: closerOrAuto });
  items.push({ section: 'Self-Closing', id: 'sc_slamming', text: 'Self-Closing: Closer is failing and door is slamming shut.', show: hw.hw_closer });
  items.push({ section: 'Self-Closing', id: 'sc_maladjusted', text: 'Self-Closing: Closer is maladjusted keeping door from closing and latching.', show: closerOrAuto });
  items.push({ section: 'Self-Closing', id: 'sc_coordinator_missing', text: 'Self-Closing: Coordinator is not provided.', show: notSingleDoor || hw.hw_overlapping_astragal || hw.hw_coordinator });
  items.push({ section: 'Self-Closing', id: 'sc_coordinator_failing', text: 'Self-Closing: Coordinator is failing to coordinate doors properly.', show: notSingleDoor || hw.hw_overlapping_astragal || hw.hw_coordinator });
  items.push({ section: 'Self-Closing', id: 'sc_rub_adjacent', text: 'Self-Closing: Door is rubbing against the adjacent leaf.', show: closerOrAuto && notSingleDoor });
  items.push({ section: 'Self-Closing', id: 'sc_rub_floor', text: 'Self-Closing: Door is rubbing against the floor.', show: closerOrAuto });
  items.push({ section: 'Self-Closing', id: 'sc_rub_frame', text: 'Self-Closing: Door is rubbing against the frame.', show: closerOrAuto });
  items.push({ section: 'Self-Closing', id: 'sc_air_pressure', text: 'Self-Closing: Excessive air pressure is preventing door from closing.', show: closerOrAuto });
  items.push({ section: 'Self-Closing', id: 'sc_hold_open', text: 'Self-Closing: Hold-open device or arm is preventing door from closing.', show: hw.hw_closer });
  items.push({ section: 'Self-Closing', id: 'sc_sweep_dragging', text: 'Self-Closing: Sweep is dragging the floor and keeping the door from closing.', show: closerOrAuto && hw.hw_sweep });

  // POSITIVE LATCHING
  const hasAnyLatchHw = locksetOrPanic || hw.hw_flush_bolts_auto || hw.hw_flush_bolts_manual;
  items.push({ section: 'Positive Latching', id: 'hw_latch_missing', text: 'Positive Latching: Latching hardware is not provided.', show: !hasAnyLatchHw, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Positive Latching', id: 'pl_latch_sticks', text: 'Positive Latching: Latch bolt sticks upon retraction.', show: locksetOrPanic });
  items.push({ section: 'Positive Latching', id: 'pl_latch_fails', text: 'Positive Latching: Latch fails to engage strike.', show: locksetOrPanic });
  items.push({ section: 'Positive Latching', id: 'pl_defeated', text: 'Positive Latching: Latching hardware has been defeated.', show: locksetOrPanic });
  items.push({ section: 'Positive Latching', id: 'pl_hw_damaged', text: 'Positive Latching: Latching hardware is missing or damaged.', show: locksetOrPanic });
  items.push({ section: 'Positive Latching', id: 'pl_electric_strike', text: 'Positive Latching: Electric strike fails to remain rigid to maintain latch.', show: hw.hw_electric_strike });
  items.push({ section: 'Positive Latching', id: 'pl_mechanical_hw', text: 'Positive Latching: Mechanical hardware present where electrified is needed.', show: locksetOrPanic && hw.hw_automatic_operator });
  const hasBottomLatchHw = hw.hw_panic_device || hw.hw_flush_bolts_auto || hw.hw_flush_bolts_manual;
  items.push({ section: 'Positive Latching', id: 'pl_bottom_fails', text: 'Positive Latching: Bottom latching point fails to engage floor strike.', show: notSingleDoor && hasBottomLatchHw });
  items.push({ section: 'Positive Latching', id: 'pl_floor_strike_missing', text: 'Positive Latching: Floor strike is not provided for bottom latching point.', show: notSingleDoor && hasBottomLatchHw });
  items.push({ section: 'Positive Latching', id: 'pl_fire_pin', text: 'Positive Latching: Fire pin missing in absence of bottom latching point.', show: notSingleDoor && locksetOrPanic && isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Positive Latching', id: 'pl_flush_bolts_manual', text: 'Positive Latching: Manual flush bolt(s) present where automatic are needed.', show: hw.hw_flush_bolts_manual && isInactive, branch: 'x13' });

  // PHYSICAL INTEGRITY
  items.push({ section: 'Physical Integrity', id: 'pi_hinge_filler', text: 'Physical Integrity: Hinge filler plate(s) missing from the door and/or frame.', show: true, branch: (isSmokePart || isSuite || isSmokeBarrierNonRated) ? 'x8' : isSmoke ? 'x4' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_hinge_missing', text: 'Physical Integrity: Hinge is missing or damaged.', show: isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_screws', text: 'Physical Integrity: Screw(s) missing or broken.', show: isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_frame', text: 'Physical Integrity: Frame is damaged or unsecured.', show: true });
  items.push({ section: 'Physical Integrity', id: 'pi_door_damaged', text: 'Physical Integrity: Door is severely damaged.', show: true });
  items.push({ section: 'Physical Integrity', id: 'pi_hydraulic', text: 'Physical Integrity: Excessive hydraulic fluid present on door face.', show: hw.hw_closer });
  items.push({ section: 'Physical Integrity', id: 'pi_holes', text: 'Physical Integrity: Fastener hole(s) present in door and/or frame.', show: true, branch: 'x6' });
  items.push({ section: 'Physical Integrity', id: 'pi_prep', text: 'Physical Integrity: Prep exposed in door and/or frame.', show: true, branch: 'x6' });
  items.push({ section: 'Physical Integrity', id: 'pi_dissimilar', text: 'Physical Integrity: Hole(s) in door filled with material dissimilar to that of the door and frame.', show: isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_laminate_hinge', text: 'Physical Integrity: Laminate is missing or damaged at hinge edge.', show: true, branch: (isSmokePart || isSuite || isSmokeBarrierNonRated) ? 'x8' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_laminate_latch', text: 'Physical Integrity: Laminate is missing or damaged latch edge.', show: true, branch: (isSmokePart || isSuite || isSmokeBarrierNonRated) ? 'x8' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_laminate_face', text: 'Physical Integrity: Laminate is missing or damaged on door face.', show: true, branch: (isSmokePart || isSuite || isSmokeBarrierNonRated) ? 'x8' : null });
  items.push({ section: 'Physical Integrity', id: 'pi_latching_hw', text: 'Physical Integrity: Latching hardware is missing or damaged.', show: hw.hw_lockset_cylindrical || hw.hw_lockset_mortise || hw.hw_panic_device || hw.hw_delayed_egress });
  items.push({ section: 'Physical Integrity', id: 'pi_astragal', text: 'Physical Integrity: Astragal is damaged.', show: notSingleDoor });
  items.push({ section: 'Physical Integrity', id: 'pi_sweep', text: 'Physical Integrity: Sweep is damaged.', show: hw.hw_sweep });
  items.push({ section: 'Physical Integrity', id: 'pi_gasketing', text: 'Physical Integrity: Gasketing is missing or damaged.', show: true, branch: 'x7' });
  items.push({ section: 'Physical Integrity', id: 'pi_panic_endcap', text: 'Physical Integrity: Panic device end cap is missing or damaged.', show: isNotSmokePartOrSuite && hw.hw_panic_device, branch: isSmoke ? 'x4' : null });

  items.push({ section: 'Physical Integrity', id: 'vp_missing', text: 'Vision Panel: Cross-corridor smoke barrier door not equipped with vision panel.', show: isCrossCorridor && !hw.hw_vision_panel, autoFlag: true });

  // SIGNAGE
  items.push({ section: 'Signage', id: 'sign_delayed_egress', text: 'Signage: Delayed egress signage is not provided.', show: hw.hw_delayed_egress });
  items.push({ section: 'Signage', id: 'sign_coat_rack', text: 'Signage: Mechanically fastened coat rack.', show: hw.hw_signage && isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Signage', id: 'sign_mech_fastened', text: 'Signage: Signage mechanically fastened to door.', show: hw.hw_signage && isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Signage', id: 'sign_5pct', text: 'Signage: Signage on door exceeds 5% of door face.', show: hw.hw_signage && isNotSmokePartOrSuite, branch: isSmoke ? 'x4' : null });
  items.push({ section: 'Signage', id: 'sign_vision', text: 'Signage: Signage adhered to vision panel.', show: hw.hw_signage && isNotSmokePartOrSuite && hw.hw_vision_panel });

  // LOCKING
  items.push({ section: 'Locking', id: 'lock_panic_actuating', text: 'Locking: Actuating portion of panic device is less than 1/2 of door width.', show: hw.hw_panic_device });
  items.push({ section: 'Locking', id: 'lock_overlap_independent', text: 'Locking: Overlapping astragal prevents independent operation of door leaves.', show: hw.hw_overlapping_astragal });
  items.push({ section: 'Locking', id: 'lock_deadbolt', text: 'Locking: Deadbolt present where occupant load is greater than 3.', show: hw.hw_deadbolt, branch: 'x11' });
  items.push({ section: 'Locking', id: 'lock_delayed_failure', text: 'Locking: Delayed egress device failure.', show: hw.hw_delayed_egress });
  items.push({ section: 'Locking', id: 'lock_delayed_sprinkler', text: 'Locking: Delayed egress device present in other than fully sprinklered building.', show: hw.hw_delayed_egress && !sprinklered });
  items.push({ section: 'Locking', id: 'lock_motion_fails', text: 'Locking: Motion sensor fails to release mag-lock.', show: hw.hw_motion_sensor });

  items.push({ section: 'Locking', id: 'lock_locked_egress', text: 'Locking: Door is mechanically locked in the means of egress.', show: true });

  items.push({ section: 'Locking', id: 'lock_pte_fails', text: 'Locking: PUSH TO EXIT button fails to release mag-lock for at least 30 seconds.', show: hw.hw_push_to_exit });
  items.push({ section: 'Locking', id: 'lock_pte_distance', text: "Locking: PUSH TO EXIT button not within 5' of opening.", show: hw.hw_push_to_exit });
  items.push({ section: 'Locking', id: 'lock_pte_missing', text: 'Locking: PUSH TO EXIT button/signage not provided.', show: hw.hw_magnetic_lock && !hw.hw_push_to_exit });

  items.push({
    section: 'Locking',
    id: 'lock_illegitimate_arrangement',
    text: 'Locking: Illegitimate locking arrangement.',
    show: hw.hw_magnetic_lock && (!hw.hw_motion_sensor || !hw.hw_push_to_exit),
    autoFlag: false,
  });

  const filtered = items.filter(i => i.show !== false);
  filtered.sort((a, b) => {
    if (a.section !== b.section) return 0; // preserve section order
    const textA = a.text.replace(/^[^:]+:\s*/, '').toLowerCase();
    const textB = b.text.replace(/^[^:]+:\s*/, '').toLowerCase();
    return textA.localeCompare(textB);
  });
  return filtered;
}

function getBranchResult(
  branchId: string,
  answers: BranchAnswers,
  atype: string,
  swing: string,
  sprinklered: boolean,
  gapStd: string,
): DeficiencyState | null {
  const compliant: DeficiencyState = { status: 'compliant', text: '', category: '', note: '', branchAnswers: answers };
  const deficient: DeficiencyState = { status: 'deficient', text: '', category: '', note: '', branchAnswers: answers };

  if (branchId === 'x11') {
    // Q1: Is this door in the means of egress?
    if (answers['x11_q1'] === undefined) return null;
    if (answers['x11_q1'] === 'no') return compliant;
    // Q2: What is the use of the space this door serves?
    if (answers['x11_q2'] === undefined) return null;
    if (answers['x11_q2'] === 'ambulatory' || answers['x11_q2'] === 'business') {
      // Q3a: Is sq footage / 100 <= 3?
      if (answers['x11_q3'] === undefined) return null;
      if (answers['x11_q3'] === 'yes') return compliant;
      return deficient;
    }
    if (answers['x11_q2'] === 'healthcare') {
      // Q3b: Is this area inpatient care or sleeping department?
      if (answers['x11_q3b'] === undefined) return null;
      if (answers['x11_q3b'] === 'inpatient') {
        if (answers['x11_q4'] === undefined) return null;
        if (answers['x11_q4'] === 'yes') return compliant;
        return deficient;
      }
      if (answers['x11_q3b'] === 'sleeping') {
        if (answers['x11_q5'] === undefined) return null;
        if (answers['x11_q5'] === 'yes') return compliant;
        return deficient;
      }
    }
    return null;
  }

  if (branchId === 'x12') {
    // Q1: Is the door in the means of egress?
    if (answers['x12_q1'] === undefined) return null;
    if (answers['x12_q1'] === 'no') return compliant;
    // Q2: What is the use of the space?
    if (answers['x12_q2'] === undefined) return null;
    if (answers['x12_q2'] === 'ambulatory' || answers['x12_q2'] === 'business') return deficient;
    if (answers['x12_q2'] === 'healthcare') {
      // Q3: Does this door serve Psychiatric, Alzheimer, Dementia, Pediatrics, OB, or ED?
      if (answers['x12_q3'] === undefined) return null;
      if (answers['x12_q3'] === 'yes') {
        // Q4: Are all three criteria met?
        if (answers['x12_q4'] === undefined) return null;
        if (answers['x12_q4'] === 'yes') {
          // Q5: For Peds/OB/ED — smoke detection or remote unlock from attended station?
          if (answers['x12_q5'] === undefined) return null;
          if (answers['x12_q5'] === 'no') return deficient;
          // Q6: Is building fully sprinklered? Skip if project setting is fully sprinklered
          if (!sprinklered) {
            if (answers['x12_q6'] === undefined) return null;
            if (answers['x12_q6'] === 'no') return deficient;
          }
          // Q7: Are locks electrical and fail-safe (release on power loss)?
          if (answers['x12_q7'] === undefined) return null;
          if (answers['x12_q7'] === 'yes') return compliant;
          return deficient;
        }
        return deficient;
      }
      if (answers['x12_q3'] === 'no') return deficient;
    }
    return null;
  }

  if (branchId === 'x13') {
    // Q1: Does the inactive leaf serve a room that is typically not occupied?
    if (answers['x13_q1'] === undefined) return null;
    if (answers['x13_q1'] === 'yes') return compliant;
    return deficient;
  }

  if (branchId === 'x14') {
    // Q1: Is this inactive leaf normally closed and infrequently used to permit large equipment through?
    if (answers['x14_q1'] === undefined) return null;
    if (answers['x14_q1'] === 'yes') return compliant;
    return deficient;
  }

  if (branchId === 'x2') {
    if (answers['x2_q1'] === undefined) return null;
    if (answers['x2_q1'] === 'no') return compliant;
    // If building is fully sprinklered, skip the sprinkler question and treat as sprinklered
    const isFullySprinklered = sprinklered || answers['x2_q2'] === 'yes';
    if (!sprinklered) {
      if (answers['x2_q2'] === undefined) return null;
    }
    if (isFullySprinklered) {
      if (answers['x2_q3'] === undefined) return null;
      if (answers['x2_q3'] === 'yes') return deficient;
      return compliant;
    } else {
      if (answers['x2_q3b'] === undefined) return null;
      if (answers['x2_q3b'] === 'yes') return deficient;
      return compliant;
    }
  }

  if (branchId === 'x1') {
    // Q1: Does the bottom clearance measure excessive on the PUSH side of the door?
    if (answers['x1_q1'] === undefined) return null;
    if (answers['x1_q1'] === 'yes') return deficient;
    // Q2: Does the door serve a room you would expect to have a positive/negative pressure,
    // excessive sound, or outside air consideration?
    if (answers['x1_q2'] === undefined) return null;
    if (answers['x1_q2'] === 'yes') return compliant;
    return deficient;
  }

  if (branchId === 'x4') {
    // Swing type is known — only dual egress can be compliant
    if (swing !== 'dbl_dual_egress') return deficient;
    // Q1: Does this door reside in Health Care Occupancy?
    if (answers['x4_q1'] === undefined) return null;
    if (answers['x4_q1'] === 'yes') return compliant;
    return deficient;
  }

  if (branchId === 'x3') {
    // Q1: Is the gap > 5/8"? Can you see daylight from the other side?
    if (answers['x3_q1'] === undefined) return null;
    if (answers['x3_q1'] === 'yes') return deficient;
    return compliant;
  }

  if (branchId === 'x5') {
    // Claude identifies assembly type automatically
    // Smoke Barrier: is the door part of a dual egress assembly?
    if (atype === 'smoke_barrier') {
      if (answers['x5_q1'] === undefined) return null;
      if (answers['x5_q1'] === 'no') return deficient;
      // Dual egress — does damaged astragal reveal excessive gap at meeting edge?
      if (answers['x5_q2'] === undefined) return null;
      if (answers['x5_q2'] === 'yes') return deficient;
      return compliant;
    }
    // Smoke Partition or Suite Perimeter
    // Does damaged astragal reveal excessive gap at meeting edge?
    if (answers['x5_q1'] === undefined) return null;
    if (answers['x5_q1'] === 'yes') return deficient;
    return compliant;
  }

  if (branchId === 'x6') {
    // For fire assemblies, always deficient — no questions needed
    if (atype !== 'smoke_partition' && atype !== 'suite_perimeter') return deficient;
    if (answers['x6_q1'] === undefined) return null;
    if (answers['x6_q1'] === 'yes') return deficient;
    return { status: 'compliant', text: '', category: '', note: 'Recommend filling present hole(s) with appropriately rated material.', branchAnswers: answers };
  }

  if (branchId === 'x7') {
    if (answers['x7_q1'] === undefined) return null;
    if (answers['x7_q1'] === 'yes') return deficient;
    // Always ask gap question for smoke partition and suite perimeter
    if (atype === 'smoke_partition' || atype === 'suite_perimeter') {
      if (answers['x7_q2'] === undefined) return null;
      if (answers['x7_q2'] === 'yes') return deficient;
    }
    return { status: 'compliant', text: '', category: '', note: 'Recommend replacing the damaged portion of gasketing or removing it entirely from the perimeter of the door.', branchAnswers: answers };
  }

  if (branchId === 'x8') {
    // Does the door reside in a patient-care area where there is a concern for infection control?
    if (answers['x8_q1'] === undefined) return null;
    if (answers['x8_q1'] === 'yes') return deficient;
    return { status: 'compliant', text: '', category: '', note: 'Recommend covering laminate damage with a protective plate(s).', branchAnswers: answers };
  }

  if (branchId === 'x9') {
    // Claude identifies assembly type automatically
    if (atype === 'smoke_barrier') {
      // Is the door part of a dual egress assembly?
      if (answers['x9_q1'] === undefined) return null;
      if (answers['x9_q1'] === 'no') return deficient;
      // Does damaged sweep reveal excessive bottom clearance?
      if (answers['x9_q2'] === undefined) return null;
      if (answers['x9_q2'] === 'yes') return deficient;
      // Does bottom clearance measure excessive on opposing side?
      if (answers['x9_q3'] === undefined) return null;
      if (answers['x9_q3'] === 'yes') return deficient;
      // Does door serve room with pressure/sound/outside air consideration?
      if (answers['x9_q4'] === undefined) return null;
      if (answers['x9_q4'] === 'yes') return compliant;
      return deficient;
    }
    // Smoke Partition or Suite Perimeter
    // Does damaged sweep reveal excessive bottom clearance?
    if (answers['x9_q1'] === undefined) return null;
    if (answers['x9_q1'] === 'yes') return deficient;
    // Does bottom clearance measure excessive on opposing side?
    if (answers['x9_q2'] === undefined) return null;
    if (answers['x9_q2'] === 'yes') return deficient;
    // Does door serve room with pressure/sound/outside air consideration?
    if (answers['x9_q3'] === undefined) return null;
    if (answers['x9_q3'] === 'yes') return compliant;
    return deficient;
  }

  if (branchId === 'x10') {
    // Is there a bottom vertical rod or flush bolt present?
    if (answers['x10_q1'] === undefined) return null;
    if (answers['x10_q1'] === 'yes') return deficient;
    return compliant;
  }

  return null;
}

function getBranchTerminalResult(branch: string, answers: BranchAnswers, atype: string, swing: string = 'single', sprinklered: boolean = true): boolean {
  const result = getBranchResult(branch, answers, atype, swing, sprinklered, 'codify');
  return result !== null;
}

function BranchUI({ item, atype, swing, sprinklered, gapStd, branchAnswers, onAnswer }: any) {
  const branchId = item.branch as string;

  const q = (id: string, text: string, options: { value: string; label: string }[]) => {
    const answered = branchAnswers[id];
    return (
      <div key={id} className="space-y-2">
        <p className="text-sm text-foreground">{text}</p>
        <div className="flex gap-2 flex-wrap">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onAnswer(id, opt.value)}
              className={`px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide border transition-all ${
                answered === opt.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const yesNo = (id: string, text: string) =>
    q(id, text, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]);

  const questions: React.ReactNode[] = [];

  if (branchId === 'x11') {
    questions.push(yesNo('x11_q1', 'Is this door in the means of egress?'));
    if (branchAnswers['x11_q1'] === 'yes') {
      questions.push(q('x11_q2', 'What is the use of the space this door serves?', [
        { value: 'ambulatory', label: 'Ambulatory' },
        { value: 'business', label: 'Business' },
        { value: 'healthcare', label: 'Health Care' },
      ]));
    }
    if (branchAnswers['x11_q1'] === 'yes' && (branchAnswers['x11_q2'] === 'ambulatory' || branchAnswers['x11_q2'] === 'business')) {
      questions.push(yesNo('x11_q3', 'Is the square footage of this room divided by 100 equal to or less than 3?'));
    }
    if (branchAnswers['x11_q1'] === 'yes' && branchAnswers['x11_q2'] === 'healthcare') {
      questions.push(q('x11_q3b', 'Is this area inpatient care or a sleeping department?', [
        { value: 'inpatient', label: 'Inpatient Care' },
        { value: 'sleeping', label: 'Sleeping Department' },
      ]));
    }
    if (branchAnswers['x11_q3b'] === 'inpatient') {
      questions.push(yesNo('x11_q4', 'Is the square footage of this room divided by 240 less than 3?'));
    }
    if (branchAnswers['x11_q3b'] === 'sleeping') {
      questions.push(yesNo('x11_q5', 'Is the square footage of this room divided by 120 less than 3?'));
    }
  }

  if (branchId === 'x12') {
    questions.push(yesNo('x12_q1', 'Is the door in the means of egress?'));
    if (branchAnswers['x12_q1'] === 'yes') {
      questions.push(q('x12_q2', 'What is the use of the space this door serves?', [
        { value: 'ambulatory', label: 'Ambulatory' },
        { value: 'business', label: 'Business' },
        { value: 'healthcare', label: 'Health Care' },
      ]));
    }
    if (branchAnswers['x12_q1'] === 'yes' && branchAnswers['x12_q2'] === 'healthcare') {
      questions.push(yesNo('x12_q3', 'Does this door serve any of the following areas: Psychiatric Unit, Alzheimer Unit, Dementia Unit, Pediatrics Unit, Maternity (OB) Unit, or Emergency Department?'));
    }
    if (branchAnswers['x12_q3'] === 'yes') {
      questions.push(yesNo('x12_q4', 'Are all three of these criteria met?\n1. Provisions are made for the rapid removal of occupants by means of one of the following: (a) Remote control of locks, (b) Keying of all locks to keys carried by staff at all times, (c) Other reliable means available to staff at all times (e.g. badges).\n2. Only one locking device is permitted on each door.'));
    }
    if (branchAnswers['x12_q3'] === 'yes' && branchAnswers['x12_q4'] === 'yes') {
      questions.push(yesNo('x12_q5', 'For Pediatrics Units, OB Units, or Emergency Departments: is the space provided with complete smoke detection, or can the locked doors be remotely unlocked from a constantly attended lockation within the locked space?'));
    }
    if (branchAnswers['x12_q5'] === 'yes' && !sprinklered) {
      questions.push(yesNo('x12_q6', 'Is the building fully sprinklered, or at the very least, the extents of the secured compartment and the compartments each occupant of the secured compartment must travel through to egress the building?'));
    }
    if (branchAnswers['x12_q5'] === 'yes' && (sprinklered || branchAnswers['x12_q6'] === 'yes')) {
      questions.push(yesNo('x12_q7', 'Are the locks electrical locks that fail safely so as to release upon loss of power to the device?'));
    }

  }

  if (branchId === 'x13') {
    questions.push(yesNo('x13_q1', 'Does the inactive leaf serve a room that is typically not occupied?'));
  }

  if (branchId === 'x14') {
    questions.push(yesNo('x14_q1', 'Is this inactive leaf normally in the closed position, and infrequently used to permit large equipment through the door?'));
  }

  if (branchId === 'x4') {
    if (swing !== 'dbl_dual_egress') {
      // Non-dual-egress swings are immediately deficient — no questions needed
      // Return empty; getBranchResult will resolve this as deficient on next render
    } else {
      questions.push(yesNo('x4_q1', 'Does this door reside in a Health Care Occupancy?'));
    }
  }

  if (branchId === 'x3') {
    questions.push(yesNo('x3_q1', 'Is the gap > 5/8", or can you see daylight from the other side?'));
  }

  if (branchId === 'x5') {
    if (atype === 'smoke_barrier') {
      questions.push(yesNo('x5_q1', 'Is the door part of a dual egress assembly?'));
      if (branchAnswers['x5_q1'] === 'yes') {
        questions.push(yesNo('x5_q2', 'Does the damaged astragal reveal an excessive gap at the meeting edge?'));
      }
    } else {
      questions.push(yesNo('x5_q1', 'Does the damaged astragal reveal an excessive gap at the meeting edge?'));
    }
  }

  if (branchId === 'x6') {
    if (atype !== 'smoke_partition' && atype !== 'suite_perimeter') {
      // Fire assemblies are immediately deficient — no questions
    } else {
      questions.push(yesNo('x6_q1', 'Are the present hole(s) through holes that might affect the door\'s ability to resist the passage of smoke?'));
    }
  }

  if (branchId === 'x7') {
    questions.push(q('x7_q1', 'Does the door meet one of the following descriptions?\n1. Door serves an area of refuge.\n2. Door serves a vestibule to a smokeproof enclosure.\n3. Door resides in a horizontal exit.\n4. Door resides in an elevator lobby separation that serves as an occupant evacuation system.', [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]));
    if (branchAnswers['x7_q1'] === 'yes') {
      // Terminal — deficient, no further questions
    }
    if (branchAnswers['x7_q1'] === 'no' && (atype === 'smoke_partition' || atype === 'suite_perimeter')) {
      questions.push(yesNo('x7_q2', 'Does the edge where the gasketing is damaged have a gap in excess of the applied standard?'));
    }
  }

  if (branchId === 'x8') {
    questions.push(yesNo('x8_q1', 'Does the door reside in a patient-care area where there is a concern for infection control?'));
  }

  if (branchId === 'x9') {
    if (atype === 'smoke_barrier') {
      questions.push(yesNo('x9_q1', 'Is the door part of a dual egress assembly?'));
      if (branchAnswers['x9_q1'] === 'yes') {
        questions.push(yesNo('x9_q2', 'Does the damaged sweep reveal an excessive bottom clearance?'));
      }
      if (branchAnswers['x9_q2'] === 'no') {
        questions.push(yesNo('x9_q3', 'Does the bottom clearance measure excessive on the opposing side of the door?'));
      }
      if (branchAnswers['x9_q3'] === 'no') {
        questions.push(yesNo('x9_q4', 'Does the door serve a room you would expect to have a positive/negative pressure, excessive sound, or outside air consideration?'));
      }
    } else {
      questions.push(yesNo('x9_q1', 'Does the damaged sweep reveal an excessive bottom clearance?'));
      if (branchAnswers['x9_q1'] === 'no') {
        questions.push(yesNo('x9_q2', 'Does the bottom clearance measure excessive on the opposing side of the door?'));
      }
      if (branchAnswers['x9_q2'] === 'no') {
        questions.push(yesNo('x9_q3', 'Does the door serve a room you would expect to have a positive/negative pressure, excessive sound, or outside air consideration?'));
      }
    }
  }

  if (branchId === 'x10') {
    questions.push(yesNo('x10_q1', 'Is there a bottom vertical rod or flush bolt present?'));
  }

  if (branchId === 'x1') {
    questions.push(yesNo('x1_q1', 'Does the bottom clearance measure excessive on the PUSH side of the door?'));
    if (branchAnswers['x1_q1'] === 'no') {
      questions.push(yesNo('x1_q2', 'Does the door serve a room you would expect to have a positive/negative pressure, excessive sound, or outside air consideration?'));
    }
  }

  if (branchId === 'x2') {
    questions.push(yesNo('x2_q1', 'Is the door on the corridor?'));
    if (branchAnswers['x2_q1'] === 'yes') {
      if (!sprinklered) {
        questions.push(yesNo('x2_q2', 'Is the smoke compartment fully sprinklered?'));
      }
      const effectivelySprinklered = sprinklered || branchAnswers['x2_q2'] === 'yes';
      if (effectivelySprinklered) {
        questions.push(yesNo('x2_q3', 'Confirm: is the face gap being judged to be ≥ 1/2"?'));
      } else if (branchAnswers['x2_q2'] === 'no') {
        questions.push(yesNo('x2_q3b', 'Confirm: is the face gap being judged to be ≥ 1/4"?'));
      }
    }
  }

  if (questions.length === 0) return null;

  return <div className="space-y-4">{questions}</div>;
}

// ─── DEFICIENCY ITEM COMPONENT ────────────────────────────────────────────────

interface DeficiencyItemProps {
  item: ChecklistItem;
  defState: DeficiencyState | undefined;
  atype: string;
  swing: string;
  sprinklered: boolean;
  gapStd: string;
  onToggle: (item: ChecklistItem) => void;
  onNoteChange: (id: string, note: string) => void;
  onBranchAnswer: (itemId: string, qid: string, value: string, branchId?: string) => void;
}

function DeficiencyItem({ item, defState, atype, swing, sprinklered, gapStd, onToggle, onNoteChange, onBranchAnswer }: DeficiencyItemProps) {
  const isFlagged = defState?.status === 'deficient';
  const isAdvisory = defState?.status === 'advisory';
  const isExpanded = isFlagged || isAdvisory;

  return (
    <div className={`rounded-sm border transition-all ${
      isFlagged ? 'border-red-500/60 bg-red-500/5' :
      isAdvisory ? 'border-yellow-500/40 bg-yellow-500/5' :
      'border-border'
    }`}>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isFlagged ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {item.text}
          </p>
          {item.hint && (
            <p className="text-xs text-blue-400 mt-1 font-mono">{item.hint}</p>
          )}
        </div>
        <button
          onClick={() => onToggle(item)}
          className={`shrink-0 px-3 py-1.5 rounded-sm text-xs font-semibold tracking-wide uppercase transition-all ${
            isFlagged
              ? 'bg-red-500 text-white border border-red-500'
              : 'border border-border text-muted-foreground hover:border-red-400 hover:text-red-400'
          }`}
        >
          {isFlagged ? '✓ Deficient' : isAdvisory ? 'Evaluating' : 'Flag'}
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-3 space-y-3">
          {item.branch && defState && (
            <BranchUI
              item={item}
              atype={atype}
              swing={swing}
              sprinklered={sprinklered}
              gapStd={gapStd}
              branchAnswers={defState.branchAnswers || {}}
              onAnswer={(qid: string, value: string) => onBranchAnswer(item.id, qid, value, item.branch ?? undefined)}
            />
          )}
          <div>
            <p className="text-xs font-mono text-red-400 uppercase tracking-wider mb-1">Note (optional)</p>
            <textarea
              value={defState?.note || ''}
              onChange={e => onNoteChange(item.id, e.target.value)}
              placeholder="Describe location, extent, or condition..."
              className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-sm resize-none min-h-16 text-foreground"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function InspectionWizard({ selectedDoor, onClear }: InspectionWizardProps) {
  // Phase: 'setup' | 'inspect' | 'complete'
  const [phase, setPhase] = useState<'setup' | 'inspect' | 'complete'>('setup');

  // Setup form state
  const [assetId, setAssetId] = useState(selectedDoor?.assetId || '');
  const [assetIdError, setAssetIdError] = useState('');
  const [iconNo, setIconNo] = useState(selectedDoor?.iconNo || '');
  const [floorNo, setFloorNo] = useState(selectedDoor?.floor || '');
  const [gridBlock, setGridBlock] = useState(selectedDoor?.grid || '');
  const [assemblyType, setAssemblyType] = useState(selectedDoor?.assemblyType || '');
  const [doorRating, setDoorRating] = useState(selectedDoor?.doorRating || '');
  const [doorSwingType, setDoorSwingType] = useState('single');
  const [hwState, setHwState] = useState<HwState>({ ...DEFAULT_HW_STATE });

  const [additionalComments, setAdditionalComments] = useState('');
  const [showCorridorPrompt, setShowCorridorPrompt] = useState(false);
  const [isCorridorDoor, setIsCorridorDoor] = useState<boolean | null>(null);

  const [occTableExpanded, setOccTableExpanded] = useState(false);
  const [blockingPromptsDone, setBlockingPromptsDone] = useState<Record<string, boolean>>({});
  const [x14Compliant, setX14Compliant] = useState(false);
  const [visitedSections, setVisitedSections] = useState<Set<number>>(new Set([0]));

  // Setup page navigation
  const [setupPage, setSetupPage] = useState(1);

  // New door identification fields
  const [frameRating, setFrameRating] = useState('180');
  const [isStairDoor, setIsStairDoor] = useState<boolean | null>(null);
  const [isCrossCorridor, setIsCrossCorridor] = useState<boolean | null>(null);
  const [isHealthCareOccupancy, setIsHealthCareOccupancy] = useState<boolean>(true);

  // Project vars
  const [projectVars] = useLocalStorage<ProjectVars>('projectVars', {
    construction: 'existing',
    gapStandard: 'codify',
    sprinklered: true,
  });

  // Inspector
  const [inspectorName] = useLocalStorage('inspectorName', '');

  // Inspection state
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [deficiencies, setDeficiencies] = useState<Record<string, DeficiencyState>>({});
  const [currentDoor, setCurrentDoor] = useState<CurrentDoor | null>(null);

  // Sync selectedDoor prop into form
  useEffect(() => {
    if (selectedDoor) {
      setAssetId(selectedDoor.assetId || '');
      setIconNo(selectedDoor.iconNo || '');
      setFloorNo(selectedDoor.floor || '');
      setGridBlock(selectedDoor.grid || '');
      if (selectedDoor.assemblyType) setAssemblyType(selectedDoor.assemblyType);
      if (selectedDoor.doorRating) setDoorRating(selectedDoor.doorRating);
      setAssetIdError('');
      setSetupPage(1);
    }
  }, [selectedDoor]);



  const toggleHardware = (id: string) => {
    // Flush Bolts (Manual) only applicable to inactive leaf
    if (id === 'hw_flush_bolts_manual' && !hwState[id] && doorSwingType !== 'dbl_inactive') {
      return;
    }

    setHwState(prev => {
      const newState = { ...prev, [id]: !prev[id] };
      // Panic device or delayed egress ON → turn off locksets
      if ((id === 'hw_panic_device' || id === 'hw_delayed_egress') && newState[id]) {
        newState.hw_lockset_cylindrical = false;
        newState.hw_lockset_mortise = false;
      }
      // Lockset turned ON → turn off panic device and delayed egress
      if ((id === 'hw_lockset_cylindrical' || id === 'hw_lockset_mortise') && newState[id]) {
        newState.hw_panic_device = false;
        newState.hw_delayed_egress = false;
      }
      // Closer ON → turn off Automatic Operator
      if (id === 'hw_closer' && newState[id]) {
        newState.hw_automatic_operator = false;
      }
      // Automatic Operator ON → turn off Closer
      if (id === 'hw_automatic_operator' && newState[id]) {
        newState.hw_closer = false;
      }
      // Lockset (Cylindrical) ON → turn off Lockset (Mortise)
      if (id === 'hw_lockset_cylindrical' && newState[id]) {
        newState.hw_lockset_mortise = false;
      }
      // Lockset (Mortise) ON → turn off Lockset (Cylindrical)
      if (id === 'hw_lockset_mortise' && newState[id]) {
        newState.hw_lockset_cylindrical = false;
      }
      // Flush Bolts (Automatic) ON → turn off Flush Bolts (Manual)
      if (id === 'hw_flush_bolts_auto' && newState[id]) {
        newState.hw_flush_bolts_manual = false;
      }
      // Flush Bolts (Manual) ON → turn off Flush Bolts (Automatic)
      if (id === 'hw_flush_bolts_manual' && newState[id]) {
        newState.hw_flush_bolts_auto = false;
      }
      return newState;
    });
  };

  const validateAssetId = (value: string) => {
    if (!value.trim()) { setAssetIdError(''); return; }
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const duplicate = existing.find(
      (r: any) => r.assetId === value.trim() && r.pinId !== selectedDoor?.pinId
    );
    if (duplicate) {
      setAssetIdError(`Already assigned to Icon No. ${duplicate.iconNo}`);
    } else {
      setAssetIdError('');
    }
  };

  const markInaccessible = () => {
    if (!assetId.trim()) { alert('Asset ID is required.'); return; }
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const duplicate = existing.find(
      (r: any) => r.assetId === assetId.trim() && r.pinId !== selectedDoor?.pinId
    );
    if (duplicate) {
      setAssetIdError(`Already assigned to Icon No. ${duplicate.iconNo}`);
      return;
    }
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      pinId: selectedDoor?.pinId,
      iconNo: iconNo.trim(),
      assetId: assetId.trim(),
      floorNo: floorNo.trim(),
      gridBlock: gridBlock.trim(),
      assemblyType: assemblyType || '—',
      doorRating: doorRating || '—',
      inspectorName: inspectorName || '—',
      projectName: localStorage.getItem('activeProject') || '—',
      completedTime: new Date().toISOString(),
      overallStatus: 'inaccessible',
      postInspectionStatus: 'inaccessible',
      deficiencies: [],
      findings: {},
      additionalComments: '',
      synced: false,
    };
    const records = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    records.push(record);
    localStorage.setItem('doorInspections', JSON.stringify(records));
    if (selectedDoor?.pinId) {
      window.dispatchEvent(new CustomEvent('pinStatusUpdate', {
        detail: { pinId: selectedDoor.pinId, status: 'inaccessible' }
      }));
    }
    setPhase('complete');
    if (onClear) onClear();
  };

  const startInspection = () => {
    if (!assetId.trim()) { alert('Asset ID is required.'); return; }
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const duplicate = existing.find(
      (r: any) => r.assetId === assetId.trim() && r.pinId !== selectedDoor?.pinId
    );
    if (duplicate) {
      setAssetIdError(`Already assigned to Icon No. ${duplicate.iconNo}`);
      return;
    }
    setAssetIdError('');
    if (!assemblyType) { alert('Select an Assembly Type.'); return; }
    if (doorRating === '' && assemblyType !== 'smoke_partition' && assemblyType !== 'suite_perimeter') { alert('Door Rating is required — check the door label.'); return; }
    if (!doorSwingType) { alert('Select a Door Swing Type.'); return; }

    const door: CurrentDoor = {
      inspectorName: inspectorName || '—',
      projectName: localStorage.getItem('activeProject') || '—',
      iconNo: iconNo.trim(),
      assetId: assetId.trim(),
      floorNo: floorNo.trim(),
      gridBlock: gridBlock.trim(),
      assemblyType,
      doorRating,
      frameRating,
      doorSwingType,
      isStairDoor,
      isCrossCorridor,
      isHealthCareOccupancy,
      hwState: { ...hwState },
      projectVars: { ...projectVars },
      startTime: new Date().toISOString(),
    };

    // Auto-flag rating deficiency
    const initDefs: Record<string, DeficiencyState> = {};
    
    // Door label illegible auto-flag
    if (doorRating === 'label_illegible') {
      initDefs['label_door'] = {
        status: 'deficient',
        text: 'Labeling: Door label is illegible.',
        category: 'Rating',
        note: 'Auto-flagged: Door label is illegible — rating cannot be verified.',
        branchAnswers: {},
        autoFlagged: true,
      };
      initDefs['rating_door'] = {
        status: 'deficient',
        text: 'Rating: Door is underrated for the door assembly type.',
        category: 'Rating',
        note: 'Auto-flagged: Door label is illegible — rating cannot be verified.',
        branchAnswers: {},
        autoFlagged: true,
      };
    } else {
      const rating = parseInt(doorRating);
      const minRating = MIN_RATINGS[assemblyType];
      const isDualEgress = doorSwingType === 'dbl_dual_egress';
      let minRequired = minRating;
      if (assemblyType === '1hr_fire' && isStairDoor) minRequired = 60;
      if (assemblyType === 'smoke_barrier' && isDualEgress && isCrossCorridor && isHealthCareOccupancy) minRequired = 0;
      if (minRequired !== null && rating < minRequired) {
        initDefs['rating_door'] = {
          status: 'deficient',
          text: 'Rating: Door is underrated for the door assembly type.',
          category: 'Rating',
          note: `Assembly requires ≥${minRequired} min, door is ${doorRating === '0' ? 'Non-Rated' : doorRating + ' min'}.`,
          branchAnswers: {},
          autoFlagged: true,
        };
      }
    }

    // Frame rating auto-flag logic
    const minRating = MIN_RATINGS[assemblyType];
    const isDualEgress = doorSwingType === 'dbl_dual_egress';
    let minRequired = minRating;
    if (assemblyType === '1hr_fire' && isStairDoor) minRequired = 60;
    if (assemblyType === 'smoke_barrier' && isDualEgress && isCrossCorridor && isHealthCareOccupancy) minRequired = 0;

    // Frame label illegible auto-flag
    if (frameRating === 'label_illegible') {
      initDefs['label_frame'] = {
        status: projectVars.construction === 'existing' ? 'advisory' : 'deficient',
        text: 'Labeling: Frame label is illegible.',
        category: 'Rating',
        note: projectVars.construction === 'existing'
          ? 'Auto-flagged: Frame label exception — existing construction label may be illegible per NFPA 80.'
          : 'Auto-flagged: Frame label is illegible — rating cannot be verified.',
        branchAnswers: {},
        autoFlagged: true,
      };
      initDefs['rating_frame'] = {
        status: 'deficient',
        text: 'Rating: Frame is underrated for the door assembly type.',
        category: 'Rating',
        note: 'Auto-flagged: Frame label is illegible — rating cannot be verified.',
        branchAnswers: {},
        autoFlagged: true,
      };
    } else {
      const frameRatingNum = parseInt(frameRating);
      if (minRequired !== null && minRequired !== 0 && frameRatingNum < minRequired) {
        initDefs['rating_frame'] = {
          status: 'deficient',
          text: 'Rating: Frame is underrated for the door assembly type.',
          category: 'Rating',
          note: `Assembly requires ≥${minRequired} min, frame is ${frameRating === '0' ? 'Non-Rated' : frameRating + ' min'}.`,
          branchAnswers: {},
          autoFlagged: true,
        };
      }
    }

    // Auto-flag corridor door for 1-hour partition at 20 min
    if (assemblyType === '1hr_partition' && doorRating === '20' && isCorridorDoor === true) {
      initDefs['rating_door'] = {
        status: 'deficient',
        text: 'Rating: Door is underrated for the door assembly type.',
        category: 'Rating',
        note: '1-Hour Partition corridor doors require minimum 45 min rating per IBC.',
        branchAnswers: {},
        autoFlagged: true,
      };
    }

    // Auto-flag delayed egress if not sprinklered
    if (hwState.hw_delayed_egress && !projectVars.sprinklered) {
      initDefs['lock_delayed_sprinkler'] = {
        status: 'deficient',
        text: 'Locking: Delayed egress device present in other than fully sprinklered building.',
        category: 'Locking',
        note: 'Auto-flagged: Project Settings indicate building is not fully sprinklered.',
        branchAnswers: {},
        autoFlagged: true,
      };
    }

    // Auto-flag illegitimate locking arrangement
    if (hwState.hw_magnetic_lock && (
      (hwState.hw_motion_sensor && !hwState.hw_push_to_exit) ||
      (!hwState.hw_motion_sensor && hwState.hw_push_to_exit)
    )) {
      const magLockNote = (hwState.hw_motion_sensor && !hwState.hw_push_to_exit)
        ? 'Auto-flagged: Magnetic lock requires both Motion Sensor and PUSH TO EXIT button, and currently, only a motion sensor is present.'
        : (!hwState.hw_motion_sensor && hwState.hw_push_to_exit)
        ? 'Auto-flagged: Magnetic lock requires both Motion Sensor and PUSH TO EXIT button, and currently, only a PUSH TO EXIT button is present.'
        : 'Auto-flagged: Magnetic lock requires both Motion Sensor and PUSH TO EXIT button.';
      initDefs['lock_illegitimate_arrangement'] = {
        status: 'deficient',
        text: 'Locking: Illegitimate locking arrangement.',
        category: 'Locking',
        note: magLockNote,
        branchAnswers: {},
        autoFlagged: true,
      };
    }

    // Auto-flag closer not provided (non-suite-perimeter, no closer or auto operator)
    if (!hwState.hw_closer && !hwState.hw_automatic_operator && assemblyType !== 'suite_perimeter') {
      initDefs['sc_closer_missing'] = {
        status: 'deficient',
        text: 'Self-Closing: Closer is not provided.',
        category: 'Self-Closing',
        note: 'Auto-flagged: No closer or automatic operator present.',
        branchAnswers: {},
        autoFlagged: true,
      };
    }

    // Auto-flag latching hardware not provided (non-smoke-barrier, no lockset/panic/delayed egress/flush bolts)
    if (
      assemblyType !== 'smoke_barrier' &&
      !hwState.hw_lockset_cylindrical &&
      !hwState.hw_lockset_mortise &&
      !hwState.hw_panic_device &&
      !hwState.hw_delayed_egress &&
      !hwState.hw_flush_bolts_auto &&
      !hwState.hw_flush_bolts_manual
    ) {
      initDefs['hw_latch_missing'] = {
        status: 'deficient',
        text: 'Positive Latching: Latching hardware is not provided.',
        category: 'Positive Latching',
        note: 'Auto-flagged: No lockset, panic device, or delayed egress device present.',
        branchAnswers: {},
        autoFlagged: true,
      };
    }

    setCurrentDoor(door);
    setDeficiencies(initDefs);
    setCurrentSectionIdx(0);
    setPhase('inspect');
  };

  // Derived: applicable items and visible sections
  const applicableItems = currentDoor
    ? getApplicableItems(currentDoor.assemblyType, currentDoor.hwState, currentDoor.doorSwingType, currentDoor.projectVars, currentDoor.isCrossCorridor === true, currentDoor.doorRating, currentDoor.frameRating, currentDoor.isHealthCareOccupancy, x14Compliant)
    : [];

  const visibleSections = SECTIONS.filter(sec =>
    applicableItems.some(item => item.section === sec)
  );

  const currentSection = visibleSections[currentSectionIdx] || '';
  const sectionItems = applicableItems.filter(item => item.section === currentSection);
  const isLastSection = currentSectionIdx >= visibleSections.length - 1;

  // Deficiency counts per section for nav
  const sectionDefCounts = (sec: string) => {
    const items = applicableItems.filter(i => i.section === sec);
    return items.filter(i => deficiencies[i.id]?.status === 'deficient').length;
  };

  const toggleDeficiency = useCallback((item: ChecklistItem) => {
    setDeficiencies(prev => {
      const current = prev[item.id];
      if (!current) {
        return {
          ...prev,
          [item.id]: {
            status: 'deficient',
            text: item.text,
            category: item.section,
            note: '',
            branchAnswers: {},
          },
        };
      }
      const { [item.id]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const updateNote = useCallback((id: string, note: string) => {
    setDeficiencies(prev => ({
      ...prev,
      [id]: { ...prev[id]!, note },
    }));
  }, []);

  const updateBranchAnswer = useCallback((itemId: string, qid: string, value: string, branchId?: string) => {
    setDeficiencies(prev => {
      const existing = prev[itemId] ?? { status: 'compliant', text: '', category: '', note: '', branchAnswers: {} };
      const updatedAnswers = { ...existing.branchAnswers, [qid]: value };

      if (branchId) {
        const result = getBranchResult(branchId, updatedAnswers, currentDoor?.assemblyType || existing.category, currentDoor?.doorSwingType || '', currentDoor?.projectVars.sprinklered !== false, currentDoor?.projectVars.gapStandard || 'codify');
        if (result?.status === 'compliant') {
          const addUniqueComment = (note: string) => {
            setAdditionalComments(prev => prev.includes(note) ? prev : (prev + ' ' + note).trim());
          };
          if (branchId === 'x3') addUniqueComment('Recommend shimming hinge(s) to reduce excessive gap(s) at perimeter of door.');
          if (branchId === 'x6') addUniqueComment('Recommend filling present hole(s) with appropriately rated material.');
          if (branchId === 'x7') addUniqueComment('Recommend replacing the damaged portion of gasketing or removing it entirely from the perimeter of the door.');
          if (branchId === 'x8') addUniqueComment('Recommend covering laminate damage with a protective plate(s).');
          const { [itemId]: _, ...rest } = prev;
          return rest;
        }
      }

      return {
        ...prev,
        [itemId]: {
          ...existing,
          branchAnswers: updatedAnswers,
        },
      };
    });
  }, []);

  const completeInspection = () => {
    const defList = Object.entries(deficiencies)
      .filter(([_, d]) => d.status === 'deficient' || d.status === 'advisory')
      .map(([id, d]) => ({ id, ...d }));
    const hasDeficiencies = defList.some(d => d.status === 'deficient');

    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      pinId: selectedDoor?.pinId,
      iconNo: currentDoor?.iconNo || '—',
      assetId: currentDoor?.assetId || '—',
      floorNo: currentDoor?.floorNo || '—',
      gridBlock: currentDoor?.gridBlock || '—',
      assemblyType: currentDoor?.assemblyType || '—',
      doorRating: currentDoor?.doorRating || '—',
      inspectorName: currentDoor?.inspectorName || '—',
      projectName: currentDoor?.projectName || '—',
      completedTime: new Date().toISOString(),
      overallStatus: hasDeficiencies ? 'fail' : defList.length > 0 ? 'conditional' : 'pass',
      postInspectionStatus: hasDeficiencies ? 'fail' : defList.length > 0 ? 'conditional' : 'pass',
      deficiencies: defList,
      findings: deficiencies,
      additionalComments: additionalComments,
      synced: false,
    };

    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    existing.push(record);
    localStorage.setItem('doorInspections', JSON.stringify(existing));

    const pinStatus = hasDeficiencies ? 'fail' : 'pass';
    if (selectedDoor?.pinId) {
      window.dispatchEvent(new CustomEvent('pinStatusUpdate', {
        detail: { pinId: selectedDoor.pinId, status: pinStatus }
      }));
    }

    setPhase('complete');
    if (onClear) onClear();
  };

  const navigateToSection = (idx: number) => {
    setCurrentSectionIdx(idx);
    setVisitedSections(prev => {
      const newSet = new Set(prev);
      newSet.add(idx);
      return newSet;
    });
  };

  const resetWizard = () => {
    setPhase('setup');
    setSetupPage(1);
    setAssetId('');
    setAssetIdError('');
    setIconNo('');
    setFloorNo('');
    setGridBlock('');
    setAssemblyType('');
    setDoorRating('');
    setFrameRating('180');
    setDoorSwingType('single');
    setIsStairDoor(null);
    setIsCrossCorridor(null);
    setIsCorridorDoor(null);
    setShowCorridorPrompt(false);
    setIsHealthCareOccupancy(true);
    setHwState({ ...DEFAULT_HW_STATE });
    setDeficiencies({});
    setCurrentDoor(null);
    setCurrentSectionIdx(0);
    setAdditionalComments('');
    setOccTableExpanded(false);
    setBlockingPromptsDone({});
    setX14Compliant(false);
    setVisitedSections(new Set([0]));
  };

  // ── COMPLETE SCREEN ──────────────────────────────────────────────
  if (phase === 'complete') {
    const defList = Object.values(deficiencies).filter(d => d.status === 'deficient' || d.status === 'advisory');
    const defCount = defList.filter(d => d.status === 'deficient').length;
    const overall = defCount > 0 ? 'fail' : defList.length > 0 ? 'conditional' : 'pass';

    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className={`rounded-lg border p-6 text-center mb-6 ${
          overall === 'pass' ? 'border-green-500/40 bg-green-500/5' :
          overall === 'fail' ? 'border-red-500/40 bg-red-500/5' :
          'border-yellow-500/40 bg-yellow-500/5'
        }`}>
          <div className={`text-4xl font-bold font-mono mb-2 ${
            overall === 'pass' ? 'text-green-400' :
            overall === 'fail' ? 'text-red-400' : 'text-yellow-400'
          }`}>
            {overall === 'pass' ? 'Pass' : overall === 'fail' ? 'Fail' : 'Conditional'}
          </div>
          <p className="text-muted-foreground text-sm">
            {defCount} {defCount === 1 ? 'Deficiency' : 'Deficiencies'} · {defList.filter(d => d.status === 'advisory').length} {defList.filter(d => d.status === 'advisory').length === 1 ? 'Advisory' : 'Advisories'}
          </p>
        </div>

        {defList.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deficiencies Recorded</h3>
            <div className="space-y-2">
              {defList.map(d => (
                <div key={d.text} className={`p-3 rounded-sm border text-sm ${
                  d.status === 'deficient' ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'
                }`}>
                  <p className="font-mono text-xs opacity-60 mb-1">{d.category}</p>
                  {d.text}
                  {d.note && <p className="text-xs mt-1 opacity-70 italic">{d.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={resetWizard}
          className="w-full py-3 bg-primary text-primary-foreground rounded-sm font-semibold tracking-wide uppercase text-sm"
        >
          Inspect Next Door →
        </button>
      </div>
    );
  }

  // ── SETUP SCREEN ─────────────────────────────────────────────────
  if (phase === 'setup') {
    // PAGE 1: DOOR IDENTIFICATION
    if (setupPage === 1) {
      return (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h1 className="text-2xl font-bold tracking-wide uppercase font-mono">Inspection Wizard</h1>
            <p className="text-sm text-muted-foreground mt-1">Page 1 of 2: Door Identification</p>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 max-w-2xl mx-auto w-full">
            {/* Door Identification card */}
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-primary font-mono">Door Identification</h2>

              <div className="grid grid-cols-2 gap-x-6 items-start">
                {/* LEFT COLUMN */}
                <div className="space-y-2">
                  {([
                    { label: 'Icon No.', value: iconNo, setter: setIconNo, placeholder: 'e.g. 23' },
                    { label: 'Floor', value: floorNo, setter: setFloorNo, placeholder: 'e.g. Third' },
                    { label: 'Grid Block', value: gridBlock, setter: setGridBlock, placeholder: 'e.g. B2' },
                  ] as const).map(({ label, value, setter, placeholder }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-24 shrink-0">{label}</span>
                      <input value={value} onChange={e => setter(e.target.value)} placeholder={placeholder} className="codify-input flex-1" />
                    </div>
                  ))}
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-24 shrink-0 pt-2">Asset ID *</span>
                    <div className="flex-1">
                      <input
                        value={assetId}
                        onChange={e => { setAssetId(e.target.value); setAssetIdError(''); }}
                        onBlur={e => validateAssetId(e.target.value)}
                        placeholder="e.g. 4371"
                        className={`codify-input w-full ${assetIdError ? 'border-red-500' : ''}`}
                      />
                      {assetIdError && <p className="text-xs text-red-400 font-mono mt-1">{assetIdError}</p>}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-2">
                  {/* Assembly Type */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-28 shrink-0">Assembly Type *</span>
                    <select value={assemblyType} onChange={e => {
                      const val = e.target.value;
                      setAssemblyType(val);
                      if (val === 'smoke_partition' || val === 'suite_perimeter') {
                        setDoorRating('0');
                        setFrameRating('0');
                      } else {
                        setDoorRating('');
                        setFrameRating('180');
                      }
                    }} className="codify-input flex-1">
                      <option value="">— Select —</option>
                      <option value="3hr_fire">3-Hour Fire Barrier</option>
                      <option value="2hr_fire">2-Hour Fire Barrier</option>
                      <option value="1hr_fire">1-Hour Fire Barrier</option>
                      <option value="1hr_partition">1-Hour Partition</option>
                      <option value="smoke_barrier">Smoke Barrier</option>
                      <option value="smoke_partition">Smoke Partition</option>
                      <option value="suite_perimeter">Suite Perimeter</option>
                    </select>
                  </div>

                  {/* Door Rating — hidden for smoke partition and suite perimeter */}
                  {assemblyType !== 'smoke_partition' && assemblyType !== 'suite_perimeter' && <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-28 shrink-0">Door Rating *</span>
                    <select value={doorRating} onChange={e => setDoorRating(e.target.value)} className="codify-input flex-1">
                      <option value="">— Select —</option>
                      <option value="180">180 min</option>
                      <option value="90">90 min</option>
                      <option value="60">60 min</option>
                      <option value="45">45 min</option>
                      <option value="20">20 min</option>
                      <option value="0">Non-Rated</option>
                      <option value="label_illegible">Label Illegible</option>
                    </select>
                  </div>}

                  {assemblyType !== 'smoke_partition' && assemblyType !== 'suite_perimeter' && <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground w-28 shrink-0">Frame Rating *</span>
                    <select value={frameRating} onChange={e => setFrameRating(e.target.value)} className="codify-input flex-1">
                      <option value="">— Select —</option>
                      <option value="180">180 min</option>
                      <option value="90">90 min</option>
                      <option value="60">60 min</option>
                      <option value="45">45 min</option>
                      <option value="20">20 min</option>
                      <option value="0">Non-Rated</option>
                      <option value="label_illegible">Label Illegible</option>
                    </select>
                  </div>}
                </div>
              </div>
            </div>

            {/* Stair Door Conditional */}
            {assemblyType === '1hr_fire' && doorRating === '45' && (
              <div className="mt-2 p-3 bg-card border border-border rounded-sm space-y-2">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Is this a stair door?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsStairDoor(true)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isStairDoor === true
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setIsStairDoor(false)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isStairDoor === false
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    No
                  </button>
                </div>

              </div>
            )}

            {/* Cross-Corridor Conditional */}
            {assemblyType === 'smoke_barrier' && (doorSwingType === 'dbl_pair' || doorSwingType === 'dbl_dual_egress') && (
              <div className="mt-2 p-3 bg-card border border-border rounded-sm space-y-2">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Is this door part of a cross-corridor opening?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsCrossCorridor(true)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isCrossCorridor === true
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setIsCrossCorridor(false)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isCrossCorridor === false
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {/* Healthcare Occupancy Conditional — Smoke Barrier + Dual Egress */}
            {assemblyType === 'smoke_barrier' && doorSwingType === 'dbl_dual_egress' && (
              <div className="mt-2 p-3 bg-card border border-border rounded-sm space-y-2">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Does this door reside in a Health Care Occupancy?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsHealthCareOccupancy(true)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isHealthCareOccupancy === true
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setIsHealthCareOccupancy(false)}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isHealthCareOccupancy === false
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {/* Corridor Door Prompt for 1-Hour Partition */}
            {showCorridorPrompt && (
              <div className="mt-2 p-3 bg-card border border-border rounded-sm space-y-2">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Is this door also a corridor door?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsCorridorDoor(true);
                    }}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isCorridorDoor === true
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => {
                      setIsCorridorDoor(false);
                    }}
                    className={`flex-1 py-2 text-xs font-mono rounded-sm border transition-all ${
                      isCorridorDoor === false
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {/* Swing Type at bottom — full width, single row */}
            <div className="bg-card border border-border rounded-sm p-4 space-y-3">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Swing Type *</span>
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {[
                    {
                      value: 'single',
                      label: 'Single',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                          <circle cx="4" cy="20" r="1.2" fill="currentColor" />
                          <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                        </svg>
                      ),
                    },
                    {
                      value: 'dbl_pair',
                      label: 'Pair Swing',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                          <circle cx="4" cy="20" r="1.2" fill="currentColor" />
                          <circle cx="20" cy="20" r="1.2" fill="currentColor" />
                          <line x1="4" y1="20" x2="10" y2="9" stroke="currentColor" strokeWidth="1.5" />
                          <line x1="20" y1="20" x2="14" y2="9" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M 4 20 A 12 12 0 0 1 10 9" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                          <path d="M 20 20 A 12 12 0 0 0 14 9" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                        </svg>
                      ),
                    },
                    {
                      value: 'dbl_dual_egress',
                      label: 'Dual Egress',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                          <line x1="0" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1,1" />
                          <circle cx="4" cy="12" r="1.2" fill="currentColor" />
                          <circle cx="20" cy="12" r="1.2" fill="currentColor" />
                          <line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" />
                          <line x1="20" y1="12" x2="12" y2="20" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M 4 12 A 8 8 0 0 1 12 4" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                          <path d="M 20 12 A 8 8 0 0 1 12 20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                        </svg>
                      ),
                    },
                    {
                      value: 'dbl_active',
                      label: 'Active',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                          <circle cx="4" cy="20" r="1.2" fill="currentColor" />
                          <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                          <line x1="17" y1="2" x2="22" y2="7" stroke="currentColor" strokeWidth="1.2" />
                          <line x1="22" y1="2" x2="17" y2="7" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      ),
                    },
                    {
                      value: 'dbl_inactive',
                      label: 'Inactive',
                      icon: (
                        <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                          <circle cx="20" cy="20" r="1.2" fill="currentColor" />
                          <line x1="20" y1="20" x2="4" y2="4" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M 20 20 A 16 16 0 0 0 4 4" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5,1.5" />
                          <line x1="2" y1="2" x2="7" y2="7" stroke="currentColor" strokeWidth="1.2" />
                          <line x1="7" y1="2" x2="2" y2="7" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                      ),
                    },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        const newSwingType = opt.value;
                        // When swing type changes to Single, turn off inapplicable hardware
                        if (newSwingType === 'single') {
                          setHwState(prev => ({
                            ...prev,
                            hw_coordinator: false,
                            hw_flush_bolts_auto: false,
                            hw_flush_bolts_manual: false,
                            hw_overlapping_astragal: false,
                          }));
                        }
                        setDoorSwingType(newSwingType);
                      }}
                      className={`py-2 px-1 text-xs font-mono rounded-sm border transition-all text-center flex flex-col items-center gap-1 ${
                        doorSwingType === opt.value
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className={doorSwingType === opt.value ? 'opacity-100' : 'opacity-70'}>
                        {opt.icon}
                      </span>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {(doorSwingType === 'dbl_active' || doorSwingType === 'dbl_inactive') && (
                  <p className="text-xs text-yellow-400 font-mono mt-1 px-1">
                    {doorSwingType === 'dbl_active'
                      ? "This door's latch is contingent on the adjacent inactive leaf closing first."
                      : 'This door must close first for the active leaf to latch.'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom buttons */}
          <div className="shrink-0 px-4 py-3 border-t border-border flex gap-3 max-w-2xl mx-auto w-full">
            <button
              onClick={markInaccessible}
              className="px-6 py-3 bg-orange-500/20 border border-orange-500 text-orange-400 rounded-sm font-semibold tracking-wide uppercase text-sm"
            >
              Inaccessible
            </button>
            <button
              onClick={() => {
                if (!assetId.trim()) { alert('Asset ID is required.'); return; }
                if (!assemblyType) { alert('Select an Assembly Type.'); return; }
                if (doorRating === '') { alert('Door Rating is required.'); return; }
                if (!doorSwingType) { alert('Select a Door Swing Type.'); return; }
                setSetupPage(2);
              }}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-sm font-semibold tracking-wide uppercase text-sm"
            >
              Next: Door Hardware →
            </button>
          </div>
        </div>
      );
    }

    // PAGE 2: DOOR HARDWARE
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <h1 className="text-2xl font-bold tracking-wide uppercase font-mono">Inspection Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">Page 2 of 2: Door Hardware</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4 max-w-2xl mx-auto w-full">
          {/* Hardware Variables */}
          <div className="bg-card border border-border rounded-sm p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-primary font-mono">Door Hardware</h2>
            <p className="text-xs text-muted-foreground">Toggle ON for hardware present on this door.</p>
            <div className="grid grid-cols-2 gap-2">
              {HARDWARE_VARS.map(v => {
                const hiddenWhenSingle = [
                  'hw_coordinator',
                  'hw_overlapping_astragal',
                ];
                if (doorSwingType === 'single' && hiddenWhenSingle.includes(v.id)) return null;

                const hiddenWhenNotSingleOrActive = [
                  'hw_lockset_cylindrical',
                  'hw_lockset_mortise',
                ];
                if (!['single', 'dbl_active'].includes(doorSwingType) && hiddenWhenNotSingleOrActive.includes(v.id)) return null;

                const hiddenWhenNotInactive = [
                  'hw_flush_bolts_auto',
                  'hw_flush_bolts_manual',
                ];
                if (doorSwingType !== 'dbl_inactive' && hiddenWhenNotInactive.includes(v.id)) return null;

                if (v.id === 'hw_deadbolt' && !['single', 'dbl_active'].includes(doorSwingType)) return null;
                if (v.id === 'hw_electric_strike' && doorSwingType === 'dbl_active') return null;

                return (
                  <button
                    key={v.id}
                    onClick={() => toggleHardware(v.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm border text-sm transition-all ${
                      hwState[v.id]
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    <span>{v.label}</span>
                    <span className={`text-xs font-mono ml-2 ${hwState[v.id] ? 'text-primary' : 'text-muted-foreground'}`}>
                      {hwState[v.id] ? 'ON' : 'OFF'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Page 2 Navigation Buttons */}
        <div className="flex gap-3 px-4 py-3 border-t border-border shrink-0">
          <button
            onClick={() => setSetupPage(1)}
            className="px-4 py-3 border border-border rounded-sm text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:border-primary/50"
          >
            ← Back
          </button>
          <button
            onClick={startInspection}
            className="flex-1 py-3 bg-primary text-primary-foreground rounded-sm font-semibold tracking-wide uppercase text-sm"
          >
            Begin Inspection →
          </button>
        </div>
      </div>
    );
  }

  // ── INSPECT SCREEN ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Door header strip */}
      <div className="bg-card border-b border-border px-4 py-2 flex gap-4 flex-wrap text-xs font-mono">
        <span className="text-muted-foreground">ICON <span className="text-foreground font-semibold">{currentDoor?.iconNo || '—'}</span></span>
        <span className="text-muted-foreground">ASSET <span className="text-foreground font-semibold">{currentDoor?.assetId || '—'}</span></span>
        <span className="text-muted-foreground">FLOOR <span className="text-foreground font-semibold">{currentDoor?.floorNo || '—'}</span></span>
        <span className="text-muted-foreground">TYPE <span className="text-primary font-semibold">{ASSEMBLY_TYPE_LABELS[currentDoor?.assemblyType || ''] || '—'}</span></span>
        <span className="text-muted-foreground">RATING <span className="text-foreground font-semibold">{currentDoor?.doorRating === '0' ? 'Non-Rated' : (currentDoor?.doorRating + ' min')}</span></span>
      </div>

      {/* Section nav */}
      <div className="bg-card border-b border-border px-4 py-2 flex gap-1.5 flex-wrap">
        {visibleSections.map((sec, idx) => {
          const defCount = sectionDefCounts(sec);
          const isActive = idx === currentSectionIdx;
          const isVisited = visitedSections.has(idx);
          return (
            <button
              key={sec}
              onClick={() => isVisited && navigateToSection(idx)}
              disabled={!isVisited}
              className={`px-2.5 py-1 rounded-sm text-xs font-mono uppercase tracking-wide transition-all border ${
                isActive
                  ? defCount > 0 ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-primary bg-primary/10 text-primary'
                  : isVisited
                    ? defCount > 0 ? 'border-red-500/40 text-red-400/70 hover:border-red-500' : 'border-border text-muted-foreground hover:border-primary/50'
                    : 'border-border/30 text-muted-foreground/30 cursor-not-allowed'
              }`}
            >
              {sec}{defCount > 0 ? ` (${defCount})` : ''}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wider font-mono">{currentSection}</h2>
          <span className="text-xs font-mono text-muted-foreground">{sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Auto-flagged rating warnings */}
        {currentSection === 'Rating' && deficiencies['rating_door']?.autoFlagged && (
          <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-sm text-xs text-red-400 font-mono">
            ⚡ AUTO-FLAGGED: {deficiencies['rating_door'].note}
          </div>
        )}
        {currentSection === 'Rating' && deficiencies['rating_frame']?.autoFlagged && (
          <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-sm text-xs text-red-400 font-mono">
            ⚡ AUTO-FLAGGED: {deficiencies['rating_frame'].note}
          </div>
        )}

        {(() => {
          const hw = currentDoor?.hwState || {};
          const swing = currentDoor?.doorSwingType || '';
          const activeBlockingPrompt = BLOCKING_PROMPTS.find(bp =>
            bp.section === currentSection &&
            bp.condition(hw, swing) &&
            !blockingPromptsDone[bp.id]
          );

          if (activeBlockingPrompt) {
            return (
              <div className="mb-4 p-4 bg-card border border-yellow-500/40 rounded-sm space-y-3">
                <p className="text-xs font-mono uppercase tracking-wider text-yellow-400">
                  ⚠ {activeBlockingPrompt.title}
                </p>
                <BranchUI
                  item={{
                    id: activeBlockingPrompt.id,
                    text: '',
                    section: currentSection,
                    show: true,
                    branch: activeBlockingPrompt.branch
                  }}
                  atype={currentDoor?.assemblyType || ''}
                  swing={swing}
                  sprinklered={currentDoor?.projectVars.sprinklered !== false}
                  gapStd={currentDoor?.projectVars.gapStandard || 'codify'}
                  branchAnswers={deficiencies[activeBlockingPrompt.id]?.branchAnswers || {}}
                  onAnswer={(qid: string, val: string) => updateBranchAnswer(activeBlockingPrompt.id, qid, val)}
                />
                {getBranchTerminalResult(activeBlockingPrompt.branch, deficiencies[activeBlockingPrompt.id]?.branchAnswers || {}, currentDoor?.assemblyType || '', currentDoor?.doorSwingType, currentDoor?.projectVars.sprinklered !== false) && (
                  <button
                    onClick={() => {
                      const addUniqueComment = (note: string) => {
                        setAdditionalComments(prev => prev.includes(note) ? prev : (prev + ' ' + note).trim());
                      };
                      const answers = deficiencies[activeBlockingPrompt.id]?.branchAnswers || {};
                      const result = getBranchResult(
                        activeBlockingPrompt.branch,
                        answers,
                        currentDoor?.assemblyType || '',
                        swing,
                        currentDoor?.projectVars.sprinklered !== false,
                        currentDoor?.projectVars.gapStandard || 'codify'
                      );

                      if (result?.status === 'deficient') {
                        // Map each blocking prompt to its real checklist item ID
                        const targetId =
                          activeBlockingPrompt.id === 'bp_sc_closer_inactive' ? 'sc_closer_missing' :
                          activeBlockingPrompt.id === 'bp_flush_bolts' ? 'pl_flush_bolts_manual' :
                          activeBlockingPrompt.id === 'bp_deadbolt' ? 'lock_deadbolt' :
                          activeBlockingPrompt.id === 'bp_mag_lock' ? 'lock_illegitimate_arrangement' :
                          activeBlockingPrompt.id;

                        setDeficiencies(prev => ({
                          ...prev,
                          [targetId]: {
                            status: 'deficient',
                            text: prev[targetId]?.text || activeBlockingPrompt.title,
                            category: currentSection,
                            note: prev[targetId]?.note || '',
                            branchAnswers: answers,
                            autoFlagged: false,
                          },
                        }));

                        // x12 occupancy-specific notes
                        if (activeBlockingPrompt.branch === 'x12') {
                          const occupancy = answers['x12_q2'];
                          if (occupancy === 'ambulatory') {
                            addUniqueComment('Locking arrangement not permitted under Chapter 20 of NFPA 101 (2012).');
                          } else if (occupancy === 'business') {
                            addUniqueComment('Locking arrangement not permitted under Chapter 38 of NFPA 101 (2012).');
                          } else if (occupancy === 'healthcare') {
                            addUniqueComment('Locking arrangement does not satisfy requirements of NFPA 101 (2012) 18.2.2.2.5.');
                          }
                        }

                      } else if (result?.status === 'compliant') {
                        if (activeBlockingPrompt.branch === 'x11') {
                          addUniqueComment('Deadbolt in accordance with NFPA 101 (2012) 7.2.1.5.10.6.');
                        }
                        if (activeBlockingPrompt.branch === 'x13') {
                          addUniqueComment('Inactive leaf in accordance with NFPA 80 (2010) A.6.4.4.5.1.');
                        }
                        if (activeBlockingPrompt.branch === 'x14') {
                          addUniqueComment('Inactive leaf in accordance with NFPA 80 (2010) A.6.4.1.1.');
                          setX14Compliant(true);
                          setDeficiencies(prev => {
                            const { sc_closer_missing: _, ...rest } = prev;
                            return rest;
                          });
                        }
                      }

                      setBlockingPromptsDone(prev => ({ ...prev, [activeBlockingPrompt.id]: true }));
                    }}
                    className="w-full py-2 bg-primary text-primary-foreground rounded-sm text-xs font-semibold uppercase tracking-wide mt-2"
                  >
                    Continue →
                  </button>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {sectionItems.map(item => (
                <DeficiencyItem
                  key={item.id}
                  item={item}
                  defState={deficiencies[item.id]}
                  atype={currentDoor?.assemblyType || ''}
                  swing={currentDoor?.doorSwingType || ''}
                  sprinklered={currentDoor?.projectVars.sprinklered !== false}
                  gapStd={currentDoor?.projectVars.gapStandard || 'codify'}
                  onToggle={toggleDeficiency}
                  onNoteChange={updateNote}
                  onBranchAnswer={updateBranchAnswer}
                />
              ))}
            </div>
          );
        })()}

        {currentSection === 'Locking' && (
          <div className="mt-4 border border-border rounded-sm">
            <button
              onClick={() => setOccTableExpanded(prev => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all"
            >
              <span>Occupant Load Factor & Dead-End Corridor Distances</span>
              <span>{occTableExpanded ? '▲' : '▼'}</span>
            </button>
            {occTableExpanded && (
              <div className="px-3 pb-3 border-t border-border">
                <table className="w-full text-xs font-mono mt-2">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 text-muted-foreground">Use</th>
                      <th className="text-right py-1 text-muted-foreground">ft² / person</th>
                      <th className="text-right py-1 text-muted-foreground">Dead-End Distance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="py-1 text-foreground">Health Care (Inpatient)</td>
                      <td className="text-right text-foreground">240</td>
                      <td className="text-right text-foreground">30 ft</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-1 text-foreground">Health Care (Sleeping Dept.)</td>
                      <td className="text-right text-foreground">120</td>
                      <td className="text-right text-foreground">30 ft</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-1 text-foreground">Ambulatory/Business (Fully Sprinklered Building)</td>
                      <td className="text-right text-foreground">100</td>
                      <td className="text-right text-foreground">50 ft</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-foreground">Ambulatory/Business (Partially Sprinklered Building)</td>
                      <td className="text-right text-foreground">100</td>
                      <td className="text-right text-foreground">20 ft</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {isLastSection && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-1">Additional Comments (optional)</p>
            <textarea
              value={additionalComments}
              onChange={e => setAdditionalComments(e.target.value)}
              placeholder="Any overall comments about this door..."
              className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-sm resize-none min-h-20 text-foreground"
            />
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {currentSectionIdx === 0 && (
            <button
              onClick={() => {
                setPhase('setup');
                setSetupPage(1);
                setDeficiencies({});
                setCurrentDoor(null);
                setCurrentSectionIdx(0);
              }}
              className="px-4 py-2 border border-border rounded-sm text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:border-primary/50"
            >
              ← Setup
            </button>
          )}
          {currentSectionIdx > 0 && (
            <button
              onClick={() => navigateToSection(Math.max(0, currentSectionIdx - 1))}
              className="px-4 py-2 border border-border rounded-sm text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:border-primary/50"
            >
              ← Back
            </button>
          )}
          {!isLastSection ? (
            <button
              onClick={() => navigateToSection(Math.min(visibleSections.length - 1, currentSectionIdx + 1))}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-sm font-semibold uppercase tracking-wide text-sm"
            >
              Next Section →
            </button>
          ) : (
            <>
              {visitedSections.size >= visibleSections.length ? (
                <button
                  onClick={completeInspection}
                  className="flex-1 py-2 bg-green-600 text-white rounded-sm font-semibold uppercase tracking-wide text-sm"
                >
                  Complete Inspection ✓
                </button>
              ) : (
                <button
                  disabled
                  className="flex-1 py-2 bg-green-600/30 text-white/40 rounded-sm font-semibold uppercase tracking-wide text-sm cursor-not-allowed"
                >
                  Complete Inspection ✓
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
