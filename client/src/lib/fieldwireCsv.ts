// Shared Fieldwire-export CSV primitives.
//
// The Codify Reporting Tool ingests Fieldwire's native export format: UTF-16 LE,
// tab-separated, with a 4-line preamble (banner / facility / timestamp / header).
// These helpers are shared by every service-line exporter (fieldwireExport.ts for
// doors, ceilingExport.ts for above/below ceiling) so the byte format stays
// identical across services.

/** Inspector initials for the "(INI)" tail on a checklist finding. */
export function initials(name: string | undefined): string {
  if (!name || !name.trim()) return 'NA';
  const parts = name.trim().split(/\s+/);
  let ini = parts.map((p) => p[0]).join('').toUpperCase();
  if (ini.length < 2) ini = name.trim().slice(0, 2).toUpperCase();
  return ini.slice(0, 4);
}

/** Scrub a value for a tab-separated cell: no tabs/newlines, trimmed. Because
 *  we strip tabs/newlines here, cells never need CSV quoting. */
export function cell(v: any): string {
  return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
}

/** Encode a string as a UTF-16 LE blob with a BOM — the encoding the Reporting
 *  Tool's parsers expect (they BOM-detect and decode utf-16). */
export function toUtf16LeBlob(str: string): Blob {
  const bytes = new Uint8Array(2 + str.length * 2);
  bytes[0] = 0xff; // BOM (little-endian)
  bytes[1] = 0xfe;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes[2 + i * 2] = c & 0xff;
    bytes[2 + i * 2 + 1] = (c >> 8) & 0xff;
  }
  return new Blob([bytes], { type: 'text/csv' });
}

/** ISO date (YYYY-MM-DD) for the checklist finding tail. */
export function isoDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Build the full file text: 4-line preamble + tab-joined header + data rows. */
export function buildCsvText(facility: string, header: string[], dataLines: string[]): string {
  const preamble = [
    'Generated with www.fieldwire.com',
    cell(facility),
    new Date().toISOString(),
    header.join('\t'),
  ];
  return [...preamble, ...dataLines].join('\r\n');
}

/** Trigger a browser download of the given text as a UTF-16 LE .csv. */
export function downloadCsv(text: string, filename: string): void {
  const url = URL.createObjectURL(toUtf16LeBlob(text));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
