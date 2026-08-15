import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReminderExpression, parseSpanishDateTime } from './personalAssistant.js';

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

test('interpreta recordatorios relativos en minutos', () => {
  const parsed = parseSpanishDateTime('en 5 minutos revisar el horno', now);
  assert.equal(parsed?.title, 'revisar el horno');
  assert.equal(parsed?.date.toISOString(), '2026-08-15T16:05:00.000Z');
});

test('interpreta el tiempo relativo al final de la petición', () => {
  const parsed = parseSpanishDateTime('tomar agua en 2 horas', now);
  assert.equal(parsed?.title, 'tomar agua');
  assert.equal(parsed?.date.toISOString(), '2026-08-15T18:00:00.000Z');
});

test('detecta un recordatorio aunque exista una frase antes de la orden', () => {
  const expression = extractReminderExpression(
    'Ya puedes dar recordatorios, recuérdame en 5 minutos revisar la campaña de Megacable para que no se me olvide'
  );
  assert.equal(expression, 'en 5 minutos revisar la campaña de Megacable para que no se me olvide');
  const parsed = parseSpanishDateTime(expression!, now);
  assert.equal(parsed?.title, 'revisar la campaña de Megacable para que no se me olvide');
  assert.equal(parsed?.date.toISOString(), '2026-08-15T16:05:00.000Z');
});

test('interpreta recordatorios relativos en meses', () => {
  const parsed = parseSpanishDateTime('en 2 meses renovar el dominio', now);
  assert.equal(parsed?.title, 'renovar el dominio');
  assert.equal(parsed?.date.toISOString(), '2026-10-15T16:00:00.000Z');
});

test('interpreta un recordatorio mensual con día y hora', () => {
  const parsed = parseSpanishDateTime('cada mes el día 20 a las 9 am pagar la tarjeta', now);
  assert.equal(parsed?.title, 'pagar la tarjeta');
  assert.equal(parsed?.date.toISOString(), '2026-08-20T15:00:00.000Z');
});
