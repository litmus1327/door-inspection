// Above & Below Ceiling inspection — finding catalog (pure data).
//
// Sibling to inspectionRules.ts. Unlike the door engine, ceiling inspection is
// NOT a branch-logic decision tree — it is a flat catalog of fixed findings the
// inspector picks from, one per dropped pin. All expertise lives here as
// reference content (whatToLookFor / codeRef), not as conditional logic.
//
// Source of the `detail` strings: "Above_Below Ceiling Combined Checklist.xlsx"
// (the current Fieldwire checklist). Each detail must stay EXACT so the report
// wording matches what surveyors expect.
//
// CATEGORY CONTRACT (important):
//   The export writes `category` into BOTH the CSV "Category" column AND the
//   "Yes: <category>: <detail>" checklist prefix, so they always agree — which
//   is what the Reporting Tool parser (pipelines/above_below_ceiling.py) expects.
//   Spellings use Fieldwire's real vocabulary ("Medical Gases", "Hazardous
//   Materials"), not the xlsx checklist-tab spelling ("Medical Gas", "Hazardous
//   Materials & Waste").
//
//   The Reporting Tool's review (review/ceiling_review.py) currently treats only
//   {Life Safety, Utilities, Medical Gases, Safety, Hazardous Materials} as
//   canonical. The other seven categories below (Emergency Generator, Fire Alarm
//   Systems, Fire Suppression Systems, Means of Egress, Medical Equipment,
//   Medications Management, Opening Protectives) will show benign, "Accept"-able
//   category_out_of_list notes when a report is reviewed. RECOMMENDED FOLLOW-UP:
//   expand CEILING_CANONICAL_CATEGORIES in review/ceiling_review.py to this full
//   set (the code is written to be expanded). Not required for the report to build.
//
// PRIORITY DEFAULTS are provisional. They must be confirmed with Scott Fox
// (SME). Real exports have historically defaulted everything to "Priority 2".

export type CeilingZone = 'Inside' | 'Outside' | 'Roof';

export type CeilingPriority = 'Priority 1' | 'Priority 2' | 'Priority 3';

export type CeilingCategory =
  | 'Life Safety'
  | 'Utilities'
  | 'Emergency Generator'
  | 'Fire Alarm Systems'
  | 'Fire Suppression Systems'
  | 'Hazardous Materials'
  | 'Means of Egress'
  | 'Medical Equipment'
  | 'Medical Gases'
  | 'Medications Management'
  | 'Opening Protectives'
  | 'Safety';

export interface CeilingFinding {
  id: string;                   // stable slug, e.g. 'ls_penetration_unsealed'
  category: CeilingCategory;    // -> CSV Category column AND "Yes: <category>:" prefix
  detail: string;              // EXACT report wording (incl. trailing period)
  defaultPriority: CeilingPriority; // -> CSV Status column (inspector can override)
  whatToLookFor: string;        // SME field guidance (reference only; never exported)
  codeRef?: string;             // general code pointer (reference only)
  zone: CeilingZone;            // Inside / Outside / Roof — drives the walkthrough helper
  exampleImage?: string;        // /public asset path — added in a later photos pass
  keywords?: string[];          // extra search terms beyond category + detail
}

// Ordered category list for the picker.
export const CEILING_CATEGORIES: CeilingCategory[] = [
  'Life Safety',
  'Opening Protectives',
  'Means of Egress',
  'Fire Alarm Systems',
  'Fire Suppression Systems',
  'Utilities',
  'Emergency Generator',
  'Medical Gases',
  'Medical Equipment',
  'Hazardous Materials',
  'Medications Management',
  'Safety',
];

// Valid Status values for the priority picker.
export const CEILING_PRIORITIES: CeilingPriority[] = ['Priority 1', 'Priority 2', 'Priority 3'];

