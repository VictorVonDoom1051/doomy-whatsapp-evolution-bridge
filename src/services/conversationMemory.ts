import { config } from '../config.js';
export type MemoryMsg = { role: 'user' | 'assistant'; content: string; at: string; senderId?: string; senderName?: string };
class ConversationMemory {
  private mem = new Map<string, MemoryMsg[]>();
  get(groupId: string): MemoryMsg[] { return this.mem.get(groupId) || []; }
  add(groupId: string, msg: MemoryMsg) {
    const arr = [...this.get(groupId), msg].slice(-config.memoryMaxMessages);
    this.mem.set(groupId, arr);
  }
}
export const conversationMemory = new ConversationMemory();
