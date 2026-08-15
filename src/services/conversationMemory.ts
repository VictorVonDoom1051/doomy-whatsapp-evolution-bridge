import { config } from '../config.js';

export type MemoryMsg = {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  senderId?: string;
  senderName?: string;
  source?: 'ambient' | 'direct' | 'assistant';
};

export class ConversationMemory {
  private mem = new Map<string, MemoryMsg[]>();

  constructor(
    private readonly maxMessages = config.memoryMaxMessages,
    private readonly ttlMs = config.memoryTtlMinutes * 60 * 1000,
    private readonly now = () => Date.now()
  ) {}

  get(groupId: string): MemoryMsg[] {
    const cutoff = this.now() - this.ttlMs;
    const recent = (this.mem.get(groupId) || []).filter(msg => {
      const timestamp = Date.parse(msg.at);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });

    if (recent.length) this.mem.set(groupId, recent);
    else this.mem.delete(groupId);

    return recent;
  }

  add(groupId: string, msg: MemoryMsg) {
    const arr = [...this.get(groupId), msg].slice(-this.maxMessages);
    this.mem.set(groupId, arr);
  }
}
export const conversationMemory = new ConversationMemory();
