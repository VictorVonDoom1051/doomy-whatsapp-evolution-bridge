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
  const messageIds: string[] = [];
  for (const part of splitMessage(text)) {
    const response = await client.post(`/message/sendText/${config.evolution.instance}`, {
      number: remoteJid,
      text: part
    });
    const messageId = response.data?.key?.id
      || response.data?.message?.key?.id
      || response.data?.data?.key?.id;
    if (messageId) messageIds.push(messageId);
  }
  return messageIds;
}

export async function sendPresence(remoteJid: string, presence: 'composing' | 'paused' = 'composing') {
  try {
    await client.post(`/chat/sendPresence/${config.evolution.instance}`, {
      number: remoteJid,
      presence
    });
  } catch { /* opcional, no romper flujo */ }
}

export interface DownloadedMedia {
  base64: string;
  mimeType: string;
  fileName?: string;
}

export async function downloadMediaMessage(raw: any): Promise<DownloadedMedia> {
  const response = await client.post(`/chat/getBase64FromMediaMessage/${config.evolution.instance}`, {
    message: raw,
    convertToMp4: false
  });
  const data = response.data?.data || response.data || {};
  const rawBase64 = data.base64 || data.media || '';
  if (!rawBase64 || typeof rawBase64 !== 'string') {
    throw new Error('Evolution API no devolvió el contenido Base64 del adjunto.');
  }
  const descriptor = mediaDescriptor(raw);
  const dataUri = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
  return {
    base64: dataUri ? dataUri[2] : rawBase64,
    mimeType: dataUri?.[1] || data.mimetype || data.mimeType || descriptor.mimeType || 'application/octet-stream',
    fileName: data.fileName || data.filename || descriptor.fileName
  };
}

function mediaDescriptor(raw: any): { mimeType?: string; fileName?: string } {
  let message = raw?.message?.message || raw?.message || raw;
  for (let depth = 0; depth < 4; depth++) {
    const wrapped = message?.ephemeralMessage?.message
      || message?.viewOnceMessage?.message
      || message?.viewOnceMessageV2?.message
      || message?.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    message = wrapped;
  }
  const media = message?.imageMessage || message?.documentMessage || message?.videoMessage || message?.audioMessage;
  return { mimeType: media?.mimetype, fileName: media?.fileName || media?.title };
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
