export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: localStorage.getItem('supabaseUrl') || '',
    key: localStorage.getItem('supabaseKey') || '',
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
      body: JSON.stringify(record),
    });
    return res.ok || res.status === 201;
  } catch (error) {
    console.error('Upload error:', error);
    return false;
  }
}

export async function fetchInspectionRecords(
  config: SupabaseConfig,
  projectName?: string
): Promise<any[] | null> {
  if (!config.url || !config.key) return null;
  try {
    const projectFilter = projectName ? `&project=eq.${encodeURIComponent(projectName)}` : '';
    const res = await fetch(
      `${config.url}/rest/v1/door_inspections?select=*&order=inspection_date.desc${projectFilter}`,
      {
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Range': '0-999',
          'Range-Unit': 'items',
        },
      }
    );
    if (!res.ok) return null;
    return await res.json();
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
