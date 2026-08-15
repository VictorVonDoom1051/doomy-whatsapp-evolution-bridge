import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEvolutionMessage } from './messageNormalizer.js';

test('extrae replies cuando Evolution envuelve el mensaje en message.message', () => {
  const normalized = normalizeEvolutionMessage({
    data: {
      message: {
        key: {
          id: 'NUEVO',
          remoteJid: 'equipo@g.us',
          participant: 'usuario@s.whatsapp.net',
          fromMe: false
        },
        message: {
          extendedTextMessage: {
            text: 'Ok, gracias',
            contextInfo: {
              stanzaId: 'ANTERIOR',
              quotedMessage: {
                conversation: 'Ya quedó lista la cotización.'
              }
            }
          }
        }
      },
      pushName: 'Edgar'
    }
  });

  assert.equal(normalized?.text, 'Ok, gracias');
  assert.equal(normalized?.isReply, true);
  assert.equal(normalized?.quotedMessageId, 'ANTERIOR');
  assert.equal(normalized?.quotedText, 'Ya quedó lista la cotización.');
});

test('extrae replies dentro de mensajes efímeros', () => {
  const normalized = normalizeEvolutionMessage({
    data: {
      key: { id: 'NUEVO', remoteJid: 'equipo@g.us', fromMe: false },
      message: {
        ephemeralMessage: {
          message: {
            extendedTextMessage: {
              text: 'Va, gracias!',
              contextInfo: {
                stanzaId: 'ANTERIOR',
                quotedMessage: { conversation: 'Todo quedó funcionando.' }
              }
            }
          }
        }
      }
    }
  });

  assert.equal(normalized?.text, 'Va, gracias!');
  assert.equal(normalized?.quotedText, 'Todo quedó funcionando.');
});
