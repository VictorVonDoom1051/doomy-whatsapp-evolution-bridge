import { config } from '../config.js';
import type { NormalizedMessage } from '../types/evolution.js';
import { extractActivation } from '../utils/activation.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { detectToolHint } from '../utils/toolHint.js';
import { conversationMemory } from './conversationMemory.js';
import { askDoomy } from './doomyApi.js';
import { sendDocument, sendPresence, sendText } from './evolutionApi.js';
import { logInteraction } from './interactionLog.js';
import { roleService } from './roleService.js';
import { runLocalPlugin } from '../plugins/registry.js';
import { canProcessMessage, getGroupPermissions } from './permissionService.js';
import { logger } from '../utils/logger.js';
import { parseDoomyResponse, selectAcknowledgementReaction } from '../utils/reaction.js';
import { interpretMedia } from './mediaInterpreter.js';

const processed = new Set<string>();
const limiter = new RateLimiter(config.rateLimitWindowSeconds * 1000, config.rateLimitMaxMessages);

export async function processMessage(msg: NormalizedMessage) {
  if (msg.fromMe) return;
  const isOwnerDirectMessage = !msg.isGroup && isConfiguredOwner(msg.senderId, msg.remoteJid);
  if (!msg.isGroup && !isOwnerDirectMessage) {
    // Antes esto descartaba el mensaje en silencio: sin log era indistinguible
    // de "Doomy respondió bien", y costaba horas de diagnóstico a ciegas.
    logger.warn({
      senderId: msg.senderId,
      remoteJid: msg.remoteJid,
      ownerIdsConfigurados: config.ownerUserIds.length
    }, 'Mensaje directo descartado: el remitente no está en OWNER_USER_IDS');
    return;
  }
  if (processed.has(msg.messageId)) {
    logger.info({ messageId: msg.messageId }, 'Mensaje duplicado ignorado');
    return;
  }
  processed.add(msg.messageId);
  if (processed.size > 5000) processed.clear();

  if (msg.isGroup && config.allowedGroupIds.length && !config.allowedGroupIds.includes(msg.remoteJid)) return;

  // Detectar activación: por trigger o por reply a un mensaje de Doomy
  let activation = extractActivation(msg.text || '');
  if (isOwnerDirectMessage && !activation.active) {
    activation = { active: true, cleanText: msg.text || '' };
  }
  const isReplyToDoomy = msg.isReply && conversationMemory.isReplyToAssistant(
    msg.remoteJid,
    msg.quotedText,
    msg.quotedMessageId
  );

  if (isReplyToDoomy) {
    const reaction = selectAcknowledgementReaction(msg.text);
    if (reaction) {
      await sendText(msg.remoteJid, reaction);
      conversationMemory.add(msg.remoteJid, {
        role: 'user',
        content: msg.text.trim(),
        at: new Date().toISOString(),
        senderId: msg.senderId,
        senderName: msg.senderName,
        source: 'direct'
      });
      return;
    }
  }

  // Si no tiene trigger pero es un reply, activar automáticamente
  if (!activation.active && isReplyToDoomy) {
    activation = { active: true, cleanText: msg.text || '' };
    logger.info({ groupId: msg.remoteJid, quotedId: msg.quotedMessageId }, 'Reply detectado sin trigger');
  }

  if (!activation.active) {
    const ambientText = msg.text.trim();
    if (config.ambientMemoryEnabled && ambientText) {
      conversationMemory.add(msg.remoteJid, {
        role: 'user',
        content: ambientText,
        at: new Date().toISOString(),
        senderId: msg.senderId,
        senderName: msg.senderName,
        source: 'ambient'
      });
    }
    return;
  }
  let cleanText = activation.cleanText || (msg.hasMedia ? 'Analiza el adjunto enviado.' : '');
  if (!cleanText.trim()) {
    logger.warn({ groupId: msg.remoteJid, text: msg.text }, 'Mensaje vacío después de activación');
    return;
  }

  try {
    if (msg.hasMedia) {
      await sendPresence(msg.remoteJid, 'composing');
      const media = await interpretMedia(msg.raw, cleanText, msg.remoteJid);
      if (media.kind === 'image') {
        await sendText(msg.remoteJid, media.response);
        return;
      }
      if (media.kind === 'storedSpreadsheet') {
        await sendText(msg.remoteJid, media.response);
        return;
      }
      if (media.kind === 'comparison') {
        await sendText(msg.remoteJid, media.response);
        await sendDocument(msg.remoteJid, media.base64, media.fileName, 'Resultado de la comparación de folios');
        return;
      }
      cleanText = media.enrichedMessage;
    }

    // Validar permisos del grupo
    const permCheck = canProcessMessage(msg.remoteJid, cleanText);
    if (!permCheck.allowed) {
      logger.warn({ groupId: msg.remoteJid, reason: permCheck.reason }, 'Permiso denegado');
      await sendText(msg.remoteJid, permCheck.reason || 'No tienes permiso para ese comando en este grupo.');
      return;
    }

    if (!limiter.allowed(msg.senderId)) {
      await sendText(msg.remoteJid, 'Doomy detectó demasiadas solicitudes seguidas. Dame unos segundos y vuelvo al trono.');
      return;
    }

    const role = roleService.getRole(msg.senderId);
    const pluginResult = await runLocalPlugin(cleanText, { groupId: msg.remoteJid, senderId: msg.senderId, role });
    if (pluginResult.handled && pluginResult.response) {
      await sendText(msg.remoteJid, pluginResult.response);
      return;
    }

    const started = Date.now();
    await sendPresence(msg.remoteJid, 'composing');
    const toolHint = detectToolHint(cleanText);
    const history = conversationMemory.get(msg.remoteJid);
    conversationMemory.add(msg.remoteJid, { role: 'user', content: cleanText, at: new Date().toISOString(), senderId: msg.senderId, senderName: msg.senderName, source: 'direct' });

    const answer = await askDoomy({
      message: cleanText,
      groupId: msg.remoteJid,
      senderId: msg.senderId,
      senderName: msg.senderName,
      role,
      toolHint,
      history,
      raw: msg.hasMedia ? msg.raw : undefined
    });

    const response = parseDoomyResponse(answer);
    const memoryAnswer = response.kind === 'reaction' ? `[Reacción ${response.reaction}]` : response.text;

    // sendText con texto vacío no envía nada y no lanza error: sin estas dos
    // líneas, "Doomy no contestó" era indistinguible de "Doomy contestó bien".
    logger.info({
      remoteJid: msg.remoteJid,
      msDoomy: Date.now() - started,
      largoRespuestaDoomy: (answer || '').length,
      tipo: response.kind
    }, 'Doomy respondió');

    if (response.kind === 'reaction') {
      await sendText(msg.remoteJid, response.reaction);
    } else {
      const sentMessageIds = await sendText(msg.remoteJid, response.text);
      logger.info({
        remoteJid: msg.remoteJid,
        partesEnviadas: sentMessageIds.length,
        largoTexto: (response.text || '').length
      }, sentMessageIds.length ? 'Respuesta entregada a Evolution' : 'ATENCIÓN: no se envió ninguna parte (texto vacío)');
      conversationMemory.add(msg.remoteJid, {
        role: 'assistant',
        content: memoryAnswer,
        at: new Date().toISOString(),
        source: 'assistant',
        messageId: sentMessageIds.at(-1)
      });
    }

    logInteraction({ at: new Date().toISOString(), groupId: msg.remoteJid, senderId: msg.senderId, senderName: msg.senderName, question: cleanText, answer: memoryAnswer, toolHint, ms: Date.now() - started });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, errMsg, groupId: msg.remoteJid, senderId: msg.senderId }, 'Error procesando mensaje');

    let userMessage = 'Doomy tuvo un fallo temporal en el trono tecnológico. Intenta de nuevo.';

    // Mensajes de error más específicos
    if (errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED')) {
      userMessage = 'Doomy no puede conectar con Doomy Oficina. Revisa que esté disponible.';
    } else if (errMsg.includes('401') || errMsg.includes('unauthorized')) {
      userMessage = 'Error de autenticación con Doomy Oficina. Contacta al administrador.';
    } else if (errMsg.includes('429')) {
      userMessage = 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.';
    } else if (/adjunto|archivo supera|extraer texto del PDF|ANTHROPIC_API_KEY|interpretar archivos|interpretación de la imagen|Excel|folio/i.test(errMsg)) {
      userMessage = errMsg;
    }

    try {
      await sendText(msg.remoteJid, userMessage);
    } catch (sendErr) {
      logger.error({ sendErr }, 'No se pudo enviar el mensaje de fallback a WhatsApp');
    }
  } finally {
    await sendPresence(msg.remoteJid, 'paused').catch(() => {});
  }
}

export function isConfiguredOwner(...identifiers: string[]): boolean {
  const configured = new Set(config.ownerUserIds.flatMap(ownerAliases));
  return identifiers.flatMap(ownerAliases).some(identifier => configured.has(identifier));
}

function ownerAliases(value: string): string[] {
  const raw = (value || '').trim().toLowerCase();
  const digits = raw.split('@')[0].replace(/\D/g, '');
  if (!digits) return raw ? [raw] : [];

  const aliases = new Set([raw, digits]);
  // Evolution/WhatsApp puede representar números mexicanos con 52 o con el 1 histórico (521).
  if (digits.startsWith('521') && digits.length === 13) aliases.add(`52${digits.slice(3)}`);
  if (digits.startsWith('52') && !digits.startsWith('521') && digits.length === 12) aliases.add(`521${digits.slice(2)}`);
  return [...aliases];
}
