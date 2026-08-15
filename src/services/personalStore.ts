import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

export type PersonalItemKind = 'reminder' | 'appointment' | 'shopping' | 'errand';
export type PersonalItemStatus = 'pending' | 'done';
export type Recurrence = 'daily' | 'weekly' | 'monthly';

export interface PersonalNotification {
  id: string;
  at: string;
  label: string;
  sentAt?: string;
}

export interface PersonalItem {
  id: string;
  ownerId: string;
  kind: PersonalItemKind;
  title: string;
  status: PersonalItemStatus;
  createdAt: string;
  dueAt?: string;
  recurrence?: Recurrence;
  notifications: PersonalNotification[];
}

interface PersonalData { items: PersonalItem[] }

export class PersonalStore {
  private data: PersonalData = { items: [] };
  private loaded = false;
  private writeQueue = Promise.resolve();
  private readonly pool?: Pool;

  constructor(
    private readonly filePath = process.env.PERSONAL_DATA_PATH || path.join('data', 'personal-assistant.json'),
    databaseUrl = process.env.DATABASE_URL || ''
  ) {
    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 5,
        ssl: (process.env.DATABASE_SSL || 'false').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined
      });
    }
  }

  async init() {
    if (this.loaded) return;
    if (this.pool) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS doomy_personal_items (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL,
          due_at TIMESTAMPTZ,
          recurrence TEXT,
          notifications JSONB NOT NULL DEFAULT '[]'::jsonb
        )
      `);
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_doomy_personal_owner_status ON doomy_personal_items(owner_id, status)');
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_doomy_personal_due ON doomy_personal_items(due_at)');
      this.loaded = true;
      return;
    }
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as PersonalData;
      this.data = { items: Array.isArray(parsed.items) ? parsed.items : [] };
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err;
    }
    this.loaded = true;
  }

  async add(input: Omit<PersonalItem, 'id' | 'createdAt' | 'status'>): Promise<PersonalItem> {
    await this.init();
    const item: PersonalItem = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    if (this.pool) await this.saveToDatabase(item);
    else {
      this.data.items.push(item);
      await this.persist();
    }
    return item;
  }

  async list(ownerId: string, kind?: PersonalItemKind): Promise<PersonalItem[]> {
    await this.init();
    if (this.pool) {
      const params: unknown[] = [ownerId];
      const kindClause = kind ? ' AND kind = $2' : '';
      if (kind) params.push(kind);
      const result = await this.pool.query(
        `SELECT * FROM doomy_personal_items WHERE owner_id = $1 AND status = 'pending'${kindClause} ORDER BY created_at`,
        params
      );
      return result.rows.map(rowToItem);
    }
    return this.data.items.filter(item => item.ownerId === ownerId && item.status === 'pending' && (!kind || item.kind === kind));
  }

  async completeByTitle(ownerId: string, kind: PersonalItemKind, title: string): Promise<PersonalItem | undefined> {
    await this.init();
    const target = normalize(title);
    const candidates = this.pool ? await this.list(ownerId, kind) : this.data.items;
    const item = candidates.find(candidate =>
      candidate.ownerId === ownerId && candidate.kind === kind && candidate.status === 'pending'
      && (normalize(candidate.title) === target || normalize(candidate.title).includes(target))
    );
    if (!item) return undefined;
    item.status = 'done';
    if (this.pool) await this.saveToDatabase(item);
    else await this.persist();
    return item;
  }

  async dueNotifications(now = new Date()): Promise<Array<{ item: PersonalItem; notification: PersonalNotification }>> {
    await this.init();
    const items = this.pool
      ? (await this.pool.query("SELECT * FROM doomy_personal_items WHERE status = 'pending' AND due_at IS NOT NULL")).rows.map(rowToItem)
      : this.data.items;
    return items.flatMap(item => {
      if (item.status !== 'pending') return [];
      return item.notifications
        .filter(notification => !notification.sentAt && Date.parse(notification.at) <= now.getTime())
        .map(notification => ({ item, notification }));
    });
  }

  async markNotificationSent(itemId: string, notificationId: string, sentAt = new Date()) {
    await this.init();
    const item = this.pool
      ? (await this.pool.query('SELECT * FROM doomy_personal_items WHERE id = $1', [itemId])).rows.map(rowToItem)[0]
      : this.data.items.find(candidate => candidate.id === itemId);
    const notification = item?.notifications.find(candidate => candidate.id === notificationId);
    if (!item || !notification) return;
    notification.sentAt = sentAt.toISOString();

    if (notification.label === 'ahora') {
      if (item.recurrence && item.dueAt) this.reschedule(item);
      else item.status = 'done';
    }
    if (this.pool) await this.saveToDatabase(item);
    else await this.persist();
  }

  async close() {
    await this.pool?.end();
  }

  private reschedule(item: PersonalItem) {
    const next = new Date(item.dueAt!);
    if (item.recurrence === 'daily') next.setDate(next.getDate() + 1);
    if (item.recurrence === 'weekly') next.setDate(next.getDate() + 7);
    if (item.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
    item.dueAt = next.toISOString();
    item.notifications = buildNotifications(item.kind, next);
  }

  private async persist() {
    const snapshot = JSON.stringify(this.data, null, 2);
    const tempPath = `${this.filePath}.tmp`;
    this.writeQueue = this.writeQueue.then(async () => {
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    await this.writeQueue;
  }

  private async saveToDatabase(item: PersonalItem) {
    await this.pool!.query(`
      INSERT INTO doomy_personal_items
        (id, owner_id, kind, title, status, created_at, due_at, recurrence, notifications)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        due_at = EXCLUDED.due_at,
        recurrence = EXCLUDED.recurrence,
        notifications = EXCLUDED.notifications
    `, [
      item.id, item.ownerId, item.kind, item.title, item.status, item.createdAt,
      item.dueAt || null, item.recurrence || null, JSON.stringify(item.notifications)
    ]);
  }
}

function rowToItem(row: any): PersonalItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    dueAt: row.due_at ? new Date(row.due_at).toISOString() : undefined,
    recurrence: row.recurrence || undefined,
    notifications: Array.isArray(row.notifications) ? row.notifications : JSON.parse(row.notifications || '[]')
  };
}

export function buildNotifications(kind: PersonalItemKind, dueAt: Date, now = new Date()): PersonalNotification[] {
  const offsets = kind === 'appointment'
    ? [{ minutes: 1440, label: 'en 24 horas' }, { minutes: 60, label: 'en 1 hora' }, { minutes: 0, label: 'ahora' }]
    : [{ minutes: 0, label: 'ahora' }];
  return offsets
    .map(offset => ({
      id: randomUUID(),
      at: new Date(dueAt.getTime() - offset.minutes * 60_000).toISOString(),
      label: offset.label
    }))
    .filter(notification => Date.parse(notification.at) > now.getTime());
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export const personalStore = new PersonalStore();
