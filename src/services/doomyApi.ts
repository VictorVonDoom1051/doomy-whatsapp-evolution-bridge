import axios from 'axios';
import { config } from '../config.js';
import type { MemoryMsg } from './conversationMemory.js';

export interface DoomyRequest {
  message: string;
  groupId: string;
  senderId: string;
  senderName?: string;
  role: string;
  toolHint?: string | null;
  history: MemoryMsg[];
  raw?: any;
}

export async function askDoomy(payload: DoomyRequest): Promise<string> {
  if (!config.doomy.apiUrl) {
    return `Doomy recibió: "${payload.message}"\n\nAún falta configurar DOOMY_API_URL para conectar con Doomy Oficina.`;
  }
  const res = await axios.post(config.doomy.apiUrl, payload, {
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
      ...(config.doomy.apiKey
        ? { Authorization: `Bearer ${config.doomy.apiKey}`, 'x-doomy-secret': config.doomy.apiKey }
        : {})
    }
  });
  return res.data?.reply || res.data?.message || res.data?.text || String(res.data);
}
