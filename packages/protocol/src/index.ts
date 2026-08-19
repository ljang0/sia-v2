import { z } from 'zod';

export const idSchema = z.string().trim().min(1).max(256);
export const isoDateSchema = z.string().datetime({ offset: true });

export const providerIdSchema = z.enum(['codex', 'claude', 'grok', 'gemini', 'meta']);
export type ProviderId = z.infer<typeof providerIdSchema>;

export const providerModelSchema = z.object({
  provider: providerIdSchema,
  model: z.string().trim().min(1).max(256),
});
export type ProviderModel = z.infer<typeof providerModelSchema>;

export const agentSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  instructions: z.string().max(100_000),
  defaultProvider: providerIdSchema,
  defaultModel: z.string().trim().min(1).max(256),
  defaultWorkspace: z.string().min(1),
  revision: z.number().int().positive(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Agent = z.infer<typeof agentSchema>;

/** Immutable configuration copied into a thread when it is created. */
export const agentRevisionSnapshotSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().max(100_000),
    provider: providerIdSchema,
    model: z.string().trim().min(1).max(256),
    workspace: z.string().min(1),
    capturedAt: isoDateSchema,
  })
  .readonly();
export type AgentRevisionSnapshot = z.infer<typeof agentRevisionSnapshotSchema>;

export const threadStatusSchema = z.enum([
  'idle',
  'running',
  'waiting_for_user',
  'queued',
  'failed',
  'archived',
]);
export type ThreadStatus = z.infer<typeof threadStatusSchema>;

export const threadSchema = z.object({
  id: idSchema,
  agentId: idSchema,
  agentRevisionId: idSchema,
  title: z.string().trim().min(1).max(200),
  provider: providerIdSchema,
  model: z.string().trim().min(1).max(256),
  workspace: z.string().min(1),
  providerSessionId: z.string().min(1).optional(),
  status: threadStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type Thread = z.infer<typeof threadSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export const contentPartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({
    kind: z.literal('image'),
    mimeType: z.string().min(1),
    source: z.enum(['local_reference', 'provider_reference']),
    reference: z.string().min(1),
    alt: z.string().optional(),
  }),
]);
export type ContentPart = z.infer<typeof contentPartSchema>;

const envelopeBase = {
  id: idSchema,
  threadId: idSchema,
  turnId: idSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: isoDateSchema,
  provider: providerIdSchema,
} as const;

export const messageEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('message'),
  payload: z.object({
    messageId: idSchema,
    role: messageRoleSchema,
    parts: z.array(contentPartSchema),
    delta: z.boolean().default(false),
  }),
});
export type MessageEvent = z.infer<typeof messageEventSchema>;

export const reasoningEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('reasoning'),
  payload: z.object({
    reasoningId: idSchema,
    text: z.string(),
    delta: z.boolean().default(false),
  }),
});
export type ReasoningEvent = z.infer<typeof reasoningEventSchema>;

export const toolEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('tool'),
  payload: z.object({
    callId: idSchema,
    name: z.string().trim().min(1).max(128),
    phase: z.enum(['requested', 'started', 'completed', 'failed']),
    arguments: z.record(z.string(), z.unknown()).optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    native: z.boolean().default(true),
    presentation: z
      .discriminatedUnion('kind', [
        z.object({
          kind: z.literal('command'),
          command: z.string(),
          cwd: z.string().optional(),
          output: z.string().optional(),
          exitCode: z.number().int().nullable().optional(),
          durationMs: z.number().nonnegative().nullable().optional(),
          processId: z.string().nullable().optional(),
        }),
        z.object({
          kind: z.literal('file_change'),
          files: z.array(
            z.object({
              path: z.string().min(1),
              change: z.string().min(1),
              diff: z.string().optional(),
            }),
          ),
        }),
        z.object({
          kind: z.literal('web_search'),
          query: z.string().optional(),
          sources: z.array(
            z.object({
              title: z.string().optional(),
              url: z.string().url(),
            }),
          ),
        }),
        z.object({ kind: z.literal('image'), path: z.string().min(1) }),
        z.object({
          kind: z.literal('review'),
          phase: z.enum(['entered', 'exited']),
          review: z.string(),
        }),
        z.object({ kind: z.literal('compaction') }),
      ])
      .optional(),
  }),
});
export type ToolEvent = z.infer<typeof toolEventSchema>;

export const approvalEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('approval'),
  payload: z.object({
    requestId: idSchema,
    phase: z.enum(['requested', 'resolved']),
    title: z.string().min(1),
    description: z.string(),
    choices: z
      .array(
        z.object({
          id: idSchema,
          label: z.string().min(1),
          kind: z.enum(['allow_once', 'deny']),
        }),
      )
      .min(1),
    selectedChoiceId: idSchema.optional(),
  }),
});
export type ApprovalEvent = z.infer<typeof approvalEventSchema>;

export const questionEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('question'),
  payload: z.object({
    requestId: idSchema,
    phase: z.enum(['requested', 'resolved']),
    prompt: z.string().min(1),
    options: z.array(z.object({ id: idSchema, label: z.string().min(1) })).optional(),
    answer: z.string().optional(),
  }),
});
export type QuestionEvent = z.infer<typeof questionEventSchema>;

