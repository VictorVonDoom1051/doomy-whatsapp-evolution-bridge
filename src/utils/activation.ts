import { config } from '../config.js';

export function extractActivation(text: string): { active: boolean; cleanText: string } {
  const original = text || '';
  const lower = original.toLowerCase();
  const found = config.activationWords.find(w => lower.includes(w.toLowerCase()));
  if (!found) return { active: false, cleanText: original.trim() };
  const re = new RegExp(found.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
  return { active: true, cleanText: original.replace(re, '').trim() };
}

export function isLocalCommand(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (t === '/doom ping' || t === 'ping') return 'ping';
  if (t === '/doom ayuda' || t === 'ayuda' || t === 'help') return 'help';
  return null;
}