export const CEILING_FINDINGS: CeilingFinding[] = [
  // ── Life Safety ──────────────────────────────────────────────────────────
  {
    id: 'ls_penetration_unsealed',
    category: 'Life Safety',
    detail: 'Penetration unsealed/improperly sealed.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Pipes, conduit, cable, or duct passing through a rated wall with the gap around them open or filled with the wrong material. Every penetration through a fire/smoke barrier must be sealed with a tested firestop system rated for that assembly.',
    codeRef: 'NFPA 101 §8.3.5 / firestop per a UL-listed system (ASTM E814 / UL 1479)',
    zone: 'Inside',
    keywords: ['firestop', 'pipe', 'conduit', 'cable', 'sleeve', 'through penetration'],
  },
  {
    id: 'ls_hole_gross_opening',
    category: 'Life Safety',
    detail: 'Hole(s) or gross opening(s) in wall assembly.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Large open holes or missing sections in a rated wall above the ceiling — anything that lets fire or smoke pass. Distinct from a small unsealed penetration; this is a break in the barrier itself.',
    codeRef: 'NFPA 101 §8.3 (fire barriers) / §8.4 (smoke barriers)',
    zone: 'Inside',
    keywords: ['opening', 'gap', 'breach', 'missing gypsum'],
  },
  {
    id: 'ls_top_of_wall_unsealed',
    category: 'Life Safety',
    detail: 'Top of wall joint unsealed/improperly sealed.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'The head-of-wall joint where the rated wall meets the deck above is open or sealed with the wrong product. Must use a tested head-of-wall (HOW) firestop system.',
    codeRef: 'Head-of-wall firestop per UL-listed system (UL 2079 / HW series)',
    zone: 'Inside',
    keywords: ['head of wall', 'HOW', 'deck', 'joint'],
  },
  {
    id: 'ls_smoke_sealant_for_firestop',
    category: 'Life Safety',
    detail: 'Smoke sealant used in lieu of a rated firestop product.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A non-rated smoke/acoustic sealant used where a fire-rated firestop is required. Smoke sealant alone does not carry a fire rating.',
    codeRef: 'Firestop must be part of a tested, rated system (UL)',
    zone: 'Inside',
    keywords: ['acoustic sealant', 'smoke seal', 'wrong product'],
  },
  {
    id: 'ls_mixed_firestop_products',
    category: 'Life Safety',
    detail: 'Mixed firestop products.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Two or more manufacturers or product types combined in one penetration. Firestop systems are only listed as tested combinations; mixing voids the listing.',
    codeRef: 'Install per a single UL-listed firestop system',
    zone: 'Inside',
    keywords: ['manufacturer', 'combination', 'listing'],
  },
  {
    id: 'ls_improper_polyfoam',
    category: 'Life Safety',
    detail: 'Improper use of polyfoam sealants.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Expanding polyurethane foam used as a firestop. Standard polyfoam is combustible and not a listed firestop unless it is a specific tested fire-rated foam.',
    codeRef: 'Firestop per UL-listed system only',
    zone: 'Inside',
    keywords: ['spray foam', 'polyurethane', 'expanding foam'],
  },
  {
    id: 'ls_wall_incomplete',
    category: 'Life Safety',
    detail: 'Wall assembly incomplete or improperly constructed.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Rated wall that does not go deck-to-deck, is missing layers of gypsum, or is otherwise not built to the tested assembly it is supposed to be.',
    codeRef: 'Build to the listed rated assembly (UL design)',
    zone: 'Inside',
    keywords: ['deck to deck', 'gypsum layers', 'construction'],
  },
  {
    id: 'ls_underrated_assembly',
    category: 'Life Safety',
    detail: 'Underrated assembly.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'The barrier as built provides a lower fire rating than the life-safety drawing requires (e.g., a 1-hour wall where a 2-hour is called for).',
    codeRef: 'Match the rating shown on the life-safety plan',
    zone: 'Inside',
    keywords: ['rating', 'hour', 'insufficient'],
  },
  {
    id: 'ls_gypsum_not_taped',
    category: 'Life Safety',
    detail: 'Gypsum wall joint(s) not taped/mudded.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Open gypsum board seams above the ceiling on a rated wall. Fire-rated assemblies generally require joints to be taped and finished (or treated per the listing).',
    codeRef: 'Finish per the listed assembly',
    zone: 'Inside',
    keywords: ['drywall', 'seam', 'joint compound', 'mud'],
  },
  {
    id: 'ls_scab_patch',
    category: 'Life Safety',
    detail: 'Surface mounted gypsum patch present (scab patch).',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A gypsum piece surface-mounted over a hole ("scab" patch) instead of a proper cut-in, taped, and finished repair. Not an equivalent barrier repair.',
    codeRef: 'Repair to restore the rated assembly',
    zone: 'Inside',
    keywords: ['patch', 'repair', 'surface mount'],
  },
  {
    id: 'ls_sprinkler_bearing_load',
    category: 'Life Safety',
    detail:
      'Fire sprinkler piping or supports bearing weight or attachments from adjacent equipment/components (e.g., HVAC ductwork, piping, low voltage cabling, etc.).',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Anything hung from, resting on, or tied to sprinkler pipe or its hangers — cable bundles, other pipe, ductwork. Nothing may load the sprinkler system.',
    codeRef: 'NFPA 13 — sprinkler piping shall not support non-system loads',
    zone: 'Inside',
    keywords: ['sprinkler pipe', 'hanger', 'cable on pipe', 'load'],
  },
  {
    id: 'ls_ceiling_gap',
    category: 'Life Safety',
    detail: 'Gap(s) in ceiling > 1/8" in sprinklered/smoke detected areas.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Missing/displaced ceiling tiles or gaps over 1/8" in a monolithic ceiling that serves as a membrane for sprinkler or smoke-detection coverage. Gaps let heat/smoke bypass the devices.',
    codeRef: 'NFPA 13 / NFPA 72 ceiling membrane continuity',
    zone: 'Inside',
    keywords: ['missing tile', 'ceiling gap', 'membrane', 'open ceiling'],
  },
  {
    id: 'ls_abhr',
    category: 'Life Safety',
    detail: 'Alcohol based hand rub (ABHR) deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'ABHR dispensers over carpet/ignition sources, too close together, over-capacity for the corridor, or mounted directly over an electrical outlet/switch.',
    codeRef: 'NFPA 101 §18/19.3.2.6 (ABHR dispensers)',
    zone: 'Inside',
    keywords: ['hand sanitizer', 'dispenser', 'sanitizer'],
  },
  {
    id: 'ls_combustible_storage',
    category: 'Life Safety',
    detail: 'Combustible storage deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Combustibles stored above the ceiling, in mechanical/electrical rooms, or within 18" of sprinkler deflectors. Also excessive storage blocking access to systems.',
    codeRef: 'NFPA 13 (18" clearance) / NFPA 101 housekeeping',
    zone: 'Inside',
    keywords: ['storage', 'combustible', 'clearance', '18 inch'],
  },
  {
    id: 'ls_stenciling_end_of_wall',
    category: 'Life Safety',
    detail: "Stenciling not present within 15' of the end of the wall.",
    defaultPriority: 'Priority 3',
    whatToLookFor:
      "Rated-wall identification stenciling (e.g., \"2 HR FIRE BARRIER\") missing near where the wall terminates. Required within 15' of each end.",
    codeRef: 'NFPA 101 §8.3.6 (fire barrier marking)',
    zone: 'Inside',
    keywords: ['stencil', 'wall marking', 'identification'],
  },
  {
    id: 'ls_stenciling_intervals',
    category: 'Life Safety',
    detail: "Stenciling not present within appropriate intervals (≤30').",
    defaultPriority: 'Priority 3',
    whatToLookFor:
      "Rated-wall stenciling spaced more than 30' apart along the barrier. Marking must repeat at intervals not exceeding 30'.",
    codeRef: 'NFPA 101 §8.3.6 (fire barrier marking)',
    zone: 'Inside',
    keywords: ['stencil', 'interval', '30 feet', 'spacing'],
  },
  {
    id: 'ls_stenciling_inaccuracy',
    category: 'Life Safety',
    detail: 'Wall stenciling inaccuracy.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Stenciling that states the wrong rating or barrier type versus the life-safety drawing (e.g., labeled "smoke" where the plan shows a fire barrier).',
    codeRef: 'NFPA 101 §8.3.6',
    zone: 'Inside',
    keywords: ['stencil wrong', 'mislabeled', 'rating mismatch'],
  },
  {
    id: 'ls_drawing_inaccuracy',
    category: 'Life Safety',
    detail: 'Life safety drawing inaccuracy.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Field conditions that do not match the life-safety plan — a barrier present in the field but not on the drawing, or vice versa. Note so the drawing can be corrected.',
    codeRef: 'Maintain accurate life-safety drawings (CMS / TJC)',
    zone: 'Inside',
    keywords: ['drawing', 'plan mismatch', 'as-built'],
  },

  // ── Opening Protectives (doors/frames encountered on the tour) ────────────
  {
    id: 'op_positive_latch',
    category: 'Opening Protectives',
    detail: 'Door fails to achieve positive latch.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A rated door that does not latch fully when released — latch bolt fails to engage the strike. The door must positively latch to hold against fire/smoke.',
    codeRef: 'NFPA 80 / NFPA 105',
    zone: 'Inside',
    keywords: ['latch', 'does not latch', 'strike'],
  },
  {
    id: 'op_self_close',
    category: 'Opening Protectives',
    detail: 'Door fails to self-close.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Rated door does not close and latch on its own from any open position — closer disconnected, adjusted too weak, or obstructed. Includes doors propped/held open without a released hold-open.',
    codeRef: 'NFPA 80 / NFPA 101 §7.2.1',
    zone: 'Inside',
    keywords: ['closer', 'self closing', 'propped', 'hold open'],
  },
  {
    id: 'op_label_illegible',
    category: 'Opening Protectives',
    detail: 'Door or frame label illegible.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'The fire-rating label on the door edge or frame is painted over, damaged, or missing so the rating cannot be verified.',
    codeRef: 'NFPA 80 (labeled fire door assemblies)',
    zone: 'Inside',
    keywords: ['label', 'painted', 'rating tag', 'illegible'],
  },
  {
    id: 'op_underrated',
    category: 'Opening Protectives',
    detail: 'Door/hardware underrated for assembly type.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Door leaf or hardware carries a lower rating than the barrier requires (e.g., a 20-minute door in a wall needing 90-minute).',
    codeRef: 'NFPA 80 / NFPA 101 opening protective ratings',
    zone: 'Inside',
    keywords: ['underrated door', 'hardware rating'],
  },
  {
    id: 'op_gap',
    category: 'Opening Protectives',
    detail: 'Door gap deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Clearance around the door out of tolerance — commonly the undercut, meeting edge, or perimeter gap exceeding allowed limits for the assembly.',
    codeRef: 'NFPA 80 clearance limits',
    zone: 'Inside',
    keywords: ['gap', 'clearance', 'undercut', 'meeting edge'],
  },
  {
    id: 'op_physical_damage',
    category: 'Opening Protectives',
    detail: 'Excessive physical damage.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Rated door or frame with holes, dents, or field modifications that compromise the assembly (e.g., a hole from removed hardware left open).',
    codeRef: 'NFPA 80 (holes/field modifications)',
    zone: 'Inside',
    keywords: ['damage', 'hole in door', 'dent'],
  },

  // ── Means of Egress ──────────────────────────────────────────────────────
  {
    id: 'moe_improper_locking',
    category: 'Means of Egress',
    detail: 'Improper locking arrangement.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'A lock in the path of egress that would trap occupants — keyed deadbolt, thumb-turn requiring a key, or an unlisted electric lock without a compliant release.',
    codeRef: 'NFPA 101 §7.2.1.5 / §7.2.1.6',
    zone: 'Inside',
    keywords: ['lock', 'deadbolt', 'egress lock', 'thumb turn'],
  },
  {
    id: 'moe_push_button_missing',
    category: 'Means of Egress',
    detail: 'Push to exit button not provided.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Access-controlled egress door missing the required "push to exit" release button that unlocks it on demand.',
    codeRef: 'NFPA 101 §7.2.1.6.2 (access-controlled egress)',
    zone: 'Inside',
    keywords: ['push to exit', 'release button', 'access control'],
  },
  {
    id: 'moe_push_button_deficiency',
    category: 'Means of Egress',
    detail: 'Push to exit button deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Push-to-exit button present but not working, mislocated, or not releasing the lock reliably.',
    codeRef: 'NFPA 101 §7.2.1.6.2',
    zone: 'Inside',
    keywords: ['push to exit', 'button broken'],
  },
  {
    id: 'moe_motion_sensor_missing',
    category: 'Means of Egress',
    detail: 'Motion sensor not provided.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Access-controlled egress door lacking the required motion/request-to-exit sensor that unlocks the door on approach.',
    codeRef: 'NFPA 101 §7.2.1.6.2 (sensor release)',
    zone: 'Inside',
    keywords: ['motion sensor', 'request to exit', 'REX'],
  },
  {
    id: 'moe_motion_sensor_deficiency',
    category: 'Means of Egress',
    detail: 'Motion sensor deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Egress motion/REX sensor present but not detecting approach or not releasing the lock as required.',
    codeRef: 'NFPA 101 §7.2.1.6.2',
    zone: 'Inside',
    keywords: ['motion sensor', 'REX', 'not releasing'],
  },
  {
    id: 'moe_remote_release_missing',
    category: 'Means of Egress',
    detail: 'Remote control of locks not provided (e.g., emergency door release).',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Clinical-needs or special locking arrangement without the required remote/emergency release at a staffed location to unlock the doors.',
    codeRef: 'NFPA 101 special/clinical-needs locking',
    zone: 'Inside',
    keywords: ['remote release', 'emergency release', 'staff unlock'],
  },
  {
    id: 'moe_delayed_egress_signage',
    category: 'Means of Egress',
    detail: 'Delayed egress signage not provided.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A delayed-egress door missing the required instructional signage telling occupants to push and hold to exit.',
    codeRef: 'NFPA 101 §7.2.1.6.1 (delayed egress signage)',
    zone: 'Inside',
    keywords: ['delayed egress sign', 'push until alarm'],
  },
  {
    id: 'moe_delayed_egress_unsprinklered',
    category: 'Means of Egress',
    detail: 'Delayed egress present in unsprinklered building.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Delayed-egress locking installed where it is not permitted — the building lacks the sprinkler or detection system that delayed egress requires.',
    codeRef: 'NFPA 101 §7.2.1.6.1 (requires sprinklers/detection)',
    zone: 'Inside',
    keywords: ['delayed egress', 'not sprinklered'],
  },
  {
    id: 'moe_delayed_egress_failure',
    category: 'Means of Egress',
    detail: 'Delayed egress failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Delayed-egress hardware not releasing within the allowed time (15/30 seconds), not releasing on alarm or power loss, or otherwise failing to let occupants out.',
    codeRef: 'NFPA 101 §7.2.1.6.1',
    zone: 'Inside',
    keywords: ['delayed egress', 'not releasing', 'timer'],
  },
  {
    id: 'moe_emergency_release_unlabeled',
    category: 'Means of Egress',
    detail: 'Emergency door release not labeled.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Emergency/remote door-release control present but not clearly labeled so staff can find and use it.',
    codeRef: 'NFPA 101 (identification of controls)',
    zone: 'Inside',
    keywords: ['release label', 'unlabeled release'],
  },
  {
    id: 'moe_wall_projection',
    category: 'Means of Egress',
    detail: 'Wall projection in excess of 6".',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Objects projecting more than 4"/6" into the egress path between 27" and 80" above the floor (fire extinguisher cabinets, monitors, fixtures) creating a head-strike/obstruction hazard.',
    codeRef: 'NFPA 101 §7.2.1 / protruding objects',
    zone: 'Inside',
    keywords: ['projection', 'protruding object', 'corridor obstruction'],
  },
  {
    id: 'moe_clear_width_height',
    category: 'Means of Egress',
    detail: 'Clear width or height deficiency.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Egress path or door opening narrower/lower than required clear width or headroom, or permanently obstructed so required width is lost.',
    codeRef: 'NFPA 101 Ch. 7 (clear width / headroom)',
    zone: 'Inside',
    keywords: ['clear width', 'headroom', 'narrow', 'obstruction'],
  },
  {
    id: 'moe_battery_egress_light',
    category: 'Means of Egress',
    detail: 'Battery powered egress light deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Emergency/egress battery light not illuminating on test, dead battery, or missing where the egress path requires emergency lighting.',
    codeRef: 'NFPA 101 §7.9 (emergency lighting)',
    zone: 'Inside',
    keywords: ['emergency light', 'egress light', 'battery light', 'bug eye'],
  },
  {
    id: 'moe_exit_signage',
    category: 'Means of Egress',
    detail: 'Exit signage deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Exit sign missing, not illuminated, pointing the wrong way, or a "No Exit" needed on a door that could be mistaken for an exit.',
    codeRef: 'NFPA 101 §7.10 (marking of means of egress)',
    zone: 'Inside',
    keywords: ['exit sign', 'no exit', 'not illuminated'],
  },

  // ── Fire Alarm Systems ───────────────────────────────────────────────────
  {
    id: 'fa_annunciator',
    category: 'Fire Alarm Systems',
    detail: 'Annunciator panel deficiency or failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Fire alarm annunciator (usually near a staffed area) blank, in trouble, or not showing system status/device in alarm.',
    codeRef: 'NFPA 72',
    zone: 'Inside',
    keywords: ['annunciator', 'trouble', 'fire alarm display'],
  },
  {
    id: 'fa_panel',
    category: 'Fire Alarm Systems',
    detail: 'Fire alarm panel deficiency or failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'FACP showing active alarms, troubles, or faults (lights/audible), or otherwise not normal. Note the condition displayed.',
    codeRef: 'NFPA 72',
    zone: 'Inside',
    keywords: ['FACP', 'fire alarm panel', 'trouble', 'fault'],
  },
  {
    id: 'fa_panel_no_smoke',
    category: 'Fire Alarm Systems',
    detail: 'Fire alarm panel not equipped with area smoke detector.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'No smoke detector protecting the FACP location (generally within ~15 feet), unless it sits in a fully detected corridor where it may be omitted.',
    codeRef: 'NFPA 72 (FACP location protection)',
    zone: 'Inside',
    keywords: ['smoke detector', 'panel protection'],
  },
  {
    id: 'fa_panel_breaker_id',
    category: 'Fire Alarm Systems',
    detail: 'Fire alarm panel or circuit breaker improperly identified.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'FACP not labeled with its feeding panel/breaker, or the breaker not marked (red) and identified in the panel directory. Circuit should be on the life-safety branch.',
    codeRef: 'NFPA 72 / NFPA 70',
    zone: 'Inside',
    keywords: ['breaker label', 'panel identification', 'red breaker'],
  },
  {
    id: 'fa_component_failure',
    category: 'Fire Alarm Systems',
    detail: 'Fire alarm system component failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'A specific device not working — smoke/heat detector, horn/strobe, duct detector, module — or physically damaged/disconnected.',
    codeRef: 'NFPA 72',
    zone: 'Inside',
    keywords: ['device failure', 'detector', 'horn strobe', 'duct detector'],
  },
  {
    id: 'fa_obstructed_av',
    category: 'Fire Alarm Systems',
    detail: 'Obstructed audio visual device.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A horn/strobe (notification appliance) blocked, painted, or hidden so its alarm cannot be seen/heard as intended.',
    codeRef: 'NFPA 72 (notification appliance visibility)',
    zone: 'Inside',
    keywords: ['strobe blocked', 'horn obstructed', 'notification appliance'],
  },
  {
    id: 'fa_pull_station_missing',
    category: 'Fire Alarm Systems',
    detail: 'Fire pull station not provided.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Manual pull station missing where required — commonly at an exit that should have one.',
    codeRef: 'NFPA 72 (manual fire alarm boxes)',
    zone: 'Inside',
    keywords: ['pull station', 'manual station', 'missing'],
  },
  {
    id: 'fa_pull_station_obstructed',
    category: 'Fire Alarm Systems',
    detail: 'Obstructed fire pull station.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Manual pull station blocked by equipment/furniture or otherwise not readily accessible.',
    codeRef: 'NFPA 72 (accessibility)',
    zone: 'Inside',
    keywords: ['pull station blocked', 'obstructed'],
  },
  {
    id: 'fa_smoke_near_diffuser',
    category: 'Fire Alarm Systems',
    detail: 'Smoke detector located <36" from HVAC diffuser or grille.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A smoke detector within 36 inches of a supply diffuser/return grille, where airflow can keep smoke from reaching it.',
    codeRef: 'NFPA 72 (spacing from air diffusers)',
    zone: 'Inside',
    keywords: ['smoke detector', 'diffuser', '36 inches', 'grille'],
  },

  // ── Fire Suppression Systems ─────────────────────────────────────────────
  {
    id: 'fs_ext_signage',
    category: 'Fire Suppression Systems',
    detail: 'Fire extinguisher identification signage not provided.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Extinguisher present but no location sign/marking to identify it from a distance.',
    codeRef: 'NFPA 10 (identification/visibility)',
    zone: 'Inside',
    keywords: ['extinguisher sign', 'location marking'],
  },
  {
    id: 'fs_ext_monthly',
    category: 'Fire Suppression Systems',
    detail: 'Fire extinguisher monthly inspection deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Missing or lapsed monthly inspection tag/record, gauge not in the green, or seal/pin missing.',
    codeRef: 'NFPA 10 (monthly inspection)',
    zone: 'Inside',
    keywords: ['extinguisher tag', 'monthly check', 'gauge'],
  },
  {
    id: 'fs_ext_obstructed',
    category: 'Fire Suppression Systems',
    detail: 'Fire extinguisher access obstructed.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Extinguisher blocked, hidden, or not readily reachable.',
    codeRef: 'NFPA 10 (accessibility)',
    zone: 'Inside',
    keywords: ['extinguisher blocked', 'obstructed'],
  },
  {
    id: 'fs_ext_k_type',
    category: 'Fire Suppression Systems',
    detail: 'K-type fire extinguisher not provided within 30 feet of cookline.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Commercial cooking area without a Class K extinguisher within a 30-foot travel distance of the cookline.',
    codeRef: 'NFPA 10 (Class K within 30 ft)',
    zone: 'Inside',
    keywords: ['class K', 'kitchen', 'cookline', 'extinguisher'],
  },
  {
    id: 'fs_ext_mounting',
    category: 'Fire Suppression Systems',
    detail: 'Fire extinguisher improperly mounted.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Extinguisher sitting on the floor, hung too high/low, or not on a proper bracket/cabinet.',
    codeRef: 'NFPA 10 (mounting height)',
    zone: 'Inside',
    keywords: ['extinguisher mount', 'on floor', 'bracket'],
  },
  {
    id: 'fs_escutcheon',
    category: 'Fire Suppression Systems',
    detail: 'Fire sprinkler escutcheon/cover missing or damaged.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Missing or dislodged escutcheon ring/cover plate around a sprinkler head, leaving a gap into the ceiling space around the head.',
    codeRef: 'NFPA 13 / NFPA 25',
    zone: 'Inside',
    keywords: ['escutcheon', 'cover plate', 'sprinkler ring'],
  },
  {
    id: 'fs_sprinkler_loaded',
    category: 'Fire Suppression Systems',
    detail: 'Fire sprinkler head painted, or loaded with dust/debris.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Sprinkler heads painted over or heavily coated with dust/lint/grease, which delays or prevents operation. Also corrosion.',
    codeRef: 'NFPA 25 (sprinkler condition)',
    zone: 'Inside',
    keywords: ['painted head', 'dust', 'loaded sprinkler', 'corroded'],
  },
  {
    id: 'fs_component_failure',
    category: 'Fire Suppression Systems',
    detail: 'Fire suppression system component failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'A suppression component not working or compromised — leaking/corroded pipe, missing head, closed control valve, damaged hood system, etc.',
    codeRef: 'NFPA 13 / NFPA 25 / NFPA 96 (hoods)',
    zone: 'Inside',
    keywords: ['suppression failure', 'leak', 'valve closed', 'missing head'],
  },

  // ── Utilities ────────────────────────────────────────────────────────────
  {
    id: 'util_exposed_electrical',
    category: 'Utilities',
    detail: 'Exposed electrical connections.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Open/live conductors, wire nuts outside a box, or splices in free air above the ceiling. All connections must be made inside an approved enclosure.',
    codeRef: 'NFPA 70 (NEC) — connections in an enclosure',
    zone: 'Inside',
    keywords: ['exposed wire', 'open splice', 'wire nut', 'live'],
  },
  {
    id: 'util_junction_box_open',
    category: 'Utilities',
    detail: 'Uncovered electrical junction box or panel.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Junction box or panel above/below the ceiling missing its cover/blank, leaving conductors exposed.',
    codeRef: 'NFPA 70 (NEC 314/408 — covers required)',
    zone: 'Inside',
    keywords: ['junction box', 'missing cover', 'open panel', 'blank'],
  },
  {
    id: 'util_medgas_label_room',
    category: 'Utilities',
    detail: 'Medical gas line(s) not labeled inside the room.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Med-gas piping in a room with no gas-type labeling. Each gas line must be identified.',
    codeRef: 'NFPA 99 (piping identification)',
    zone: 'Inside',
    keywords: ['med gas label', 'pipe label', 'oxygen line'],
  },
  {
    id: 'util_medgas_label_intervals',
    category: 'Utilities',
    detail: "Medical gas line(s) not labeled within appropriate intervals (≤20').",
    defaultPriority: 'Priority 3',
    whatToLookFor:
      "Med-gas pipe labeling spaced more than 20' apart. Labels must repeat at intervals and at each wall/partition passage.",
    codeRef: 'NFPA 99 (identification intervals)',
    zone: 'Inside',
    keywords: ['med gas label', 'interval', '20 feet'],
  },
  {
    id: 'util_system_failure',
    category: 'Utilities',
    detail: 'Utilities system/component deficiency or failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A building utility system component not functioning as intended — general catch-all when a more specific finding does not fit.',
    zone: 'Inside',
    keywords: ['utility failure', 'system deficiency'],
  },
  {
    id: 'util_equipment_failure',
    category: 'Utilities',
    detail: 'Utilities equipment deficiency/failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'A specific utility equipment item damaged or not operating (pump, fan, controller, etc.).',
    zone: 'Inside',
    keywords: ['equipment failure', 'utility equipment'],
  },
  {
    id: 'util_unlabeled_controls',
    category: 'Utilities',
    detail: 'Unlabeled utility system controls (e.g. valves, disconnects, etc.).',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Valves, disconnects, or main controls not labeled as to what they serve — needed to shut systems down quickly.',
    codeRef: 'NFPA 70 / general labeling',
    zone: 'Inside',
    keywords: ['valve label', 'disconnect', 'unlabeled control'],
  },
  {
    id: 'util_pressure_high_risk',
    category: 'Utilities',
    detail: 'Inappropriate pressure relationship (high-risk).',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Air flowing the wrong way in a high-risk space — e.g., an OR/sterile space not positive, or an airborne-isolation room not negative. Verify against the room monitor/design mode.',
    codeRef: 'ASHRAE 170 / FGI Guidelines',
    zone: 'Inside',
    keywords: ['pressure', 'positive', 'negative', 'OR', 'isolation'],
  },
  {
    id: 'util_pressure_low_risk',
    category: 'Utilities',
    detail: 'Inappropriate pressure relationship (low-risk).',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Wrong pressure relationship in a lower-risk space (soiled/clean utility, toilet, etc.) versus its required direction.',
    codeRef: 'ASHRAE 170 / FGI Guidelines',
    zone: 'Inside',
    keywords: ['pressure', 'clean', 'soiled', 'relationship'],
  },
  {
    id: 'util_pressure_monitor',
    category: 'Utilities',
    detail: 'Air pressure monitoring equipment deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Room pressure monitor missing, not reading, showing no visual alarm on out-of-range, or set for the wrong mode.',
    codeRef: 'ASHRAE 170 / FGI (pressure monitoring)',
    zone: 'Inside',
    keywords: ['pressure monitor', 'magnehelic', 'no reading', 'alarm'],
  },
  {
    id: 'util_temp_humidity',
    category: 'Utilities',
    detail: 'Temperature and humidity deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'OR/sterile spaces outside range — temperature 68-73°F, relative humidity 30-60%. Check thermostats/monitors.',
    codeRef: 'ASHRAE 170 / FGI (temp & RH)',
    zone: 'Inside',
    keywords: ['temperature', 'humidity', 'RH', 'thermostat'],
  },
  {
    id: 'util_pm',
    category: 'Utilities',
    detail: 'Preventive maintenance deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Utility equipment missing its PM label/record or overdue for scheduled maintenance/testing.',
    zone: 'Inside',
    keywords: ['PM', 'preventive maintenance', 'overdue'],
  },
  {
    id: 'util_task_light',
    category: 'Utilities',
    detail: 'Battery powered task lighting deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Battery task light (e.g., at electrical/generator equipment) not working, missing, or lacking an asset tag for testing.',
    codeRef: 'NFPA 110 / NFPA 111 (equipment task lighting)',
    zone: 'Inside',
    keywords: ['task light', 'battery light', 'equipment lighting'],
  },
  {
    id: 'util_panel_access',
    category: 'Utilities',
    detail: 'Electrical panel or disconnect access obstructed.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Storage or equipment blocking the required working clearance (typically 36") in front of an electrical panel or disconnect.',
    codeRef: 'NFPA 70 (NEC 110.26 working clearance)',
    zone: 'Inside',
    keywords: ['panel clearance', 'blocked panel', '36 inches', 'disconnect'],
  },
  {
    id: 'util_grounding',
    category: 'Utilities',
    detail: 'Equipment or building grounding deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Missing or disconnected bonding/grounding on equipment, raceway, or building steel.',
    codeRef: 'NFPA 70 (NEC Art. 250)',
    zone: 'Inside',
    keywords: ['ground', 'bonding', 'grounding'],
  },
  {
    id: 'util_spare_breakers',
    category: 'Utilities',
    detail: 'Spare breakers in use.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Breakers marked "spare" or blank in the directory that are actually energized/serving a load — the directory does not reflect reality.',
    codeRef: 'NFPA 70 (NEC 408.4 circuit identification)',
    zone: 'Inside',
    keywords: ['spare breaker', 'directory', 'unlabeled circuit'],
  },
  {
    id: 'util_panel_directory',
    category: 'Utilities',
    detail: 'Electrical panel directory missing or deficient.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Panel with no directory, illegible, or not accurately identifying each circuit (including line-isolation monitor panels in ORs).',
    codeRef: 'NFPA 70 (NEC 408.4)',
    zone: 'Inside',
    keywords: ['directory', 'panel schedule', 'circuit labels'],
  },
  {
    id: 'util_electrical_equipment',
    category: 'Utilities',
    detail: 'Electrical equipment deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Damaged faceplate/receptacle, missing tamper-resistant or GFCI protection where required (e.g., within 6′ of a water source), or other electrical device fault.',
    codeRef: 'NFPA 70 (NEC — GFCI/tamper-resistant)',
    zone: 'Inside',
    keywords: ['receptacle', 'GFCI', 'faceplate', 'tamper resistant'],
  },
  {
    id: 'util_ice_machine',
    category: 'Utilities',
    detail: 'Ice/beverage machine improperly maintained.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Ice/beverage machine without a water filter or lacking an air gap on the drain line to the building drain (backflow risk).',
    codeRef: 'Plumbing code (air gap) / infection control',
    zone: 'Inside',
    keywords: ['ice machine', 'air gap', 'drain', 'filter'],
  },

  // ── Emergency Generator ──────────────────────────────────────────────────
  {
    id: 'gen_annunciator',
    category: 'Emergency Generator',
    detail: 'Annunciator panel deficiency or failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Generator remote annunciator (often near the fire alarm annunciator) blank, in trouble, or showing an active alarm.',
    codeRef: 'NFPA 110 (remote annunciator)',
    zone: 'Outside',
    keywords: ['generator annunciator', 'trouble'],
  },
  {
    id: 'gen_epo_label',
    category: 'Emergency Generator',
    detail: 'Emergency power off switch (EPO) labeling deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Generator shutdown (EPO) present but not clearly labeled (e.g., "Emergency Generator Shut-Off").',
    codeRef: 'NFPA 110 (labeling of controls)',
    zone: 'Outside',
    keywords: ['EPO', 'shutdown label', 'generator stop'],
  },
  {
    id: 'gen_epo_location',
    category: 'Emergency Generator',
    detail: 'Emergency power off switch (EPO) improperly located.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'EPO mounted on or inside the generator enclosure/housing itself rather than at a remote/approved location.',
    codeRef: 'NFPA 110 (remote shutdown location)',
    zone: 'Outside',
    keywords: ['EPO location', 'remote stop'],
  },
  {
    id: 'gen_epo_missing',
    category: 'Emergency Generator',
    detail: 'Emergency power off switch (EPO) not provided.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'No remote emergency shutdown for the generator provided at all.',
    codeRef: 'NFPA 110 (remote manual stop required)',
    zone: 'Outside',
    keywords: ['EPO missing', 'no shutdown'],
  },
  {
    id: 'gen_equipment_failure',
    category: 'Emergency Generator',
    detail: 'Equipment failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Generator or supporting equipment not functional — leaks, active fault, damaged components, or fails to run/transfer.',
    codeRef: 'NFPA 110',
    zone: 'Outside',
    keywords: ['generator failure', 'leak', 'fault'],
  },
  {
    id: 'gen_not_secured',
    category: 'Emergency Generator',
    detail: 'Equipment not secured to mounting pad.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Generator and/or belly fuel tank not bolted/anchored to its concrete pad or platform.',
    codeRef: 'NFPA 110 / seismic anchorage',
    zone: 'Outside',
    keywords: ['anchorage', 'not bolted', 'belly tank', 'pad'],
  },
  {
    id: 'gen_ats',
    category: 'Emergency Generator',
    detail: 'Automatic transfer switch (ATS) deficiency or failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'ATS in a fault/trouble state, not transferring, or physically damaged. It is what moves load to the generator on a power loss.',
    codeRef: 'NFPA 110 (transfer equipment)',
    zone: 'Outside',
    keywords: ['ATS', 'transfer switch'],
  },
  {
    id: 'gen_fuel_placard',
    category: 'Emergency Generator',
    detail: 'Fuel hazard placard not provided.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Fuel tank/enclosure missing the hazard placard (for #2 diesel) on the tank and/or fence.',
    codeRef: 'NFPA 704 / fire code marking',
    zone: 'Outside',
    keywords: ['placard', 'diesel', 'fuel hazard', 'NFPA 704'],
  },
  {
    id: 'gen_enclosure_unsecured',
    category: 'Emergency Generator',
    detail: 'Outdoor enclosure unsecured.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Generator fence/enclosure or its access panels not secured (missing lock or hasp). For pre-occupancy, a hasp/means to secure is enough.',
    codeRef: 'Physical security / fire code',
    zone: 'Outside',
    keywords: ['fence', 'unlocked', 'enclosure', 'access panel'],
  },
  {
    id: 'gen_housekeeping',
    category: 'Emergency Generator',
    detail: 'Poor housekeeping inside generator room/enclosure.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Combustibles, storage, or clutter inside the generator room/enclosure.',
    codeRef: 'NFPA 110 / housekeeping',
    zone: 'Outside',
    keywords: ['housekeeping', 'storage', 'clutter'],
  },
  {
    id: 'gen_battery',
    category: 'Emergency Generator',
    detail: 'Battery deficiency or failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Start battery past service life (replace every ~24-30 months), corroded, low, or failing. If not maintenance-free (has fill caps), an eyewash must be within ~10 seconds/100′.',
    codeRef: 'NFPA 110 (starting batteries)',
    zone: 'Outside',
    keywords: ['start battery', 'battery date', 'corrosion'],
  },

  // ── Medical Gases ────────────────────────────────────────────────────────
  {
    id: 'mg_alarm_failure',
    category: 'Medical Gases',
    detail: 'Medical gas alarm/equipment failure.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'Master or area med-gas alarm not reporting on test, in fault, or a med-gas source/equipment item not functioning. Master alarms should be ~80 dBA at 3 feet and clear of faults.',
    codeRef: 'NFPA 99 (medical gas alarms)',
    zone: 'Inside',
    keywords: ['med gas alarm', 'master alarm', 'area alarm', 'fault'],
  },
  {
    id: 'mg_labeling',
    category: 'Medical Gases',
    detail: 'Medical gas labeling or signage deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Source valve/zone valve not labeled with gas type and "source valve" wording; manifold room door signage missing (asphyxiant ventilation warning where applicable).',
    codeRef: 'NFPA 99 (identification & signage)',
    zone: 'Inside',
    keywords: ['med gas label', 'source valve', 'signage'],
  },
  {
    id: 'mg_zone_valve_obstructed',
    category: 'Medical Gases',
    detail: 'Medical gas zone shut-off valve obstructed.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Zone shut-off valve blocked or hard to reach. It must be located outside the room it serves and readily operable in an emergency.',
    codeRef: 'NFPA 99 (zone valve access/location)',
    zone: 'Inside',
    keywords: ['zone valve', 'shut off', 'obstructed'],
  },
  {
    id: 'mg_tank_securement',
    category: 'Medical Gases',
    detail: 'Medical gas tank securement deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Cylinders not chained/secured against tipping. Ganged chaining is acceptable if taut and it prevents tipping.',
    codeRef: 'NFPA 99 (cylinder securement)',
    zone: 'Inside',
    keywords: ['cylinder', 'chain', 'tank securement', 'tipping'],
  },
  {
    id: 'mg_tank_separation',
    category: 'Medical Gases',
    detail: 'Medical gas tank separation or clearance deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Full and empty cylinders not segregated/labeled, or required separation of oxidizers from combustibles/clearances not maintained in the storage room.',
    codeRef: 'NFPA 99 (storage — full/empty segregation)',
    zone: 'Inside',
    keywords: ['empty tanks', 'segregation', 'separation', 'oxidizer'],
  },
  {
    id: 'mg_ventilation',
    category: 'Medical Gases',
    detail: 'Medical gas ventilation deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Manifold/storage room ventilation not meeting requirements — natural openings (high & low, on an exterior wall, ≥72 in² each) or mechanical exhaust near the floor with make-up air.',
    codeRef: 'NFPA 99 (source room ventilation)',
    zone: 'Inside',
    keywords: ['ventilation', 'manifold room', 'louver', 'exhaust'],
  },

  // ── Medical Equipment ────────────────────────────────────────────────────
  {
    id: 'me_equipment_failure',
    category: 'Medical Equipment',
    detail: 'Equipment deficiency or failure.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Medical equipment damaged, not functioning, or with an obvious safety issue observed on the tour.',
    codeRef: 'NFPA 99 (medical equipment)',
    zone: 'Inside',
    keywords: ['medical equipment', 'device failure'],
  },
  {
    id: 'me_pm',
    category: 'Medical Equipment',
    detail: 'Preventive maintenance deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Medical equipment overdue for PM or missing its inspection/biomed tag.',
    codeRef: 'NFPA 99 / biomed PM program',
    zone: 'Inside',
    keywords: ['PM tag', 'biomed', 'overdue'],
  },

  // ── Hazardous Materials ──────────────────────────────────────────────────
  {
    id: 'haz_eyewash_deficiency',
    category: 'Hazardous Materials',
    detail: 'Eyewash/shower equipment deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Eyewash not delivering tepid (60-100°F) flushing fluid, clogged nozzles, missing caps, or a spray pattern that fails ANSI. Test by activating.',
    codeRef: 'ANSI/ISEA Z358.1',
    zone: 'Inside',
    keywords: ['eyewash', 'shower', 'tepid', 'nozzle', 'ANSI'],
  },
  {
    id: 'haz_eyewash_missing',
    category: 'Hazardous Materials',
    detail: 'Eyewash/shower equipment not provided.',
    defaultPriority: 'Priority 1',
    whatToLookFor:
      'No plumbed eyewash where a corrosive/injurious chemical hazard exists (e.g., decontam). Bottled personal wash does not satisfy the requirement.',
    codeRef: 'ANSI/ISEA Z358.1 / OSHA 1910.151',
    zone: 'Inside',
    keywords: ['eyewash missing', 'decontam', 'no eyewash'],
  },
  {
    id: 'haz_eyewash_obstructed',
    category: 'Hazardous Materials',
    detail: 'Eyewash/shower equipment obstructed.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Eyewash blocked or the path to it obstructed (must be reachable within ~10 seconds/100′, unobstructed, with no locked doors between hazard and eyewash).',
    codeRef: 'ANSI/ISEA Z358.1 (unobstructed path)',
    zone: 'Inside',
    keywords: ['eyewash blocked', 'path obstructed'],
  },
  {
    id: 'haz_eyewash_signage',
    category: 'Hazardous Materials',
    detail: 'Eyewash/shower equipment signage not provided.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'No highly-visible sign identifying the eyewash/shower location.',
    codeRef: 'ANSI/ISEA Z358.1 (signage)',
    zone: 'Inside',
    keywords: ['eyewash sign', 'signage'],
  },
  {
    id: 'haz_eyewash_weekly',
    category: 'Hazardous Materials',
    detail: 'Eyewash/shower equipment weekly inspection deficiency.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Missing/lapsed weekly activation record. Plumbed eyewash must be flushed weekly until clear and documented.',
    codeRef: 'ANSI/ISEA Z358.1 (weekly activation)',
    zone: 'Inside',
    keywords: ['eyewash weekly', 'inspection tag', 'flush record'],
  },
  {
    id: 'haz_material_labeling',
    category: 'Hazardous Materials',
    detail: 'Hazardous material or waste not labeling deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Hazardous material/waste container unlabeled or mislabeled, secondary containers not marked, or hazardous-waste accumulation not properly identified/dated.',
    codeRef: 'OSHA HazCom / EPA / RCRA labeling',
    zone: 'Inside',
    keywords: ['hazmat label', 'secondary container', 'waste label'],
  },
  {
    id: 'haz_ppe_spill_kit',
    category: 'Hazardous Materials',
    detail: 'PPE or spill cleanup kit not provided or maintained.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Required PPE or a spill kit missing, incomplete, or expired where hazardous materials are handled/stored.',
    codeRef: 'OSHA / spill response plan',
    zone: 'Inside',
    keywords: ['spill kit', 'PPE', 'cleanup'],
  },

  // ── Medications Management ───────────────────────────────────────────────
  {
    id: 'med_unsecured',
    category: 'Medications Management',
    detail: 'Unsecured Medications.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Medications (including sample meds/IV fluids where applicable) left accessible/unlocked in an unattended area open to the public or unauthorized staff.',
    codeRef: 'CMS / TJC medication security',
    zone: 'Inside',
    keywords: ['medication', 'unlocked', 'unsecured meds'],
  },

  // ── Safety ───────────────────────────────────────────────────────────────
  {
    id: 'safe_flooring_wall',
    category: 'Safety',
    detail: 'Damaged flooring or wall finishes.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Torn/lifting flooring, trip hazards, or damaged wall finishes that create a safety or infection-control issue.',
    zone: 'Inside',
    keywords: ['flooring', 'trip hazard', 'wall finish', 'damage'],
  },
  {
    id: 'safe_laminate',
    category: 'Safety',
    detail: 'Damaged laminate or other solid surface.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Chipped/delaminated countertops, casework, or solid surfaces that can no longer be properly cleaned/disinfected.',
    zone: 'Inside',
    keywords: ['laminate', 'countertop', 'casework', 'solid surface'],
  },
  {
    id: 'safe_ceiling_tile',
    category: 'Safety',
    detail: 'Damaged or stained ceiling tile.',
    defaultPriority: 'Priority 3',
    whatToLookFor:
      'Water-stained, sagging, broken, or missing ceiling tiles — a sign of a leak above and an infection-control/aesthetic issue.',
    zone: 'Inside',
    keywords: ['ceiling tile', 'water stain', 'sagging', 'missing tile'],
  },
  {
    id: 'safe_nurse_call',
    category: 'Safety',
    detail: 'Nurse call or emergency call station deficiency.',
    defaultPriority: 'Priority 2',
    whatToLookFor:
      'Nurse-call or bathroom emergency pull cord not reporting (no dome light/audible), cord not reachable from the floor (should hang ~4-6" off the floor), wrapped up, or non-washable.',
    codeRef: 'FGI Guidelines / UL 1069 (nurse call)',
    zone: 'Inside',
    keywords: ['nurse call', 'pull cord', 'emergency call', 'dome light'],
  },
];

// ─── Selectors (pure) ────────────────────────────────────────────────────────

export function findingsByCategory(cat: CeilingCategory): CeilingFinding[] {
  return CEILING_FINDINGS.filter((f) => f.category === cat);
}

export function findingsByZone(zone: CeilingZone): CeilingFinding[] {
  return CEILING_FINDINGS.filter((f) => f.zone === zone);
}

export function getFinding(id: string): CeilingFinding | undefined {
  return CEILING_FINDINGS.find((f) => f.id === id);
}

/** Case-insensitive search across category, detail, and keywords. */
export function searchFindings(query: string): CeilingFinding[] {
  const q = query.trim().toLowerCase();
  if (!q) return CEILING_FINDINGS;
  const terms = q.split(/\s+/);
  return CEILING_FINDINGS.filter((f) => {
    const hay = `${f.category} ${f.detail} ${(f.keywords || []).join(' ')}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
