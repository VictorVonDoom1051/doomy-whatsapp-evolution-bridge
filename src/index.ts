import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { webhookRouter } from './routes/webhook.js';
import { setWebhook } from './services/evolutionApi.js';
import { closePersonalScheduler, startPersonalScheduler } from './services/personalScheduler.js';
import { googleOAuthRouter } from './routes/googleOAuth.js';
import { internalRouter } from './routes/internal.js';
import { googleTokenStore } from './services/googleTokenStore.js';

const app = express();

// Railway (y la mayoría de PaaS) corren detrás de un proxy inverso.
// Esto permite que Express lea correctamente el IP real del cliente.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '25mb' }));
app.use(pinoHttp({ logger }));

app.get('/', (_req, res) => res.json({ ok: true, service: 'doomy-whatsapp-evolution-bridge' }));
app.get('/health', (_req, res) => res.json({ ok: true, timestamp: new Date().toISOString() }));
app.use('/webhook', webhookRouter);
app.use('/admin/google', googleOAuthRouter);
app.use('/api/internal', internalRouter);

app.post('/admin/setup-webhook', async (req, res) => {
  if (config.webhookSecret) {
    const secret = req.header('x-doomy-secret') || req.query.secret;
    if (secret !== config.webhookSecret) return res.status(401).json({ ok: false });
  }
  try {
    await setWebhook();
    res.json({ ok: true, webhook: `${config.publicBaseUrl}/webhook/evolution` });
  } catch (err) {
    logger.error({ err }, 'No se pudo configurar el webhook de Evolution API');
    res.status(500).json({ ok: false, error: 'No se pudo configurar el webhook' });
  }
});

// Middleware de errores no capturados de Express (defensa adicional)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Error no manejado en Express');
  res.status(500).json({ ok: false });
});

const server = app.listen(config.port, () => {
  logger.info(`Doomy Evolution Bridge escuchando en puerto ${config.port}`);
  void startPersonalScheduler();
});

// Apagado ordenado: Railway envía SIGTERM antes de reiniciar/redesplegar el servicio.
async function shutdown(signal: string) {
  logger.info(`Recibida señal ${signal}, cerrando servidor...`);
  await closePersonalScheduler().catch(err => logger.error({ err }, 'No se pudo cerrar el almacenamiento personal'));
  await googleTokenStore.close().catch(err => logger.error({ err }, 'No se pudo cerrar Google Token Store'));
  server.close(() => {
    logger.info('Servidor cerrado correctamente.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'Unhandled promise rejection'));
process.on('uncaughtException', (err) => logger.error({ err }, 'Uncaught exception'));
