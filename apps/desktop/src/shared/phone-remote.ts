import { z } from 'zod';

export const phoneRemoteCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status') }).strict(),
  z.object({ operation: z.literal('enable'), agentId: z.string().uuid() }).strict(),
  z.object({ operation: z.literal('disable') }).strict(),
  z.object({ operation: z.literal('rotate') }).strict(),
  z.object({ operation: z.literal('copy') }).strict(),
]);
export type PhoneRemoteCommand = z.infer<typeof phoneRemoteCommand>;
export interface PhoneRemoteSettings {
  enabled: boolean;
  running: boolean;
  agentId?: string;
  url?: string;
  qr?: string;
  detail: string;
}
export interface RemoteTurn {
  id: string;
  text: string;
  response: string;
  status: 'working' | 'waiting' | 'done' | 'error' | 'cancelled';
  steps: string[];
  error: string;
  files: string[];
}
export interface RemoteState {
  agent: string;
  mode: 'mac' | 'connected';
  approval: 'auto' | 'ask';
  session: string | null;
  turns: RemoteTurn[];
  workers: number;
}
export interface RemoteNote {
  id: string;
  title: string;
  kind: 'memory' | 'skill' | 'journal' | 'workflow' | 'topic';
  content: string;
}
export interface RemoteVault {
  nodes: Omit<RemoteNote, 'content'>[];
  edges: [string, string][];
}
export type PhoneRemoteApi = (command: PhoneRemoteCommand) => Promise<PhoneRemoteSettings>;
