import { z } from 'zod';

export const idSchema = z.string().trim().min(1).max(256);
export const isoDateSchema = z.string().datetime({ offset: true });

export const providerIdSchema = z.enum(['codex', 'claude', 'grok', 'gemini', 'meta']);
export type ProviderId = z.infer<typeof providerIdSchema>;

/**
 * Identifies the process/runtime that executes a model turn. This is deliberately
 * separate from ProviderId: one provider/model may be usable through multiple
 * harnesses without changing its billing or account attribution.
 */
export const BUILTIN_HARNESS_IDS = [
  'codex_app_server',
  'claude_code',
  'legacy_acp',
  'opencode_acp',
  'pi_rpc',
  'sia_direct',
] as const;

/**
 * Harness ids are catalog data, not a closed product enum. A newly admitted lab
 * harness can therefore be added without changing every persisted-data schema.
 * Runtime registration is still required before an id is executable.
 */
export const harnessIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Harness ids must be lowercase identifiers');
export type HarnessId = z.infer<typeof harnessIdSchema>;
export type BuiltinHarnessId = (typeof BUILTIN_HARNESS_IDS)[number];

export const harnessPreferenceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('automatic') }),
  z.object({ mode: z.literal('explicit'), harnessId: harnessIdSchema }),
]);
export type HarnessPreference = z.infer<typeof harnessPreferenceSchema>;

export const credentialSourceSchema = z.enum([
  'provider_subscription',
  'provider_api',
  'sia_managed',
]);
export type CredentialSource = z.infer<typeof credentialSourceSchema>;

/** Model wire protocols that a lab may expose independently of its harness. */
export const modelApiProtocolSchema = z.enum([
  'openai_responses',
  'openai_chat_completions',
  'anthropic_messages',
]);
export type ModelApiProtocol = z.infer<typeof modelApiProtocolSchema>;

export const hostedCatalogRouteSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    harnessId: harnessIdSchema,
    harnessModelId: z.string().trim().min(1).max(256),
    credentialSource: credentialSourceSchema,
    apiProtocol: modelApiProtocolSchema,
  })
  .strict();
export type HostedCatalogRoute = z.infer<typeof hostedCatalogRouteSchema>;

export const hostedCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    providers: z
      .array(
        z
          .object({
            id: z
              .string()
              .trim()
              .min(1)
              .max(64)
              .regex(/^[a-z][a-z0-9_-]*$/),
            name: z.string().trim().min(1).max(120),
            kind: z.literal('hosted'),
            credentialMode: z.literal('managed'),
            available: z.boolean(),
            defaultModel: z.string().trim().min(1).max(256),
            models: z.array(
              z
                .object({
                  id: z.string().trim().min(1).max(256),
                  name: z.string().trim().min(1).max(120),
                  apiProtocols: z.array(modelApiProtocolSchema).min(1),
                })
                .strict(),
            ),
            capabilities: z.object({ streaming: z.boolean(), tools: z.boolean() }).strict(),
            execution: z
              .object({
                defaultHarnessId: harnessIdSchema,
                routes: z.array(hostedCatalogRouteSchema),
              })
              .strict()
              .optional(),
            limits: z
              .object({
                dailyRequests: z.number().int().positive(),
                dailyTokens: z.number().int().positive(),
                maxOutputTokens: z.number().int().positive(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict()
  .superRefine((catalog, context) => {
    const providerIds = new Set<string>();
    const canonicalModels = new Set<string>();
    for (const [providerIndex, provider] of catalog.providers.entries()) {
      if (providerIds.has(provider.id)) {
        context.addIssue({
          code: 'custom',
          path: ['providers', providerIndex, 'id'],
          message: 'Hosted provider ids must be unique',
        });
      }
      providerIds.add(provider.id);
      const modelProtocols = new Map(
        provider.models.map((model) => [model.id, new Set(model.apiProtocols)] as const),
      );
      if (provider.available && !modelProtocols.has(provider.defaultModel)) {
        context.addIssue({
          code: 'custom',
          path: ['providers', providerIndex, 'defaultModel'],
          message: 'The default model must be present in the provider model list',
        });
      }
      for (const [modelIndex, model] of provider.models.entries()) {
        if (canonicalModels.has(model.id)) {
          context.addIssue({
            code: 'custom',
            path: ['providers', providerIndex, 'models', modelIndex, 'id'],
            message: 'Canonical hosted model ids must be unique across labs',
          });
        }
        canonicalModels.add(model.id);
      }
      for (const [routeIndex, route] of provider.execution?.routes.entries() ?? []) {
        if (!modelProtocols.get(route.model)?.has(route.apiProtocol)) {
          context.addIssue({
            code: 'custom',
            path: ['providers', providerIndex, 'execution', 'routes', routeIndex],
            message: 'A route must use a protocol advertised by its model',
          });
        }
      }
      if (
        provider.execution &&
        provider.execution.routes.length > 0 &&
        !provider.execution.routes.some(
          (route) => route.harnessId === provider.execution?.defaultHarnessId,
        )
      ) {
        context.addIssue({
          code: 'custom',
          path: ['providers', providerIndex, 'execution', 'defaultHarnessId'],
          message: 'The default harness must have at least one route',
        });
      }
    }
  });
export type HostedCatalog = z.infer<typeof hostedCatalogSchema>;

export const executionResolutionSourceSchema = z.enum([
  'user',
  'backend_default',
  'legacy_default',
]);
export type ExecutionResolutionSource = z.infer<typeof executionResolutionSourceSchema>;

const modelRouteShape = {
  provider: providerIdSchema,
  /** Canonical model id shown and persisted by Sia. */
  model: z.string().trim().min(1).max(256),
  harnessId: harnessIdSchema,
  /** Exact model selector sent to this harness; never inferred at execution time. */
  harnessModelId: z.string().trim().min(1).max(256),
  credentialSource: credentialSourceSchema,
} as const;

/** One allowlisted way to run a canonical provider/model through a harness. */
export const modelRouteSchema = z.object(modelRouteShape).readonly();
export type ModelRoute = z.infer<typeof modelRouteSchema>;

/** Immutable route selected for a thread before any provider process is started. */
export const resolvedExecutionTargetSchema = z
  .object({
    ...modelRouteShape,
    resolutionSource: executionResolutionSourceSchema,
  })
  .readonly();
export type ResolvedExecutionTarget = z.infer<typeof resolvedExecutionTargetSchema>;

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
  /** Missing on legacy agents and interpreted as { mode: 'automatic' } by the resolver. */
  harnessPreference: harnessPreferenceSchema.optional(),
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
    /** Missing on snapshots created before harness-aware execution was introduced. */
    resolvedExecutionTarget: resolvedExecutionTargetSchema.optional(),
    /** @deprecated Migration read only; new snapshots persist resolvedExecutionTarget. */
    harnessId: harnessIdSchema.optional(),
    workspace: z.string().min(1),
    capturedAt: isoDateSchema,
  })
  .superRefine((snapshot, context) => {
    const target = snapshot.resolvedExecutionTarget;
    if (!target) return;
    if (target.provider !== snapshot.provider) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedExecutionTarget', 'provider'],
        message: 'Resolved provider must match the snapshot provider',
      });
    }
    if (target.model !== snapshot.model) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedExecutionTarget', 'model'],
        message: 'Resolved model must match the snapshot model',
      });
    }
    if (snapshot.harnessId && target.harnessId !== snapshot.harnessId) {
      context.addIssue({
        code: 'custom',
        path: ['harnessId'],
        message: 'Legacy harnessId must match the resolved execution target',
      });
    }
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

