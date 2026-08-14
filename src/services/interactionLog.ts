import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
export type Interaction = { at: string; groupId: string; senderId: string; senderName?: string; question: string; answer: string; toolHint?: string | null; ms: number };
export function logInteraction(i: Interaction) {
  if (!config.logInteractions) return;
  fs.mkdirSync('data', { recursive: true });
  fs.appendFileSync(path.join('data', 'interactions.jsonl'), JSON.stringify(i) + '\n', 'utf8');
}
