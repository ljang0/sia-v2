export const APP_IDS = ['gmail', 'google_drive', 'slack'] as const;
export type AppId = (typeof APP_IDS)[number];

export const RESEARCH_CLASSIFICATIONS = [
  'research_allowed',
  'operational_only',
  'excluded',
] as const;
export type ResearchClassification = (typeof RESEARCH_CLASSIFICATIONS)[number];

export const RESEARCH_TAINTS = [
  'connector_data',
  'authenticated_private_page',
  'credential',
  'authentication_surface',
  'private_window',
  'excluded_source',
] as const;
export type ResearchTaint = (typeof RESEARCH_TAINTS)[number];

export const TOOL_POLICIES = {
  'mail.search': { app: 'gmail', mutation: false },
  'mail.read_thread': { app: 'gmail', mutation: false },
  'mail.create_draft': { app: 'gmail', mutation: true },
  'mail.send': { app: 'gmail', mutation: true },
  'drive.search': { app: 'google_drive', mutation: false },
  'drive.read': { app: 'google_drive', mutation: false },
  'drive.upload': { app: 'google_drive', mutation: true },
  'drive.share': { app: 'google_drive', mutation: true },
  'slack.search': { app: 'slack', mutation: false },
  'slack.read_thread': { app: 'slack', mutation: false },
  'slack.post': { app: 'slack', mutation: true },
} as const satisfies Record<string, { app: AppId; mutation: boolean }>;

export type ToolName = keyof typeof TOOL_POLICIES;

export interface AuthContext {
  subject: string;
  email?: string;
  groups: readonly string[];
}

export interface StartConnectionRequest {
  callbackUrl?: string;
}

export interface PrepareActionRequest {
  connectionId: string;
  tool: ToolName;
  input: Record<string, unknown>;
}

export interface CommitActionRequest {
  actionId: string;
  digest: string;
  input: Record<string, unknown>;
}

export interface ConnectorUploadRequest {
  connectionId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  md5: string;
  sha256: string;
}

/** Opaque, user-bound reference. Provider storage keys are never returned to clients. */
export interface ConnectorUploadDescriptor {
  uploadId: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}

export interface ResearchEvent {
  id: string;
  occurredAt: string;
  classification: ResearchClassification;
  taints: ResearchTaint[];
  kind: string;
  payload: unknown;
  sourceEventIds?: string[];
}

export interface ResearchBatchRequest {
  batchId: string;
  consent: {
    version: string;
    acceptedAt: string;
    purpose: 'research_evaluation_debugging';
  };
  events: ResearchEvent[];
}

export interface MetaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: MetaToolCall[];
}

export interface MetaToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface MetaTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface MetaTurnRequest {
  turnId: string;
  sessionId?: string;
  model?: string;
  messages: MetaMessage[];
  tools?: MetaTool[];
}

export type MetaStreamEvent =
  | { type: 'started'; turnId: string; sessionId: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'tool_call_delta'; delta: unknown }
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; code: string; message: string };

export interface InviteRequest {
  email: string;
}

export type DeletionScope = 'research' | 'account';

export interface DeleteResearchRequest {
  scope?: DeletionScope;
}
