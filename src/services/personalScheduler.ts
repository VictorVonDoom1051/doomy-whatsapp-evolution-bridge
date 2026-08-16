import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sendText } from './evolutionApi.js';
import { personalStore } from './personalStore.js';
import { buildDailyBrief, isGoogleConnected } from './googleWorkspace.js';

let timer: NodeJS.Timeout | undefined;
let running = false;
let lastSummaryDate = '';

export async function runPersonalScheduler(now = new Date()) {
  if (running) return;
  running = true;
  try {
    for (const { item, notification } of await personalStore.dueNotifications(now)) {
      const icon = item.kind === 'appointment' ? '📅' : '⏰';
      const prefix = item.kind === 'appointment' && notification.label !== 'ahora'
        ? `Tu cita es ${notification.label}`
        : item.kind === 'appointment' ? 'Es hora de tu cita' : 'Recordatorio';
      await sendText(item.ownerId, `${icon} ${prefix}: ${item.title}`);
      await personalStore.markNotificationSent(item.id, notification.id, now);
    }
    await maybeSendDailySummary(now);
  } catch (err) {
    logger.error({ err }, 'Error ejecutando recordatorios personales');
  } finally {
    running = false;
  }
}

async function maybeSendDailySummary(now: Date) {
  if (!config.google.dailySummaryEnabled || !config.ownerUserIds.length || !(await isGoogleConnected())) return;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.google.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  if (date === lastSummaryDate || hour !== config.google.dailySummaryHour || minute < config.google.dailySummaryMinute || minute > config.google.dailySummaryMinute + 2) return;
  const summary = await buildDailyBrief(now);
  for (const owner of config.ownerUserIds) await sendText(owner, summary);
  lastSummaryDate = date;
}

export async function startPersonalScheduler() {
  if (!config.ownerUserIds.length || timer) return;
  await personalStore.init();
  timer = setInterval(() => void runPersonalScheduler(), config.personalSchedulerIntervalSeconds * 1000);
  timer.unref();
  logger.info('Programador de recordatorios personales activo');
}

export function stopPersonalScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

export async function closePersonalScheduler() {
  stopPersonalScheduler();
  await personalStore.close();
}
