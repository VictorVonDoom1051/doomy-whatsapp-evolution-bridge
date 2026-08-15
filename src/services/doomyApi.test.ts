import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDoomyApiPayload, WHATSAPP_OWNER_STYLE, WHATSAPP_WORK_STYLE, type DoomyRequest } from './doomyApi.js';

function request(overrides: Partial<DoomyRequest> = {}): DoomyRequest {
  return {
    message: '¿Ya quedó la cotización de mañana?',
    groupId: 'equipo@g.us',
    senderId: 'usuario@s.whatsapp.net',
    senderName: 'Edgar',
    role: 'admin',
    history: [],
    ...overrides
  };
}

test('prepara el mensaje con contexto natural de WhatsApp laboral', () => {
  const payload = buildDoomyApiPayload(request());

  assert.equal(payload.originalMessage, '¿Ya quedó la cotización de mañana?');
  assert.equal(payload.channel, 'whatsapp_work_group');
  assert.equal(payload.responseStyle, 'natural_coworker');
  assert.equal(payload.styleInstructions, WHATSAPP_WORK_STYLE);
  assert.match(payload.message, /^¿Ya quedó la cotización de mañana\?/);
  assert.match(payload.message, /grupo laboral de WhatsApp/);
  assert.match(payload.message, /responderle a Edgar/);
});

test('no inventa un nombre cuando Evolution no lo proporciona', () => {
  const payload = buildDoomyApiPayload(request({ senderName: undefined }));

  assert.doesNotMatch(payload.message, /responderle a/);
  assert.match(payload.message, /<contexto_interno_respuesta>/);
});

test('conserva intactos los datos que usa el bridge para herramientas y memoria', () => {
  const history = [{ role: 'user' as const, content: 'Folio 1042', at: '2026-08-14T12:00:00.000Z' }];
  const payload = buildDoomyApiPayload(request({
    toolHint: 'cotizaciones',
    history,
    raw: { attachment: true }
  }));

  assert.equal(payload.toolHint, 'cotizaciones');
  assert.equal(payload.history, history);
  assert.deepEqual(payload.raw, { attachment: true });
});

test('separa el chat privado del propietario del contexto de clientes y grupos', () => {
  const payload = buildDoomyApiPayload(request({
    groupId: '523310917819@s.whatsapp.net',
    senderId: '523310917819@s.whatsapp.net',
    message: '¿Quién soy y qué permisos tengo?'
  }));

  assert.equal(payload.channel, 'whatsapp_owner_private');
  assert.equal(payload.responseStyle, 'natural_owner_assistant');
  assert.equal(payload.styleInstructions, WHATSAPP_OWNER_STYLE);
  assert.match(payload.message, /propietario y administrador de VonverIA/);
  assert.match(payload.message, /no es un grupo ni pertenece a un cliente/);
  assert.match(payload.message, /NAHVI.*clientes/);
});
