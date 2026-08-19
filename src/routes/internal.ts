import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { sendText } from '../services/evolutionApi.js';
import { logger } from '../utils/logger.js';

export const internalRouter = Router();

// Middleware: Validar autenticación por x-doomy-whatsapp-key
function authenticate(req: Request, res: Response, next: Function) {
  const providedKey = (req.header('x-doomy-whatsapp-key') || '').trim();
  const expectedKey = (config.doomyWhatsappInternalKey || '').trim();

  if (!expectedKey) {
    logger.error('DOOMY_WHATSAPP_INTERNAL_KEY no configurada en el bridge');
    return res.status(503).json({ ok: false, error: 'Bridge no configurado para recibir mensajes salientes' });
  }

  if (providedKey !== expectedKey) {
    logger.warn({ providedKey: providedKey ? '***' : '(vacío)' }, 'Intento de autenticación fallido en /api/internal/send-text');
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  next();
}

internalRouter.use(authenticate);

// POST /api/internal/send-text
// Reenvía un mensaje de texto a WhatsApp vía Evolution API
// Usado por Doomy Oficina para enviar recordatorios de eventos
internalRouter.post('/send-text', async (req: Request, res: Response) => {
  try {
    const { phone, contactId, message } = req.body;

    if (!message) {
      return res.status(400).json({ ok: false, error: 'message es obligatorio' });
    }

    if (!phone && !contactId) {
      return res.status(400).json({ ok: false, error: 'phone o contactId es obligatorio' });
    }

    // Por ahora solo soportamos phone directo
    // Si en futuro se necesita contactId, habría que consultar la BD de Doomy
    if (!phone) {
      return res.status(400).json({ ok: false, error: 'contactId aún no soportado, usa phone' });
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'message debe ser un texto no vacío' });
    }

    if (message.length > 4096) {
      return res.status(400).json({ ok: false, error: 'message no puede exceder 4096 caracteres' });
    }

    logger.info({ phone, messageLength: message.length }, 'Enviando mensaje vía Evolution API');

    // Enviar el mensaje a través de Evolution API
    const messageIds = await sendText(phone, message);

    if (!messageIds || messageIds.length === 0) {
      logger.warn({ phone }, 'Evolution API no retornó message IDs');
      return res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje' });
    }

    logger.info({ phone, messageIds }, 'Mensaje enviado exitosamente');

    res.json({
      ok: true,
      phone,
      messageIds,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error({ err, body: req.body }, 'Error en POST /api/internal/send-text');
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error desconocido'
    });
  }
});

// GET /api/internal/health
// Health check para verificar que el bridge está disponible
internalRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'doomy-whatsapp-evolution-bridge', timestamp: new Date().toISOString() });
});
