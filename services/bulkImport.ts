import { readExcel } from './excelService';

export type FileSlot = 'DE' | 'EU' | 'UK' | 'availability' | 'tags' | 'outer';
export const FILE_SLOTS: { value: FileSlot; label: string }[] = [
  { value: 'DE', label: 'PO Germany (DE)' },
  { value: 'EU', label: 'PO EU (ES/IT/FR)' },
  { value: 'UK', label: 'PO United Kingdom (UK)' },
  { value: 'availability', label: 'Availability' },
  { value: 'tags', label: 'Tags' },
  { value: 'outer', label: 'Outer' },
];

export function detectFileSlot(rows: Record<string, any>[], filename: string): FileSlot | '' {
  const row = rows[0];
  if (!row) return '';
  const fields = new Set(Object.keys(row));
  // Match the contents first; filenames only disambiguate PO regions.
  if (fields.has('PO Number') && fields.has('ASIN')) {
    const regions = new Set<FileSlot>();
    const name = filename.replace(/\.xlsx?$/i, '').toUpperCase();
    if (/(^|[^A-Z])(UK|GB|UNITED KINGDOM)([^A-Z]|$)/.test(name)) regions.add('UK');
    if (/(^|[^A-Z])(DE|GERMANY|DEUTSCHLAND)([^A-Z]|$)/.test(name)) regions.add('DE');
    if (/(^|[^A-Z])(EU|ES|FR|IT)([^A-Z]|$)/.test(name)) regions.add('EU');
    const currencies = new Set(rows.map(r => String(r.Currency || '').trim().toUpperCase()).filter(Boolean));
    if (currencies.size === 1 && currencies.has('GBP')) regions.add('UK');
    return regions.size === 1 ? [...regions][0] : '';
  }
  const candidates: FileSlot[] = [];
  if (fields.has('SKU') && fields.has('After Assembly Orders GMBH')) candidates.push('availability');
  if (fields.has('ASIN') && fields.has('Brand')) candidates.push('tags');
  if (fields.has('SKU') && fields.has('Units per Outer')) candidates.push('outer');
  return candidates.length === 1 ? candidates[0] : '';
}

export async function inspectBulkFile(file: File) {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error('Only .xls and .xlsx files are supported');
  // Prefer the Amazon data sheet even if Instructions precedes it.
  const rows = await readExcel<Record<string, any>>(file);
  if (!rows.length) throw new Error('The file contains no data rows');
  return detectFileSlot(rows, file.name);
}

export function duplicateSlots(slots: string[]): string[] {
  return [...new Set(slots.filter((slot, index) => slot && slots.indexOf(slot) !== index))];
}
