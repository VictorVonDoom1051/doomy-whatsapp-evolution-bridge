import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDoomyResponse, selectAcknowledgementReaction } from './reaction.js';

test('convierte una reacción permitida en una acción', () => {
  assert.deepEqual(parseDoomyResponse(' [[reaction:✅]] '), { kind: 'reaction', reaction: '✅' });
});

test('mantiene como texto una reacción no permitida', () => {
  assert.deepEqual(parseDoomyResponse('[[reaction:🔥]]'), { kind: 'text', text: '[[reaction:🔥]]' });
});

test('no interpreta una reacción mezclada con texto', () => {
  assert.deepEqual(parseDoomyResponse('Listo [[reaction:👍]]'), { kind: 'text', text: 'Listo [[reaction:👍]]' });
});

test('elige una reacción local para agradecimientos breves', () => {
  assert.equal(selectAcknowledgementReaction('Ok, gracias'), '👍');
  assert.equal(selectAcknowledgementReaction('Va, gracias!'), '👍');
  assert.equal(selectAcknowledgementReaction('Ya quedó'), '✅');
  assert.equal(selectAcknowledgementReaction('Ahorita lo reviso'), '👀');
});

test('no reacciona localmente a mensajes sustantivos', () => {
  assert.equal(selectAcknowledgementReaction('Gracias, pero cambia el precio y vuelve a mandarlo'), null);
});
