import { Zone } from '@/types';

/**
 * Crosswalk between interactive door-diagram zones and the checklist item IDs
 * produced by getApplicableItems() in InspectionWizard.tsx.
 *
 * This table is the contract between the diagram and the inspection logic.
 * When an item ID is added, renamed, or removed in the wizard, update it here
 * or that item becomes unreachable from the diagram.
 *
 * See INTERACTIVE_DOOR_DIAGRAM_SPEC.md, Section 3.
 */
export const ZONE_TO_ITEM_IDS: Record<Zone, string[]> = {
  head_gap: ['gap_top'],
  hinge_stile: [
    'gap_hinge',
    'pi_laminate_hinge',
    'pi_hinge_filler',
    'pi_hinge_missing',
    'pi_screws',
  ],
  latch_stile: ['gap_latch', 'pi_laminate_latch'],
  sill_gap: [
    'gap_bottom_3_4',
    'gap_bottom_1',
    'gap_sweep',
    'pi_sweep',
    'sc_rub_floor',
    'sc_sweep_dragging',
  ],
  meeting_stile: [
    'gap_meeting',
    'gap_astragal',
    'pi_astragal',
    'gap_fire_pin',
    'pl_fire_pin',
    'pl_bottom_fails',
    'pl_floor_strike_missing',
    'lock_overlap_independent',
  ],
  leaf_face: [
    'gap_face',
    'pi_door_damaged',
    'pi_holes',
    'pi_prep',
    'pi_dissimilar',
    'pi_laminate_face',
    'pi_hydraulic',
    'label_door',
    'rating_door',
  ],
  frame: ['pi_frame', 'label_frame', 'rating_frame'],
  closer: [
    'sc_closer_missing',
    'sc_arm_disconnected',
    'sc_slamming',
    'sc_maladjusted',
    'sc_hold_open',
    'sc_air_pressure',
    'sc_rub_adjacent',
    'sc_rub_frame',
    'sc_coordinator_missing',
    'sc_coordinator_failing',
  ],
  latch_hw: [
    'hw_latch_missing',
    'pl_latch_sticks',
    'pl_latch_fails',
    'pl_defeated',
    'pl_hw_damaged',
    'pl_electric_strike',
    'pl_mechanical_hw',
    'pi_latching_hw',
    'lock_locked_egress',
    'lock_illegitimate_arrangement',
  ],
  panic_hw: [
    'lock_panic_actuating',
    'pi_panic_endcap',
    'lock_delayed_failure',
    'lock_delayed_sprinkler',
    'lock_deadbolt',
    'lock_motion_fails',
    'lock_pte_fails',
    'lock_pte_distance',
    'lock_pte_missing',
  ],
  vision_panel: ['rating_vision', 'vp_missing', 'sign_vision'],
  gasketing: ['pi_gasketing'],
  signage: [
    'sign_delayed_egress',
    'sign_coat_rack',
    'sign_mech_fastened',
    'sign_5pct',
  ],
};

/** Human-readable label for each zone, shown on hover and in panels. */
export const ZONE_LABELS: Record<Zone, string> = {
  head_gap: 'Top edge gap',
  hinge_stile: 'Hinge edge',
  latch_stile: 'Latch edge',
  sill_gap: 'Bottom gap',
  meeting_stile: 'Meeting edge',
  leaf_face: 'Door face',
  frame: 'Frame',
  closer: 'Closer',
  latch_hw: 'Latch / lockset',
  panic_hw: 'Panic / exit device',
  vision_panel: 'Vision panel',
  gasketing: 'Gasketing / seals',
  signage: 'Signage',
};

/** Zones drawn for a single-leaf door (excludes the pairs-only meeting edge). */
export const SINGLE_LEAF_ZONES: Zone[] = [
  'frame',
  'head_gap',
  'hinge_stile',
  'latch_stile',
  'sill_gap',
  'leaf_face',
  'closer',
  'latch_hw',
  'panic_hw',
  'vision_panel',
  'gasketing',
  'signage',
];

/**
 * Returns the first zone that owns a given checklist item ID, or null.
 * An item may be listed under more than one zone; the first match wins.
 */
export function zoneForItemId(id: string): Zone | null {
  for (const zone of Object.keys(ZONE_TO_ITEM_IDS) as Zone[]) {
    if (ZONE_TO_ITEM_IDS[zone].includes(id)) return zone;
  }
  return null;
}
