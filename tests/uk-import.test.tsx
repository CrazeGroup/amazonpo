import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import XLSX from 'xlsx-js-style';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseWorkbook, readExcel, exportToExcel, exportPOConfirmation } from '../services/excelService';
import { processPOData } from '../services/businessLogic';
import { PivotTable } from '../components/PivotTable';
import { POInputRow } from '../types';

const uk = { PO: 'UK-1', 'Vendor code': 'GC865', 'Ship-to location': 'XEM4', ASIN: 'B095KNXRW2', 'External ID type': 'EAN', 'External ID': '4059779034934', 'Model number': '34934', 'Merchant SKU': '', 'Product name': 'Test product', Availability: 'AC - Accepted: In stock', 'Requested quantity': 144, 'Accepted quantity': 0, Cost: 6.59, Currency: 'GBP', 'Window start': 46273, 'Window end': 46280, 'Expected date': 46273, 'Case size': 1 };
function workbook(rows: object[], name = 'Line Items') {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([['Instructions'], ['Not PO data']]), 'Instructions');
  XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet(rows), name);
  return w;
}
function process(rows: POInputRow[]) {
  return processPOData(rows, rows.map(r => ({ASIN: r.ASIN, Brand: 'CRAZE'})), rows.map(r => ({SKU: r['Amazon SKU'], 'After Assembly Orders GMBH': 100000, Available: 'AVAILABLE'})), rows.map(r => ({SKU: r['Amazon SKU'], 'Units per Outer': 1})));
}
test('UK XLS binary import maps fields, ignores Instructions, retains GBP and calendar dates', async () => {
  const bytes = XLSX.write(workbook([uk]), {type:'buffer', bookType:'biff8'});
  const rows = await readExcel<POInputRow>(new File([bytes], 'uk.xls'), 'UK');
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r['Amazon SKU'], '34934');
  assert.equal(r['Vendor Code'], 'GC865');
  assert.equal(r['Destination Warehouse'], 'XEM4');
  assert.equal(r['Code Type'], 'EAN');
  assert.equal(r['Product Title'], 'Test product');
  assert.equal(r['Quantity Requested'], 144);
  assert.equal(r['Unit Cost'], 6.59);
  assert.equal(r.Currency, 'GBP');
  assert.equal((r['Delivery Window End Date'] as Date).toISOString(), '2026-09-15T12:00:00.000Z');
  const [result] = process(rows);
  assert.equal(result['Expected Quantity'], 144);
  assert.equal(result['Line Total'], 948.96);
  assert.equal(result['Rejection Comments'], 'ACCEPTED');
});
test('UK text decimals and thousands; legacy European headers/numbers', () => {
  const [r] = parseWorkbook<POInputRow>(workbook([{...uk, Cost:'6.59', 'Requested quantity':'1,440'}]), 'UK');
  assert.equal(r['Unit Cost'], 6.59);
  assert.equal(r['Quantity Requested'], 1440);
  const eu = {'PO Number':'EU-1', ASIN:'A', 'Model Number':'34934', 'Quantity Requested':'1.440', 'Unit Cost':'6,59', 'Window end':'15.09.2026'};
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet([eu]), 'Orders');
  for (const region of ['EU','DE'] as const) {
    const [r] = parseWorkbook<POInputRow>(w, region);
    assert.equal(r['Quantity Requested'], 1440);
    assert.equal(r['Unit Cost'], 6.59);
    assert.equal(r.Currency, 'EUR');
  }
});
test('config SKU survives; missing PO fields and invalid UK costs reject', () => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.json_to_sheet([{SKU:'34934', 'Units Outer':12}]), 'Outer');
  assert.equal(parseWorkbook<any>(w)[0].SKU, '34934');
  assert.throws(() => parseWorkbook(w, 'UK'), /missing columns/);
  assert.throws(() => parseWorkbook(workbook([{...uk, Cost:'invalid'}]), 'UK'), /invalid Unit Cost/);
  assert.throws(() => parseWorkbook(workbook([{...uk, Cost:''}]), 'UK'), /invalid Unit Cost/);
});
test('UK uses the existing EN SKU preference and shared sequential stock allocation', () => {
  const rows = parseWorkbook<POInputRow>(workbook([uk, {...uk, PO:'UK-2'}]), 'UK');
  const results = processPOData(rows, [{ASIN:uk.ASIN, Brand:'CRAZE'}], [{SKU:'34934EN', 'After Assembly Orders GMBH':150, Available:'AVAILABLE'}], [{SKU:'34934EN','Units per Outer':12}]);
  assert.equal(results[0]['Amazon SKU'], '34934EN');
  assert.equal(results[0]['Expected Quantity'], 144);
  assert.equal(results[1]['Expected Quantity'], 0);
});
test('full and regional confirmation exports retain UK values and exclude EU rows', () => {
  const results = process(parseWorkbook<POInputRow>(workbook([uk]), 'UK'));
  const dir = mkdtempSync(join(tmpdir(), 'po-export-'));
  try {
    const full = join(dir, 'full.xlsx'), confirmation = join(dir, 'uk.xlsx');
    exportToExcel(results, full);
    exportPOConfirmation([...results, {...results[0], _region:'EU'}], 'UK', confirmation);
    const read = (file: string) => { const w=XLSX.readFile(file); return XLSX.utils.sheet_to_json<any>(w.Sheets[w.SheetNames[0]]); };
    assert.equal(read(full)[0].Currency, 'GBP');
    assert.equal(read(full)[0].Region, 'UK');
    assert.equal(read(full)[0]['Unit Cost'], 6.59);
    assert.equal(read(confirmation).length, 1);
    assert.equal(read(confirmation)[0]['Accepted quantity'], 144);
    assert.equal(read(confirmation)[0]['Expected date (yyyy-MM-dd)'], '2026-09-15');
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('pivot shows UK amounts as GBP and keeps mixed currencies separate', () => {
  const rows = process(parseWorkbook<POInputRow>(workbook([uk]), 'UK'));
  const html = renderToStaticMarkup(<PivotTable data={rows}/>);
  assert.match(html, /GBP/);
  assert.doesNotMatch(html, /€/);
  const mixed = renderToStaticMarkup(<PivotTable data={[...rows, {...rows[0], Currency:'EUR', 'Line Total':10}]}/>);
  assert.match(mixed, /10\.00/);
  assert.doesNotMatch(mixed, /958\.96/);
});
test('provided UK workbook audit', {skip:!processEnvFile()}, () => {
  const rows = parseWorkbook<POInputRow>(XLSX.readFile(processEnvFile()!), 'UK');
  assert.equal(rows.length, 57);
  assert.equal(new Set(rows.map(r=>r['PO Number'])).size, 3);
  assert.equal(rows.reduce((a,r)=>a+r['Quantity Requested'],0),4705);
  assert.equal(Math.round(rows.reduce((a,r)=>a+r['Quantity Requested']*r['Unit Cost'],0)*100),1926302);
  assert.ok(process(rows).every(r=>r['Expected Quantity']===r['Quantity Requested'] && r.Currency==='GBP'));
});
function processEnvFile() { return globalThis.process.env.PO_UK_FILE; }

// Bulk upload classification uses content, with explicit resolution of ambiguous regions.
import { detectFileSlot, inspectBulkFile, duplicateSlots } from '../services/bulkImport';
import { BulkFileUpload } from '../components/BulkFileUpload';
test('bulk upload identifies all six file slots from workbook contents', async () => {
  const makeFile = (rows: object[], name: string) => new File([XLSX.write(workbook(rows), {type:'buffer', bookType:'xlsx'})], name);
  const files = [
    makeFile([{...uk, Currency:'EUR'}], 'PO DE.xlsx'),
    makeFile([{...uk, Currency:'EUR'}], 'PO EU.xlsx'),
    makeFile([uk], 'download.xlsx'),
    makeFile([{'Item No.':'34934', 'After Assembly Orders GMBH':200}], 'stock.xlsx'),
    makeFile([{ASIN:uk.ASIN, Brand:'CRAZE'}], 'mapping.xlsx'),
    makeFile([{'Article No.':'34934', 'Units Outer':12}], 'packing.xlsx'),
  ];
  assert.deepEqual(await Promise.all(files.map(inspectBulkFile)), ['DE','EU','UK','availability','tags','outer']);
});
test('bulk upload does not guess ambiguous regions or trust misleading config names', () => {
  assert.equal(detectFileSlot([{'PO Number':'1', ASIN:'A', Currency:'EUR'}], 'orders.xlsx'), '');
  assert.equal(detectFileSlot([{'PO Number':'1', ASIN:'A', Currency:'GBP'}], 'PO DE.xlsx'), '');
  assert.equal(detectFileSlot([{ASIN:'A', Brand:'B'}], 'PO UK.xlsx'), 'tags');
  assert.equal(detectFileSlot([{unknown:1}], 'availability.xlsx'), '');
  assert.deepEqual(duplicateSlots(['UK','tags','UK','','']), ['UK']);
});
test('bulk upload reports unsupported or unreadable files', async () => {
  await assert.rejects(inspectBulkFile(new File(['test'], 'test.txt')), /Only .xls/);
  await assert.rejects(inspectBulkFile(new File([], 'empty.xlsx')));
});
test('bulk upload renders a multiple-file picker and accessible drop target', () => {
  const html = renderToStaticMarkup(<BulkFileUpload disabled={false} onAssign={() => {}} />);
  assert.match(html, /multiple=""/);
  assert.match(html, /Drop all files here/);
  assert.match(html, /role="status"/);
});