export const planEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('plan'),
  payload: z.object({
    planId: idSchema,
    title: z.string().optional(),
    steps: z.array(
      z.object({
        id: idSchema,
        text: z.string().min(1),
        status: z.enum(['pending', 'in_progress', 'completed']),
      }),
    ),
  }),
});
export type PlanEvent = z.infer<typeof planEventSchema>;

export const subagentEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('subagent'),
  payload: z.object({
    subagentId: idSchema,
    name: z.string().min(1),
    phase: z.enum(['started', 'message', 'completed', 'failed']),
    text: z.string().optional(),
    parentThreadId: z.string().optional(),
    agentPath: z.string().optional(),
    operation: z.enum(['spawn', 'send', 'resume', 'wait', 'close', 'activity']).optional(),
    model: z.string().optional(),
    reasoningEffort: z.string().optional(),
  }),
});
export type SubagentEvent = z.infer<typeof subagentEventSchema>;

export const usageEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('usage'),
  payload: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    providerReported: z.boolean().default(true),
  }),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

export const errorEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('error'),
  payload: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    recoverable: z.boolean(),
    detail: z.unknown().optional(),
  }),
});
export type ErrorEvent = z.infer<typeof errorEventSchema>;

export const completionEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('completion'),
  payload: z.object({
    status: z.enum(['completed', 'cancelled', 'failed']),
    providerTurnId: z.string().optional(),
  }),
});
export type CompletionEvent = z.infer<typeof completionEventSchema>;

export const threadEventEnvelopeSchema = z.discriminatedUnion('type', [
  messageEventSchema,
  reasoningEventSchema,
  toolEventSchema,
  approvalEventSchema,
  questionEventSchema,
  planEventSchema,
  subagentEventSchema,
  usageEventSchema,
  errorEventSchema,
  completionEventSchema,
]);
export type ThreadEventEnvelope = z.infer<typeof threadEventEnvelopeSchema>;

export const toolDescriptorSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  description: z.string().min(1).max(1_000),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z.object({
    readOnly: z.boolean(),
    requiresApproval: z.boolean(),
    takesForeground: z.boolean().default(false),
  }),
});
export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>;

export interface ProviderProbeResult {
  readonly available: boolean;
  readonly version?: string;
  readonly supported: boolean;
  readonly reason?: string;
  readonly executable?: string;
}

export interface ProviderAccount {
  readonly state: 'authenticated' | 'unauthenticated' | 'unknown';
  readonly label?: string;
  readonly billing?: 'subscription' | 'api' | 'organization' | 'included' | 'unknown';
}

export interface ProviderSessionOptions {
  readonly threadId: string;
  readonly model: string;
  readonly workspace: string;
  readonly instructions: string;
  /** Private, role-preserving history to restore into a newly created provider session. */
  readonly history?: readonly ProviderHistoryMessage[];
  readonly tools: readonly ToolDescriptor[];
}

export interface ProviderHistoryMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

export interface ProviderSession {
  readonly id: string;
  readonly provider: ProviderId;
  readonly nativeId: string;
  readonly threadId: string;
}

export interface ProviderTurnInput {
  readonly turnId: string;
  readonly text: string;
  readonly attachments?: readonly ProviderAttachment[];
  readonly model?: string;
  readonly reasoningEffort?: string;
}

export interface ProviderReviewInput {
  readonly turnId: string;
  readonly target:
    | { readonly type: 'uncommitted_changes' }
    | { readonly type: 'base_branch'; readonly branch: string }
    | { readonly type: 'commit'; readonly sha: string; readonly title?: string }
    | { readonly type: 'custom'; readonly instructions: string };
}

export interface ProviderAttachment {
  readonly kind: 'image' | 'audio' | 'file';
  readonly path: string;
  readonly name: string;
}

export interface ProviderModelOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly reasoningEfforts: readonly string[];
  readonly defaultReasoningEffort?: string;
}

export interface ProviderRequestResponse {
  readonly requestId: string;
  readonly choiceId?: string;
  readonly text?: string;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly productionEnabled: boolean;
  probe(signal?: AbortSignal): Promise<ProviderProbeResult>;
  account(signal?: AbortSignal): Promise<ProviderAccount>;
  listModels?(signal?: AbortSignal): Promise<readonly ProviderModelOption[]>;
  createSession(
    options: ProviderSessionOptions,
    signal?: AbortSignal,
  ): Promise<ProviderSession>;
  sendTurn(
    session: ProviderSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope>;
  startReview?(
    session: ProviderSession,
    input: ProviderReviewInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope>;
  cancelTurn(session: ProviderSession, turnId: string): Promise<void>;
  respondToRequest(session: ProviderSession, response: ProviderRequestResponse): Promise<void>;
  dispose(): Promise<void>;
}

/** Parses and validates an event before it crosses a process boundary. */
export function parseThreadEvent(value: unknown): ThreadEventEnvelope {
  return threadEventEnvelopeSchema.parse(value);
}
