import { buildNotifications, personalStore, type PersonalItemKind, type Recurrence } from './personalStore.js';

export interface PersonalCommandResult { handled: boolean; response?: string }

export async function handlePersonalCommand(text: string, ownerId: string, now = new Date()): Promise<PersonalCommandResult> {
  const clean = text.trim();
  const normalized = normalize(clean);
  const shoppingAdd = clean.match(/^(?:agrega|añade|anota)\s+(.+?)\s+(?:a|en)\s+(?:la\s+)?(?:lista\s+de\s+)?compras?$/i);
  if (shoppingAdd) return addSimple(ownerId, 'shopping', shoppingAdd[1], 'Agregado a compras');
  const errandAdd = clean.match(/^(?:agrega|añade|anota)\s+(.+?)\s+(?:a|en)\s+(?:la\s+lista\s+de\s+)?(?:mandados|pendientes)$/i);
  if (errandAdd) return addSimple(ownerId, 'errand', errandAdd[1], 'Mandado anotado');
  if (/^(?:que|qué|muestra|ver|dime).*(?:lista de )?compras/.test(normalized) || normalized === 'lista de compras') return showList(ownerId, 'shopping', 'Lista de compras');
  if (/^(?:que|qué|muestra|ver|dime).*(?:mandados|pendientes)/.test(normalized) || /^(?:mandados|pendientes)$/.test(normalized)) return showList(ownerId, 'errand', 'Mandados pendientes');
  if (/^(?:que|qué|muestra|ver|dime).*(?:citas|agenda)/.test(normalized)) return showTimed(ownerId, 'appointment', 'Próximas citas');
  if (/^(?:que|qué|muestra|ver|dime).*recordatorios/.test(normalized)) return showTimed(ownerId, 'reminder', 'Recordatorios');
  const shoppingDone = clean.match(/^(?:marca|marcar|quita|elimina)\s+(.+?)(?:\s+como\s+(?:comprado|listo))?\s+(?:de\s+)?(?:la\s+)?(?:lista\s+de\s+)?compras?$/i);
  if (shoppingDone) return complete(ownerId, 'shopping', shoppingDone[1]);
  const errandDone = clean.match(/^(?:marca|marcar|quita|elimina)\s+(.+?)(?:\s+como\s+(?:terminado|hecho|listo))?(?:\s+de\s+(?:mandados|pendientes))?$/i);
  if (errandDone && /(?:terminado|hecho|listo|mandados|pendientes)/i.test(clean)) return complete(ownerId, 'errand', errandDone[1]);
  const reminderExpression = extractReminderExpression(clean);
  if (reminderExpression) return addTimed(ownerId, 'reminder', reminderExpression, now);
  if (/^(?:agenda|agendar|crea una cita|crear una cita)\b/i.test(clean)) return addTimed(ownerId, 'appointment', clean.replace(/^(?:agenda|agendar|crea una cita|crear una cita)\s+/i, ''), now);
  return { handled: false };
}

