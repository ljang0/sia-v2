import type {
  ProviderAccount,
  ProviderAdapter,
  ProviderProbeResult,
  ProviderModelOption,
  ProviderRequestResponse,
  ProviderReviewInput,
  ProviderSession,
  ProviderSessionOptions,
  ProviderTurnInput,
  ThreadEventEnvelope,
  ToolEvent,
} from '@sia/protocol';
import { AsyncQueue } from '../async-queue.js';
import { discoverCli, type CommandRunner, type SupportedVersionRange } from '../discovery.js';
import { EventFactory, numberAt, record, stringAt } from '../events.js';
import { JsonLinesTransport, JsonRpcPeer } from '../json-rpc.js';
import {
  ProcessSupervisor,
  type SupervisedProcess,
  waitForProcessSpawn,
} from '../supervisor.js';

export interface DynamicToolCall {
  readonly callId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly threadId?: string;
  readonly turnId?: string;
}

export interface DynamicToolCallResult {
  readonly success: boolean;
  readonly content: unknown;
}

export type DynamicToolHandler = (
  call: DynamicToolCall,
  signal?: AbortSignal,
) => Promise<DynamicToolCallResult>;

/**
 * Provider-native extension surfaces that Sia replaces with its own audited dynamic tools.
 * Keep this list explicit so a pinned Codex upgrade cannot silently expand the tool surface.
 */
export const SIA_CODEX_DISABLED_FEATURES = [
  'apps',
  'plugins',
  'hooks',
  'skill_search',
  'skill_mcp_dependency_install',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'in_app_browser',
  'computer_use',
  'image_generation',
  'terminal_visualization_instructions',
  'artifact',
] as const;

/** Native Codex tools that remain part of Sia's intentionally small provider surface. */
export const SIA_CODEX_ENABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'view_image',
  'multi_agent',
] as const;

const SIA_CODEX_CONFIG_OVERRIDES = [
  'skills.include_instructions=false',
  'skills.bundled.enabled=false',
  'orchestrator.skills.enabled=false',
  'orchestrator.mcp.enabled=false',
  'notify=[]',
  'web_search="live"',
] as const;

export function codexAppServerArgs(
  baseArgs: readonly string[] = ['app-server', '--listen', 'stdio://'],
): readonly string[] {
  return [
    ...baseArgs,
    ...SIA_CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...SIA_CODEX_ENABLED_FEATURES.flatMap((feature) => ['--enable', feature]),
    ...SIA_CODEX_CONFIG_OVERRIDES.flatMap((override) => ['-c', override]),
    '--strict-config',
  ];
}

export interface CodexPeerHandle {
  readonly peer: JsonRpcPeer;
  dispose(): Promise<void>;
}

export interface CodexAppServerOptions {
  readonly command?: string;
  readonly commandArgs?: readonly string[];
  readonly supportedVersions?: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly peerFactory?: () => Promise<CodexPeerHandle>;
  readonly dynamicToolHandler?: DynamicToolHandler;
  readonly requestTimeoutMs?: number;
  /** Creates non-persisted threads for opt-in real-binary smoke tests. */
  readonly sessionEphemeral?: boolean;
}

interface CodexIsolationInventory {
  readonly mcpServerNames: readonly string[];
  readonly skillPaths: readonly string[];
}

interface ActiveTurn {
  readonly session: ProviderSession;
  readonly input: ProviderTurnInput;
  readonly queue: AsyncQueue<ThreadEventEnvelope>;
  readonly events: EventFactory;
  readonly nativeItems: Map<string, Record<string, unknown>>;
  readonly dynamicToolNames: ReadonlySet<string>;
  nativeTurnId?: string;
}

interface DeferredRequest {
  readonly resolve: (response: ProviderRequestResponse) => void;
  readonly reject: (error: Error) => void;
}

export class CodexAppServerAdapter implements ProviderAdapter {
  readonly id = 'codex' as const;
  readonly productionEnabled = true;
  readonly #options: CodexAppServerOptions;
  readonly #supervisor: ProcessSupervisor;
  readonly #sessions = new Map<string, ProviderSession>();
  readonly #dynamicToolNamesBySession = new Map<string, ReadonlySet<string>>();
  readonly #activeByThread = new Map<string, ActiveTurn>();
  readonly #activeByNativeTurn = new Map<string, ActiveTurn>();
  readonly #pendingRequests = new Map<string, DeferredRequest>();
  #peerHandle: CodexPeerHandle | undefined;
  #initializing: Promise<JsonRpcPeer> | undefined;

  constructor(options: CodexAppServerOptions = {}) {
    this.#options = options;
    this.#supervisor = options.supervisor ?? new ProcessSupervisor();
  }

