import type { ProcessedRow } from '../types';

export interface ItemAvailability {
  itemNo: string;
  lineNo: number;
  level: number;
  date: string;
  stock: number;
}

// Dates imported from Excel or entered manually
function calendarDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  if (typeof value === 'number') return calendarDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000));
  if (typeof value !== 'string') return null;
  const str = value.trim();
  if (/^0001-01-01/.test(str)) return '0001-01-01';
  if (/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(str)) {
    const day = str.slice(0, 10);
    const parsed = new Date(day);
    return Number.isFinite(parsed.getTime()) ? day : null;
  }
  const euMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (euMatch) {
    const day = euMatch[1].padStart(2, '0');
    const month = euMatch[2].padStart(2, '0');
    const year = euMatch[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

export function availabilityBefore(records: ItemAvailability[], itemNo: string, start: unknown): number | 'N/A' {
  const cutoff = calendarDate(start);
  if (!cutoff || !itemNo.trim()) return 'N/A';
  const matches = records.filter(r => r.itemNo.trim() === itemNo.trim() && r.level === 1).sort((a, b) => a.lineNo - b.lineNo);
  let stock: number | 'N/A' = 'N/A';
  for (const record of matches) {
    const date = calendarDate(record.date);
    if (date && date < cutoff) stock = record.stock;
  }
  return stock;
}

export function enrichAvailability(row: ProcessedRow, records: ItemAvailability[]): ProcessedRow {
  const itemNo = String(row['Amazon SKU'] ?? row['Model Number'] ?? row['Item No.'] ?? row['Item No'] ?? row['SKU'] ?? '').trim();
  return { ...row, 'Avail AMZ PO': availabilityBefore(records, itemNo, row['Delivery Window Start Date']) };
}

export async function fetchItemAvailabilities(): Promise<ItemAvailability[]> {
  const response = await fetch('/api/item-availabilities', { signal: AbortSignal.timeout(60000) });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Avail AMZ PO: servidor de Business Central no disponible.');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'No se pudo consultar Avail AMZ PO.');
  if (!Array.isArray(body.value)) throw new Error('Respuesta de disponibilidad inválida.');
  return body.value;
}
