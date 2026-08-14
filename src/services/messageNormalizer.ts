import type { EvolutionWebhook, NormalizedMessage } from '../types/evolution.js';

function extractText(data: any): string {
  const msg = data?.message || data?.messages?.message || data;
  return msg?.conversation
    || msg?.extendedTextMessage?.text
    || msg?.imageMessage?.caption
    || msg?.videoMessage?.caption
    || data?.text
    || data?.messageText
    || '';
}

export function normalizeEvolutionMessage(body: EvolutionWebhook): NormalizedMessage | null {
  const data = body.data || body;
  const key = data.key || data.message?.key || {};
  const remoteJid = key.remoteJid || data.remoteJid || data.chatId || data.from || '';
  if (!remoteJid) return null;
  const participant = key.participant || data.participant || data.sender || remoteJid;
  const text = extractText(data);
  const messageType = data.messageType || data.message?.messageType || data.type;
  const hasMedia = Boolean(messageType && !['conversation', 'extendedTextMessage'].includes(messageType));

  // Detectar si es un reply/quote a otro mensaje
  const extendedTextMsg = data.message?.extendedTextMessage || data.extendedTextMessage;
  const contextInfo = extendedTextMsg?.contextInfo || data.contextInfo;
  const quotedMsg = contextInfo?.quotedMessage;
  const isReply = Boolean(quotedMsg || contextInfo?.stanzaId);
  const quotedMessageId = quotedMsg?.key?.id || contextInfo?.stanzaId;

  return {
    messageId: key.id || data.id || `${remoteJid}-${Date.now()}`,
    remoteJid,
    isGroup: remoteJid.endsWith('@g.us'),
    fromMe: Boolean(key.fromMe || data.fromMe),
    senderId: participant,
    senderName: data.pushName || data.senderName || data.notifyName,
    text,
    messageType,
    raw: data,
    hasMedia,
    isReply,
    quotedMessageId
  };
}
