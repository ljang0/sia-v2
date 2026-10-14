import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { EventFactory, numberAt, record, stringAt } from '../events.js';
import {
  ProcessSupervisor,
  type SupervisedProcess,
  waitForProcessSpawn,
} from '../supervisor.js';
import type { AcpMcpServer } from './acp.js';

/** The versions whose RPC events, config isolation and tool lockdown were checked. */
const DEFAULT_SUPPORTED_VERSIONS: SupportedVersionRange = {
  minimum: '1.2.0',
  maximumExclusive: '1.3.0',
};

/** Pi's provider id for the one model route Sia configures. */
const SIA_PROVIDER = 'sia';
const MAX_INSTRUCTIONS = 32_000;

/** A loopback Responses endpoint holding a model-scoped capability, not a real key. */
export interface PiModelEndpoint {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export interface PiAdapterOptions {
  readonly providerId: ProviderId;
  readonly accountOverride: ProviderAccount;
  readonly modelEndpoint: (session: ProviderSessionOptions) => Promise<PiModelEndpoint>;
  readonly command?: string;
  readonly supportedVersions?: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly mcpServerFactory?: (session: ProviderSessionOptions) => readonly AcpMcpServer[];
}

interface PiSessionState {
  readonly session: ProviderSession;
  readonly process: SupervisedProcess;
  readonly home: string;
  /** One reader over the process's records, shared by every turn of the session. */
  readonly records: AsyncIterator<Record<string, unknown>>;
  active?: { readonly turnId: string } | undefined;
}

/** Pi's `models.json`: only the Sia provider and the one scoped model. */
export function piModels(endpoint: PiModelEndpoint, model: string) {
  return {
    providers: {
      [SIA_PROVIDER]: {
        baseUrl: endpoint.baseUrl,
        api: 'openai-responses',
        apiKey: endpoint.apiKey,
        models: [{ id: model }],
      },
    },
  };
}

/** Pi's `mcp.json`: Sia's tool servers, declared directly to the model. */
export function piMcpConfig(servers: readonly AcpMcpServer[]) {
  return {
    mcpServers: Object.fromEntries(
      servers.map((server) => [
        server.name,
        {
          command: server.command,
          args: [...server.args],
          ...(server.env?.length
            ? { env: Object.fromEntries(server.env.map(({ name, value }) => [name, value])) }
            : {}),
          exposure: 'direct',
        },
      ]),
    ),
  };
}

/**
 * Flags that keep Pi to Sia's boundary: no persisted session, no extensions except the built-in
 * MCP client, only Sia's MCP tools declared, and no skills, templates, themes, context files,
 * project trust, or startup network calls.
 */
export function piArgs(model: string, instructions: string): readonly string[] {
  const trimmed = instructions.trim().slice(0, MAX_INSTRUCTIONS);
  return [
    '--mode',
    'rpc',
    '--no-session',
    '--provider',
    SIA_PROVIDER,
    '--model',
    model,
    '--no-extensions',
    '-e',
    'builtin:mcp',
    '--tools',
    'mcp__sia__*',
    '--no-skills',
    '--no-prompt-templates',
    '--no-themes',
    '--no-context-files',
    '--no-approve',
    '--offline',
    ...(trimmed ? ['--append-system-prompt', trimmed] : []),
  ];
}

/**
 * Pi in RPC mode for an included model. Each session runs in its own process with a private
 * HOME and agent directory, so the person's Pi login, settings, extensions and sessions are never
 * loaded, and everything Pi writes is deleted with the session.
 */
export class PiRpcAdapter implements ProviderAdapter {
  readonly id: ProviderId;
  // Release admission is the harness registry's decision; the adapter itself is complete.
  readonly productionEnabled = true;
  readonly #options: PiAdapterOptions;
  readonly #supervisor: ProcessSupervisor;
  readonly #sessions = new Map<string, PiSessionState>();

  constructor(options: PiAdapterOptions) {
    this.id = options.providerId;
    this.#options = options;
    this.#supervisor = options.supervisor ?? new ProcessSupervisor();
  }

