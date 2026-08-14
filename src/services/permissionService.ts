import { config } from '../config.js';

export interface GroupPermissions {
  allowHome: boolean;
  allowChat: boolean;
  allowQuotation: boolean;
  description: string;
}

const homeKeywords = [
  // Luces
  'luz', 'luces', 'lamp', 'brightness', 'brillo', 'dimer',
  // Frigate/Cámaras
  'frigate', 'camera', 'cámara', 'video', 'grabadora', 'grabadora',
  // Puertas/Cerraduras
  'puerta', 'lock', 'cerradura', 'bloqueo',
  // Alarmas
  'alarma', 'alarm', 'sensor',
  // Clima
  'temperatura', 'clima', 'aire acondicionado', 'ventilador', 'fan', 'ac',
  // Control específico (no genéricos como "on/off")
  'encender luces', 'apagar luces', 'prender luces', 'apaga',
  'controlar', 'activar', 'desactivar', 'switch'
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
