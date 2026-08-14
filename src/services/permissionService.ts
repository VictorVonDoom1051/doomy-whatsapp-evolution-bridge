import { config } from '../config.js';

export interface GroupPermissions {
  allowHome: boolean;
  allowChat: boolean;
  allowQuotation: boolean;
  description: string;
}

const homeKeywords = [
  'luz', 'luces', 'lamp', 'brightness', 'brillo',
  'frigate', 'camera', 'cámara', 'video', 'grabadora',
  'puerta', 'lock', 'cerradura', 'alarma', 'alarm',
  'temperatura', 'clima', 'air', 'ventilador', 'fan',
  'automatización', 'automation', 'escena', 'scene',
  'encender', 'apagar', 'prender', 'off', 'on'
];

export function getGroupPermissions(groupId: string): GroupPermissions {
  const permLevel = config.groupPermissionMap.get(groupId) || 'full_access';
  return config.groupPermissions[permLevel as keyof typeof config.groupPermissions] || config.groupPermissions.full_access;
}

export function isHomeCommand(text: string): boolean {
  const lower = text.toLowerCase();
  return homeKeywords.some(keyword => lower.includes(keyword));
}

export function canProcessMessage(groupId: string, text: string): { allowed: boolean; reason?: string } {
  const perms = getGroupPermissions(groupId);

  if (!perms.allowHome && isHomeCommand(text)) {
    return {
      allowed: false,
      reason: 'Este grupo no tiene permiso para controlar dispositivos del hogar.'
    };
  }

  if (!perms.allowChat && !isHomeCommand(text)) {
    return {
      allowed: false,
      reason: 'Este grupo no tiene permiso para usar chat.'
    };
  }

  return { allowed: true };
}
