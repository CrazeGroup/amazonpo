import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityBefore, enrichAvailability } from '../services/itemAvailability';
import { loadItemAvailabilities } from '../server/businessCentral';
const rows = [
  {itemNo:'19276', level:1, lineNo:30, date:'2026-09-18', stock:100},
  {itemNo:'19276', level:1, lineNo:10, date:'2026-09-16', stock:900},
  {itemNo:'19276', level:2, lineNo:25, date:'2026-09-16', stock:99},
  {itemNo:'19276', level:1, lineNo:20, date:'2026-09-16', stock:758},
  {itemNo:'other', level:1, lineNo:40, date:'2026-09-16', stock:7},
];
test('synthetic 758 case: numeric line order, exact item, level 1 and strict date boundary', () => {
  assert.equal(availabilityBefore(rows, '19276', '2026-09-18'), 758);
  assert.equal(availabilityBefore(rows, '19276', new Date('2026-09-18T12:00:00Z')), 758);
  assert.equal(availabilityBefore(rows, '19276', '2026-09-16'), 'N/A');
  assert.equal(availabilityBefore(rows, '19276DE', '2026-09-18'), 'N/A');
  assert.equal(availabilityBefore(rows, '19276', ''), 'N/A');
  assert.equal(availabilityBefore([{...rows[0], stock:0}], '19276', '2026-09-19'), 0);
  assert.equal(enrichAvailability({'Amazon SKU':'19276','Delivery Window Start Date':'2026-09-19'} as any, rows)['Avail AMZ PO'], 100);
});

test('real Business Central 19276 scenario with initial inventory 0001-01-01 and win start date', () => {
  const bcRows = [
    { itemNo: '19276', level: 1, lineNo: 3, date: '0001-01-01', stock: 758 },
    { itemNo: '19276', level: 1, lineNo: 4, date: '2026-09-14', stock: 666 },
  ];
  // Before 2026-09-14, stock is 758 from lineNo 3 (Current Qty. on Hand)
  assert.equal(availabilityBefore(bcRows, '19276', '2026-09-14'), 758);
  assert.equal(availabilityBefore(bcRows, '19276', '14/09/2026'), 758);
  assert.equal(availabilityBefore(bcRows, '19276', new Date('2026-09-14T00:00:00Z')), 758);
  // Before 2026-09-15, stock is 666 from lineNo 4
  assert.equal(availabilityBefore(bcRows, '19276', '2026-09-15'), 666);
  // Enrich row
  const row = enrichAvailability({ 'Amazon SKU': '19276', 'Delivery Window Start Date': '2026-09-14' } as any, bcRows);
  assert.equal(row['Avail AMZ PO'], 758);
});
const env = {BC_CLIENT_ID:'test', BC_CLIENT_SECRET:'test', BC_ITEM_FIELD:'item', BC_DATE_FIELD:'date', BC_STOCK_FIELD:'balance'};
test('server authenticates, maps fields and follows all pages', async () => {
  const urls: string[] = [];
  const request = async (url: any, options: any) => {
    urls.push(String(url));
    if (urls.length === 1) { assert.equal(options.method,'POST'); return Response.json({access_token:'token'}); }
    assert.equal(options.headers.Authorization,'Bearer token');
    return Response.json({value:[{item:'19276',date:'2026-09-16',balance:urls.length === 2 ? '758' : 0,lineNo:urls.length,level:1}], ...(urls.length === 2 ? {'@odata.nextLink':`${String(url)}&$skiptoken=next`} : {})});
  };
  const result = await loadItemAvailabilities(env, request as typeof fetch);
  assert.equal(result.length,2);
  assert.equal(result[0].stock,758);
  assert.equal(result[1].stock,0);
  assert.equal(new URL(urls[1]).searchParams.get('$orderby'),'lineNo asc');
});
test('missing configuration and authentication failures are explicit', async () => {
  await assert.rejects(loadItemAvailabilities({}), /BC_CLIENT_ID/);
  await assert.rejects(loadItemAvailabilities(env, (async () => new Response('',{status:401})) as typeof fetch), /401/);
});
test('rejects pagination to an unrelated host before sending token', async () => {
  let calls = 0;
  await assert.rejects(loadItemAvailabilities(env, (async () => ++calls === 1 ? Response.json({access_token:'token'}) : Response.json({value:[], '@odata.nextLink':'https://example.com/steal'})) as typeof fetch), /Paginación/);
  assert.equal(calls,2);
});
