const ALLOWED_REACTIONS = new Set(['👍', '✅', '👀']);
const REACTION_COMMAND = /^\s*\[\[reaction:(.+?)\]\]\s*$/u;

export type DoomyResponse =
  | { kind: 'text'; text: string }
  | { kind: 'reaction'; reaction: string };

export function parseDoomyResponse(answer: string): DoomyResponse {
  const text = answer.trim();
  const match = text.match(REACTION_COMMAND);
  const reaction = match?.[1]?.trim();

  if (reaction && ALLOWED_REACTIONS.has(reaction)) {
    return { kind: 'reaction', reaction };
  }

  return { kind: 'text', text };
}

export function selectAcknowledgementReaction(text: string): string | null {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length > 45) return null;

  const eyes = new Set(['lo reviso', 'ahorita lo reviso', 'voy a revisarlo', 'pendiente']);
  const completed = new Set(['listo', 'ya quedo', 'quedo listo', 'terminado', 'hecho']);
  const accepted = new Set([
    'ok', 'okay', 'va', 'sale', 'perfecto', 'excelente', 'entendido', 'recibido',
    'gracias', 'muchas gracias', 'ok gracias', 'okay gracias', 'va gracias',
    'sale gracias', 'perfecto gracias', 'listo gracias'
  ]);

  if (eyes.has(normalized)) return '👀';
  if (completed.has(normalized)) return '✅';
  if (accepted.has(normalized)) return '👍';
  return null;
}
