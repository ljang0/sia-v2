export const APP_IDS = [
  'google_workspace',
  'gmail',
  'google_drive',
  'google_docs',
  'google_sheets',
  'google_slides',
  'slack',
] as const;
export type AppId = (typeof APP_IDS)[number];

export const LEGACY_GOOGLE_APP_IDS = [
  'gmail',
  'google_drive',
  'google_docs',
  'google_sheets',
  'google_slides',
] as const;
export type LegacyGoogleAppId = (typeof LEGACY_GOOGLE_APP_IDS)[number];

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
  'docs.create': { app: 'google_docs', mutation: true },
  'docs.read': { app: 'google_docs', mutation: false },
  'docs.append': { app: 'google_docs', mutation: true },
  'sheets.create': { app: 'google_sheets', mutation: true },
  'sheets.read': { app: 'google_sheets', mutation: false },
  'sheets.update': { app: 'google_sheets', mutation: true },
  'sheets.append': { app: 'google_sheets', mutation: true },
  'slides.create': { app: 'google_slides', mutation: true },
  'slides.read': { app: 'google_slides', mutation: false },
  'slides.append': { app: 'google_slides', mutation: true },
  // Calendar and Tasks exist only on Sia's direct Google adapter, so they belong to the unified
  // Workspace connection rather than a superseded per-service Composio app.
  'calendar.list_events': { app: 'google_workspace', mutation: false },
  'calendar.read_event': { app: 'google_workspace', mutation: false },
  'calendar.create_event': { app: 'google_workspace', mutation: true },
  'calendar.update_event': { app: 'google_workspace', mutation: true },
  'calendar.delete_event': { app: 'google_workspace', mutation: true },
  'tasks.list': { app: 'google_workspace', mutation: false },
  'tasks.create': { app: 'google_workspace', mutation: true },
  'tasks.update': { app: 'google_workspace', mutation: true },
  'slack.search': { app: 'slack', mutation: false },
  'slack.find_users': { app: 'slack', mutation: false },
  'slack.open_dm': { app: 'slack', mutation: false },
  'slack.read_thread': { app: 'slack', mutation: false },
  'slack.post': { app: 'slack', mutation: true },
} as const satisfies Record<string, { app: AppId; mutation: boolean }>;

export type ToolName = keyof typeof TOOL_POLICIES;

/** Tools with no Composio mapping. They run only through Sia's direct Google adapter. */
export const GOOGLE_DIRECT_TOOLS = [
  'calendar.list_events',
  'calendar.read_event',
  'calendar.create_event',
  'calendar.update_event',
  'calendar.delete_event',
  'tasks.list',
  'tasks.create',
  'tasks.update',
] as const satisfies readonly ToolName[];
export type GoogleDirectToolName = (typeof GOOGLE_DIRECT_TOOLS)[number];
export type ComposioToolName = Exclude<ToolName, GoogleDirectToolName>;

export function isComposioTool(tool: ToolName): tool is ComposioToolName {
  return !(GOOGLE_DIRECT_TOOLS as readonly ToolName[]).includes(tool);
}

export type GoogleAccessLevel = 'read_only' | 'read_write';

export interface AuthContext {
  subject: string;
  email?: string;
  groups: readonly string[];
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
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
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

export interface RegistrationRequest {
  email: string;
  /**
   * Legacy clients may still send this flag. Account creation is no longer coupled to
   * research enrollment; research consent is collected independently at upload time.
   */
  researchEnrollmentAcknowledged?: boolean;
}

export const VOICE_TOKEN_TYPES = ['realtime_scribe', 'batch_scribe', 'tts_websocket'] as const;
export type VoiceTokenType = (typeof VOICE_TOKEN_TYPES)[number];

export interface VoiceTokenRequest {
  type: VoiceTokenType;
}

export type DeletionScope = 'research' | 'account';
