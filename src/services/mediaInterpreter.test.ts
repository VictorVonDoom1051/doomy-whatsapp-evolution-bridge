import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPdfPrompt, extractRequestedFolios } from './mediaInterpreter.js';

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
