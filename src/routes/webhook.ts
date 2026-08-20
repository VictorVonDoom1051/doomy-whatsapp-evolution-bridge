import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { normalizeEvolutionMessage } from '../services/messageNormalizer.js';
import { processMessage } from '../services/messageProcessor.js';

export const webhookRouter = Router();

webhookRouter.post('/evolution', async (req, res) => {
  if (config.webhookSecret) {
    const secret = req.header('x-doomy-secret') || req.query.secret;
    if (secret !== config.webhookSecret) return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  res.status(200).json({ ok: true });

  try {
    // Los eventos CONNECTION_UPDATE no son mensajes: normalizeEvolutionMessage
    // los descarta. Sin este log, que la sesión de WhatsApp se cayera (p. ej.
    // "device_removed") era completamente invisible y Doomy simplemente dejaba
    // de contestar sin dejar rastro.
    const eventName = String((req.body as any)?.event || '').toLowerCase();
    if (eventName.includes('connection')) {
      const data = (req.body as any)?.data || {};
      const state = data.state || data.connection;
      const log = state === 'open' ? logger.info.bind(logger) : logger.warn.bind(logger);
      log({
        state,
        statusReason: data.statusReason,
        instance: (req.body as any)?.instance
      }, `Conexión de WhatsApp: ${state || 'desconocida'}`);
      return;
    }

    const normalized = normalizeEvolutionMessage(req.body);
    if (!normalized) return;

    // Log ligero para trazabilidad, sin exponer el contenido completo del mensaje.
    logger.info({
      remoteJid: normalized.remoteJid,
      isGroup: normalized.isGroup,
      fromMe: normalized.fromMe
    }, 'Webhook de Evolution procesado');

    await processMessage(normalized);
  } catch (err) {
    logger.error({ err }, 'Webhook error');
  }
});
