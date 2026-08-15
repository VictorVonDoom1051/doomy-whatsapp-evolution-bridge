import { config } from '../config.js';

export type MemoryMsg = {
  role: 'user' | 'assistant';
  content: string;
  at: string;
  senderId?: string;
  senderName?: string;
  source?: 'ambient' | 'direct' | 'assistant';
  messageId?: string;
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

  isReplyToAssistant(groupId: string, quotedText?: string, quotedMessageId?: string): boolean {
    const messages = this.get(groupId);
    if (quotedMessageId && messages.some(msg => msg.role === 'assistant' && msg.messageId === quotedMessageId)) {
      return true;
    }

    const target = normalizeForComparison(quotedText);
    if (!target) return false;

    return messages.some(msg => {
      if (msg.role !== 'assistant') return false;
      return normalizeForComparison(msg.content) === target;
    });
  }
}
export const conversationMemory = new ConversationMemory();

function normalizeForComparison(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
