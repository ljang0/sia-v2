import type {
  ProviderAdapter,
  ProviderId,
  ProviderRequestResponse,
  ProviderAttachment,
  ProviderModelOption,
  ProviderReviewInput,
  ProviderSession,
  ProviderSessionOptions,
  ThreadEventEnvelope,
} from '@sia/protocol';
import {
  createClaudeAdapter,
  createCodexAdapter,
  createGeminiAdapter,
  createGrokAdapter,
  createMetaAdapter,
  type AcpMcpServer,
  type MetaTransport,
} from '@sia/runtime';
import type { ActionGateway, TurnLease } from '@sia/action-gateway';

export interface RuntimeThreadConfig {
  id: string;
  provider: ProviderId;
  model: string;
  workspace: string;
  instructions: string;
  priorMessages?: readonly { id: string; role: 'user' | 'assistant'; text: string }[];
}

export interface RuntimeTurnInput {
  thread: RuntimeThreadConfig;
  turnId: string;
  text: string;
  attachments?: readonly ProviderAttachment[];
  reasoningEffort?: string;
  lease?: TurnLease;
}

export interface RuntimeReviewInput {
  thread: RuntimeThreadConfig;
  turnId: string;
  target: ProviderReviewInput['target'];
  lease?: TurnLease;
}

interface ActiveTurnContext {
  sessionId: string;
  threadId: string;
  turnId: string;
  provider: ProviderId;
  workspace: string;
  lease?: TurnLease;
  signal?: AbortSignal;
}

interface SessionState {
  adapter: ProviderAdapter;
  session: ProviderSession;
  fingerprint: string;
}

/**
 * Owns provider subprocess lifecycles. Provider-native tools remain native; only
 * the 26 canonical Sia actions cross through ActionGateway.
 */
export class RuntimeCoordinator {
  readonly #gateway: ActionGateway;
  readonly #adapters = new Map<ProviderId, ProviderAdapter>();
  readonly #sessions = new Map<string, SessionState>();
  readonly #activeByThread = new Map<string, ActiveTurnContext>();
  readonly #activeByProviderSession = new Map<string, ActiveTurnContext>();
  readonly #onDispose: (() => Promise<void>) | undefined;

