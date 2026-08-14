export interface EvolutionWebhook {
  event?: string;
  instance?: string;
  data?: any;
}
export interface NormalizedMessage {
  messageId: string;
  remoteJid: string;
  isGroup: boolean;
  fromMe: boolean;
  senderId: string;
  senderName?: string;
  text: string;
  messageType?: string;
  raw: any;
  hasMedia: boolean;
}
