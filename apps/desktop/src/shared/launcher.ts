export interface LauncherState {
  appearance?: 'calm' | 'expressive';
  agents: { id: string; name: string }[];
  agentId?: string;
  task?: {
    sessionId: string;
    agentId: string;
    title: string;
    status: 'running' | 'waiting' | 'idle' | 'error';
    progress: string;
    response: string;
    truncated: boolean;
  };
}
export type LauncherInput =
  | { kind: 'new'; agentId: string; text: string }
  | { kind: 'reply'; sessionId: string; text: string };
export interface LauncherApi {
  state(): Promise<LauncherState>;
  onState(listener: (state: LauncherState) => void): () => void;
  send(input: LauncherInput): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  newRequest(sessionId: string): Promise<void>;
  dismiss(): Promise<void>;
  openSia(sessionId?: string): Promise<void>;
}
declare global {
  interface Window {
    siaLauncher: LauncherApi;
  }
}
