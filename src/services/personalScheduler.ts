import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sendText } from './evolutionApi.js';
import { personalStore } from './personalStore.js';

let timer: NodeJS.Timeout | undefined;
let running = false;

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
  } catch (err) {
    logger.error({ err }, 'Error ejecutando recordatorios personales');
  } finally {
    running = false;
  }
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
