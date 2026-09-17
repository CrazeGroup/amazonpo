import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ItemAvailability } from '../services/itemAvailability';

const tenant = 'fab724f7-6b6d-4e3b-86e3-8c1e05e36b2a';
const endpoint = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/production/api/craze/integrations/v1.0/companies(2acec35c-7d06-ed11-82f8-0022485ceea3)/itemAvailabilities`;

export async function loadItemAvailabilities(env: Record<string, string | undefined>, request: typeof fetch = fetch): Promise<ItemAvailability[]> {
  const required = ['BC_CLIENT_ID', 'BC_CLIENT_SECRET', 'BC_ITEM_FIELD', 'BC_DATE_FIELD', 'BC_STOCK_FIELD'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error(`Falta configurar Business Central: ${missing.join(', ')}.`);
  const auth = await request(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.BC_CLIENT_ID!, client_secret: env.BC_CLIENT_SECRET!, scope: 'https://api.businesscentral.dynamics.com/.default' })
  });
  if (!auth.ok) throw new Error(`Autenticación de Business Central fallida (${auth.status}).`);
  const token = await auth.json();
  if (!token.access_token) throw new Error('Business Central no devolvió un token.');
  const url = new URL(endpoint);
  url.searchParams.set('$filter', 'level eq 1');
  url.searchParams.set('$orderby', 'lineNo asc');
  let next: string | null = url.href;
  const seen = new Set<string>();
  const result: ItemAvailability[] = [];
  while (next) {
    const pageUrl = new URL(next, endpoint);
    if (pageUrl.origin !== url.origin || pageUrl.pathname !== url.pathname || seen.has(pageUrl.href)) throw new Error('Paginación de Business Central inválida.');
    seen.add(pageUrl.href);
    const page = await request(pageUrl.href, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!page.ok) throw new Error(`Consulta de Business Central fallida (${page.status}).`);
    const body = await page.json();
    if (!Array.isArray(body.value)) throw new Error('Respuesta de Business Central inválida.');
    for (const row of body.value) {
      if (Number(row.level) !== 1) continue;
      const item = row[env.BC_ITEM_FIELD!], date = row[env.BC_DATE_FIELD!], stock = row[env.BC_STOCK_FIELD!];
      const numeric = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v));
      if (item == null || String(item).trim() === '' || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !numeric(stock) || !numeric(row.lineNo)) throw new Error('Los campos de itemAvailabilities no coinciden con la configuración de artículo, fecha y stock.');
      result.push({ itemNo: String(item).trim(), date, stock: Number(stock), lineNo: Number(row.lineNo), level: 1 });
    }
    next = body['@odata.nextLink'] ?? null;
  }
  return result;
}

export const DEFAULT_BC_ENV: Record<string, string> = {
  BC_CLIENT_ID: '6f832138-cb48-43e7-8601-efca120b45dc',
  BC_CLIENT_SECRET: '93dCSk3EKKCKd9gotuGYnG8K9WH21v9AEgdBgRa7KUw=',
  BC_ITEM_FIELD: 'itemNo',
  BC_DATE_FIELD: 'periodStart',
  BC_STOCK_FIELD: 'projectedAvailableBalance',
};

let cache: { data: ItemAvailability[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function handleAvailability(req: IncomingMessage, res: ServerResponse, env = process.env) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); res.end(JSON.stringify({ error: 'Método no permitido.' })); return; }
  const bypassCache = req.url?.includes('refresh=true');
  if (!bypassCache && cache && (Date.now() - cache.timestamp) < CACHE_TTL_MS) {
    res.end(JSON.stringify({ value: cache.data }));
    return;
  }
  const effectiveEnv = { ...DEFAULT_BC_ENV, ...env };
  try {
    const data = await loadItemAvailabilities(effectiveEnv);
    cache = { data, timestamp: Date.now() };
    res.end(JSON.stringify({ value: data }));
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Error consultando Business Central.' }));
  }
}
