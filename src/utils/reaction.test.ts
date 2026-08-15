import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDoomyResponse } from './reaction.js';

test('convierte una reacción permitida en una acción', () => {
  assert.deepEqual(parseDoomyResponse(' [[reaction:✅]] '), { kind: 'reaction', reaction: '✅' });
});

test('mantiene como texto una reacción no permitida', () => {
  assert.deepEqual(parseDoomyResponse('[[reaction:🔥]]'), { kind: 'text', text: '[[reaction:🔥]]' });
});

test('no interpreta una reacción mezclada con texto', () => {
  assert.deepEqual(parseDoomyResponse('Listo [[reaction:👍]]'), { kind: 'text', text: 'Listo [[reaction:👍]]' });
});
