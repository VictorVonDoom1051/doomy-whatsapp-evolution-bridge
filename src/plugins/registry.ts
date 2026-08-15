import type { DoomyPlugin } from './types.js';
import { handlePersonalCommand } from '../services/personalAssistant.js';

const plugins: DoomyPlugin[] = [
  {
    name: 'ping',
    match: (t) => t.trim().toLowerCase() === 'ping',
    handle: async () => ({ handled: true, response: 'Doomy activo.' })
  },
  {
    name: 'ayuda',
    match: (t) => ['ayuda', 'help'].includes(t.trim().toLowerCase()),
    handle: async () => ({ handled: true, response: 'Comandos: ping, ayuda, inventario, cotización, agenda, cliente. También puedes pedirme tareas en lenguaje natural.' })
  }
];

export async function runLocalPlugin(text: string, ctx: { groupId: string; senderId: string; role: string }) {
  if (!ctx.groupId.endsWith('@g.us') && ctx.role === 'admin') {
    const personal = await handlePersonalCommand(text, ctx.groupId);
    if (personal.handled) return personal;
  }
  const plugin = plugins.find(p => p.match(text));
  if (!plugin) return { handled: false };
  return plugin.handle(text, ctx);
}
