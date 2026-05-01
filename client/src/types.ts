export type DoorStatus = 'not_inspected' | 'pass' | 'fail' | 'inaccessible';

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
}

export interface InspectionDeficiency {
  id: string;
  status: 'deficient' | 'advisory' | 'pass';
  note?: string;
}

export interface DoorInspection {
  id: string;
  iconNo: string;
  assetId: string | null;
  floorNo: string;
  gridBlock: string;
  assemblyType: string;
  doorRating: string;
  inspectorName: string;
  projectName: string;
  completedTime: string;
  overallStatus: 'pass' | 'fail';
  deficiencies: Array<{
    deficiency: string;
    note?: string;
  }>;
  findings: Record<string, any>;
  additionalComments?: string;
  postInspectionStatus?: string;
  synced: boolean;
  photos?: string[]; // URLs to photos in Supabase Storage
}

export interface ProjectVars {
  construction: 'existing' | 'new';
  gapStandard: 'codify' | 'other';
  sprinklered: boolean;
}
