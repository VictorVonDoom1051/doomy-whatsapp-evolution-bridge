import axios from 'axios';
import { config } from '../config.js';
import { splitMessage } from '../utils/text.js';
import { logger } from '../utils/logger.js';

const client = axios.create({
  baseURL: config.evolution.apiUrl,
  timeout: 30000,
  headers: { apikey: config.evolution.apiKey, 'Content-Type': 'application/json' }
});

export async function sendText(remoteJid: string, text: string) {
  for (const part of splitMessage(text)) {
    await client.post(`/message/sendText/${config.evolution.instance}`, {
      number: remoteJid,
      text: part
    });
  }
}

export async function sendPresence(remoteJid: string, presence: 'composing' | 'paused' = 'composing') {
  try {
    await client.post(`/chat/sendPresence/${config.evolution.instance}`, {
      number: remoteJid,
      presence
    });
  } catch { /* opcional, no romper flujo */ }
}

export async function trySendReaction(remoteJid: string, messageId: string, reaction: string): Promise<boolean> {
  try {
    await client.post(`/message/sendReaction/${config.evolution.instance}`, {
      key: {
        remoteJid,
        fromMe: false,
        id: messageId
      },
      reaction
    });
    return true;
  } catch (err) {
    logger.warn({ err, remoteJid, messageId }, 'Evolution API no pudo enviar la reacción');
    return false;
  }
}

export async function setWebhook() {
  if (!config.publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL requerido para configurar webhook');
  }
  const headers = config.webhookSecret ? { 'x-doomy-secret': config.webhookSecret } : undefined;
  const payload = {
    webhook: {
      url: config.publicBaseUrl + '/webhook/evolution',
      enabled: true,
      webhookByEvents: false,
      headers: headers,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
    }
  };
  await client.post('/webhook/set/' + config.evolution.instance, payload);
}
