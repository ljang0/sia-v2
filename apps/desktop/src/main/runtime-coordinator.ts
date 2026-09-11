import type {
  ProviderAdapter,
  ProviderId,
  HarnessId,
  ProviderRequestResponse,
  ProviderAttachment,
  ProviderModelOption,
  ProviderReviewInput,
  ProviderSession,
  ProviderSessionOptions,
  ResolvedExecutionTarget,
  ThreadEventEnvelope,
} from '@sia/protocol';
import {
  createClaudeAdapter,
  createCodexAdapter,
  createGeminiAdapter,
  createGrokAdapter,
  createMetaAdapter,
  legacyModelRoute,
  type AcpMcpServer,
  type CodexAppServerAdapter,
  type CodexChatGptLogin,
  type CodexCustomModelProviderResolver,
  type MetaTransport,
} from '@sia/runtime';
import type { ActionGateway, TurnLease } from '@sia/action-gateway';

import {
  macExecutionTools,
  macExecutionGuidance,
  MAC_RESPONSE_SCHEMA,
  presentMacResponse,
  parseMacResponse,
  type MacTaskResult,
} from './mac-execution.js';

export interface RuntimeThreadConfig {
  nativeTools?: 'disabled';
  computerAccessMode?: 'mac' | 'connected';
  macBackgroundControl?: boolean;
  macBackgroundFallback?: 'pause' | 'foreground';
  computerTrust?: 'ask' | 'auto';
  id: string;
  provider: ProviderId;
  model: string;
  resolvedExecutionTarget?: ResolvedExecutionTarget;
  workspace: string;
  instructions: string;
  priorMessages?: readonly { id: string; role: 'user' | 'assistant'; text: string }[];
}

export interface RuntimeTurnInput {
  onMacResult?: (result: MacTaskResult) => void;
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
  backgroundOnly?: boolean;
  allowedTools?: ReadonlySet<string>;
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
  target: ResolvedExecutionTarget;
  fingerprint: string;
}

export interface RuntimeHarnessRegistration {
  readonly provider: ProviderId;
  readonly harnessId: HarnessId;
  readonly adapter: ProviderAdapter;
}

/**
 * Owns provider subprocess lifecycles. Provider-native tools remain native; only
 * the canonical Sia actions cross through ActionGateway.
 */
export class RuntimeCoordinator {
  readonly #gateway: ActionGateway;
  readonly #macContext: (() => Promise<string>) | undefined;
  readonly #adapters = new Map<ProviderId, ProviderAdapter>();
  readonly #routeAdapters = new Map<string, ProviderAdapter>();
  readonly #ownedAdapters = new Set<ProviderAdapter>();
  readonly #codexAdapter: CodexAppServerAdapter;
  readonly #sessions = new Map<string, SessionState>();
  readonly #activeByThread = new Map<string, ActiveTurnContext>();
  readonly #activeByProviderSession = new Map<string, ActiveTurnContext>();
  readonly #onDispose: (() => Promise<void>) | undefined;

