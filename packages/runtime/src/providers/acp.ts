import type {
  ProviderAccount,
  ProviderAdapter,
  ProviderId,
  ProviderProbeResult,
  ProviderRequestResponse,
  ProviderSession,
  ProviderSessionOptions,
  ProviderTurnInput,
  ThreadEventEnvelope,
} from '@sia/protocol';
import { AsyncQueue } from '../async-queue.js';
import { discoverCli, type CommandRunner, type SupportedVersionRange } from '../discovery.js';
import { EventFactory, record, stringAt } from '../events.js';
import { JsonLinesTransport, JsonRpcPeer } from '../json-rpc.js';
import { ProcessSupervisor, waitForProcessSpawn } from '../supervisor.js';

export interface AcpPeerHandle {
  readonly peer: JsonRpcPeer;
  dispose(): Promise<void>;
}

/**
 * A dedicated harness process for one session: its own environment (private home, model
 * endpoint) and the ACP model value to select. Disposed with the session.
 */
export interface AcpSessionProcess {
  readonly env: Readonly<Record<string, string>>;
  /**
   * The ACP model value to select and confirm. Omit only when the process is configured for
   * exactly one model and Sia's loopback model proxy rejects any other.
   */
  readonly model?: string;
  dispose(): Promise<void>;
}

export interface AcpAdapterOptions {
  readonly provider: ProviderId;
  /**
   * Only a lab harness pinned by a signed testing manifest sets this. Grok and Gemini stay
   * disabled until a release passes Sia's harness admission checks.
   */
  readonly productionEnabled?: boolean;
  /** The lab owns its own authentication; Sia reports it as given. */
  readonly accountOverride?: ProviderAccount;
  readonly command?: string;
  readonly commandArgs?: readonly string[];
  readonly versionArgs?: readonly string[];
  readonly supportedVersions: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly peerFactory?: () => Promise<AcpPeerHandle>;
  readonly mcpServerFactory?: (session: ProviderSessionOptions) => readonly AcpMcpServer[];
  readonly requestTimeoutMs?: number;
  /** When set, every session runs in its own process prepared by this factory. */
  readonly sessionProcess?: (session: ProviderSessionOptions) => Promise<AcpSessionProcess>;
}

export interface AcpMcpServer {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: readonly { readonly name: string; readonly value: string }[];
}

interface ActivePrompt {
  readonly session: ProviderSession;
  readonly input: ProviderTurnInput;
  readonly queue: AsyncQueue<ThreadEventEnvelope>;
  readonly events: EventFactory;
}

interface DeferredPermission {
  readonly resolve: (response: ProviderRequestResponse) => void;
  readonly reject: (error: Error) => void;
}

/** One permission option exactly as the harness offered it. */
interface AcpPermissionOption {
  readonly optionId: string;
  readonly kind: string | undefined;
}

interface AcpSessionState {
  readonly session: ProviderSession;
  readonly instructions: string;
  instructionsPending: boolean;
  /** Present when the session owns a dedicated process. */
  readonly dedicated?: DedicatedPeer;
}

interface DedicatedPeer {
  readonly handle: AcpPeerHandle;
  readonly process: AcpSessionProcess;
}

interface AcpSelectConfig {
  readonly id: string;
  readonly currentValue: string;
  readonly values: readonly string[];
}

const GEMINI_ACP_ARGS = [
  '--acp',
  '--extensions',
  'none',
  '--allowed-mcp-server-names',
  'sia',
] as const;

/** Provider-owned defaults used when an ACP command override is not supplied. */
export function defaultAcpCommandArgs(
  provider: Extract<ProviderId, 'grok' | 'gemini'>,
): readonly string[] {
  return provider === 'grok' ? ['agent', 'stdio'] : [...GEMINI_ACP_ARGS];
}

