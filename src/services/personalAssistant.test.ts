import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSpanishDateTime } from './personalAssistant.js';

const now = new Date('2026-08-15T16:00:00.000Z'); // 10:00 en Ciudad de México

test('interpreta recordatorios con fecha al inicio', () => {
  const parsed = parseSpanishDateTime('mañana a las 9 llamar a Juan', now);
  assert.equal(parsed?.title, 'llamar a Juan');
  assert.equal(parsed?.date.toISOString(), '2026-08-16T15:00:00.000Z');
});

test('interpreta citas con fecha al final', () => {
  const parsed = parseSpanishDateTime('dentista el viernes a las 5 pm', now);
  assert.equal(parsed?.title, 'dentista');
  assert.equal(parsed?.date.toISOString(), '2026-08-21T23:00:00.000Z');
});

test('pide aclaración cuando falta la hora', () => {
  assert.equal(parseSpanishDateTime('mañana llamar a Juan', now), null);
});
