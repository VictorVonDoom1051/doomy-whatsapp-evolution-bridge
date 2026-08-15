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

test('reconoce cuando el texto citado pertenece a una respuesta reciente de Doomy', () => {
  const now = Date.parse('2026-08-14T18:00:00.000Z');
  const memory = new ConversationMemory(30, 60 * 60 * 1000, () => now);
  memory.add('equipo@g.us', {
    role: 'assistant',
    content: 'Ya quedó lista la cotización.',
    at: new Date(now).toISOString(),
    source: 'assistant'
  });

  assert.equal(memory.isReplyToAssistant('equipo@g.us', 'Ya quedó lista la cotización.'), true);
  assert.equal(memory.isReplyToAssistant('equipo@g.us', 'Mensaje de otra persona'), false);
});

test('reconoce una respuesta de Doomy por el ID del mensaje aunque falte el texto citado', () => {
  const now = Date.parse('2026-08-14T18:00:00.000Z');
  const group = 'equipo@g.us';
  const memory = new ConversationMemory(30, 60_000, () => now);
  memory.add(group, {
    role: 'assistant',
    content: 'Qué buena noticia! Ya las estoy usando 😁',
    at: new Date(now).toISOString(),
    source: 'assistant',
    messageId: 'DOOMY-MESSAGE-123'
  });

  assert.equal(memory.isReplyToAssistant(group, undefined, 'DOOMY-MESSAGE-123'), true);
});

test('tolera diferencias de acentos y variantes Unicode al comparar el texto citado', () => {
  const now = Date.parse('2026-08-14T18:00:00.000Z');
  const group = 'equipo@g.us';
  const memory = new ConversationMemory(30, 60_000, () => now);
  memory.add(group, {
    role: 'assistant',
    content: '¡Qué buena noticia! 😁️',
    at: new Date(now).toISOString(),
    source: 'assistant'
  });

  assert.equal(memory.isReplyToAssistant(group, '¡que buena noticia! 😁'), true);
});