/** Shared ACP v1 adapter used by Grok Build, Gemini CLI, OpenCode, OpenHands and lab harnesses. */
export class AcpAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  readonly productionEnabled: boolean;
  readonly #options: AcpAdapterOptions;
  readonly #supervisor: ProcessSupervisor;
  readonly #sessions = new Map<string, AcpSessionState>();
  readonly #active = new Map<string, ActivePrompt>();
  readonly #pendingPermissions = new Map<string, DeferredPermission>();
  #peerHandle: AcpPeerHandle | undefined;
  #initializing: Promise<JsonRpcPeer> | undefined;

  constructor(options: AcpAdapterOptions) {
    this.id = options.provider;
    // Both adapters remain directly testable, but neither has a release currently
    // pinned to Sia's complete production boundary. Grok cannot comprehensively
    // exclude inherited extensions, and Gemini main does not advertise the
    // standard ACP model configuration that Sia must verify.
    this.productionEnabled = options.productionEnabled ?? false;
    this.#options = options;
    this.#supervisor = options.supervisor ?? new ProcessSupervisor();
  }

  async probe(signal?: AbortSignal): Promise<ProviderProbeResult> {
    return await discoverCli({
      command: this.#options.command ?? this.id,
      ...(this.#options.versionArgs ? { versionArgs: this.#options.versionArgs } : {}),
      range: this.#options.supportedVersions,
      ...(this.#options.commandRunner ? { runner: this.#options.commandRunner } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async account(_signal?: AbortSignal): Promise<ProviderAccount> {
    const probe = await this.probe(_signal);
    if (this.#options.accountOverride && probe.available && probe.supported)
      return this.#options.accountOverride;
    return {
      state: probe.available && probe.supported ? 'unknown' : 'unauthenticated',
      billing: this.id === 'grok' ? 'subscription' : 'api',
    };
  }

  async createSession(
    options: ProviderSessionOptions,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    await this.#releaseSession(options.threadId);
    const dedicated = this.#options.sessionProcess
      ? await this.#startDedicatedPeer(options)
      : undefined;
    try {
      const peer = dedicated?.handle.peer ?? (await this.#peer());
      const result = await peer.request(
        'session/new',
        {
          cwd: options.workspace,
          mcpServers: this.#options.mcpServerFactory?.(options) ?? [],
        },
        { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
      );
      const nativeId = stringAt(result, ['sessionId'], ['session', 'id'], ['id']);
      if (!nativeId) throw new Error(`${this.id} ACP session/new did not return a session id`);
      const requestedModel = dedicated ? dedicated.process.model : options.model;
      if (requestedModel !== undefined) {
        await this.#selectModel(peer, nativeId, requestedModel, result, signal);
      }
      const session: ProviderSession = {
        id: options.threadId,
        provider: this.id,
        nativeId,
        threadId: options.threadId,
      };
      const instructions = options.instructions.trim();
      this.#sessions.set(session.id, {
        session,
        instructions,
        instructionsPending: instructions.length > 0,
        ...(dedicated ? { dedicated } : {}),
      });
      return session;
    } catch (error) {
      if (dedicated) await disposeDedicated(dedicated);
      throw error;
    }
  }

  async *sendTurn(
    session: ProviderSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const state = this.#sessions.get(session.id);
    if (!state || state.session.nativeId !== session.nativeId)
      throw new Error(`Unknown ${this.id} session`);
    if (this.#active.has(session.nativeId))
      throw new Error(`A prompt is already active in this ${this.id} session`);
    const peer = state.dedicated?.handle.peer ?? (await this.#peer());
    const active: ActivePrompt = {
      session,
      input,
      queue: new AsyncQueue(),
      events: new EventFactory(this.id, session.threadId, input.turnId),
    };
    this.#active.set(session.nativeId, active);
    const onAbort = (): void => {
      void this.cancelTurn(session, input.turnId);
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const includesInstructions = state.instructionsPending;
    const promptText = includesInstructions
      ? firstPromptWithInstructions(state.instructions, input.text)
      : input.text;
    state.instructionsPending = false;

    void peer
      .request(
        'session/prompt',
        {
          sessionId: session.nativeId,
          prompt: [
            { type: 'text', text: promptText },
            ...(input.attachments ?? []).map((attachment) => ({
              type: 'resource',
              resource: { uri: `file://${attachment.path}`, name: attachment.name },
            })),
          ],
        },
        signal ? { signal } : undefined,
      )
      .then((result) => {
        const stopReason = stringAt(result, ['stopReason']);
        const status =
          stopReason === 'cancelled'
            ? 'cancelled'
            : stopReason === 'error'
              ? 'failed'
              : 'completed';
        active.queue.push(active.events.create('completion', { status }));
        active.queue.close();
        this.#active.delete(session.nativeId);
      })
      .catch((error: unknown) => {
        if (includesInstructions) state.instructionsPending = true;
        active.queue.push(
          active.events.create('error', {
            code: 'acp_prompt_failed',
            message: error instanceof Error ? error.message : String(error),
            recoverable: true,
          }),
        );
        active.queue.push(active.events.create('completion', { status: 'failed' }));
        active.queue.close();
        this.#active.delete(session.nativeId);
      });

    try {
      for await (const event of active.queue) yield event;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (this.#active.get(session.nativeId) === active) this.#active.delete(session.nativeId);
    }
  }

  async cancelTurn(session: ProviderSession, turnId: string): Promise<void> {
    const active = this.#active.get(session.nativeId);
    if (!active || active.input.turnId !== turnId) return;
    const dedicated = this.#sessions.get(session.id)?.dedicated;
    const peer = dedicated?.handle.peer ?? (await this.#peer());
    await peer.notify('session/cancel', { sessionId: session.nativeId });
  }

  async respondToRequest(
    _session: ProviderSession,
    response: ProviderRequestResponse,
  ): Promise<void> {
    const pending = this.#pendingPermissions.get(response.requestId);
    if (!pending) throw new Error(`Unknown ACP permission request ${response.requestId}`);
    this.#pendingPermissions.delete(response.requestId);
    pending.resolve(response);
  }

  async dispose(): Promise<void> {
    for (const pending of this.#pendingPermissions.values())
      pending.reject(new Error('ACP adapter disposed'));
    this.#pendingPermissions.clear();
    for (const active of this.#active.values())
      active.queue.fail(new Error('ACP adapter disposed'));
    this.#active.clear();
    const dedicated = [...this.#sessions.values()].flatMap(({ dedicated: peer }) =>
      peer ? [peer] : [],
    );
    this.#sessions.clear();
    await Promise.all(dedicated.map(disposeDedicated));
    await this.#peerHandle?.dispose();
    this.#peerHandle = undefined;
    this.#initializing = undefined;
    await this.#supervisor.dispose();
  }

  get #timeout(): number {
    return this.#options.requestTimeoutMs ?? 30_000;
  }

  async #peer(): Promise<JsonRpcPeer> {
    if (this.#peerHandle) return this.#peerHandle.peer;
    if (this.#initializing) return await this.#initializing;
    this.#initializing = (async () => {
      const handle = this.#options.peerFactory
        ? await this.#options.peerFactory()
        : await this.#spawnPeer();
      this.#peerHandle = handle;
      await this.#connect(handle);
      return handle.peer;
    })();
    try {
      return await this.#initializing;
    } catch (error) {
      this.#initializing = undefined;
      throw error;
    }
  }

  async #connect(handle: AcpPeerHandle): Promise<void> {
    handle.peer.onNotification((method, params) => this.#onNotification(method, params));
    handle.peer.onRequest(async (method, params) => await this.#onRequest(method, params));
    await handle.peer.request(
      'initialize',
      {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: 'sia', version: '0.1.0' },
      },
      { timeoutMs: this.#timeout },
    );
  }

  async #startDedicatedPeer(options: ProviderSessionOptions): Promise<DedicatedPeer> {
    const process = await this.#options.sessionProcess!(options);
    let handle: AcpPeerHandle | undefined;
    try {
      handle = this.#options.peerFactory
        ? await this.#options.peerFactory()
        : await this.#spawnPeer(process.env);
      await this.#connect(handle);
      return { handle, process };
    } catch (error) {
      await handle?.dispose().catch(() => undefined);
      await process.dispose();
      throw error;
    }
  }

  async #releaseSession(threadId: string): Promise<void> {
    const previous = this.#sessions.get(threadId);
    if (!previous?.dedicated) return;
    this.#sessions.delete(threadId);
    await disposeDedicated(previous.dedicated);
  }

  async #spawnPeer(env?: Readonly<Record<string, string>>): Promise<AcpPeerHandle> {
    const process = this.#supervisor.spawn({
      command: this.#options.command ?? this.id,
      args: [
        ...(this.#options.commandArgs ??
          (this.id === 'grok' || this.id === 'gemini' ? defaultAcpCommandArgs(this.id) : [])),
      ],
      ...(env ? { env } : {}),
    });
    await waitForProcessSpawn(process.child);
    process.child.stderr.resume();
    const peer = new JsonRpcPeer(
      new JsonLinesTransport(process.child.stdout, process.child.stdin),
    );
    return {
      peer,
      dispose: async () => {
        await peer.close();
        await process.stop();
      },
    };
  }

  async #selectModel(
    peer: JsonRpcPeer,
    sessionId: string,
    requestedModel: string,
    newSessionResult: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    const config = modelSelectConfig(newSessionResult);
    if (!config) {
      throw new Error(
        `${this.id} ACP session/new did not advertise a selectable model config; cannot guarantee requested model "${requestedModel}"`,
      );
    }
    if (config.currentValue === requestedModel) return;
    if (!config.values.includes(requestedModel)) {
      const advertised = config.values.length > 0 ? config.values.join(', ') : 'none';
      throw new Error(
        `${this.id} ACP does not advertise requested model "${requestedModel}" (advertised: ${advertised})`,
      );
    }
    const result = await peer.request(
      'session/set_config_option',
      {
        sessionId,
        configId: config.id,
        value: requestedModel,
      },
      { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
    );
    const confirmed = modelSelectConfig(result, config.id);
    if (!confirmed || confirmed.currentValue !== requestedModel) {
      throw new Error(
        `${this.id} ACP did not confirm requested model "${requestedModel}" after session/set_config_option`,
      );
    }
  }

  #onNotification(method: string, params: unknown): void {
    if (method !== 'session/update') return;
    const sessionId = stringAt(params, ['sessionId']);
    const active = sessionId ? this.#active.get(sessionId) : undefined;
    if (!active) return;
    const update = record(record(params).update);
    const kind = stringAt(update, ['sessionUpdate'], ['type']);
    const content = record(update.content);
    if (kind === 'agent_message_chunk') {
      active.queue.push(
        active.events.create('message', {
          messageId:
            stringAt(update, ['messageId'], ['id']) ?? `message-${active.input.turnId}`,
          role: 'assistant',
          parts: [
            {
              kind: 'text',
              text: stringAt(content, ['text']) ?? stringAt(update, ['text']) ?? '',
            },
          ],
          delta: true,
        }),
      );
      return;
    }
    if (kind === 'agent_thought_chunk') {
      active.queue.push(
        active.events.create('reasoning', {
          reasoningId: stringAt(update, ['id']) ?? `reasoning-${active.input.turnId}`,
          text: stringAt(content, ['text']) ?? stringAt(update, ['text']) ?? '',
          delta: true,
        }),
      );
      return;
    }
    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const rawStatus = stringAt(update, ['status']);
      const phase =
        rawStatus === 'failed'
          ? 'failed'
          : rawStatus === 'completed'
            ? 'completed'
            : kind === 'tool_call'
              ? 'started'
              : 'requested';
      active.queue.push(
        active.events.create('tool', {
          callId: stringAt(update, ['toolCallId'], ['id']) ?? 'acp-tool',
          name: stringAt(update, ['title'], ['name'], ['kind']) ?? 'provider_tool',
          phase,
          arguments: record(update.rawInput ?? update.input),
          ...(update.rawOutput === undefined ? {} : { result: update.rawOutput }),
          ...(stringAt(update, ['error']) ? { error: stringAt(update, ['error']) } : {}),
          native: true,
        }),
      );
      return;
    }
    if (kind === 'plan') {
      const entries = Array.isArray(update.entries) ? update.entries : [];
      active.queue.push(
        active.events.create('plan', {
          planId: active.input.turnId,
          steps: entries.map((entry, index) => {
            const item = record(entry);
            const candidate = stringAt(item, ['status']);
            const status =
              candidate === 'completed' || candidate === 'in_progress' ? candidate : 'pending';
            return {
              id: String(index),
              text: stringAt(item, ['content'], ['text']) ?? 'Step',
              status,
            };
          }),
        }),
      );
      return;
    }
    active.queue.push(
      active.events.create('tool', {
        callId: stringAt(update, ['id']) ?? `native-update:${active.input.turnId}`,
        name: `provider_native.${kind ?? 'unknown_update'}`,
        phase: 'completed',
        arguments: {},
        native: true,
      }),
    );
  }

  async #onRequest(method: string, params: unknown): Promise<unknown> {
    if (method !== 'session/request_permission') {
      throw Object.assign(new Error(`Unsupported ACP request ${method}`), { code: -32601 });
    }
    const sessionId = stringAt(params, ['sessionId']);
    const active = sessionId ? this.#active.get(sessionId) : undefined;
    if (!active) throw new Error('Permission request does not belong to an active ACP session');
    const requestId =
      stringAt(params, ['requestId'], ['toolCall', 'toolCallId']) ?? `permission:${Date.now()}`;
    const rawOptions = Array.isArray(record(params).options)
      ? (record(params).options as unknown[])
      : [];
    const choices = rawOptions.map((option, index) => {
      const value = record(option);
      const id = stringAt(value, ['optionId'], ['id']) ?? String(index);
      const kind = stringAt(value, ['kind']);
      return {
        id,
        label: stringAt(value, ['name'], ['label']) ?? id,
        kind: kind === 'allow_once' ? ('allow_once' as const) : ('deny' as const),
      };
    });
    active.queue.push(
      active.events.create('approval', {
        requestId,
        phase: 'requested',
        title: 'Provider requests permission',
        description:
          stringAt(params, ['toolCall', 'title'], ['description']) ??
          'Review this provider action.',
        choices:
          choices.length > 0
            ? choices
            : [
                { id: 'allow_once', label: 'Allow once', kind: 'allow_once' },
                { id: 'deny', label: 'Deny', kind: 'deny' },
              ],
      }),
    );
    const response = await new Promise<ProviderRequestResponse>((resolve, reject) => {
      this.#pendingPermissions.set(requestId, { resolve, reject });
    });
    const offered = rawOptions.map((option, index) => {
      const value = record(option);
      return {
        optionId: stringAt(value, ['optionId'], ['id']) ?? String(index),
        kind: stringAt(value, ['kind']),
      };
    });
    const optionId = permissionOptionId(offered, response.choiceId);
    return optionId
      ? { outcome: { outcome: 'selected', optionId } }
      : { outcome: { outcome: 'cancelled' } };
  }
}

/**
 * Sia answers with its own decision (`allow_once`, `allow_task`, `deny`); harnesses name their
 * options freely, so the answer is matched by ACP option kind. Sia approves one action at a time,
 * so a harness's "always allow" option is never chosen on the person's behalf.
 */
export function permissionOptionId(
  offered: readonly AcpPermissionOption[],
  choiceId: string | undefined,
): string | undefined {
  if (!choiceId) return undefined;
  if (offered.length === 0) return choiceId;
  if (offered.some(({ optionId }) => optionId === choiceId)) {
    const exact = offered.find(({ optionId }) => optionId === choiceId)!;
    if (exact.kind !== 'allow_always') return exact.optionId;
  }
  const wanted = choiceId === 'deny' ? ['reject_once', 'reject_always'] : ['allow_once'];
  for (const kind of wanted) {
    const match = offered.find((option) => option.kind === kind);
    if (match) return match.optionId;
  }
  return undefined;
}

async function disposeDedicated(dedicated: DedicatedPeer): Promise<void> {
  try {
    await dedicated.handle.dispose();
  } finally {
    await dedicated.process.dispose();
  }
}

function modelSelectConfig(value: unknown, expectedId?: string): AcpSelectConfig | undefined {
  const rawOptions = record(value).configOptions;
  if (!Array.isArray(rawOptions)) return undefined;
  const candidate = rawOptions
    .map((option) => record(option))
    .find((option) => {
      const id = stringAt(option, ['id']);
      if (expectedId) return id === expectedId;
      return stringAt(option, ['category']) === 'model' || id === 'model';
    });
  if (!candidate || stringAt(candidate, ['type']) !== 'select') return undefined;
  const id = stringAt(candidate, ['id']);
  const currentValue = stringAt(candidate, ['currentValue']);
  if (!id || !currentValue) return undefined;
  const rawValues = Array.isArray(candidate.options) ? candidate.options : [];
  return {
    id,
    currentValue,
    values: rawValues
      .map((option) => stringAt(option, ['value']))
      .filter((option): option is string => Boolean(option)),
  };
}

function firstPromptWithInstructions(instructions: string, prompt: string): string {
  return [
    'Follow these saved agent instructions throughout this session:',
    '<agent_instructions>',
    instructions,
    '</agent_instructions>',
    '',
    'User request:',
    prompt,
  ].join('\n');
}

export function createGrokAdapter(
  options: Omit<AcpAdapterOptions, 'provider' | 'supportedVersions'> & {
    readonly supportedVersions?: SupportedVersionRange;
  } = {},
): AcpAdapter {
  return new AcpAdapter({
    ...options,
    provider: 'grok',
    supportedVersions: options.supportedVersions ?? { minimum: '0.1.0' },
  });
}

export function createAcpAdapter(options: AcpAdapterOptions): AcpAdapter {
  return new AcpAdapter(options);
}

export function createGeminiAdapter(
  options: Omit<AcpAdapterOptions, 'provider' | 'supportedVersions'> & {
    readonly supportedVersions?: SupportedVersionRange;
  } = {},
): AcpAdapter {
  return new AcpAdapter({
    ...options,
    provider: 'gemini',
    supportedVersions: options.supportedVersions ?? { minimum: '0.1.0' },
  });
}
