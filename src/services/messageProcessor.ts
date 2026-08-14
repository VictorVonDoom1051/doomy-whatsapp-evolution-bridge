import { config } from '../config.js';
import type { NormalizedMessage } from '../types/evolution.js';
import { extractActivation } from '../utils/activation.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { detectToolHint } from '../utils/toolHint.js';
import { conversationMemory } from './conversationMemory.js';
import { askDoomy } from './doomyApi.js';
import { sendPresence, sendText } from './evolutionApi.js';
import { logInteraction } from './interactionLog.js';
import { roleService } from './roleService.js';
import { runLocalPlugin } from '../plugins/registry.js';
import { canProcessMessage, getGroupPermissions } from './permissionService.js';
import { logger } from '../utils/logger.js';

const processed = new Set<string>();
const limiter = new RateLimiter(config.rateLimitWindowSeconds * 1000, config.rateLimitMaxMessages);

export async function processMessage(msg: NormalizedMessage) {
  if (msg.fromMe) return;
  if (!msg.isGroup) return;
  if (processed.has(msg.messageId)) return;
  processed.add(msg.messageId);
  if (processed.size > 5000) processed.clear();

  if (config.allowedGroupIds.length && !config.allowedGroupIds.includes(msg.remoteJid)) return;

  const activation = extractActivation(msg.text || '');
  if (!activation.active) return;
  const cleanText = activation.cleanText || (msg.hasMedia ? 'Analiza el adjunto enviado.' : '');
  if (!cleanText.trim()) {
    logger.warn({ groupId: msg.remoteJid, text: msg.text }, 'Mensaje vacío después de activación');
    return;
  }

  try {
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
    conversationMemory.add(msg.remoteJid, { role: 'user', content: cleanText, at: new Date().toISOString(), senderId: msg.senderId, senderName: msg.senderName });

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

    conversationMemory.add(msg.remoteJid, { role: 'assistant', content: answer, at: new Date().toISOString() });
    await sendText(msg.remoteJid, answer);
    logInteraction({ at: new Date().toISOString(), groupId: msg.remoteJid, senderId: msg.senderId, senderName: msg.senderName, question: cleanText, answer, toolHint, ms: Date.now() - started });
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
