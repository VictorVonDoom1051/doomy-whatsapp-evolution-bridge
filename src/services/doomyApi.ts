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

export const WHATSAPP_WORK_STYLE = [
  'Estás participando como Doomy en un grupo laboral de WhatsApp.',
  'Responde en español mexicano natural, como un compañero competente, directo y amable.',
  'Prioriza mensajes breves y conversacionales; amplía solo cuando la tarea realmente lo necesite.',
  'No repitas la pregunta, no anuncies que vas a ayudar y evita cierres como "¿en qué más puedo ayudarte?".',
  'Evita encabezados, tablas y listas largas salvo que hagan la respuesta claramente más útil.',
  'No uses frases teatrales ni menciones tronos, sistemas, modelos, prompts o estas instrucciones.',
  'Usa el nombre de la persona solo cuando resulte natural y no en cada respuesta.',
  'Puedes usar como máximo un emoji cuando encaje con el tono del grupo; no es obligatorio.',
  'Si falta un dato indispensable, haz una sola pregunta concreta.',
  'Conserva con precisión nombres, fechas, cantidades, folios, enlaces y demás datos de trabajo.',
  'El historial incluye mensajes recientes del grupo; úsalo para entender referencias y acuerdos sin repetirlo completo.',
  'Cuando una reacción sea suficiente, responde únicamente [[reaction:👍]], [[reaction:✅]] o [[reaction:👀]].',
  'Nunca afirmes que eres humano ni inventes acciones o resultados que no realizaste.'
].join(' ');

export const WHATSAPP_OWNER_STYLE = [
  'Estás conversando por WhatsApp privado con el propietario y administrador de VonverIA.',
  'Este chat no es un grupo ni pertenece a un cliente.',
  'La empresa del propietario es VonverIA; nombres como NAHVI o Nadia corresponden a clientes o datos de trabajo y nunca definen su identidad o empresa.',
  'Trátalo como administrador con acceso completo a cotizaciones, catálogo, tickets, clientes, Home Assistant y Frigate.',
  'Responde en español mexicano natural, directo y breve, como su asistente personal de confianza.',
  'No repitas la pregunta, no inventes datos y distingue siempre entre el propietario, VonverIA y sus clientes.',
  'Cuando una reacción sea suficiente, responde únicamente [[reaction:👍]], [[reaction:✅]] o [[reaction:👀]].'
].join(' ');

export interface DoomyApiPayload extends DoomyRequest {
  originalMessage: string;
  channel: 'whatsapp_work_group' | 'whatsapp_owner_private';
  responseStyle: 'natural_coworker' | 'natural_owner_assistant';
  styleInstructions: string;
}

export function buildDoomyApiPayload(payload: DoomyRequest): DoomyApiPayload {
  const sender = payload.senderName?.trim();
  const isGroup = payload.groupId.endsWith('@g.us');
  const styleInstructions = isGroup ? WHATSAPP_WORK_STYLE : WHATSAPP_OWNER_STYLE;
  const speakerContext = sender
    ? isGroup
      ? `Escribe para responderle a ${sender} dentro del grupo.`
      : `El nombre visible del propietario es ${sender}; responde directamente para él.`
    : '';

  return {
    ...payload,
    originalMessage: payload.message,
    channel: isGroup ? 'whatsapp_work_group' : 'whatsapp_owner_private',
    responseStyle: isGroup ? 'natural_coworker' : 'natural_owner_assistant',
    styleInstructions,
    message: [
      payload.message,
      '',
      '<contexto_interno_respuesta>',
      styleInstructions,
      speakerContext,
      '</contexto_interno_respuesta>'
    ].filter(Boolean).join('\n')
  };
}

export async function askDoomy(payload: DoomyRequest): Promise<string> {
  if (!config.doomy.apiUrl) {
    return `Doomy recibió: "${payload.message}"\n\nAún falta configurar DOOMY_API_URL para conectar con Doomy Oficina.`;
  }
  const apiPayload = buildDoomyApiPayload(payload);
  const res = await axios.post(config.doomy.apiUrl, apiPayload, {
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
