import dotenv from 'dotenv';
dotenv.config();

function list(value?: string): string[] {
  return (value || '').split(',').map(v => v.trim()).filter(Boolean);
}
function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL || '',
    apiKey: process.env.EVOLUTION_API_KEY || '',
    instance: process.env.EVOLUTION_INSTANCE || 'doomy-oficina'
  },
  doomy: {
    apiUrl: process.env.DOOMY_API_URL || '',
    apiKey: process.env.DOOMY_API_KEY || ''
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    tokenPath: process.env.GOOGLE_TOKEN_PATH || 'data/google-oauth-token.json',
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    taskListId: process.env.GOOGLE_TASK_LIST_ID || '@default',
    timeZone: process.env.GOOGLE_TIME_ZONE || 'America/Mexico_City',
    dailySummaryEnabled: (process.env.DAILY_SUMMARY_ENABLED || 'true').toLowerCase() === 'true',
    dailySummaryHour: num(process.env.DAILY_SUMMARY_HOUR, 8),
    dailySummaryMinute: num(process.env.DAILY_SUMMARY_MINUTE, 0)
  },
  mediaMaxBytes: num(process.env.MEDIA_MAX_BYTES, 10 * 1024 * 1024),
  pdfMaxCharacters: num(process.env.PDF_MAX_CHARACTERS, 60000),
  comparisonDataPath: process.env.COMPARISON_DATA_PATH || 'data/comparisons',
  comparisonTtlHours: num(process.env.COMPARISON_TTL_HOURS, 24),
  botName: process.env.BOT_NAME || 'Doomy',
  activationWords: list(process.env.ACTIVATION_WORDS) || ['@Doomy', 'Doomy', 'oye Doomy', '/doom'],
  allowedGroupIds: list(process.env.ALLOWED_GROUP_IDS),
  adminUserIds: list(process.env.ADMIN_USER_IDS),
  ownerUserIds: list(process.env.OWNER_USER_IDS),
  personalSchedulerIntervalSeconds: num(process.env.PERSONAL_SCHEDULER_INTERVAL_SECONDS, 30),
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  rateLimitWindowSeconds: num(process.env.RATE_LIMIT_WINDOW_SECONDS, 20),
  rateLimitMaxMessages: num(process.env.RATE_LIMIT_MAX_MESSAGES, 5),
  memoryMaxMessages: num(process.env.MEMORY_MAX_MESSAGES, 30),
  memoryTtlMinutes: num(process.env.MEMORY_TTL_MINUTES, 180),
  ambientMemoryEnabled: (process.env.AMBIENT_MEMORY_ENABLED || 'true').toLowerCase() === 'true',
  logInteractions: (process.env.LOG_INTERACTIONS || 'true').toLowerCase() === 'true',
  // Permisos por grupo: especifica qué funcionalidades están permitidas
  groupPermissions: {
    'quotation_only': {
      allowHome: false,        // Bloquea luces, Frigate, automatización del hogar
      allowChat: true,         // Permite chat e IA
      allowQuotation: true,    // Permite cotizaciones
      description: 'Solo cotización y chat'
    },
    'full_access': {
      allowHome: true,         // Permite control de casa
      allowChat: true,
      allowQuotation: true,
      description: 'Acceso completo'
    }
  },
  // Mapeo de grupos a permisos (groupId -> permission level)
  groupPermissionMap: (() => {
    const map = new Map<string, string>();
    const allowed = list(process.env.ALLOWED_GROUP_IDS);
    const permissions = process.env.GROUP_PERMISSIONS_MAP || '';
    // Formato: "groupId1:quotation_only,groupId2:full_access"
    if (permissions) {
      permissions.split(',').forEach(entry => {
        const [groupId, perm] = entry.trim().split(':');
        if (groupId && perm) map.set(groupId, perm);
      });
    }
    // Por defecto, grupos permitidos usan FULL_ACCESS (sin restricciones)
    allowed.forEach(gid => {
      if (!map.has(gid)) map.set(gid, 'full_access');
    });
    return map;
  })()
};