export const threadSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    agentRevisionId: idSchema,
    title: z.string().trim().min(1).max(200),
    provider: providerIdSchema,
    model: z.string().trim().min(1).max(256),
    /** Pinned for new threads; absent on legacy records until recovery resolves it. */
    resolvedExecutionTarget: resolvedExecutionTargetSchema.optional(),
    /** @deprecated Migration read only; new threads persist resolvedExecutionTarget. */
    harnessId: harnessIdSchema.optional(),
    workspace: z.string().min(1),
    providerSessionId: z.string().min(1).optional(),
    status: threadStatusSchema,
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .superRefine((thread, context) => {
    const target = thread.resolvedExecutionTarget;
    if (!target) return;
    if (target.provider !== thread.provider) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedExecutionTarget', 'provider'],
        message: 'Resolved provider must match the thread provider',
      });
    }
    if (target.model !== thread.model) {
      context.addIssue({
        code: 'custom',
        path: ['resolvedExecutionTarget', 'model'],
        message: 'Resolved model must match the thread model',
      });
    }
    if (thread.harnessId && target.harnessId !== thread.harnessId) {
      context.addIssue({
        code: 'custom',
        path: ['harnessId'],
        message: 'Legacy harnessId must match the resolved execution target',
      });
    }
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

const executionAttributionShape = {
  provider: providerIdSchema,
  /** Optional while legacy adapters are migrated; provider remains authoritative. */
  harnessId: harnessIdSchema.optional(),
  /** Exact canonical model, when known at the event-producing boundary. */
  model: z.string().trim().min(1).max(256).optional(),
} as const;

export const executionAttributionSchema = z.object(executionAttributionShape).readonly();
export type ExecutionAttribution = z.infer<typeof executionAttributionSchema>;

const envelopeBase = {
  id: idSchema,
  threadId: idSchema,
  turnId: idSchema,
  sequence: z.number().int().nonnegative(),
  timestamp: isoDateSchema,
  ...executionAttributionShape,
} as const;

