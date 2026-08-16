import type { DoomyPlugin } from './types.js';
import { handlePersonalCommand } from '../services/personalAssistant.js';
import { handleGoogleCommand } from '../services/googleWorkspace.js';

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
  // Gmail, Drive y el calendario personal sólo se exponen en el chat privado del propietario.
  if (ctx.role === 'admin' && !ctx.groupId.endsWith('@g.us')) {
    const workspace = await handleGoogleCommand(text, ctx.groupId);
    if (workspace.handled) return workspace;
  }
  // En privado sólo el propietario puede usar la agenda. En los grupos permitidos,
  // la agenda es compartida y los avisos regresan al mismo grupo que los creó.
  if (ctx.groupId.endsWith('@g.us') || ctx.role === 'admin') {
    const personal = await handlePersonalCommand(text, ctx.groupId);
    if (personal.handled) return personal;
  }
  const plugin = plugins.find(p => p.match(text));
  if (!plugin) return { handled: false };
  return plugin.handle(text, ctx);
}
