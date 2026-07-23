export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  // Prefer the connection baked into the deploy (Vite env vars) so inspectors
  // never have to enter a URL/key. Fall back to any locally-saved config.
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';
  return {
    url: envUrl || localStorage.getItem('supabaseUrl') || '',
    key: envKey || localStorage.getItem('supabaseKey') || '',
  };
}

export function setSupabaseConfig(url: string, key: string) {
  localStorage.setItem('supabaseUrl', url);
  localStorage.setItem('supabaseKey', key);
}

export async function testSupabaseConnection(config: SupabaseConfig): Promise<boolean> {
  if (!config.url || !config.key) return false;
  try {
    const res = await fetch(`${config.url}/rest/v1/door_inspections?limit=1`, {
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
      },
    });
    return res.ok;
  } catch (error) {
    console.error('Supabase connection error:', error);
    return false;
  }
}

// Map an app inspection record to a door_inspections table row. The full
// record is kept in `data`; the rest are denormalized columns for querying.
function recordToRow(record: any) {
  return {
    id: record.id,
    project: record.projectName || null,
    asset_id: record.assetId || null,
    icon_no: record.iconNo || null,
    floor: record.floorNo || null,
    status: record.overallStatus || null,
    inspector: record.inspectorName || null,
    inspection_date: record.completedTime || new Date().toISOString(),
    data: record,
    updated_at: new Date().toISOString(),
  };
}

export async function uploadInspectionRecord(
  config: SupabaseConfig,
  record: any
): Promise<boolean> {
  if (!config.url || !config.key) return false;
  try {
    const res = await fetch(`${config.url}/rest/v1/door_inspections`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(recordToRow(record)),
    });
    return res.ok || res.status === 201;
  } catch (error) {
    console.error('Upload error:', error);
    return false;
  }
}

// Returns the app records (the `data` blob of each row), newest first.
export async function fetchInspectionRecords(
  config: SupabaseConfig,
  projectName?: string
): Promise<any[] | null> {
  if (!config.url || !config.key) return null;
  try {
    const projectFilter = projectName ? `&project=eq.${encodeURIComponent(projectName)}` : '';
    const res = await fetch(
      `${config.url}/rest/v1/door_inspections?select=data&order=inspection_date.desc${projectFilter}`,
      {
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Range': '0-9999',
          'Range-Unit': 'items',
        },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map((r: any) => r.data).filter(Boolean) : [];
  } catch (error) {
    console.error('Fetch records error:', error);
    return null;
  }
}

export async function uploadPhotoToSupabase(
  config: SupabaseConfig,
  file: File,
  inspectionId: string
): Promise<string | null> {
  if (!config.url || !config.key) return null;
  try {
    const fileName = `${inspectionId}/${Date.now()}_${file.name}`;
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${config.url}/storage/v1/object/door_inspection_photos/${fileName}`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
      },
      body: file,
    });

    if (!res.ok) return null;
    return `${config.url}/storage/v1/object/public/door_inspection_photos/${fileName}`;
  } catch (error) {
    console.error('Photo upload error:', error);
    return null;
  }
}

// ─── Door pins ────────────────────────────────────────────────────────────

function pinToRow(pin: any) {
  return {
    id: pin.id,
    project: pin.projectName || null,
    page_number: pin.pageNumber ?? null,
    data: pin,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertPin(config: SupabaseConfig, pin: any): Promise<boolean> {
  if (!config.url || !config.key) return false;
  try {
    const res = await fetch(`${config.url}/rest/v1/door_pins`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(pinToRow(pin)),
    });
    return res.ok || res.status === 201;
  } catch (error) {
    console.error('Pin upsert error:', error);
    return false;
  }
}

export async function deletePin(config: SupabaseConfig, id: string): Promise<boolean> {
  if (!config.url || !config.key) return false;
  try {
    const res = await fetch(
      `${config.url}/rest/v1/door_pins?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
        },
      }
    );
    return res.ok;
  } catch (error) {
    console.error('Pin delete error:', error);
    return false;
  }
}

// Returns the pin objects (the `data` blob of each row). When a project name is
// given, only that project's pins are returned — without it every device pulls
// all pins for all projects, leaking pins from unrelated jobs onto the plan.
export async function fetchPins(config: SupabaseConfig, projectName?: string): Promise<any[] | null> {
  if (!config.url || !config.key) return null;
  try {
    const projectFilter = projectName ? `&project=eq.${encodeURIComponent(projectName)}` : '';
    const res = await fetch(`${config.url}/rest/v1/door_pins?select=data${projectFilter}`, {
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Range': '0-9999',
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map((r: any) => r.data).filter(Boolean) : [];
  } catch (error) {
    console.error('Fetch pins error:', error);
    return null;
  }
}

// ─── Floor-plan PDF (Supabase Storage) ──────────────────────────────────────
// Each project has its own plan under floor_plans/<project>/plan.pdf.

const planPath = (project: string) => `floor_plans/${encodeURIComponent(project)}/plan.pdf`;

export async function uploadPlanPDF(
  config: SupabaseConfig,
  file: File | Blob,
  project: string
): Promise<boolean> {
  if (!config.url || !config.key || !project) return false;
  try {
    const res = await fetch(`${config.url}/storage/v1/object/${planPath(project)}`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: file,
    });
    return res.ok;
  } catch (error) {
    console.error('Plan upload error:', error);
    return false;
  }
}

export async function planExistsInCloud(config: SupabaseConfig, project: string): Promise<boolean> {
  if (!config.url || !config.key || !project) return false;
  try {
    const res = await fetch(`${config.url}/storage/v1/object/public/${planPath(project)}`, {
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Range': 'bytes=0-0',
      },
    });
    return res.ok; // 200 or 206
  } catch {
    return false;
  }
}