  async probe(signal?: AbortSignal): Promise<ProviderProbeResult> {
    return await discoverCli({
      command: this.#options.command ?? 'codex',
      range: this.#options.supportedVersions ?? {
        minimum: '0.147.0',
        maximumExclusive: '0.148.0',
      },
      ...(this.#options.commandRunner ? { runner: this.#options.commandRunner } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async account(signal?: AbortSignal): Promise<ProviderAccount> {
    const peer = await this.#peer();
    const result = record(
      await peer.request(
        'account/read',
        {},
        { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
      ),
    );
    const account = record(result.account ?? result);
    const email = stringAt(account, ['email'], ['label']);
    const accountType = stringAt(account, ['type'], ['planType']);
    return {
      state: accountType || email ? 'authenticated' : 'unauthenticated',
      ...(email ? { label: email } : {}),
      billing: accountType?.toLowerCase().includes('api') ? 'api' : 'subscription',
    };
  }

  async listModels(signal?: AbortSignal): Promise<readonly ProviderModelOption[]> {
    const peer = await this.#peer();
    const models: ProviderModelOption[] = [];
    let cursor: string | undefined;
    do {
      const result = record(
        await peer.request(
          'model/list',
          { limit: 100, ...(cursor ? { cursor } : {}) },
          { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
        ),
      );
      const data = Array.isArray(result.data) ? result.data : [];
      for (const candidate of data) {
        const model = record(candidate);
        const id = stringAt(model, ['model'], ['id']);
        if (!id || model.hidden === true) continue;
        const efforts = Array.isArray(model.supportedReasoningEfforts)
          ? model.supportedReasoningEfforts
              .map((entry) => stringAt(record(entry), ['reasoningEffort'], ['effort']))
              .filter((value): value is string => Boolean(value))
          : [];
        const defaultReasoningEffort = stringAt(model, ['defaultReasoningEffort']);
        models.push({
          id,
          label: stringAt(model, ['displayName']) ?? id,
          description: stringAt(model, ['description']) ?? '',
          reasoningEfforts: efforts,
          ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
        });
      }
      cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
    } while (cursor);
    return models;
  }

  async createSession(
    options: ProviderSessionOptions,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    const peer = await this.#peer();
    const inventory = await this.#readIsolationInventory(peer, options.workspace, signal);
    let result: unknown;
    try {
      result = await peer.request(
        'thread/start',
        {
          cwd: options.workspace,
          model: options.model,
          developerInstructions: options.instructions,
          approvalPolicy: 'on-request',
          sandbox: 'workspace-write',
          serviceName: 'sia',
          ...(this.#options.sessionEphemeral ? { ephemeral: true } : {}),
          config: this.#isolationConfig(inventory),
          dynamicTools: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        },
        { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
      );
    } catch {
      throw isolationFailure('Codex refused the isolated session configuration.');
    }
    const nativeId = stringAt(result, ['thread', 'id'], ['threadId'], ['id']);
    if (!nativeId)
      throw isolationFailure('Codex did not create a verifiable isolated session.');
    try {
      await this.#verifyIsolation(peer, options.workspace, nativeId, inventory, signal);
      if (options.history?.length) {
        await peer.request(
          'thread/inject_items',
          { threadId: nativeId, items: codexHistoryItems(options.history) },
          { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
        );
      }
    } catch {
      await peer
        .request('thread/unsubscribe', { threadId: nativeId }, { timeoutMs: this.#timeout })
        .catch(() => undefined);
      throw isolationFailure('Codex isolation verification failed.');
    }
    const session: ProviderSession = {
      id: options.threadId,
      provider: this.id,
      nativeId,
      threadId: options.threadId,
    };
    this.#sessions.set(session.id, session);
    this.#dynamicToolNamesBySession.set(
      session.id,
      new Set(options.tools.map(({ name }) => name)),
    );
    return session;
  }

  async *sendTurn(
    session: ProviderSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const params = {
      threadId: session.nativeId,
      input: [
        { type: 'text', text: input.text, text_elements: [] },
        ...(input.attachments ?? []).map((attachment) =>
          attachment.kind === 'image'
            ? { type: 'localImage', path: attachment.path }
            : attachment.kind === 'audio'
              ? { type: 'localAudio', path: attachment.path }
              : { type: 'mention', name: attachment.name, path: attachment.path },
        ),
      ],
      ...(input.model ? { model: input.model } : {}),
      ...(input.reasoningEffort ? { effort: input.reasoningEffort } : {}),
    };
    for await (const event of this.#runRequest(session, input, 'turn/start', params, signal)) {
      yield event;
    }
  }

  async *startReview(
    session: ProviderSession,
    input: ProviderReviewInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const target =
      input.target.type === 'uncommitted_changes'
        ? { type: 'uncommittedChanges' }
        : input.target.type === 'base_branch'
          ? { type: 'baseBranch', branch: input.target.branch }
          : input.target.type === 'commit'
            ? {
                type: 'commit',
                sha: input.target.sha,
                title: input.target.title ?? null,
              }
            : { type: 'custom', instructions: input.target.instructions };
    for await (const event of this.#runRequest(
      session,
      { turnId: input.turnId, text: '' },
      'review/start',
      { threadId: session.nativeId, target, delivery: 'inline' },
      signal,
    )) {
      yield event;
    }
  }

  async *#runRequest(
    session: ProviderSession,
    input: ProviderTurnInput,
    method: 'turn/start' | 'review/start',
    params: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    if (!this.#sessions.has(session.id)) throw new Error('Unknown Codex session');
    if (this.#activeByThread.has(session.nativeId))
      throw new Error('A turn is already active in this Codex thread');
    const peer = await this.#peer();
    const active: ActiveTurn = {
      session,
      input,
      queue: new AsyncQueue(),
      events: new EventFactory(this.id, session.threadId, input.turnId),
      nativeItems: new Map(),
      dynamicToolNames: this.#dynamicToolNamesBySession.get(session.id) ?? new Set(),
    };
    this.#activeByThread.set(session.nativeId, active);

    const onAbort = (): void => {
      void this.cancelTurn(session, input.turnId);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    void peer
      .request(method, params, { ...(signal ? { signal } : {}), timeoutMs: this.#timeout })
      .then((result) => {
        const nativeTurnId = stringAt(result, ['turn', 'id'], ['turnId'], ['id']);
        if (nativeTurnId) {
          active.nativeTurnId = nativeTurnId;
          this.#activeByNativeTurn.set(nativeTurnId, active);
        }
      })
      .catch((error: unknown) => this.#failTurn(active, error));

    try {
      for await (const event of active.queue) yield event;
    } finally {
      signal?.removeEventListener('abort', onAbort);
      this.#removeActive(active);
    }
  }

  async cancelTurn(session: ProviderSession, turnId: string): Promise<void> {
    const active = this.#activeByThread.get(session.nativeId);
    if (!active || active.input.turnId !== turnId) return;
    const peer = await this.#peer();
    await peer.request(
      'turn/interrupt',
      {
        threadId: session.nativeId,
        ...(active.nativeTurnId ? { turnId: active.nativeTurnId } : {}),
      },
      { timeoutMs: this.#timeout },
    );
  }

  async respondToRequest(
    _session: ProviderSession,
    response: ProviderRequestResponse,
  ): Promise<void> {
    const pending = this.#pendingRequests.get(response.requestId);
    if (!pending) throw new Error(`Unknown Codex request ${response.requestId}`);
    this.#pendingRequests.delete(response.requestId);
    pending.resolve(response);
  }

  async dispose(): Promise<void> {
    for (const request of this.#pendingRequests.values())
      request.reject(new Error('Codex adapter disposed'));
    this.#pendingRequests.clear();
    for (const active of this.#activeByThread.values())
      active.queue.fail(new Error('Codex adapter disposed'));
    this.#activeByThread.clear();
    this.#activeByNativeTurn.clear();
    this.#sessions.clear();
    this.#dynamicToolNamesBySession.clear();
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
      handle.peer.onNotification((method, params) => this.#onNotification(method, params));
      handle.peer.onRequest(async (method, params) => await this.#onRequest(method, params));
      await handle.peer.request(
        'initialize',
        {
          clientInfo: { name: 'sia', version: '0.1.0' },
          capabilities: { experimentalApi: true },
        },
        { timeoutMs: this.#timeout },
      );
      await handle.peer.notify('initialized', {});
      return handle.peer;
    })();
    try {
      return await this.#initializing;
    } catch (error) {
      this.#initializing = undefined;
      throw error;
    }
  }

  async #spawnPeer(): Promise<CodexPeerHandle> {
    const process = this.#supervisor.spawn({
      command: this.#options.command ?? 'codex',
      args: [...codexAppServerArgs(this.#options.commandArgs)],
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

  async #readIsolationInventory(
    peer: JsonRpcPeer,
    workspace: string,
    signal?: AbortSignal,
  ): Promise<CodexIsolationInventory> {
    try {
      const requestOptions = { ...(signal ? { signal } : {}), timeoutMs: this.#timeout };
      const [rawConfigResult, rawSkillsResult, rawHooksResult] = await Promise.all([
        peer.request('config/read', { cwd: workspace, includeLayers: false }, requestOptions),
        peer.request('skills/list', { cwds: [workspace], forceReload: true }, requestOptions),
        peer.request('hooks/list', { cwds: [workspace] }, requestOptions),
      ]);

      const configResult = strictRecord(rawConfigResult);
      const config = strictRecord(configResult.config);
      assertProcessIsolationConfig(config);

      const rawMcpServers = config.mcp_servers;
      const mcpServers = rawMcpServers === undefined ? {} : strictRecord(rawMcpServers);
      for (const value of Object.values(mcpServers)) strictRecord(value);

      const skillsResult = strictRecord(rawSkillsResult);
      const skillRows = strictArray(skillsResult.data);
      if (skillRows.length !== 1) throw new Error('unexpected skills inventory size');
      const skillRow = strictRecord(skillRows[0]);
      assertWorkspaceRow(skillRow, workspace);
      assertEmptyArray(skillRow.errors);
      const skillPaths = strictArray(skillRow.skills).map((rawSkill) => {
        const skill = strictRecord(rawSkill);
        const path = stringAt(skill, ['path']);
        if (!path) throw new Error('skill inventory omitted a path');
        return path;
      });

      const hooksResult = strictRecord(rawHooksResult);
      const hookRows = strictArray(hooksResult.data);
      if (hookRows.length !== 1) throw new Error('unexpected hooks inventory size');
      const hookRow = strictRecord(hookRows[0]);
      assertWorkspaceRow(hookRow, workspace);
      assertEmptyArray(hookRow.errors);
      assertEmptyArray(hookRow.warnings);
      for (const rawHook of strictArray(hookRow.hooks)) {
        if (strictRecord(rawHook).enabled !== false)
          throw new Error('an inherited hook remains enabled');
      }

      return {
        mcpServerNames: uniqueSorted(Object.keys(mcpServers)),
        skillPaths: uniqueSorted(skillPaths),
      };
    } catch {
      throw isolationFailure('Codex extension inventory could not be read safely.');
    }
  }

  #isolationConfig(inventory: CodexIsolationInventory): Readonly<Record<string, unknown>> {
    return {
      features: Object.fromEntries([
        ...SIA_CODEX_DISABLED_FEATURES.map((feature) => [feature, false] as const),
        ...SIA_CODEX_ENABLED_FEATURES.map((feature) => [feature, true] as const),
      ]),
      web_search: 'live',
      notify: [],
      orchestrator: {
        skills: { enabled: false },
        mcp: { enabled: false },
      },
      skills: {
        include_instructions: false,
        bundled: { enabled: false },
        config: inventory.skillPaths.map((path) => ({ path, enabled: false })),
      },
      mcp_servers: Object.fromEntries(
        inventory.mcpServerNames.map((name) => [name, { enabled: false }]),
      ),
    };
  }

  async #verifyIsolation(
    peer: JsonRpcPeer,
    workspace: string,
    threadId: string,
    expectedInventory: CodexIsolationInventory,
    signal?: AbortSignal,
  ): Promise<void> {
    const [features, apps, pluginsResult, mcpServers, currentInventory] = await Promise.all([
      this.#pagedRequest(peer, 'experimentalFeature/list', { threadId }, signal),
      this.#pagedRequest(peer, 'app/list', { threadId, forceRefetch: false }, signal),
      peer.request(
        'plugin/list',
        { cwds: [workspace], forceRefetch: false },
        { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
      ),
      this.#pagedRequest(
        peer,
        'mcpServerStatus/list',
        { threadId, detail: 'toolsAndAuthOnly' },
        signal,
      ),
      this.#readIsolationInventory(peer, workspace, signal),
    ]);

    const featureStates = new Map<string, unknown>();
    for (const rawFeature of features) {
      const feature = strictRecord(rawFeature);
      const name = stringAt(feature, ['name']);
      if (name) featureStates.set(name, feature.enabled);
    }
    if (SIA_CODEX_DISABLED_FEATURES.some((feature) => featureStates.get(feature) !== false)) {
      throw new Error('a provider-native feature remains enabled');
    }
    if (SIA_CODEX_ENABLED_FEATURES.some((feature) => featureStates.get(feature) !== true)) {
      throw new Error('a required native feature is unavailable');
    }
    if (apps.length !== 0) throw new Error('provider apps remain visible');

    const plugins = strictRecord(pluginsResult);
    assertEmptyArray(plugins.marketplaces);
    assertEmptyArray(plugins.marketplaceLoadErrors);

    const observedMcpNames: string[] = [];
    for (const rawServer of mcpServers) {
      const server = strictRecord(rawServer);
      const name = stringAt(server, ['name']);
      if (!name) throw new Error('MCP status omitted a server name');
      observedMcpNames.push(name);
      if (server.serverInfo !== null) throw new Error('an MCP server was started');
      assertEmptyCollection(server.tools);
      assertEmptyArray(server.resources);
      assertEmptyArray(server.resourceTemplates);
    }

    if (!sameStrings(observedMcpNames, expectedInventory.mcpServerNames))
      throw new Error('MCP inventory changed during session creation');
    if (
      !sameStrings(currentInventory.mcpServerNames, expectedInventory.mcpServerNames) ||
      !sameStrings(currentInventory.skillPaths, expectedInventory.skillPaths)
    ) {
      throw new Error('extension inventory changed during session creation');
    }
  }

  async #pagedRequest(
    peer: JsonRpcPeer,
    method: string,
    params: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<readonly unknown[]> {
    const data: unknown[] = [];
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 100; page += 1) {
      const result = strictRecord(
        await peer.request(
          method,
          { ...params, cursor, limit: 100 },
          { ...(signal ? { signal } : {}), timeoutMs: this.#timeout },
        ),
      );
      data.push(...strictArray(result.data));
      if (result.nextCursor === null || result.nextCursor === undefined) return data;
      if (
        typeof result.nextCursor !== 'string' ||
        result.nextCursor.length === 0 ||
        seenCursors.has(result.nextCursor)
      ) {
        throw new Error('invalid inventory cursor');
      }
      cursor = result.nextCursor;
      seenCursors.add(cursor);
    }
    throw new Error('inventory pagination exceeded its safety limit');
  }

  #findActive(params: unknown): ActiveTurn | undefined {
    const nativeTurnId = stringAt(params, ['turnId'], ['turn', 'id']);
    if (nativeTurnId) {
      const byTurn = this.#activeByNativeTurn.get(nativeTurnId);
      if (byTurn) return byTurn;
    }
    const threadId = stringAt(params, ['threadId'], ['thread', 'id']);
    return threadId ? this.#activeByThread.get(threadId) : undefined;
  }

  #onNotification(method: string, params: unknown): void {
    const active = this.#findActive(params);
    if (!active) return;
    const value = record(params);
    const item = record(value.item);
    const itemId = stringAt(value, ['itemId'], ['item', 'id']) ?? 'provider-item';
    if (method === 'item/agentMessage/delta') {
      active.queue.push(
        active.events.create('message', {
          messageId: itemId,
          role: 'assistant',
          parts: [{ kind: 'text', text: stringAt(value, ['delta'], ['text']) ?? '' }],
          delta: true,
        }),
      );
      return;
    }
    if (method === 'item/reasoning/textDelta' || method === 'item/reasoning/summaryTextDelta') {
      active.queue.push(
        active.events.create('reasoning', {
          reasoningId: itemId,
          text: stringAt(value, ['delta'], ['text']) ?? '',
          delta: true,
        }),
      );
      return;
    }
    if (method === 'item/commandExecution/outputDelta') {
      const cached = active.nativeItems.get(itemId) ?? { type: 'commandExecution', id: itemId };
      const delta = stringAt(value, ['delta']) ?? '';
      const output = `${stringAt(cached, ['aggregatedOutput']) ?? ''}${delta}`;
      const next = { ...cached, aggregatedOutput: output };
      active.nativeItems.set(itemId, next);
      active.queue.push(nativeToolEvent(active, itemId, next, 'started'));
      return;
    }
    if (method === 'item/fileChange/patchUpdated') {
      const cached = active.nativeItems.get(itemId) ?? { type: 'fileChange', id: itemId };
      const next = {
        ...cached,
        ...(Array.isArray(value.changes) ? { changes: value.changes } : {}),
      };
      active.nativeItems.set(itemId, next);
      active.queue.push(nativeToolEvent(active, itemId, next, 'started'));
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      const last = record(record(value.tokenUsage).last);
      active.queue.push(
        active.events.create('usage', {
          ...(numberAt(last, ['inputTokens']) === undefined
            ? {}
            : { inputTokens: numberAt(last, ['inputTokens']) }),
          ...(numberAt(last, ['outputTokens']) === undefined
            ? {}
            : { outputTokens: numberAt(last, ['outputTokens']) }),
          ...(numberAt(last, ['cachedInputTokens']) === undefined
            ? {}
            : { cachedInputTokens: numberAt(last, ['cachedInputTokens']) }),
          providerReported: true,
        }),
      );
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const itemType = stringAt(item, ['type']);
      active.nativeItems.set(itemId, item);
      if (itemType === 'collabAgentToolCall' || itemType === 'subAgentActivity') {
        for (const event of codexSubagentEvents(active, itemId, item, method)) {
          active.queue.push(event);
        }
        return;
      }
      const toolName = stringAt(item, ['tool'], ['name']) ?? itemType;
      if (toolName || !isTextOnlyCodexItem(itemType)) {
        active.queue.push(nativeToolEvent(active, itemId, item, nativePhase(method, item)));
      }
      return;
    }
    if (method === 'turn/plan/updated') {
      const rawPlan = Array.isArray(value.plan) ? value.plan : [];
      active.queue.push(
        active.events.create('plan', {
          planId: active.nativeTurnId ?? active.input.turnId,
          steps: rawPlan.map((step, index) => {
            const candidate = record(step);
            const rawStatus = stringAt(candidate, ['status']);
            const status =
              rawStatus === 'completed'
                ? 'completed'
                : rawStatus === 'inProgress' || rawStatus === 'in_progress'
                  ? 'in_progress'
                  : 'pending';
            return {
              id: stringAt(candidate, ['id']) ?? String(index),
              text: stringAt(candidate, ['step'], ['text']) ?? 'Step',
              status,
            };
          }),
        }),
      );
      return;
    }
    if (method === 'error' || method === 'turn/error' || method === 'thread/error') {
      // The app-server reports why a turn is about to fail (auth, usage limits, transport)
      // through an error notification; surface it so a failed turn is never silent.
      const message =
        stringAt(value, ['error', 'message'], ['message'], ['detail'], ['reason']) ??
        'The provider reported an error for this turn.';
      active.queue.push(
        active.events.create('error', { code: 'provider_error', message, recoverable: true }),
      );
      return;
    }
    if (method === 'turn/completed') {
      const rawStatus = stringAt(value, ['turn', 'status'], ['status']);
      const status =
        rawStatus === 'failed'
          ? 'failed'
          : rawStatus === 'cancelled' || rawStatus === 'interrupted'
            ? 'cancelled'
            : 'completed';
      if (status === 'failed') {
        const failureMessage = stringAt(
          value,
          ['turn', 'error', 'message'],
          ['error', 'message'],
          ['turn', 'failureReason'],
          ['message'],
        );
        if (failureMessage) {
          active.queue.push(
            active.events.create('error', {
              code: 'provider_error',
              message: failureMessage,
              recoverable: true,
            }),
          );
        }
      }
      active.queue.push(
        active.events.create('completion', {
          status,
          ...(active.nativeTurnId ? { providerTurnId: active.nativeTurnId } : {}),
        }),
      );
      active.queue.close();
      this.#removeActive(active);
    }
  }

  async #onRequest(method: string, params: unknown): Promise<unknown> {
    if (method === 'item/tool/call') {
      const callId = stringAt(params, ['callId'], ['item', 'id'], ['id']) ?? 'unknown-call';
      const name = stringAt(params, ['name'], ['tool'], ['item', 'name']);
      if (!name || !this.#options.dynamicToolHandler) {
        return {
          success: false,
          contentItems: [{ type: 'inputText', text: 'Tool unavailable' }],
        };
      }
      const result = await this.#options.dynamicToolHandler({
        callId,
        name,
        arguments: record(record(params).arguments ?? record(params).input),
        ...(stringAt(params, ['threadId'])
          ? { threadId: stringAt(params, ['threadId'])! }
          : {}),
        ...(stringAt(params, ['turnId']) ? { turnId: stringAt(params, ['turnId'])! } : {}),
      });
      return {
        success: result.success,
        contentItems: [
          {
            type: 'inputText',
            text:
              typeof result.content === 'string'
                ? result.content
                : JSON.stringify(withoutToolResultImages(result.content)),
          },
          ...toolResultImages(result.content).map((image) => ({
            type: 'inputImage' as const,
            imageUrl: `data:${image.mimeType};base64,${image.dataBase64}`,
          })),
        ],
      };
    }
    if (method.includes('requestApproval') || method.includes('requestUserInput')) {
      const requestId =
        stringAt(params, ['requestId'], ['itemId'], ['id']) ?? `${method}:${Date.now()}`;
      const active = this.#findActive(params);
      if (!active) throw new Error('Approval does not belong to an active turn');
      const isQuestion = method.includes('UserInput');
      if (isQuestion) {
        active.queue.push(
          active.events.create('question', {
            requestId,
            phase: 'requested',
            prompt: stringAt(params, ['question'], ['prompt']) ?? 'Codex needs input',
          }),
        );
      } else {
        active.queue.push(
          active.events.create('approval', {
            requestId,
            phase: 'requested',
            title: 'Codex requests approval',
            description:
              stringAt(params, ['reason'], ['command'], ['description']) ??
              'Review this provider action.',
            choices: [
              { id: 'allow_once', label: 'Allow once', kind: 'allow_once' },
              { id: 'deny', label: 'Deny', kind: 'deny' },
            ],
          }),
        );
      }
      const response = await new Promise<ProviderRequestResponse>((resolve, reject) => {
        this.#pendingRequests.set(requestId, { resolve, reject });
      });
      if (isQuestion) return { answers: response.text ? { answer: response.text } : {} };
      return { decision: response.choiceId === 'allow_once' ? 'accept' : 'decline' };
    }
    throw Object.assign(new Error(`Unsupported Codex request ${method}`), { code: -32601 });
  }

  #failTurn(active: ActiveTurn, error: unknown): void {
    active.queue.push(
      active.events.create('error', {
        code: 'provider_request_failed',
        message: error instanceof Error ? error.message : String(error),
        recoverable: true,
      }),
    );
    active.queue.push(active.events.create('completion', { status: 'failed' }));
    active.queue.close();
    this.#removeActive(active);
  }

  #removeActive(active: ActiveTurn): void {
    if (this.#activeByThread.get(active.session.nativeId) === active)
      this.#activeByThread.delete(active.session.nativeId);
    if (active.nativeTurnId && this.#activeByNativeTurn.get(active.nativeTurnId) === active)
      this.#activeByNativeTurn.delete(active.nativeTurnId);
  }
}

const MAX_RESTORED_HISTORY_CHARACTERS = 80_000;

export function codexHistoryItems(
  history: NonNullable<ProviderSessionOptions['history']>,
): Array<Record<string, unknown>> {
  const selected = [] as (typeof history)[number][];
  let characters = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    if (!message.text.trim()) continue;
    if (
      selected.length > 0 &&
      characters + message.text.length > MAX_RESTORED_HISTORY_CHARACTERS
    ) {
      break;
    }
    selected.push(message);
    characters += message.text.length;
  }
  return selected.reverse().map((message) => ({
    type: 'message',
    id: message.id,
    role: message.role,
    content: [
      {
        type: message.role === 'user' ? 'input_text' : 'output_text',
        text: message.text,
      },
    ],
  }));
}

function nativeToolEvent(
  active: ActiveTurn,
  itemId: string,
  item: Record<string, unknown>,
  phase: ToolEvent['payload']['phase'],
): ToolEvent {
  const itemType = stringAt(item, ['type']);
  const name = stringAt(item, ['tool'], ['name']) ?? itemType ?? 'provider_tool';
  const presentation = nativePresentation(itemType, item);
  return active.events.create('tool', {
    callId: itemId,
    name,
    phase,
    arguments: record(item.arguments ?? item.input),
    ...(item.output === undefined ? {} : { result: item.output }),
    ...(presentation ? { presentation } : {}),
    native: !active.dynamicToolNames.has(name),
  });
}

function nativePhase(
  method: string,
  item: Readonly<Record<string, unknown>>,
): ToolEvent['payload']['phase'] {
  const status = stringAt(item, ['status']);
  if (status === 'failed' || status === 'declined') return 'failed';
  return method === 'item/started' ? 'started' : 'completed';
}

function nativePresentation(
  itemType: string | undefined,
  item: Readonly<Record<string, unknown>>,
): ToolEvent['payload']['presentation'] | undefined {
  if (itemType === 'commandExecution') {
    return {
      kind: 'command',
      command: stringAt(item, ['command']) ?? 'Command',
      ...(stringAt(item, ['cwd']) ? { cwd: stringAt(item, ['cwd']) } : {}),
      ...(stringAt(item, ['aggregatedOutput'])
        ? { output: stringAt(item, ['aggregatedOutput']) }
        : {}),
      ...(item.exitCode === null || numberAt(item, ['exitCode']) !== undefined
        ? { exitCode: item.exitCode === null ? null : numberAt(item, ['exitCode']) }
        : {}),
      ...(item.durationMs === null || numberAt(item, ['durationMs']) !== undefined
        ? { durationMs: item.durationMs === null ? null : numberAt(item, ['durationMs']) }
        : {}),
      ...(item.processId === null || stringAt(item, ['processId'])
        ? { processId: item.processId === null ? null : stringAt(item, ['processId']) }
        : {}),
    };
  }
  if (itemType === 'fileChange') {
    return {
      kind: 'file_change',
      files: (Array.isArray(item.changes) ? item.changes : []).flatMap((candidate) => {
        const change = record(candidate);
        const path = stringAt(change, ['path']);
        const kind = stringAt(change, ['kind']);
        if (!path || !kind) return [];
        const diff = stringAt(change, ['diff']);
        return [{ path, change: kind, ...(diff ? { diff } : {}) }];
      }),
    };
  }
  if (itemType === 'webSearch') {
    return {
      kind: 'web_search',
      ...(stringAt(item, ['query']) ? { query: stringAt(item, ['query']) } : {}),
      sources: (Array.isArray(item.results) ? item.results : []).flatMap((candidate) => {
        const source = record(candidate);
        const url = stringAt(source, ['url'], ['link']);
        if (!url || !/^https?:\/\//i.test(url)) return [];
        const title = stringAt(source, ['title'], ['name']);
        return [{ url, ...(title ? { title } : {}) }];
      }),
    };
  }
  if (itemType === 'imageView' && stringAt(item, ['path'])) {
    return { kind: 'image', path: stringAt(item, ['path'])! };
  }
  if (itemType === 'enteredReviewMode' || itemType === 'exitedReviewMode') {
    return {
      kind: 'review',
      phase: itemType === 'enteredReviewMode' ? 'entered' : 'exited',
      review: stringAt(item, ['review']) ?? 'Code review',
    };
  }
  if (itemType === 'contextCompaction') return { kind: 'compaction' };
  return undefined;
}

function codexSubagentEvents(
  active: ActiveTurn,
  itemId: string,
  item: Readonly<Record<string, unknown>>,
  method: string,
) {
  const itemType = stringAt(item, ['type']);
  if (itemType === 'subAgentActivity') {
    const subagentId = stringAt(item, ['agentThreadId']) ?? itemId;
    const kind = stringAt(item, ['kind']);
    const agentPath = stringAt(item, ['agentPath']);
    return [
      active.events.create('subagent', {
        subagentId,
        name: subagentName(agentPath, subagentId),
        phase:
          kind === 'interrupted' ? 'failed' : kind === 'interacted' ? 'message' : 'started',
        operation: 'activity',
        parentThreadId: active.session.nativeId,
        ...(agentPath ? { agentPath } : {}),
      }),
    ];
  }

  const tool = stringAt(item, ['tool']);
  const operation = collabOperation(tool);
  const states = record(item.agentsStates);
  const receiverIds = Array.isArray(item.receiverThreadIds)
    ? item.receiverThreadIds.filter((value): value is string => typeof value === 'string')
    : [];
  const targets = [...new Set([...receiverIds, ...Object.keys(states)])];
  if (!targets.length) targets.push(itemId);
  return targets.map((subagentId) => {
    const state = record(states[subagentId]);
    const status = stringAt(state, ['status']);
    const text = stringAt(state, ['message']) ?? stringAt(item, ['prompt']);
    const model = stringAt(item, ['model']);
    const reasoningEffort = stringAt(item, ['reasoningEffort']);
    return active.events.create('subagent', {
      subagentId,
      name: subagentName(undefined, subagentId),
      phase: subagentPhase(operation, status, method, stringAt(item, ['status'])),
      operation,
      parentThreadId: stringAt(item, ['senderThreadId']) ?? active.session.nativeId,
      ...(text ? { text } : {}),
      ...(model ? { model } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });
  });
}

function collabOperation(tool: string | undefined) {
  if (tool === 'spawnAgent') return 'spawn' as const;
  if (tool === 'sendInput') return 'send' as const;
  if (tool === 'resumeAgent') return 'resume' as const;
  if (tool === 'closeAgent') return 'close' as const;
  return 'wait' as const;
}

function subagentPhase(
  operation: ReturnType<typeof collabOperation>,
  agentStatus: string | undefined,
  _method: string,
  callStatus: string | undefined,
) {
  if (agentStatus === 'errored' || callStatus === 'failed') return 'failed' as const;
  if (agentStatus === 'completed' || agentStatus === 'shutdown' || operation === 'close') {
    return 'completed' as const;
  }
  if (operation === 'send' || operation === 'wait') return 'message' as const;
  return 'started' as const;
}

function subagentName(agentPath: string | undefined, subagentId: string): string {
  const leaf = agentPath?.split('/').filter(Boolean).at(-1);
  return leaf || `Agent ${subagentId.slice(0, 8)}`;
}

function toolResultImages(value: unknown): Array<{ mimeType: string; dataBase64: string }> {
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

function withoutToolResultImages(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const { images: _images, ...rest } = value as Record<string, unknown>;
  return rest;
}

function isTextOnlyCodexItem(itemType: string | undefined): boolean {
  if (!itemType) return false;
  const normalized = itemType.replace(/[^a-z]/gi, '').toLowerCase();
  return (
    normalized === 'agentmessage' || normalized === 'usermessage' || normalized === 'reasoning'
  );
}

export function createCodexAdapter(options: CodexAppServerOptions = {}): CodexAppServerAdapter {
  return new CodexAppServerAdapter(options);
}

function isolationFailure(detail: string): Error {
  return new Error(`Codex isolation failed closed: ${detail}`);
}

function strictRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected an object');
  return value as Record<string, unknown>;
}

function strictArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('expected an array');
  return value;
}

function assertEmptyArray(value: unknown): void {
  if (!Array.isArray(value) || value.length !== 0) throw new Error('expected an empty array');
}

function assertEmptyCollection(value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length !== 0) throw new Error('expected an empty collection');
    return;
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value as Record<string, unknown>).length !== 0
  ) {
    throw new Error('expected an empty collection');
  }
}

function assertWorkspaceRow(row: Readonly<Record<string, unknown>>, workspace: string): void {
  if (row.cwd !== workspace)
    throw new Error('inventory did not resolve the requested workspace');
}

function assertProcessIsolationConfig(config: Readonly<Record<string, unknown>>): void {
  const features = strictRecord(config.features);
  for (const feature of SIA_CODEX_DISABLED_FEATURES) {
    if (features[feature] !== false) throw new Error('a required feature override is absent');
  }
  for (const feature of SIA_CODEX_ENABLED_FEATURES) {
    if (features[feature] !== true)
      throw new Error('a required native feature override is absent');
  }
  if (config.web_search !== 'live') throw new Error('public web search is unavailable');
  assertEmptyArray(config.notify);
  const skills = strictRecord(config.skills);
  if (skills.include_instructions !== false) throw new Error('skill instructions are enabled');
  if (strictRecord(skills.bundled).enabled !== false)
    throw new Error('bundled skills are enabled');
  const orchestrator = strictRecord(config.orchestrator);
  if (strictRecord(orchestrator.skills).enabled !== false)
    throw new Error('orchestrator skills are enabled');
  if (strictRecord(orchestrator.mcp).enabled !== false)
    throw new Error('orchestrator MCP is enabled');
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = uniqueSorted(left);
  const sortedRight = uniqueSorted(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}
