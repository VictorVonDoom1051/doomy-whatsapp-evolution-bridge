import { google, type calendar_v3, type gmail_v1, type tasks_v1 } from 'googleapis';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { googleTokenStore } from './googleTokenStore.js';
import { parseSpanishDateTime } from './personalAssistant.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.readonly'
];

type PendingAction = { expiresAt: number; label: string; run: () => Promise<string> };
const pending = new Map<string, PendingAction>();
const oauthStates = new Map<string, number>();

export interface GoogleCommandResult { handled: boolean; response?: string }

function oauthClient() {
  if (!config.google.clientId || !config.google.clientSecret || !config.google.redirectUri) {
    throw new Error('Falta configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI.');
  }
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export function googleAuthorizationUrl() {
  const state = randomUUID();
  oauthStates.set(state, Date.now() + 10 * 60_000);
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES, state });
}

export function consumeGoogleOauthState(state: string) {
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  return Boolean(expiresAt && expiresAt > Date.now());
}

export async function saveGoogleAuthorizationCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  const previous = await googleTokenStore.get();
  const refreshToken = tokens.refresh_token || previous?.refreshToken;
  if (!refreshToken) throw new Error('Google no devolvió refresh_token; vuelve a autorizar con consentimiento.');
  await googleTokenStore.set({ refreshToken, accessToken: tokens.access_token || undefined, expiryDate: tokens.expiry_date || undefined });
}

export async function isGoogleConnected() {
  return Boolean(await googleTokenStore.get());
}

async function auth() {
  const stored = await googleTokenStore.get();
  if (!stored) throw new Error('Google Workspace todavía no está conectado.');
  const client = oauthClient();
  client.setCredentials({ refresh_token: stored.refreshToken, access_token: stored.accessToken, expiry_date: stored.expiryDate });
  return client;
}

export async function handleGoogleCommand(text: string, conversationId: string, now = new Date()): Promise<GoogleCommandResult> {
  const clean = text.trim();
  const normalized = normalize(clean);

  if (/^(?:confirmar|confirmo|si,? confirmar|sí,? confirmar)$/.test(normalized)) {
    const action = pending.get(conversationId);
    if (!action || action.expiresAt < Date.now()) {
      pending.delete(conversationId);
      return { handled: true, response: 'No hay una acción pendiente por confirmar.' };
    }
    pending.delete(conversationId);
    return { handled: true, response: await action.run() };
  }
  if (/^(?:cancelar|cancela)$/.test(normalized) && pending.has(conversationId)) {
    pending.delete(conversationId);
    return { handled: true, response: 'Acción cancelada.' };
  }

  if (/google.*(?:estado|conectado|conexion)|(?:estado|conexion).*google/.test(normalized)) {
    return { handled: true, response: await isGoogleConnected() ? 'Google Workspace está conectado ✅' : 'Google Workspace aún no está conectado.' };
  }
  if (!(await isGoogleConnected())) return { handled: false };

  if (/^(?:que|qué|dime|muestra|ver|revisa).*(?:agenda|calendario|citas)/.test(normalized)) {
    const days = /semana/.test(normalized) ? 7 : /manana/.test(normalized) ? 2 : 1;
    return { handled: true, response: await listCalendar(now, days) };
  }

  const createEvent = clean.match(/^(?:agenda|agendar|crea una cita|crear una cita)\s+(.+)$/i);
  if (createEvent) {
    const parsed = parseSpanishDateTime(createEvent[1], now);
    if (!parsed) return { handled: true, response: '¿Para qué día y hora la agendo?' };
    const label = `${parsed.title} — ${formatDate(parsed.date)}`;
    pending.set(conversationId, {
      expiresAt: Date.now() + 10 * 60_000,
      label,
      run: async () => createCalendarEvent(parsed.title, parsed.date)
    });
    return { handled: true, response: `Voy a crear esta cita en Google Calendar:\n${label}\n\nResponde *confirmar* o *cancelar*.` };
  }

  const addTask = clean.match(/^(?:agrega|añade|crea|anota)\s+(.+?)\s+(?:a|en)\s+(?:google\s+)?tasks?$/i);
  if (addTask) return { handled: true, response: await createTask(addTask[1]) };
  if (/^(?:que|qué|dime|muestra|ver|revisa).*(?:google tasks|tareas de google)/.test(normalized)) {
    return { handled: true, response: await listTasks() };
  }

  const driveSearch = clean.match(/^(?:busca|encuentra|localiza)\s+(?:en\s+)?(?:mi\s+)?drive\s+(.+)$/i)
    || clean.match(/^(?:busca|encuentra|localiza)\s+(.+?)\s+en\s+(?:mi\s+)?drive$/i);
  if (driveSearch) return { handled: true, response: await searchDrive(driveSearch[1]) };

  if (/^(?:revisa|muestra|dime|ver).*(?:correos?|gmail).*(?:no leidos|sin leer|importantes|recientes)/.test(normalized)
      || /^(?:correos?|gmail)\s+(?:no leidos|sin leer|recientes)$/.test(normalized)) {
    return { handled: true, response: await listUnreadEmails() };
  }
  const gmailSearch = clean.match(/^(?:busca|encuentra)\s+(?:en\s+)?gmail\s+(.+)$/i)
    || clean.match(/^(?:busca|encuentra)\s+(?:el\s+)?correo\s+(?:de|sobre)\s+(.+)$/i);
  if (gmailSearch) return { handled: true, response: await searchGmail(gmailSearch[1]) };

  const draft = clean.match(/^(?:crea|prepara|redacta)\s+(?:un\s+)?borrador\s+(?:para\s+)?([^:]+):\s*(.+)$/i);
  if (draft) {
    const recipient = draft[1].trim();
    if (!/^\S+@\S+\.\S+$/.test(recipient)) return { handled: true, response: 'Necesito el correo completo del destinatario para crear el borrador.' };
    const body = draft[2].trim();
    pending.set(conversationId, {
      expiresAt: Date.now() + 10 * 60_000,
      label: `Borrador para ${recipient}`,
      run: async () => createGmailDraft(recipient, 'Mensaje de VonverIA', body)
    });
    return { handled: true, response: `Crearé un borrador para ${recipient}. No se enviará automáticamente.\n\nResponde *confirmar* o *cancelar*.` };
  }

  if (/^(?:resumen|briefing|informe)\s+(?:del\s+)?d[ií]a/.test(clean)) {
    return { handled: true, response: await buildDailyBrief(now) };
  }
  return { handled: false };
}

