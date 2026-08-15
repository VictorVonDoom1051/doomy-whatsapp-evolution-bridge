import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

  constructor(private readonly filePath = process.env.PERSONAL_DATA_PATH || path.join('data', 'personal-assistant.json')) {}

  async init() {
    if (this.loaded) return;
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
    this.data.items.push(item);
    await this.persist();
    return item;
  }

  async list(ownerId: string, kind?: PersonalItemKind): Promise<PersonalItem[]> {
    await this.init();
    return this.data.items.filter(item => item.ownerId === ownerId && item.status === 'pending' && (!kind || item.kind === kind));
  }

  async completeByTitle(ownerId: string, kind: PersonalItemKind, title: string): Promise<PersonalItem | undefined> {
    await this.init();
    const target = normalize(title);
    const item = this.data.items.find(candidate =>
      candidate.ownerId === ownerId && candidate.kind === kind && candidate.status === 'pending'
      && (normalize(candidate.title) === target || normalize(candidate.title).includes(target))
    );
    if (!item) return undefined;
    item.status = 'done';
    await this.persist();
    return item;
  }

  async dueNotifications(now = new Date()): Promise<Array<{ item: PersonalItem; notification: PersonalNotification }>> {
    await this.init();
    return this.data.items.flatMap(item => {
      if (item.status !== 'pending') return [];
      return item.notifications
        .filter(notification => !notification.sentAt && Date.parse(notification.at) <= now.getTime())
        .map(notification => ({ item, notification }));
    });
  }

  async markNotificationSent(itemId: string, notificationId: string, sentAt = new Date()) {
    await this.init();
    const item = this.data.items.find(candidate => candidate.id === itemId);
    const notification = item?.notifications.find(candidate => candidate.id === notificationId);
    if (!item || !notification) return;
    notification.sentAt = sentAt.toISOString();

    if (notification.label === 'ahora') {
      if (item.recurrence && item.dueAt) this.reschedule(item);
      else item.status = 'done';
    }
    await this.persist();
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