export const messageEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('message'),
  payload: z.object({
    messageId: idSchema,
    role: messageRoleSchema,
    parts: z.array(contentPartSchema),
    delta: z.boolean().default(false),
    phase: z.enum(['commentary', 'final_answer']).optional(),
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
    /** `summary` is the user-facing summary; `text` is raw reasoning, kept apart from it. */
    part: z.enum(['summary', 'text']).optional(),
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
              movePath: z.string().min(1).optional(),
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
          kind: z.enum(['allow_once', 'allow_task', 'deny']),
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

/** The account's most constrained plan usage window, as the provider reports it. */
export const usageLimitSchema = z.object({
  usedPercent: z.number().min(0).max(100),
  /** ISO time the window resets. */
  resetsAt: z.string().datetime().optional(),
  windowMinutes: z.number().int().positive().optional(),
});
export type UsageLimit = z.infer<typeof usageLimitSchema>;

export const usageEventSchema = z.object({
  ...envelopeBase,
  type: z.literal('usage'),
  payload: z.object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    limits: usageLimitSchema.optional(),
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
  /** Dynamic-tool-only sessions: supported by the Codex harness, with native execution disabled. */
  readonly nativeTools?: 'disabled' | 'mac' | 'mac-background';
  /** Explicit desktop Mac mode: native commands run outside the workspace sandbox. */
  readonly nativeApproval?: 'ask' | 'auto';
  /** Replaces the coding persona for the native or window-based Mac assistant. */
  readonly baseInstructions?: string;
  readonly threadId: string;
  readonly model: string;
  /** Optional during migration; harness-aware callers should provide the pinned target. */
  readonly resolvedExecutionTarget?: ResolvedExecutionTarget;
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
  /** Optional until each legacy ProviderAdapter is wrapped by a HarnessAdapter. */
  readonly harnessId?: HarnessId;
  readonly resolvedExecutionTarget?: ResolvedExecutionTarget;
  readonly nativeId: string;
  readonly threadId: string;
}

export interface ProviderTurnInput {
  readonly turnId: string;
  readonly text: string;
  readonly attachments?: readonly ProviderAttachment[];
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
}

/** Text a person adds to a turn that is already running ("steer"). */
export interface ProviderSteerInput {
  readonly text: string;
  readonly attachments?: readonly ProviderAttachment[];
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
  /** False once the provider no longer knows this session, for example after a crash. */
  hasSession?(session: ProviderSession): boolean;
  /** Releases an idle session whose thread was deleted. */
  closeSession?(session: ProviderSession): Promise<void>;
  cancelTurn(session: ProviderSession, turnId: string): Promise<void>;
  /**
   * Adds input to the running turn instead of starting a new one. Rejects when the turn
   * already ended or the provider refused it, so the caller can keep the message queued.
   */
  steerTurn?(
    session: ProviderSession,
    turnId: string,
    input: ProviderSteerInput,
  ): Promise<void>;
  respondToRequest(session: ProviderSession, response: ProviderRequestResponse): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Harness-facing equivalent of ProviderSessionOptions. Provider account and model
 * discovery intentionally remain outside this interface.
 */
export interface HarnessSessionOptions extends Omit<
  ProviderSessionOptions,
  'model' | 'resolvedExecutionTarget'
> {
  readonly target: ResolvedExecutionTarget;
}

export interface HarnessSession {
  readonly id: string;
  readonly harnessId: HarnessId;
  readonly target: ResolvedExecutionTarget;
  readonly nativeId: string;
  readonly threadId: string;
}

/** Runtime contract for provider-independent harnesses such as OpenCode and Pi. */
export interface HarnessAdapter {
  readonly id: HarnessId;
  readonly productionEnabled: boolean;
  readonly supportedProviders: readonly ProviderId[];
  probe(signal?: AbortSignal): Promise<ProviderProbeResult>;
  createSession(options: HarnessSessionOptions, signal?: AbortSignal): Promise<HarnessSession>;
  sendTurn(
    session: HarnessSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope>;
  startReview?(
    session: HarnessSession,
    input: ProviderReviewInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope>;
  cancelTurn(session: HarnessSession, turnId: string): Promise<void>;
  respondToRequest(session: HarnessSession, response: ProviderRequestResponse): Promise<void>;
  dispose(): Promise<void>;
}

/** Parses and validates an event before it crosses a process boundary. */
export function parseThreadEvent(value: unknown): ThreadEventEnvelope {
  return threadEventEnvelopeSchema.parse(value);
}

/** An image a Sia-hosted tool returns beside its structured result. */
export interface ToolResultImage {
  mimeType: string;
  dataBase64: string;
}

/** The well-formed images in a tool result's optional `images` list; anything else is dropped. */
export function toolResultImages(value: unknown): ToolResultImage[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const images = (value as Record<string, unknown>).images;
  if (!Array.isArray(images)) return [];
  return images.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      return [];
    const image = candidate as Record<string, unknown>;
    return typeof image.mimeType === 'string' &&
      /^image\/[a-z0-9.+-]+$/i.test(image.mimeType) &&
      typeof image.dataBase64 === 'string' &&
      image.dataBase64.length > 0
      ? [{ mimeType: image.mimeType, dataBase64: image.dataBase64 }]
      : [];
  });
}

/** A tool result without its `images` list, for the structured text the model reads. */
export function withoutToolResultImages(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const { images: _images, ...rest } = value as Record<string, unknown>;
  return rest;
}