export async function downloadPlanPDF(config: SupabaseConfig, project: string): Promise<Blob | null> {
  if (!config.url || !config.key || !project) return null;
  try {
    const res = await fetch(`${config.url}/storage/v1/object/public/${planPath(project)}`, {
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
      },
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch (error) {
    console.error('Plan download error:', error);
    return null;
  }
}

// ─── Projects & inspectors (team lists) ─────────────────────────────────────

export interface ProjectRow {
  name: string;
  created_at?: string;
  category?: string | null;
  archived?: boolean;
}

/** All projects the team has created, newest first (archived ones included —
 *  the Projects page filters them into an "Archived" view client-side). */
export async function listProjects(config: SupabaseConfig): Promise<ProjectRow[] | null> {
  if (!config.url || !config.key) return null;
  try {
    const res = await fetch(`${config.url}/rest/v1/projects?select=name,created_at,category,archived&order=created_at.desc`, {
      headers: { 'apikey': config.key, 'Authorization': `Bearer ${config.key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error('List projects error:', error);
    return null;
  }
}

/** Create a project (idempotent on name). An optional service-line category
 *  is stored on the row. */
export async function createProject(config: SupabaseConfig, name: string, category?: string): Promise<boolean> {
  if (!config.url || !config.key || !name.trim()) return false;
  try {
    const body: Record<string, unknown> = { name: name.trim() };
    if (category && category.trim()) body.category = category.trim();
    const res = await fetch(`${config.url}/rest/v1/projects`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    });
    return res.ok || res.status === 201;
  } catch (error) {
    console.error('Create project error:', error);
    return false;
  }
}

/** Patch a project row (category and/or archived flag). Keyed on name. */
export async function updateProject(
  config: SupabaseConfig,
  name: string,
  patch: { category?: string | null; archived?: boolean }
): Promise<boolean> {
  if (!config.url || !config.key || !name.trim()) return false;
  try {
    const res = await fetch(
      `${config.url}/rest/v1/projects?name=eq.${encodeURIComponent(name)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(patch),
      }
    );
    return res.ok;
  } catch (error) {
    console.error('Update project error:', error);
    return false;
  }
}

/** Hide a project without deleting any data (reversible). */
export function archiveProject(config: SupabaseConfig, name: string): Promise<boolean> {
  return updateProject(config, name, { archived: true });
}

/** Restore an archived project. */
export function unarchiveProject(config: SupabaseConfig, name: string): Promise<boolean> {
  return updateProject(config, name, { archived: false });
}

/** Permanently delete a project AND its cloud data: the project row, its pins,
 *  its inspection records, and its stored floor-plan PDF. Irreversible.
 *
 *  Associations are by project-name text (no DB foreign keys), so there is no
 *  automatic cascade — we delete each related table/object explicitly. Local
 *  (offline) pins/records live in unscoped localStorage and are not purged here;
 *  the cloud is the source of truth. Returns true if the project row itself was
 *  removed; related deletes are best-effort. */
export async function deleteProject(config: SupabaseConfig, name: string): Promise<boolean> {
  if (!config.url || !config.key || !name.trim()) return false;
  const headers = { 'apikey': config.key, 'Authorization': `Bearer ${config.key}` };
  const enc = encodeURIComponent(name);

  // Best-effort: pins, inspection records, and the stored plan PDF.
  const cleanup = [
    fetch(`${config.url}/rest/v1/door_pins?project=eq.${enc}`, { method: 'DELETE', headers }),
    fetch(`${config.url}/rest/v1/door_inspections?project=eq.${enc}`, { method: 'DELETE', headers }),
    fetch(`${config.url}/storage/v1/object/${planPath(name)}`, { method: 'DELETE', headers }),
  ];
  await Promise.allSettled(cleanup);

  // The project row itself — this is the delete we report success on.
  try {
    const res = await fetch(`${config.url}/rest/v1/projects?name=eq.${enc}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch (error) {
    console.error('Delete project error:', error);
    return false;
  }
}

/** Team inspector names, alphabetical. */
export async function listInspectors(config: SupabaseConfig): Promise<string[] | null> {
  if (!config.url || !config.key) return null;
  try {
    const res = await fetch(`${config.url}/rest/v1/inspectors?select=name&order=name.asc`, {
      headers: { 'apikey': config.key, 'Authorization': `Bearer ${config.key}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map((r: any) => r.name).filter(Boolean) : [];
  } catch (error) {
    console.error('List inspectors error:', error);
    return null;
  }
}

/** Add a teammate to the inspector list (idempotent on name). */
export async function addInspector(config: SupabaseConfig, name: string): Promise<boolean> {
  if (!config.url || !config.key || !name.trim()) return false;
  try {
    const res = await fetch(`${config.url}/rest/v1/inspectors`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ name: name.trim() }),
    });
    return res.ok || res.status === 201;
  } catch (error) {
    console.error('Add inspector error:', error);
    return false;
  }
}
