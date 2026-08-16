import { Router } from 'express';
import { config } from '../config.js';
import { consumeGoogleOauthState, googleAuthorizationUrl, saveGoogleAuthorizationCode } from '../services/googleWorkspace.js';

export const googleOAuthRouter = Router();

googleOAuthRouter.get('/connect', (req, res) => {
  if (!isAuthorized(req)) return res.status(401).send('No autorizado');
  res.redirect(googleAuthorizationUrl());
});

googleOAuthRouter.get('/callback', async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!consumeGoogleOauthState(state)) return res.status(400).send('La autorización expiró o no es válida. Inicia nuevamente la conexión.');
  if (!code) return res.status(400).send('Google no devolvió un código de autorización.');
  try {
    await saveGoogleAuthorizationCode(code);
    res.type('html').send('<h2>Google Workspace conectado con Doomy ✅</h2><p>Ya puedes cerrar esta ventana.</p>');
  } catch (err) {
    res.status(500).send(`No se pudo conectar Google: ${err instanceof Error ? err.message : String(err)}`);
  }
});

function isAuthorized(req: any) {
  if (!config.webhookSecret) return false;
  return (req.header('x-doomy-secret') || req.query.secret) === config.webhookSecret;
}
