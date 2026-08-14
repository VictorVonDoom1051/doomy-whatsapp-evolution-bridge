export interface PluginContext {
  groupId: string;
  senderId: string;
  role: string;
}
export interface PluginResult { handled: boolean; response?: string }
export interface DoomyPlugin {
  name: string;
  match(text: string): boolean;
  handle(text: string, ctx: PluginContext): Promise<PluginResult>;
}
