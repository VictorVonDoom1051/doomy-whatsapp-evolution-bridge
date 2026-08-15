import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationMemory } from './conversationMemory.js';

test('conserva mensajes ambientales recientes con nombre del participante', () => {
  const now = Date.parse('2026-08-14T18:00:00.000Z');
  const memory = new ConversationMemory(30, 3 * 60 * 60 * 1000, () => now);

  memory.add('equipo@g.us', {
    role: 'user',
    content: 'La entrega queda para el viernes.',
    at: '2026-08-14T17:55:00.000Z',
    senderName: 'Juan',
    source: 'ambient'
  });

  assert.deepEqual(memory.get('equipo@g.us'), [{
    role: 'user',
    content: 'La entrega queda para el viernes.',
    at: '2026-08-14T17:55:00.000Z',
    senderName: 'Juan',
    source: 'ambient'
  }]);
});

test('descarta mensajes que superaron el tiempo de memoria', () => {
  const now = Date.parse('2026-08-14T18:00:00.000Z');
  const memory = new ConversationMemory(30, 60 * 60 * 1000, () => now);

  memory.add('equipo@g.us', {
    role: 'user',
    content: 'Mensaje viejo',
    at: '2026-08-14T16:00:00.000Z',
    source: 'ambient'
  });

  assert.deepEqual(memory.get('equipo@g.us'), []);
});

test('respeta el máximo de mensajes por grupo', () => {
  let now = Date.parse('2026-08-14T18:00:00.000Z');
  const memory = new ConversationMemory(2, 60 * 60 * 1000, () => now);

  for (const content of ['uno', 'dos', 'tres']) {
    memory.add('equipo@g.us', { role: 'user', content, at: new Date(now++).toISOString(), source: 'ambient' });
  }

  assert.deepEqual(memory.get('equipo@g.us').map(message => message.content), ['dos', 'tres']);
});