  constructor(
    gateway: ActionGateway,
    options: {
      macContext?: () => Promise<string>;
      metaTransport?: MetaTransport;
      hostedCodexProvider?: CodexCustomModelProviderResolver;
      acpMcpServerFactory?: (
        provider: 'grok' | 'gemini' | 'claude',
        session: ProviderSessionOptions,
      ) => readonly AcpMcpServer[];
      onDispose?: () => Promise<void>;
      /** Additional audited adapters. Registration never overrides a built-in route. */
      harnessAdapters?: readonly RuntimeHarnessRegistration[];
    } = {},
  ) {
    this.#gateway = gateway;
    this.#macContext = options.macContext;
    this.#onDispose = options.onDispose;
    this.#codexAdapter = createCodexAdapter({
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
    });
    this.#registerAdapter('codex', 'codex_app_server', this.#codexAdapter);
    if (options.hostedCodexProvider) {
      this.#registerAdapter(
        'meta',
        'codex_app_server',
        createCodexAdapter({
          providerId: 'meta',
          accountOverride: {
            state: 'authenticated',
            label: 'Included with Sia',
            billing: 'included',
          },
          customModelProvider: options.hostedCodexProvider,
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
        false,
      );
    }
    this.#registerAdapter(
      'grok',
      'legacy_acp',
      createGrokAdapter({
        ...(options.acpMcpServerFactory
          ? { mcpServerFactory: (session) => options.acpMcpServerFactory!('grok', session) }
          : {}),
      }),
    );
    this.#registerAdapter(
      'gemini',
      'legacy_acp',
      createGeminiAdapter({
        ...(options.acpMcpServerFactory
          ? { mcpServerFactory: (session) => options.acpMcpServerFactory!('gemini', session) }
          : {}),
      }),
    );
    this.#registerAdapter(
      'claude',
      'claude_code',
      createClaudeAdapter({
        ...(options.acpMcpServerFactory
          ? { mcpServerFactory: (session) => options.acpMcpServerFactory!('claude', session) }
          : {}),
      }),
    );
    if (options.metaTransport) {
      this.#registerAdapter(
        'meta',
        'sia_direct',
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
    for (const registration of options.harnessAdapters ?? []) {
      this.#registerAdapter(
        registration.provider,
        registration.harnessId,
        registration.adapter,
        false,
      );
    }
  }

  #registerAdapter(
    provider: ProviderId,
    harnessId: HarnessId,
    adapter: ProviderAdapter,
    providerDefault = true,
  ): void {
    if (adapter.id !== provider) {
      throw new Error(`Harness ${harnessId} adapter id must match provider ${provider}`);
    }
    const key = routeAdapterKey(provider, harnessId);
    if (this.#routeAdapters.has(key)) {
      throw new Error(`Harness route ${provider}/${harnessId} is already registered`);
    }
    this.#routeAdapters.set(key, adapter);
    this.#ownedAdapters.add(adapter);
    if (providerDefault && !this.#adapters.has(provider)) this.#adapters.set(provider, adapter);
  }

  async listModels(
    provider: ProviderId,
    signal?: AbortSignal,
  ): Promise<readonly ProviderModelOption[]> {
    const adapter = this.#adapters.get(provider);
    if (!adapter?.listModels) return [];
    return await adapter.listModels(signal);
  }

  async startCodexChatGptLogin(signal?: AbortSignal): Promise<CodexChatGptLogin> {
    return await this.#codexAdapter.startChatGptLogin(signal);
  }

  async waitForCodexChatGptLogin(loginId: string, signal?: AbortSignal): Promise<void> {
    await this.#codexAdapter.waitForChatGptLogin(loginId, signal);
  }

  async cancelCodexChatGptLogin(loginId: string): Promise<void> {
    await this.#codexAdapter.cancelChatGptLogin(loginId);
  }

  async *runTurn(
    input: RuntimeTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const mac =
      input.thread.computerAccessMode === 'mac' && input.thread.nativeTools !== 'disabled';
    // Like Notch's GUI token, one task owns the screen for its whole action loop.
    // The controller releases the turn lease on success, cancellation and failure.
    if (mac && input.lease)
      await input.lease.acquire({ kind: 'global_focus', id: 'foreground' }, signal);
    const nativeContext =
      mac && !input.thread.macBackgroundControl ? await this.#macContext?.() : undefined;
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
            text: [nativeContext, input.text].filter(Boolean).join('\n\n'),
            model: input.thread.model,
            ...(mac ? { outputSchema: MAC_RESPONSE_SCHEMA } : {}),
            ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
            ...(input.attachments?.length ? { attachments: input.attachments } : {}),
          },
          signal,
        ),
    )) {
      if (
        mac &&
        event.type === 'message' &&
        event.payload.role === 'assistant' &&
        !event.payload.delta
      ) {
        const result = parseMacResponse(
          event.payload.parts
            .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
            .join(''),
        );
        if (result) input.onMacResult?.(result);
      }
      yield mac ? presentMacResponse(event) : event;
    }
  }

  async *runReview(
    input: RuntimeReviewInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    if (
      input.thread.computerAccessMode === 'mac' &&
      input.thread.nativeTools !== 'disabled' &&
      input.lease
    )
      await input.lease.acquire({ kind: 'global_focus', id: 'foreground' }, signal);
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
      yield input.thread.computerAccessMode === 'mac' && input.thread.nativeTools !== 'disabled'
        ? presentMacResponse(event)
        : event;
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
      ...(thread.computerAccessMode === 'mac' && thread.macBackgroundControl
        ? { backgroundOnly: thread.macBackgroundFallback !== 'foreground' }
        : {}),
      ...(thread.computerAccessMode === 'mac' && thread.nativeTools !== 'disabled'
        ? { allowedTools: new Set(macExecutionTools(thread.macBackgroundControl)) }
        : {}),
      ...(lease ? { lease } : {}),
      ...(signal ? { signal } : {}),
    };
    this.#activeByThread.set(thread.id, context);
    this.#activeByProviderSession.set(state.session.id, context);
    this.#activeByProviderSession.set(state.session.nativeId, context);
    try {
      for await (const rawEvent of run()) {
        const event = {
          ...rawEvent,
          harnessId: state.target.harnessId,
          model: state.target.model,
        };
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
    return (await this.#invokeTool(context, toolName, argumentsValue)).content;
  }

  async dispose(): Promise<void> {
    this.#activeByThread.clear();
    this.#activeByProviderSession.clear();
    this.#sessions.clear();
    await Promise.allSettled([...this.#ownedAdapters].map((adapter) => adapter.dispose()));
    await this.#onDispose?.();
  }

  /** Drops all provider-side conversation state while keeping the app runtime reusable. */
  async resetSessions(): Promise<void> {
    this.#activeByThread.clear();
    this.#activeByProviderSession.clear();
    this.#sessions.clear();
    await Promise.allSettled([...this.#ownedAdapters].map((adapter) => adapter.dispose()));
  }

  async #invokeTool(
    context: ActiveTurnContext,
    name: string,
    argumentsValue: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; content: unknown }> {
    if (context.allowedTools && !context.allowedTools.has(name))
      return {
        success: false,
        content: {
          outcome: 'refused',
          summary:
            'Use my Mac uses native app tools only. Continue in the actual app; connected browser and service tools are unavailable in this mode.',
        },
      };
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
    if (
      thread.provider !== 'codex' &&
      thread.provider !== 'claude' &&
      thread.provider !== 'meta'
    ) {
      throw new Error(
        'This legacy provider is disabled for new turns. Connect Codex or Claude, or choose a model included with Sia.',
      );
    }
    const target = thread.resolvedExecutionTarget ?? {
      ...legacyModelRoute(thread.provider, thread.model),
      resolutionSource: 'legacy_default' as const,
    };
    assertTargetContext(thread, target);
    const mac = thread.computerAccessMode === 'mac' && thread.nativeTools !== 'disabled';
    if (mac && target.harnessId !== 'codex_app_server')
      throw new Error('Use my Mac requires a Codex App Server agent.');
    if (thread.nativeTools === 'disabled' && target.harnessId !== 'codex_app_server')
      throw new Error('Memory reviews require the Codex App Server harness.');
    const tools = this.#gateway
      .listTools()
      .filter(
        (tool) =>
          thread.nativeTools !== 'disabled' ||
          ['assistant_library', 'memory_suggest'].includes(tool.name),
      );
    const sessionTools = tools.filter((tool) =>
      mac
        ? macExecutionTools(thread.macBackgroundControl).includes(tool.name)
        : tool.name !== 'computer_task_complete',
    );
    const fingerprint = JSON.stringify([
      thread.provider,
      thread.model,
      target,
      thread.workspace,
      thread.instructions,
      thread.nativeTools,
      thread.computerAccessMode,
      thread.computerTrust,
      thread.macBackgroundControl,
      thread.macBackgroundFallback,
      sessionTools.map(({ name }) => name),
    ]);
    const existing = this.#sessions.get(thread.id);
    if (existing?.fingerprint === fingerprint) return existing;
    const adapter = this.#routeAdapters.get(routeAdapterKey(thread.provider, target.harnessId));
    if (!adapter) {
      throw new Error(
        target.harnessId === 'opencode_acp' || target.harnessId === 'pi_rpc'
          ? 'That beta harness has not passed this release’s conformance and security checks.'
          : thread.provider === 'meta'
            ? 'Included models require a configured Sia cloud relay in this build.'
            : `Harness ${target.harnessId} is not registered for ${thread.provider}.`,
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
    const account = await adapter.account(signal);
    if (account.state !== 'authenticated') {
      throw new Error(
        `Sign in to ${thread.provider === 'meta' ? 'Sia' : thread.provider} before starting a task.`,
      );
    }
    if (
      (thread.provider === 'codex' || thread.provider === 'claude') &&
      account.billing !== 'subscription'
    ) {
      throw new Error(
        `${thread.provider === 'codex' ? 'Codex' : 'Claude'} is authenticated with an unsupported billing source. Connect a subscription plan and try again.`,
      );
    }
    const usesCodexHarness = target.harnessId === 'codex_app_server';
    const session = await adapter.createSession(
      {
        ...(mac
          ? {
              nativeTools: thread.macBackgroundControl
                ? ('mac-background' as const)
                : ('mac' as const),
              nativeApproval: thread.computerTrust ?? 'ask',
              baseInstructions: macExecutionGuidance(
                thread.macBackgroundControl,
                thread.macBackgroundFallback,
              ),
            }
          : thread.nativeTools
            ? { nativeTools: thread.nativeTools }
            : {}),
        threadId: thread.id,
        model: target.harnessModelId,
        resolvedExecutionTarget: target,
        workspace: thread.workspace,
        instructions: usesCodexHarness
          ? thread.instructions
          : composeSessionInstructions(thread.instructions, thread.priorMessages),
        ...(usesCodexHarness && thread.priorMessages?.length
          ? { history: thread.priorMessages }
          : {}),
        tools: sessionTools,
      },
      signal,
    );
    const state = { adapter, session, target, fingerprint };
    this.#sessions.set(thread.id, state);
    return state;
  }
}

function assertTargetContext(
  thread: RuntimeThreadConfig,
  target: ResolvedExecutionTarget,
): void {
  if (target.provider !== thread.provider || target.model !== thread.model) {
    throw new Error('The thread execution route does not match its pinned provider and model.');
  }
}

function routeAdapterKey(provider: ProviderId, harnessId: HarnessId): string {
  return `${provider}\u0000${harnessId}`;
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
