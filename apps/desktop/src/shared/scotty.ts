import type { TextSize } from './display.js';

export type ScottySize = 'small' | 'medium' | 'large';
export type ScottyStatus = 'idle' | 'working' | 'input' | 'ready' | 'blocked';
export interface ScottySettings {
  enabled: boolean;
  size: ScottySize;
  motion: boolean;
}
export type ScottyCommand =
  | { operation: 'status' | 'show' | 'hide' | 'resetPosition' }
  | { operation: 'size'; size: ScottySize }
  | { operation: 'motion'; enabled: boolean };
export type ScottySettingsApi = (command: ScottyCommand) => Promise<ScottySettings>;
export interface ScottyTask {
  id: string;
  token: string;
  agent: string;
  title: string;
  status: ScottyStatus;
  progress: string;
  response: string;
  truncated: boolean;
  question?: string;
  approval?: {
    id: string;
    title: string;
    summary: string;
    target: string;
    account?: string;
    dataLeaving?: string;
    reversible: boolean;
    requiresMainApp: boolean;
  };
  canReply: boolean;
  canStop: boolean;
  unread: boolean;
  /** A working Use my Mac task: on the person's screen or quietly in the background. */
  screen?: 'foreground' | 'background';
}
export interface ScottyState {
  revision: number;
  settings: ScottySettings;
  available: boolean;
  status: ScottyStatus;
  workingCount: number;
  attentionCount: number;
  agents: { id: string; name: string }[];
  agentId?: string;
  tasks: ScottyTask[];
  moreTasks: boolean;
  /** Settings → Appearance → Text size; Default when unset. */
  textSize?: TextSize;
}
export type ScottyAction =
  | { kind: 'new'; agentId: string; text: string }
  | { kind: 'reply'; token: string; text: string }
  | { kind: 'open' | 'cancel' | 'read'; token: string }
  | { kind: 'approve'; token: string; approvalId: string; decision: 'approve' | 'deny' };
export interface ScottyApi {
  state(): Promise<ScottyState>;
  onState(listener: (state: ScottyState) => void): () => void;
  action(action: ScottyAction): Promise<{ threadId: string }>;
  expand(open: boolean): Promise<void>;
  hide(): Promise<void>;
  openSia(): Promise<void>;
  move(phase: 'start' | 'update' | 'end'): Promise<void>;
  nudge(dx: number, dy: number): Promise<void>;
  interactive(value: boolean): void;
}
declare global {
  interface Window {
    siaScotty: ScottyApi;
  }
}
