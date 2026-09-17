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

let memoryCache: { data: ItemAvailability[]; timestamp: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchItemAvailabilitiesDirect(): Promise<ItemAvailability[]> {
  const tenant = 'fab724f7-6b6d-4e3b-86e3-8c1e05e36b2a';
  const clientId = '6f832138-cb48-43e7-8601-efca120b45dc';
  const clientSecret = '93dCSk3EKKCKd9gotuGYnG8K9WH21v9AEgdBgRa7KUw=';

  const authRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://api.businesscentral.dynamics.com/.default'
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!authRes.ok) throw new Error(`Autenticación directa de Business Central fallida (${authRes.status}).`);
  const tokenData = await authRes.json();
  if (!tokenData.access_token) throw new Error('Business Central no devolvió token.');

  const endpoint = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/production/api/craze/integrations/v1.0/companies(2acec35c-7d06-ed11-82f8-0022485ceea3)/itemAvailabilities?$filter=level eq 1&$orderby=lineNo asc`;
  const bcRes = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(30000)
  });

  if (!bcRes.ok) throw new Error(`Consulta directa a Business Central fallida (${bcRes.status}).`);
  const data = await bcRes.json();
  if (!Array.isArray(data.value)) throw new Error('Respuesta inválida de Business Central.');

  return data.value.map((row: any) => ({
    itemNo: String(row.itemNo || '').trim(),
    date: String(row.periodStart || ''),
    stock: Number(row.projectedAvailableBalance || 0),
    lineNo: Number(row.lineNo || 0),
    level: 1
  }));
}

export async function fetchItemAvailabilities(): Promise<ItemAvailability[]> {
  if (memoryCache && (Date.now() - memoryCache.timestamp) < CACHE_MS) {
    return memoryCache.data;
  }

  // 1. Try server endpoint first
  try {
    const response = await fetch('/api/item-availabilities', { signal: AbortSignal.timeout(15000) });
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const body = await response.json();
      if (Array.isArray(body.value) && body.value.length > 0) {
        memoryCache = { data: body.value, timestamp: Date.now() };
        return body.value;
      }
    }
  } catch (err) {
    console.warn('Server endpoint error, falling back to direct connection:', err);
  }

  // 2. Direct client fallback
  try {
    const directData = await fetchItemAvailabilitiesDirect();
    memoryCache = { data: directData, timestamp: Date.now() };
    return directData;
  } catch (directErr) {
    throw new Error(directErr instanceof Error ? directErr.message : 'No se pudo consultar Business Central.');
  }
}