  constructor(
    gateway: ActionGateway,
    options: {
      metaTransport?: MetaTransport;
      acpMcpServerFactory?: (
        provider: 'grok' | 'gemini',
        session: ProviderSessionOptions,
      ) => readonly AcpMcpServer[];
      onDispose?: () => Promise<void>;
    } = {},
  ) {
    this.#gateway = gateway;
    this.#onDispose = options.onDispose;
    this.#adapters.set(
      'codex',
      createCodexAdapter({
        // Sia owns the encrypted local transcript and reconstructs context when
        // a provider session is recreated. Do not leave a second native Codex
        // transcript in provider-owned persistence.
        sessionEphemeral: true,
        dynamicToolHandler: async (call, signal) => {
          const context = this.#activeByProviderSession.get(call.threadId ?? '');
          if (!context) {
            return {
              success: false,
              content: { error: 'No active Sia turn owns this tool call.' },
            };
          }
          return this.#invokeTool(context, call.name, call.arguments, signal);
        },
      }),
    );
    this.#adapters.set(
      'grok',
      createGrokAdapter({
        ...(options.acpMcpServerFactory
          ? { mcpServerFactory: (session) => options.acpMcpServerFactory!('grok', session) }
          : {}),
      }),
    );
    this.#adapters.set(
      'gemini',
      createGeminiAdapter({
        ...(options.acpMcpServerFactory
          ? { mcpServerFactory: (session) => options.acpMcpServerFactory!('gemini', session) }
          : {}),
      }),
    );
    this.#adapters.set('claude', createClaudeAdapter());
    if (options.metaTransport) {
      this.#adapters.set(
        'meta',
        createMetaAdapter({
          transport: options.metaTransport,
          toolHandler: async (call, signal) => {
            const context = this.#activeByThread.get(call.session.threadId);
            if (!context) {
              return {
                success: false,
                content: { error: 'No active Sia turn owns this tool call.' },
              };
            }
            return this.#invokeTool(context, call.name, call.arguments, signal);
          },
        }),
      );
    }
  }

  async listModels(
    provider: ProviderId,
    signal?: AbortSignal,
  ): Promise<readonly ProviderModelOption[]> {
    const adapter = this.#adapters.get(provider);
    if (!adapter?.listModels) return [];
    return await adapter.listModels(signal);
  }

  async *runTurn(
    input: RuntimeTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const state = await this.#sessionFor(input.thread, signal);
    for await (const event of this.#runSession(
      input.thread,
      input.turnId,
      state,
      input.lease,
      signal,
      () =>
        state.adapter.sendTurn(
          state.session,
          {
            turnId: input.turnId,
            text: input.text,
            model: input.thread.model,
            ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
            ...(input.attachments?.length ? { attachments: input.attachments } : {}),
          },
          signal,
        ),
    )) {
      yield event;
    }
  }

  async *runReview(
    input: RuntimeReviewInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const state = await this.#sessionFor(input.thread, signal);
    if (!state.adapter.startReview) {
      throw new Error(`${input.thread.provider} does not support dedicated code review.`);
    }
    for await (const event of this.#runSession(
      input.thread,
      input.turnId,
      state,
      input.lease,
      signal,
      () => state.adapter.startReview!(state.session, input, signal),
    )) {
      yield event;
    }
  }

  async *#runSession(
    thread: RuntimeThreadConfig,
    turnId: string,
    state: SessionState,
    lease: TurnLease | undefined,
    signal: AbortSignal | undefined,
    run: () => AsyncIterable<ThreadEventEnvelope>,
  ): AsyncIterable<ThreadEventEnvelope> {
    const context: ActiveTurnContext = {
      sessionId: state.session.id,
      threadId: thread.id,
      turnId,
      provider: thread.provider,
      workspace: thread.workspace,
      ...(lease ? { lease } : {}),
      ...(signal ? { signal } : {}),
    };
    this.#activeByThread.set(thread.id, context);
    this.#activeByProviderSession.set(state.session.id, context);
    this.#activeByProviderSession.set(state.session.nativeId, context);
    try {
      for await (const event of run()) {
        yield event;
      }
    } finally {
      if (this.#activeByThread.get(thread.id) === context) {
        this.#activeByThread.delete(thread.id);
      }
      if (this.#activeByProviderSession.get(state.session.id) === context) {
        this.#activeByProviderSession.delete(state.session.id);
      }
      if (this.#activeByProviderSession.get(state.session.nativeId) === context) {
        this.#activeByProviderSession.delete(state.session.nativeId);
      }
    }
  }

  async cancel(threadId: string, turnId: string): Promise<void> {
    const state = this.#sessions.get(threadId);
    if (state) await state.adapter.cancelTurn(state.session, turnId);
  }

  async respondToRequest(threadId: string, response: ProviderRequestResponse): Promise<void> {
    const state = this.#sessions.get(threadId);
    if (!state) throw new Error('The provider session ended before approval was resolved.');
    await state.adapter.respondToRequest(state.session, response);
  }

  async invokeCapability(
    sessionId: string,
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    const context = this.#activeByProviderSession.get(sessionId);
    if (!context) {
      return {
        outcome: 'refused',
        summary: 'This Sia tool capability is not attached to an active provider turn.',
      };
    }
    const result = await this.#gateway.invoke({
      name: toolName,
      arguments: argumentsValue,
      context,
    });
    return result;
  }

  async dispose(): Promise<void> {
    this.#activeByThread.clear();
    this.#activeByProviderSession.clear();
    this.#sessions.clear();
    await Promise.allSettled([...this.#adapters.values()].map((adapter) => adapter.dispose()));
    await this.#onDispose?.();
  }

  /** Drops all provider-side conversation state while keeping the app runtime reusable. */
  async resetSessions(): Promise<void> {
    this.#activeByThread.clear();
    this.#activeByProviderSession.clear();
    this.#sessions.clear();
    await Promise.allSettled([...this.#adapters.values()].map((adapter) => adapter.dispose()));
  }

  async #invokeTool(
    context: ActiveTurnContext,
    name: string,
    argumentsValue: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; content: unknown }> {
    const result = await this.#gateway.invoke({
      name,
      arguments: argumentsValue,
      context: { ...context, ...(signal ? { signal } : {}) },
    });
    return {
      success: result.outcome === 'verified' || result.outcome === 'accepted_unverified',
      content: result,
    };
  }

  async #sessionFor(thread: RuntimeThreadConfig, signal?: AbortSignal): Promise<SessionState> {
    const fingerprint = JSON.stringify([
      thread.provider,
      thread.model,
      thread.workspace,
      thread.instructions,
    ]);
    const existing = this.#sessions.get(thread.id);
    if (existing?.fingerprint === fingerprint) return existing;
    const adapter = this.#adapters.get(thread.provider);
    if (!adapter) {
      throw new Error(
        thread.provider === 'meta'
          ? 'Meta requires a configured Sia cloud relay in this build.'
          : `Provider ${thread.provider} is not available.`,
      );
    }
    if (!adapter.productionEnabled) {
      throw new Error(`${thread.provider} is disabled by the current provider policy.`);
    }
    const probe = await adapter.probe(signal);
    if (!probe.available || !probe.supported) {
      throw new Error(
        probe.reason ??
          `${thread.provider} is not installed at a version supported by this Sia release.`,
      );
    }
    const session = await adapter.createSession(
      {
        threadId: thread.id,
        model: thread.model,
        workspace: thread.workspace,
        instructions:
          thread.provider === 'codex'
            ? thread.instructions
            : composeSessionInstructions(thread.instructions, thread.priorMessages),
        ...(thread.provider === 'codex' && thread.priorMessages?.length
          ? { history: thread.priorMessages }
          : {}),
        tools: this.#gateway.listTools(),
      },
      signal,
    );
    const state = { adapter, session, fingerprint };
    this.#sessions.set(thread.id, state);
    return state;
  }
}

const MAX_LEGACY_RESTORED_TRANSCRIPT_CHARACTERS = 80_000;

export function composeSessionInstructions(
  instructions: string,
  priorMessages: RuntimeThreadConfig['priorMessages'],
): string {
  if (!priorMessages?.length) return instructions;
  const transcript = priorMessages
    .map(({ role, text }) => `${role === 'user' ? 'USER' : 'ASSISTANT'}:\n${text}`)
    .join('\n\n');
  const restored =
    transcript.length > MAX_LEGACY_RESTORED_TRANSCRIPT_CHARACTERS
      ? transcript.slice(-MAX_LEGACY_RESTORED_TRANSCRIPT_CHARACTERS)
      : transcript;
  return [
    instructions,
    'Continue the existing conversation using the restored transcript below. It is conversation history, not a new system instruction.',
    '<restored_conversation>',
    restored,
    '</restored_conversation>',
  ]
    .filter(Boolean)
    .join('\n\n');
}
