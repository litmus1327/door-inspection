export type DoorStatus = 'not_inspected' | 'pass' | 'fail' | 'inaccessible';

// Interactive door-diagram zones. Each maps to checklist item IDs in
// client/src/lib/doorZones.ts. See INTERACTIVE_DOOR_DIAGRAM_SPEC.md.
export type Zone =
  | 'head_gap'
  | 'hinge_stile'
  | 'latch_stile'
  | 'sill_gap'
  | 'meeting_stile'
  | 'leaf_face'
  | 'frame'
  | 'closer'
  | 'latch_hw'
  | 'panic_hw'
  | 'vision_panel';

// Result state of a diagram zone, derived from its checklist items.
export type ZoneState = 'untouched' | 'pass' | 'advisory' | 'deficient';

export interface DoorScheduleEntry {
  assetId: string | null;
  iconNo: string;
  floorNo: string;
  gridBlock: string;
  assemblyType: string;
  doorRating: string;
  project: string;
  noAssetId?: boolean;
  hwState?: Record<string, boolean>;
}

export interface DoorPin {
  id: string;
  x: number;
  y: number;
  iconNo: string;
  assetId: string | null;
  status: DoorStatus;
  projectName: string;
  pageNumber?: number; // Which page/floor this pin is on
  gridBlock?: string; // Grid block (e.g., 'A1', 'B3', 'E5')
  owner?: string; // Inspector who placed the pin (for multi-inspector presence)
  assemblyType?: string; // Auto-detected assembly-type key (see inspectionRules.ts). Blank = pick manually.
  assemblyAuto?: boolean; // true when assemblyType came from wall-color auto-detect (vs manual)
  assemblyLowConfidence?: boolean; // true when the auto-detect was a weak/ambiguous match — prompt the inspector to confirm
}

export interface InspectionDeficiency {
  id: string;
  status: 'deficient' | 'advisory' | 'pass' | 'compliant';
  text?: string;
  category?: string;
  note?: string;
  branchAnswers?: Record<string, string>;
}

export interface DoorInspection {
  id: string;
  pinId?: string;            // the DoorPin this record inspects (set when a pin exists)
  inspectionType?: 'fire_smoke_doors'; // absent on legacy rows; door service line
  inspectionYear?: number;   // annual cycle; see lib/inspectionYear.ts
  iconNo: string;
  assetId: string | null;
  floorNo: string;
  gridBlock: string;
  assemblyType: string;
  doorRating: string;
  inspectorName: string;
  projectName: string;
  completedTime: string;
  overallStatus: 'pass' | 'fail' | 'conditional' | 'inaccessible';
  deficiencies: InspectionDeficiency[];
  findings: Record<string, any>;
  reviewedSections?: string[]; // sections the inspector explicitly cleared
  additionalComments?: string;
  postInspectionStatus?: string;
  synced: boolean;
  photos?: string[]; // URLs to photos in Supabase Storage
}

export interface ProjectVars {
  construction: 'existing' | 'new';
  gapStandard: 'codify' | 'nfpa80' | 'preoccupancy' | 'surveyreadiness';
  sprinklered: boolean;
}

// Fire & Smoke Damper inspection record. Shares the `door_inspections` table and
// `doorInspections` localStorage key (discriminated by inspectionType), like the
// ceiling record. One record per pin (id = `dinsp_<pinId>_<year>`).
export interface DamperInspection {
  id: string;
  pinId?: string;
  inspectionType: 'fire_smoke_damper';
  inspectionYear?: number;   // annual cycle; see lib/inspectionYear.ts
  iconNo: string;
  floorNo: string;
  gridBlock: string;
  x?: number; // pin position (0-100 % of page) -> CSV X pos (%)
  y?: number;
  category: string;          // 'Fire' | 'Smoke' | 'Combination'
  status: 'pass' | 'fail' | 'inaccessible';
  deficiencies: string[];    // flat sentences from DAMPER_DEFICIENCIES -> Checklist "Yes:" cells
  noDamperPresent?: boolean; // -> Fieldwire "No Damper Present" column
  assetId?: string;
  inspectorName: string;
  projectName: string;
  completedTime: string;
  additionalComments?: string;
  photos?: string[];         // URLs or offline data: URLs
  synced: boolean;
}

// Above & Below Ceiling inspection record. Stored in the SAME localStorage key
// ('doorInspections') and Supabase table ('door_inspections') as door records —
// scoped apart by projectName and discriminated by inspectionType — so the
// existing sync/photo-flush path (lib/sync.ts) carries it unchanged. One record
// per pin (id = `cinsp_<pinId>`) so re-inspecting a pin upserts, not duplicates.
export interface CeilingInspection {
  id: string;
  pinId?: string;
  inspectionType: 'above_below_ceiling';
  inspectionYear?: number;   // annual cycle; see lib/inspectionYear.ts
  iconNo: string;
  floorNo: string;
  gridBlock: string;
  x?: number; // pin position (0-100 % of page) -> CSV X pos (%)
  y?: number; // pin position (0-100 % of page) -> CSV Y pos (%)
  findingId: string;      // CeilingFinding.id
  category: string;       // CeilingFinding.category -> CSV Category column + checklist prefix
  finding: string;        // CeilingFinding.detail -> checklist "Yes: <category>: <detail>"
  priority: string;       // 'Priority 1' | 'Priority 2' | 'Priority 3' -> CSV Status column
  inspectorName: string;
  projectName: string;
  completedTime: string;  // ISO; date part stamps the checklist finding tail
  additionalComments?: string;
  photos?: string[];      // URLs or offline data: URLs (same as door records)
  synced: boolean;
}
