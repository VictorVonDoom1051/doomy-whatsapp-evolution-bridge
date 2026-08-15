import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx-js-style';
import { buildPdfPrompt, compareSpreadsheetWithPdf, extractRequestedFolios, findWorkbookFolios } from './mediaInterpreter.js';

test('extrae varios folios solicitados sin confundir cantidades', () => {
  assert.deepEqual(
    extractRequestedFolios('Busca los folios EG-20260814-195145034-F16 y Q_20260814195145_00333C en este PDF'),
    ['EG-20260814-195145034-F16', 'Q_20260814195145_00333C']
  );
});

test('verifica localmente qué folios aparecen en el PDF', () => {
  const prompt = buildPdfPrompt(
    'Busca EG-123456 y EG-999999',
    'Cotización aprobada con folio EG-123456 para el cliente VonverIA.',
    'cotizaciones.pdf'
  );
  assert.match(prompt, /EG-123456: ENCONTRADO/);
  assert.match(prompt, /EG-999999: NO ENCONTRADO/);
  assert.match(prompt, /resultados verificados/);
});

test('marca SÍ en verde y NO en rojo al comparar Excel contra PDF', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'Folio'],
    ['VonverIA', 'EG-123456'],
    ['NAHVI', 'EG-999999']
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Folios');
  const original = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const pending = {
    fileName: 'folios.xlsx',
    storedAt: new Date().toISOString(),
    workbookBase64: original.toString('base64'),
    folios: findWorkbookFolios(workbook)
  };
  const result = compareSpreadsheetWithPdf(pending, 'Documento con folio EG-123456', 'documento.pdf');
  assert.equal(result.kind, 'comparison');
  if (result.kind !== 'comparison') return;
  assert.match(result.response, /1 encontrados y 1 no encontrados/);
  const output = XLSX.read(Buffer.from(result.base64, 'base64'), { type: 'buffer', cellStyles: true });
  assert.equal(output.Sheets.Folios.C2.v, 'SÍ');
  assert.equal(output.Sheets.Folios.C2.s.fgColor.rgb, 'C6EFCE');
  assert.equal(output.Sheets.Folios.C3.v, 'NO');
  assert.equal(output.Sheets.Folios.C3.s.fgColor.rgb, 'FFC7CE');
});