export function extractReminderExpression(text: string): string | null {
  const match = text.match(/(?:recuerdame|recuérdame|recuerdanos|recuérdanos|recuerdale|recuérdale|recuerdales|recuérdales)\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function addSimple(ownerId: string, kind: PersonalItemKind, title: string, label: string): Promise<PersonalCommandResult> {
  await personalStore.add({ ownerId, kind, title: title.trim(), notifications: [] });
  return { handled: true, response: `${label}: ${title.trim()} ✅` };
}
async function showList(ownerId: string, kind: PersonalItemKind, label: string): Promise<PersonalCommandResult> {
  const items = await personalStore.list(ownerId, kind);
  return { handled: true, response: items.length ? `${label}:\n${items.map((item, index) => `${index + 1}. ${item.title}`).join('\n')}` : `${label}: está vacía.` };
}
async function showTimed(ownerId: string, kind: PersonalItemKind, label: string): Promise<PersonalCommandResult> {
  const items = (await personalStore.list(ownerId, kind)).sort((a, b) => Date.parse(a.dueAt || '') - Date.parse(b.dueAt || ''));
  return { handled: true, response: items.length ? `${label}:\n${items.map((item, index) => `${index + 1}. ${item.title} — ${formatDate(item.dueAt!)}`).join('\n')}` : `${label}: no tienes ninguno pendiente.` };
}
async function complete(ownerId: string, kind: PersonalItemKind, title: string): Promise<PersonalCommandResult> {
  const item = await personalStore.completeByTitle(ownerId, kind, title.trim());
  return { handled: true, response: item ? `Listo, marqué “${item.title}” como terminado ✅` : `No encontré “${title.trim()}” en esa lista.` };
}
async function addTimed(ownerId: string, kind: PersonalItemKind, expression: string, now: Date): Promise<PersonalCommandResult> {
  const parsed = parseSpanishDateTime(expression, now);
  if (!parsed) return { handled: true, response: '¿Para qué día y hora lo programo? Por ejemplo: “mañana a las 9”.' };
  const recurrence = parseRecurrence(expression);
  const item = await personalStore.add({ ownerId, kind, title: parsed.title, dueAt: parsed.date.toISOString(), recurrence, notifications: buildNotifications(kind, parsed.date, now) });
  const prefix = kind === 'appointment' ? 'Cita agendada' : 'Recordatorio creado';
  return { handled: true, response: `${prefix}: ${item.title}, ${formatDate(item.dueAt!)}${item.recurrence ? ` (${recurrenceLabel(item.recurrence)})` : ''} ✅` };
}

export function parseSpanishDateTime(expression: string, now = new Date()): { title: string; date: Date } | null {
  const relativePattern = '(?:en|dentro de)\\s+(\\d+)\\s+(minutos?|horas?|d[ií]as?|mes(?:es)?)';
  const relativeFirst = expression.match(new RegExp(`^${relativePattern}\\s+(.+)$`, 'i'));
  const relativeLast = expression.match(new RegExp(`^(.+?)\\s+${relativePattern}$`, 'i'));
  const relativeMiddle = expression.match(new RegExp(`^(.+?)\\s+${relativePattern}\\s+(.+)$`, 'i'));
  if (relativeFirst || relativeLast || relativeMiddle) {
    const match = relativeFirst || relativeLast || relativeMiddle!;
    const amount = Number(relativeFirst ? match[1] : match[2]);
    const unit = normalize(relativeFirst ? match[2] : match[3]);
    const title = (relativeFirst ? match[3] : relativeMiddle ? `${match[1]} ${match[4]}` : match[1]).trim();
    if (!amount || !title) return null;
    if (unit.startsWith('mes')) { const date = new Date(now); date.setUTCMonth(date.getUTCMonth() + amount); return { title, date }; }
    const multiplier = unit.startsWith('minuto') ? 60_000 : unit.startsWith('hora') ? 3_600_000 : 86_400_000;
    return { title, date: new Date(now.getTime() + amount * multiplier) };
  }
  const monthly = expression.match(/^(?:cada mes|mensualmente|todos los meses)(?:\s+el)?(?:\s+d[ií]a)?\s+(\d{1,2})\s+(?:a las?|a la)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(.+)$/i)
    || expression.match(/^(.+?)\s+(?:cada mes|mensualmente|todos los meses)(?:\s+el)?(?:\s+d[ií]a)?\s+(\d{1,2})\s+(?:a las?|a la)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (monthly) {
    const starts = /^(?:cada mes|mensualmente|todos los meses)/i.test(expression);
    const day = Number(starts ? monthly[1] : monthly[2]); let hour = Number(starts ? monthly[2] : monthly[3]);
    const minute = Number((starts ? monthly[3] : monthly[4]) || 0); const meridiem = (starts ? monthly[4] : monthly[5])?.toLowerCase();
    const title = (starts ? monthly[5] : monthly[1]).trim();
    if (meridiem === 'pm' && hour < 12) hour += 12; if (meridiem === 'am' && hour === 12) hour = 0;
    if (day < 1 || day > 31 || hour > 23 || minute > 59 || !title) return null;
    const local = localDateParts(now); let date = monthlyDate(local.year, local.month, day, hour, minute);
    if (date.getTime() <= now.getTime()) { const next = new Date(Date.UTC(local.year, local.month, 1)); date = monthlyDate(next.getUTCFullYear(), next.getUTCMonth() + 1, day, hour, minute); }
    return { title, date };
  }
  const dayPattern = '(hoy|mañana|pasado mañana|el lunes|el martes|el miércoles|el miercoles|el jueves|el viernes|el sábado|el sabado|el domingo|todos los días|todos los dias|cada día|cada dia)';
  const timePattern = '(?:a las?|a la)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
  const first = expression.match(new RegExp(`^${dayPattern}\\s+${timePattern}\\s+(.+)$`, 'i'));
  const last = expression.match(new RegExp(`^(.+?)\\s+${dayPattern}\\s+${timePattern}$`, 'i'));
  const match = first || last; if (!match) return null;
  const dayText = first ? match[1] : match[2]; let hour = Number(first ? match[2] : match[3]);
  const minute = Number((first ? match[3] : match[4]) || 0); const meridiem = (first ? match[4] : match[5])?.toLowerCase(); const title = (first ? match[5] : match[1]).trim();
  if (meridiem === 'pm' && hour < 12) hour += 12; if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || !title) return null;
  const localDay = resolveDay(dayText, now); let date = zonedTimeToUtc(localDay.year, localDay.month, localDay.day, hour, minute);
  if (/todos los d[ií]as|cada d[ií]a/i.test(dayText) && date.getTime() <= now.getTime()) { const tomorrow = addLocalDays(localDay, 1); date = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute); }
  if (date.getTime() <= now.getTime() && normalize(dayText) === 'hoy') return null;
  return { title, date };
}

function resolveDay(value: string, now: Date) {
  let result = localDateParts(now); const day = normalize(value).replace(/^el /, '');
  if (day === 'manana') result = addLocalDays(result, 1); else if (day === 'pasado manana') result = addLocalDays(result, 2);
  else if (!['hoy', 'todos los dias', 'cada dia'].includes(day)) { const weekdays: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }; const target = weekdays[day]; if (target !== undefined) { const current = new Date(Date.UTC(result.year, result.month - 1, result.day)).getUTCDay(); result = addLocalDays(result, (target - current + 7) % 7 || 7); } }
  return result;
}
function localDateParts(value: Date) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value); const get = (type: string) => Number(parts.find(part => part.type === type)?.value); return { year: get('year'), month: get('month'), day: get('day') }; }
function addLocalDays(value: { year: number; month: number; day: number }, days: number) { const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }; }
function monthlyDate(year: number, month: number, requestedDay: number, hour: number, minute: number) { const last = new Date(Date.UTC(year, month, 0)).getUTCDate(); return zonedTimeToUtc(year, month, Math.min(requestedDay, last), hour, minute); }
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number) { const guess = Date.UTC(year, month - 1, day, hour, minute); const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)); const get = (type: string) => Number(parts.find(part => part.type === type)?.value); const represented = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute')); return new Date(guess - (represented - guess)); }
function parseRecurrence(value: string): Recurrence | undefined { const n = normalize(value); if (/todos los dias|cada dia/.test(n)) return 'daily'; if (/cada semana|semanalmente/.test(n)) return 'weekly'; if (/cada mes|mensual(?:mente)?|todos los meses/.test(n)) return 'monthly'; return undefined; }
function recurrenceLabel(value: Recurrence) { return value === 'daily' ? 'diario' : value === 'weekly' ? 'semanal' : 'mensual'; }
function formatDate(value: string) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value)); }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
