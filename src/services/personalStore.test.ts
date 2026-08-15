import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildNotifications, PersonalStore } from './personalStore.js';

test('persiste compras y permite marcarlas como terminadas', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doomy-personal-'));
  const file = path.join(dir, 'items.json');
  const store = new PersonalStore(file);
  await store.add({ ownerId: 'owner', kind: 'shopping', title: 'leche', notifications: [] });
  assert.equal((await store.list('owner', 'shopping')).length, 1);
  await store.completeByTitle('owner', 'shopping', 'leche');
  assert.equal((await store.list('owner', 'shopping')).length, 0);
  assert.match(await readFile(file, 'utf8'), /"title": "leche"/);
});

test('crea avisos de cita 24 horas, una hora y al momento', () => {
  const now = new Date('2026-08-15T10:00:00.000Z');
  const due = new Date('2026-08-17T10:00:00.000Z');
  const notifications = buildNotifications('appointment', due, now);
  assert.deepEqual(notifications.map(item => item.label), ['en 24 horas', 'en 1 hora', 'ahora']);
});

test('entrega una notificación vencida una sola vez', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'doomy-personal-'));
  const store = new PersonalStore(path.join(dir, 'items.json'));
  const item = await store.add({
    ownerId: 'owner',
    kind: 'reminder',
    title: 'llamar a Juan',
    dueAt: '2026-08-15T10:00:00.000Z',
    notifications: [{ id: 'notice', at: '2026-08-15T10:00:00.000Z', label: 'ahora' }]
  });
  assert.equal((await store.dueNotifications(new Date('2026-08-15T10:01:00.000Z'))).length, 1);
  await store.markNotificationSent(item.id, 'notice', new Date('2026-08-15T10:01:00.000Z'));
  assert.equal((await store.dueNotifications(new Date('2026-08-15T10:02:00.000Z'))).length, 0);
});
