export const config = {
  runtime: 'edge',
};

const tenant = 'fab724f7-6b6d-4e3b-86e3-8c1e05e36b2a';
const endpoint = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/production/api/craze/integrations/v1.0/companies(2acec35c-7d06-ed11-82f8-0022485ceea3)/itemAvailabilities`;

const DEFAULT_BC_CLIENT_ID = '6f832138-cb48-43e7-8601-efca120b45dc';
const DEFAULT_BC_CLIENT_SECRET = '93dCSk3EKKCKd9gotuGYnG8K9WH21v9AEgdBgRa7KUw=';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'GET' }
    });
  }

  try {
    const clientId = process.env.BC_CLIENT_ID || DEFAULT_BC_CLIENT_ID;
    const clientSecret = process.env.BC_CLIENT_SECRET || DEFAULT_BC_CLIENT_SECRET;
    const itemField = process.env.BC_ITEM_FIELD || 'itemNo';
    const dateField = process.env.BC_DATE_FIELD || 'periodStart';
    const stockField = process.env.BC_STOCK_FIELD || 'projectedAvailableBalance';

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

    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: `Autenticación de Business Central fallida (${authRes.status}).` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tokenData = await authRes.json();
    if (!tokenData.access_token) {
      return new Response(JSON.stringify({ error: 'Business Central no devolvió token.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(endpoint);
    url.searchParams.set('$filter', 'level eq 1');
    url.searchParams.set('$orderby', 'lineNo asc');

    let next: string | null = url.href;
    const seen = new Set<string>();
    const result: any[] = [];

    while (next) {
      const pageUrl = new URL(next, endpoint);
      if (pageUrl.origin !== url.origin || pageUrl.pathname !== url.pathname || seen.has(pageUrl.href)) break;
      seen.add(pageUrl.href);

      const pageRes = await fetch(pageUrl.href, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!pageRes.ok) break;
      const body = await pageRes.json();
      if (!Array.isArray(body.value)) break;

      for (const row of body.value) {
        if (Number(row.level) !== 1) continue;
        const item = row[itemField], date = row[dateField], stock = row[stockField];
        if (item != null && date && stock != null && row.lineNo != null) {
          result.push({
            itemNo: String(item).trim(),
            date: String(date),
            stock: Number(stock),
            lineNo: Number(row.lineNo),
            level: 1
          });
        }
      }
      next = body['@odata.nextLink'] ?? null;
    }

    return new Response(JSON.stringify({ value: result }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error consultando Business Central.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