export async function buildDailyBrief(now = new Date()) {
  const [calendar, tasks, emails] = await Promise.all([listCalendar(now, 1), listTasks(5), listUnreadEmails(5)]);
  return `☀️ *Resumen de Doomy*\n\n${calendar}\n\n${tasks}\n\n${emails}`;
}

async function listCalendar(now: Date, days: number) {
  const client = google.calendar({ version: 'v3', auth: await auth() });
  const end = new Date(now.getTime() + days * 86_400_000);
  const result = await client.events.list({ calendarId: config.google.calendarId, timeMin: now.toISOString(), timeMax: end.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 10 });
  const events = result.data.items || [];
  return events.length ? `📅 *Agenda*\n${events.map(event => `• ${event.summary || 'Sin título'} — ${formatEvent(event)}`).join('\n')}` : '📅 Agenda: no hay eventos próximos.';
}

async function createCalendarEvent(title: string, start: Date) {
  const client = google.calendar({ version: 'v3', auth: await auth() });
  const end = new Date(start.getTime() + 60 * 60_000);
  await client.events.insert({ calendarId: config.google.calendarId, requestBody: { summary: title, start: { dateTime: start.toISOString(), timeZone: config.google.timeZone }, end: { dateTime: end.toISOString(), timeZone: config.google.timeZone }, reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] } } });
  return `Cita creada en Google Calendar: ${title}, ${formatDate(start)} ✅`;
}

async function listTasks(limit = 10) {
  const client = google.tasks({ version: 'v1', auth: await auth() });
  const result = await client.tasks.list({ tasklist: config.google.taskListId, showCompleted: false, maxResults: limit });
  const items = result.data.items || [];
  return items.length ? `✅ *Tareas*\n${items.map(item => `• ${item.title || 'Sin título'}`).join('\n')}` : '✅ Google Tasks: no tienes pendientes.';
}

async function createTask(title: string) {
  const client = google.tasks({ version: 'v1', auth: await auth() });
  await client.tasks.insert({ tasklist: config.google.taskListId, requestBody: { title } });
  return `Agregado a Google Tasks: ${title} ✅`;
}

async function searchDrive(query: string) {
  const client = google.drive({ version: 'v3', auth: await auth() });
  const safe = query.replace(/['\\]/g, '\\$&');
  const result = await client.files.list({ q: `trashed = false and fullText contains '${safe}'`, fields: 'files(id,name,mimeType,webViewLink,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: 8 });
  const files = result.data.files || [];
  return files.length ? `📁 *Drive*\n${files.map(file => `• ${file.name}${file.webViewLink ? `\n  ${file.webViewLink}` : ''}`).join('\n')}` : `No encontré archivos en Drive relacionados con “${query}”.`;
}

async function listUnreadEmails(limit = 8) { return gmailResults('is:unread newer_than:14d', limit, 'Correos sin leer'); }
async function searchGmail(query: string) { return gmailResults(query, 8, `Resultados para “${query}”`); }

async function gmailResults(query: string, limit: number, label: string) {
  const client = google.gmail({ version: 'v1', auth: await auth() });
  const list = await client.users.messages.list({ userId: 'me', q: query, maxResults: limit });
  const messages = await Promise.all((list.data.messages || []).map(item => client.users.messages.get({ userId: 'me', id: item.id!, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] })));
  if (!messages.length) return `📧 ${label}: no encontré mensajes.`;
  return `📧 *${label}*\n${messages.map(({ data }) => `• ${header(data, 'Subject') || '(sin asunto)'}\n  ${header(data, 'From') || ''}`).join('\n')}`;
}

async function createGmailDraft(to: string, subject: string, body: string) {
  const client = google.gmail({ version: 'v1', auth: await auth() });
  const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`).toString('base64url');
  await client.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
  return `Borrador creado en Gmail para ${to}. No fue enviado ✅`;
}

function header(message: gmail_v1.Schema$Message, name: string) { return message.payload?.headers?.find(item => item.name?.toLowerCase() === name.toLowerCase())?.value; }
function formatEvent(event: calendar_v3.Schema$Event) { const value = event.start?.dateTime || event.start?.date; return value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: event.start?.dateTime ? 'short' : undefined, timeZone: config.google.timeZone }).format(new Date(value)) : 'sin fecha'; }
function formatDate(value: Date) { return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: config.google.timeZone }).format(value); }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
