import type { EvolutionWebhook, NormalizedMessage } from '../types/evolution.js';

function unwrapMessage(data: any): any {
  let msg = data?.message?.message
    || data?.message
    || data?.messages?.message?.message
    || data?.messages?.message
    || data;

  for (let depth = 0; depth < 4; depth++) {
    const wrapped = msg?.ephemeralMessage?.message
      || msg?.viewOnceMessage?.message
      || msg?.viewOnceMessageV2?.message
      || msg?.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    msg = wrapped;
  }

  return msg;
}

function extractTextFromMessage(msg: any): string {
  return msg?.conversation
    || msg?.extendedTextMessage?.text
    || msg?.imageMessage?.caption
    || msg?.videoMessage?.caption
    || '';
}

function extractText(data: any): string {
  return extractTextFromMessage(unwrapMessage(data))
    || data?.text
    || data?.messageText
    || data?.chatInput
    || '';
}

function extractContextInfo(msg: any): any {
  return msg?.extendedTextMessage?.contextInfo
    || msg?.imageMessage?.contextInfo
    || msg?.videoMessage?.contextInfo
    || msg?.documentMessage?.contextInfo
    || msg?.audioMessage?.contextInfo
    || msg?.contextInfo;
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
  const message = unwrapMessage(data);
  const contextInfo = extractContextInfo(message) || data.contextInfo;
  const quotedMsg = contextInfo?.quotedMessage;
  const isReply = Boolean(quotedMsg || contextInfo?.stanzaId);
  const quotedMessageId = quotedMsg?.key?.id || contextInfo?.stanzaId;
  const quotedText = quotedMsg ? extractTextFromMessage(unwrapMessage(quotedMsg)) : undefined;

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
    quotedMessageId,
    quotedText
  };
}