  async probe(signal?: AbortSignal): Promise<ProviderProbeResult> {
    return await discoverCli({
      command: this.#options.command ?? 'pi',
      range: this.#options.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS,
      ...(this.#options.commandRunner ? { runner: this.#options.commandRunner } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async account(): Promise<ProviderAccount> {
    return this.#options.accountOverride;
  }

  hasSession(session: ProviderSession): boolean {
    const state = this.#sessions.get(session.id);
    return Boolean(state && state.session.nativeId === session.nativeId);
  }

  async createSession(options: ProviderSessionOptions): Promise<ProviderSession> {
    await this.#release(options.threadId);
    const endpoint = await this.#options.modelEndpoint(options);
    const home = await mkdtemp(join(tmpdir(), 'sia-pi-'));
    try {
      await chmod(home, 0o700);
      const agentDir = join(home, 'agent');
      await mkdir(agentDir, { mode: 0o700 });
      const write = (name: string, value: unknown) =>
        writeFile(join(agentDir, name), `${JSON.stringify(value)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
      await write('models.json', piModels(endpoint, options.model));
      await write('mcp.json', piMcpConfig(this.#options.mcpServerFactory?.(options) ?? []));
      const process = this.#supervisor.spawn({
        command: this.#options.command ?? 'pi',
        args: piArgs(options.model, options.instructions),
        cwd: options.workspace,
        env: { HOME: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_TELEMETRY: '0' },
      });
      await waitForProcessSpawn(process.child);
      process.child.stderr.resume();
      const queue = new AsyncQueue<Record<string, unknown>>();
      readJsonLines(process.child.stdout, queue);
      // Turns read with next() so ending one turn never closes the session's stream.
      const records = queue[Symbol.asyncIterator]();
      const session: ProviderSession = {
        id: options.threadId,
        provider: this.id,
        nativeId: `pi-${options.threadId}-${Date.now()}`,
        threadId: options.threadId,
      };
      this.#sessions.set(session.id, { session, process, home, records });
      return session;
    } catch (error) {
      await rm(home, { recursive: true, force: true });
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
      throw new Error('Unknown Pi session');
    if (state.active) throw new Error('A Pi turn is already running');
    state.active = { turnId: input.turnId };
    const events = new EventFactory(this.id, session.threadId, input.turnId);
    const onAbort = () => void this.cancelTurn(session, input.turnId);
    signal?.addEventListener('abort', onAbort, { once: true });
    let assistantIndex = 0;
    const toolNames = new Map<string, string>();
    try {
      state.process.child.stdin.write(
        `${JSON.stringify({ id: input.turnId, type: 'prompt', message: promptText(input) })}\n`,
      );
      while (true) {
        const next = await state.records.next();
        if (next.done) break;
        const value = next.value;
        const type = stringAt(value, ['type']);
        if (type === 'response' && value.command === 'prompt' && value.success === false) {
          yield events.create('error', {
            code: 'pi_prompt_failed',
            message: stringAt(value, ['error']) ?? 'Pi rejected the prompt.',
            recoverable: true,
          });
          yield events.create('completion', { status: 'failed' });
          return;
        }
        if (type === 'message_start' && stringAt(value, ['message', 'role']) === 'assistant') {
          assistantIndex += 1;
          continue;
        }
        if (type === 'message_update') {
          const update = record(value.assistantMessageEvent);
          const delta = stringAt(update, ['delta']);
          const kind = stringAt(update, ['type']);
          if (kind === 'text_delta' && delta) {
            yield events.create('message', {
              messageId: `pi-${input.turnId}-${assistantIndex}`,
              role: 'assistant',
              parts: [{ kind: 'text', text: delta }],
              delta: true,
            });
          } else if (kind === 'thinking_delta' && delta) {
            yield events.create('reasoning', {
              reasoningId: `pi-reasoning-${input.turnId}-${assistantIndex}`,
              text: delta,
              delta: true,
            });
          }
          continue;
        }
        if (type === 'message_end' && stringAt(value, ['message', 'role']) === 'assistant') {
          const message = record(value.message);
          const usage = record(message.usage);
          const inputTokens = numberAt(usage, ['input']);
          const outputTokens = numberAt(usage, ['output']);
          const cachedInputTokens = numberAt(usage, ['cacheRead']);
          if (inputTokens !== undefined || outputTokens !== undefined) {
            yield events.create('usage', {
              ...(inputTokens === undefined ? {} : { inputTokens }),
              ...(outputTokens === undefined ? {} : { outputTokens }),
              ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
              providerReported: true,
            });
          }
          if (stringAt(message, ['stopReason']) === 'error') {
            yield events.create('error', {
              code: 'pi_model_error',
              message: stringAt(message, ['errorMessage']) ?? 'The model request failed.',
              recoverable: true,
            });
          }
          continue;
        }
        if (type === 'tool_execution_start' || type === 'tool_execution_end') {
          const callId = stringAt(value, ['toolCallId']) ?? `pi-tool-${input.turnId}`;
          const name = (stringAt(value, ['toolName']) ?? 'sia_tool').replace(/^mcp__sia__/, '');
          toolNames.set(callId, name);
          const failed = type === 'tool_execution_end' && value.isError === true;
          yield events.create('tool', {
            callId,
            name: toolNames.get(callId) ?? name,
            phase:
              type === 'tool_execution_start' ? 'started' : failed ? 'failed' : 'completed',
            arguments: record(value.args),
            ...(type === 'tool_execution_end' ? { result: value.result } : {}),
            native: false,
          });
          continue;
        }
        if (type === 'agent_settled') {
          yield events.create('completion', {
            status: value.aborted === true || signal?.aborted ? 'cancelled' : 'completed',
          });
          return;
        }
      }
      // The process ended before Pi settled the turn.
      yield events.create('error', {
        code: 'pi_exited',
        message: 'Pi stopped before finishing the turn.',
        recoverable: true,
      });
      yield events.create('completion', { status: signal?.aborted ? 'cancelled' : 'failed' });
    } finally {
      signal?.removeEventListener('abort', onAbort);
      state.active = undefined;
    }
  }

  async cancelTurn(session: ProviderSession, turnId: string): Promise<void> {
    const state = this.#sessions.get(session.id);
    if (state?.active?.turnId !== turnId) return;
    state.process.child.stdin.write(`${JSON.stringify({ type: 'abort' })}\n`);
  }

  async respondToRequest(
    _session: ProviderSession,
    _response: ProviderRequestResponse,
  ): Promise<void> {
    throw new Error('Pi permissions are handled by Sia tools, not provider requests');
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((id) => this.#release(id)));
    await this.#supervisor.dispose();
  }

  async #release(threadId: string): Promise<void> {
    const state = this.#sessions.get(threadId);
    if (!state) return;
    this.#sessions.delete(threadId);
    await state.process.stop();
    await rm(state.home, { recursive: true, force: true });
  }
}

export function createPiAdapter(options: PiAdapterOptions): PiRpcAdapter {
  return new PiRpcAdapter(options);
}

function promptText(input: ProviderTurnInput): string {
  if (!input.attachments?.length) return input.text;
  return [
    input.text,
    '',
    'Attached local items (use Sia tools to inspect them):',
    ...input.attachments.map(({ kind, name, path }) => `- ${kind}: ${name} (${path})`),
  ].join('\n');
}

/**
 * Pi frames records with LF only; Unicode line separators may appear inside JSON strings, so
 * Node's readline (which also splits on them) cannot be used.
 */
function readJsonLines(
  stream: NodeJS.ReadableStream,
  queue: AsyncQueue<Record<string, unknown>>,
): void {
  const decoder = new TextDecoder();
  let buffer = '';
  stream.on('data', (chunk: Buffer) => {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          queue.push(record(JSON.parse(line)));
        } catch {
          // Pi reserves stdout for JSONL; ignore anything else, and records after close.
        }
      }
      newline = buffer.indexOf('\n');
    }
  });
  stream.once('end', () => queue.close());
  stream.once('error', () => queue.close());
}
