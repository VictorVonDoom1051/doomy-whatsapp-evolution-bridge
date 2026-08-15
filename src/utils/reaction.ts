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
