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
