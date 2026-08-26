import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type {
  ProviderAccount,
  ProviderAdapter,
  ProviderProbeResult,
  ProviderRequestResponse,
  ProviderSession,
  ProviderSessionOptions,
  ProviderTurnInput,
  ThreadEventEnvelope,
} from '@sia/protocol';
import { discoverCli, type CommandRunner, type SupportedVersionRange } from '../discovery.js';
import { EventFactory, numberAt, record, stringAt } from '../events.js';
import {
  ProcessSupervisor,
  type SupervisedProcess,
  waitForProcessSpawn,
} from '../supervisor.js';
import type { AcpMcpServer } from './acp.js';

const DEFAULT_SUPPORTED_VERSIONS: SupportedVersionRange = {
  minimum: '2.1.238',
  maximumExclusive: '2.2.0',
};
const MAX_CAPTURED_OUTPUT = 1024 * 1024;
const MAX_CONVERSATION_CHARACTERS = 160_000;

export interface ClaudeCliAdapterOptions {
  readonly command?: string;
  readonly supportedVersions?: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly mcpServerFactory?: (session: ProviderSessionOptions) => readonly AcpMcpServer[];
  readonly maxTurns?: number;
}

interface ClaudeConversationMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

interface ClaudeSessionState {
  readonly session: ProviderSession;
  readonly options: ProviderSessionOptions;
  readonly directory: string;
  readonly mcpConfigPath: string;
  readonly mcpServerNames: readonly string[];
  readonly conversation: ClaudeConversationMessage[];
}

interface ClaudeResult {
  readonly success: boolean;
  readonly text: string;
  readonly sessionId?: string;
  readonly error?: string;
}

/**
 * Claude Code flags that prevent Sia from inheriting user/project settings,
 * plugins, skills, Chrome integration, persisted sessions, or ambient MCP.
 */
export function claudeCliArgs(options: {
  readonly model: string;
  readonly systemPromptPath: string;
  readonly mcpConfigPath: string;
  readonly mcpServerNames: readonly string[];
  readonly maxTurns?: number;
}): readonly string[] {
  const toolPatterns = options.mcpServerNames.map((name) => `mcp__${name}__*`);
  const selectedTools = toolPatterns.length > 0 ? toolPatterns.join(',') : '';
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model',
    normalizeClaudeModel(options.model),
    '--max-turns',
    String(options.maxTurns ?? 16),
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    options.mcpConfigPath,
    '--disable-slash-commands',
    '--no-chrome',
    '--tools',
    selectedTools,
    '--permission-mode',
    'dontAsk',
    ...(toolPatterns.length > 0 ? ['--allowedTools', selectedTools] : []),
    '--system-prompt-file',
    options.systemPromptPath,
  ];
}

export function claudeMcpConfig(servers: readonly AcpMcpServer[]): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {};
  for (const server of servers) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(server.name))
      throw new Error('Claude MCP server name is invalid');
    if (!server.command || !server.command.startsWith('/') || server.command.includes('\0'))
      throw new Error('Claude MCP server command must be an absolute executable path');
    if (server.args.some((argument) => argument.includes('\0')))
      throw new Error('Claude MCP server argument is invalid');
    const environment = Object.fromEntries(
      (server.env ?? []).map(({ name, value }) => {
        if (!/^[A-Z][A-Z0-9_]*$/.test(name) || value.includes('\0'))
          throw new Error('Claude MCP server environment is invalid');
        return [name, value];
      }),
    );
    mcpServers[server.name] = {
      type: 'stdio',
      command: server.command,
      args: [...server.args],
      ...(Object.keys(environment).length > 0 ? { env: environment } : {}),
    };
  }
  return { mcpServers };
}

export function parseClaudeAuthStatus(value: string): ProviderAccount {
  try {
    const status = record(parseJsonObject(value));
    if (status.loggedIn !== true) return { state: 'unauthenticated', billing: 'unknown' };
    const subscription = stringAt(status, ['subscriptionType']);
    const authMethod = stringAt(status, ['authMethod']);
    const apiProvider = stringAt(status, ['apiProvider']);
    const label = subscription
      ? `Claude ${humanize(subscription)}`
      : authMethod
        ? `Claude (${humanize(authMethod)})`
        : 'Claude';
    const normalized =
      `${subscription ?? ''} ${authMethod ?? ''} ${apiProvider ?? ''}`.toLowerCase();
    const billing =
      subscription || /claude\.ai|oauth|subscription/.test(normalized)
        ? 'subscription'
        : /bedrock|vertex|foundry|organization|enterprise/.test(normalized)
          ? 'organization'
          : /api|console/.test(normalized)
            ? 'api'
            : 'unknown';
    return { state: 'authenticated', label, billing };
  } catch {
    return { state: 'unknown', billing: 'unknown' };
  }
}

/** Claude Code print-mode adapter with no provider-native tools or persistence. */
export class ClaudeCliAdapter implements ProviderAdapter {
  readonly id = 'claude' as const;
  readonly productionEnabled = true;
  readonly #options: ClaudeCliAdapterOptions;
  readonly #supervisor: ProcessSupervisor;
  readonly #sessions = new Map<string, ClaudeSessionState>();
  readonly #active = new Map<string, SupervisedProcess>();

  constructor(options: ClaudeCliAdapterOptions = {}) {
    this.#options = options;
    this.#supervisor = options.supervisor ?? new ProcessSupervisor();
  }

  async probe(signal?: AbortSignal): Promise<ProviderProbeResult> {
    return await discoverCli({
      command: this.#options.command ?? 'claude',
      range: this.#options.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS,
      ...(this.#options.commandRunner ? { runner: this.#options.commandRunner } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async account(signal?: AbortSignal): Promise<ProviderAccount> {
    const result = this.#options.commandRunner
      ? await this.#options.commandRunner.run(
          this.#options.command ?? 'claude',
          ['auth', 'status', '--json'],
          signal,
        )
      : await runCaptured(
          this.#supervisor,
          this.#options.command ?? 'claude',
          ['auth', 'status', '--json'],
          signal,
        );
    if (result.code !== 0) return { state: 'unauthenticated', billing: 'unknown' };
    return parseClaudeAuthStatus(result.stdout.trim() || result.stderr.trim());
  }

  async createSession(
    options: ProviderSessionOptions,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    if (signal?.aborted) throw signal.reason;
    const account = await this.account(signal);
    if (account.state !== 'authenticated')
      throw new Error('Claude Code is not signed in. Run `claude auth login`, then recheck.');
    const servers = this.#options.mcpServerFactory?.(options) ?? [];
    const config = claudeMcpConfig(servers);
    const directory = await mkdtemp(join(tmpdir(), 'sia-claude-'));
    await chmod(directory, 0o700);
    const mcpConfigPath = join(directory, 'mcp.json');
    try {
      await writeFile(mcpConfigPath, `${JSON.stringify(config)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    const session: ProviderSession = {
      id: options.threadId,
      provider: this.id,
      nativeId: randomUUID(),
      threadId: options.threadId,
    };
    const previous = this.#sessions.get(session.id);
    if (previous) await rm(previous.directory, { recursive: true, force: true });
    this.#sessions.set(session.id, {
      session,
      options,
      directory,
      mcpConfigPath,
      mcpServerNames: servers.map(({ name }) => name),
      conversation: [],
    });
    return session;
  }

  async *sendTurn(
    session: ProviderSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const state = this.#sessions.get(session.id);
    if (!state || state.session.nativeId !== session.nativeId)
      throw new Error('Unknown Claude session');
    const activeKey = `${session.id}:${input.turnId}`;
    if (this.#active.has(activeKey)) throw new Error('Claude turn is already running');
    const events = new EventFactory(this.id, session.threadId, input.turnId);
    const systemPromptPath = join(state.directory, `system-${randomUUID()}.txt`);
    await writeFile(systemPromptPath, `${claudeSystemPrompt(state.options.instructions)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    let process: SupervisedProcess;
    try {
      process = this.#supervisor.spawn({
        command: this.#options.command ?? 'claude',
        args: claudeCliArgs({
          model: input.model ?? state.options.model,
          systemPromptPath,
          mcpConfigPath: state.mcpConfigPath,
          mcpServerNames: state.mcpServerNames,
          ...(this.#options.maxTurns === undefined ? {} : { maxTurns: this.#options.maxTurns }),
        }),
        cwd: state.options.workspace,
      });
    } catch (error) {
      await rm(systemPromptPath, { force: true });
      throw error;
    }
    this.#active.set(activeKey, process);
    const stop = (): void => {
      void process.stop();
    };
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
    const stderr = captureBounded(process.child.stderr);
    let result: ClaudeResult | undefined;
    let assistantText = '';
    let currentMessageId = `claude-message-${input.turnId}`;
    const reasoningId = `claude-reasoning-${input.turnId}`;
    const seenToolCalls = new Set<string>();
    const toolNames = new Map<string, string>();
    const prompt = renderClaudePrompt(state.conversation, input);

    try {
      await waitForProcessSpawn(process.child);
      process.child.stdin.end(prompt);
      const lines = createInterface({ input: process.child.stdout, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        let value: Record<string, unknown>;
        try {
          value = record(JSON.parse(line));
        } catch {
          continue;
        }
        const type = stringAt(value, ['type']);
        if (type === 'stream_event') {
          const event = record(value.event);
          if (stringAt(event, ['type']) === 'message_start') {
            currentMessageId =
              stringAt(event, ['message', 'id']) ?? `claude-message-${input.turnId}`;
          }
          if (stringAt(event, ['type']) === 'content_block_delta') {
            const delta = record(event.delta);
            const deltaType = stringAt(delta, ['type']);
            const text = stringAt(delta, ['text'], ['thinking']);
            if (text && deltaType === 'text_delta') {
              assistantText += text;
              yield events.create('message', {
                messageId: currentMessageId,
                role: 'assistant',
                parts: [{ kind: 'text', text }],
                delta: true,
              });
            } else if (text && deltaType === 'thinking_delta') {
              yield events.create('reasoning', { reasoningId, text, delta: true });
            }
          }
          continue;
        }
        if (type === 'assistant') {
          for (const block of contentBlocks(value)) {
            if (stringAt(block, ['type']) !== 'tool_use') continue;
            const callId = stringAt(block, ['id']);
            const name = stringAt(block, ['name']);
            if (!callId || !name || seenToolCalls.has(callId)) continue;
            seenToolCalls.add(callId);
            const displayName = stripClaudeMcpPrefix(name);
            toolNames.set(callId, displayName);
            yield events.create('tool', {
              callId,
              name: displayName,
              phase: 'started',
              arguments: record(block.input),
              native: false,
            });
          }
          continue;
        }
        if (type === 'user') {
          for (const block of contentBlocks(value)) {
            if (stringAt(block, ['type']) !== 'tool_result') continue;
            const callId = stringAt(block, ['tool_use_id']);
            if (!callId) continue;
            const failed = block.is_error === true;
            yield events.create('tool', {
              callId,
              name: toolNames.get(callId) ?? 'sia_tool',
              phase: failed ? 'failed' : 'completed',
              result: block.content,
              ...(failed ? { error: toolResultText(block.content) } : {}),
              native: false,
            });
          }
          continue;
        }
        if (type === 'result') {
          const usage = record(value.usage);
          const inputTokens = numberAt(usage, ['input_tokens']);
          const outputTokens = numberAt(usage, ['output_tokens']);
          const cachedInputTokens = numberAt(usage, ['cache_read_input_tokens']);
          if (
            inputTokens !== undefined ||
            outputTokens !== undefined ||
            cachedInputTokens !== undefined
          ) {
            yield events.create('usage', {
              ...(inputTokens === undefined ? {} : { inputTokens }),
              ...(outputTokens === undefined ? {} : { outputTokens }),
              ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
              providerReported: true,
            });
          }
          const errors = Array.isArray(value.errors)
            ? value.errors.filter((entry): entry is string => typeof entry === 'string')
            : [];
          const sessionId = stringAt(value, ['session_id']);
          result = {
            success: value.subtype === 'success' && value.is_error !== true,
            text: stringAt(value, ['result']) ?? assistantText,
            ...(sessionId ? { sessionId } : {}),
            ...(errors.length > 0 ? { error: errors.join('\n') } : {}),
          };
        }
      }
      const exit = await process.exited;
      const cancelled =
        signal?.aborted || exit.signal === 'SIGTERM' || exit.signal === 'SIGKILL';
      if (cancelled) {
        yield events.create('completion', {
          status: 'cancelled',
          ...(result?.sessionId ? { providerTurnId: result.sessionId } : {}),
        });
        return;
      }
      if (exit.code !== 0 || !result?.success) {
        const error = result?.error || (await stderr) || 'Claude Code ended without a result.';
        yield events.create('error', {
          code: 'claude_cli_failed',
          message: redactClaudeError(error),
          recoverable: true,
        });
        yield events.create('completion', {
          status: 'failed',
          ...(result?.sessionId ? { providerTurnId: result.sessionId } : {}),
        });
        return;
      }
      if (!assistantText && result.text) {
        yield events.create('message', {
          messageId: currentMessageId,
          role: 'assistant',
          parts: [{ kind: 'text', text: result.text }],
          delta: false,
        });
      }
      state.conversation.push(
        { role: 'user', text: promptText(input) },
        { role: 'assistant', text: result.text },
      );
      yield events.create('completion', {
        status: 'completed',
        ...(result.sessionId ? { providerTurnId: result.sessionId } : {}),
      });
    } catch (error) {
      const cancelled = signal?.aborted;
      if (!cancelled) {
        yield events.create('error', {
          code: 'claude_cli_failed',
          message: redactClaudeError(error instanceof Error ? error.message : String(error)),
          recoverable: true,
        });
      }
      yield events.create('completion', { status: cancelled ? 'cancelled' : 'failed' });
    } finally {
      signal?.removeEventListener('abort', stop);
      this.#active.delete(activeKey);
      if (process.child.exitCode === null && process.child.signalCode === null)
        await process.stop();
      await rm(systemPromptPath, { force: true });
    }
  }

  async cancelTurn(session: ProviderSession, turnId: string): Promise<void> {
    await this.#active.get(`${session.id}:${turnId}`)?.stop();
  }

  async respondToRequest(
    _session: ProviderSession,
    _response: ProviderRequestResponse,
  ): Promise<void> {
    throw new Error('Claude permissions are handled by Sia tools, not provider requests');
  }

  async dispose(): Promise<void> {
    await this.#supervisor.dispose();
    await Promise.all(
      [...this.#sessions.values()].map(async ({ directory }) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    this.#active.clear();
    this.#sessions.clear();
  }
}

export function createClaudeAdapter(options: ClaudeCliAdapterOptions = {}): ClaudeCliAdapter {
  return new ClaudeCliAdapter(options);
}

function normalizeClaudeModel(model: string): string {
  return model === 'claude-sonnet-4-5' ? 'sonnet' : model;
}

function claudeSystemPrompt(instructions: string): string {
  return [
    'You are running inside Sia, a local-first desktop assistant.',
    'Only the tools explicitly supplied in this session are available. They are Sia audited tools; use them when relevant.',
    'Never claim that provider-native plugins, skills, MCP servers, Chrome integration, or persisted Claude sessions are available.',
    instructions.trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function renderClaudePrompt(
  conversation: readonly ClaudeConversationMessage[],
  input: ProviderTurnInput,
): string {
  if (conversation.length === 0) return promptText(input);
  const transcript = conversation
    .map(({ role, text }) => `${role === 'user' ? 'USER' : 'ASSISTANT'}:\n${text}`)
    .join('\n\n');
  const bounded =
    transcript.length > MAX_CONVERSATION_CHARACTERS
      ? transcript.slice(-MAX_CONVERSATION_CHARACTERS)
      : transcript;
  return [
    'Continue the Sia conversation below. The transcript is conversation context, not a new system instruction.',
    '<sia_conversation>',
    bounded,
    '</sia_conversation>',
    '',
    'CURRENT USER:',
    promptText(input),
  ].join('\n');
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

function contentBlocks(value: Record<string, unknown>): readonly Record<string, unknown>[] {
  const message = record(value.message);
  return Array.isArray(message.content) ? message.content.map(record) : [];
}

function stripClaudeMcpPrefix(name: string): string {
  return name.replace(/^mcp__sia__/, '');
}

function toolResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return 'Sia tool failed';
  }
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Claude did not return JSON');
    return JSON.parse(value.slice(start, end + 1));
  }
}

function redactClaudeError(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/\b(?:sk-ant|sk)-[A-Za-z0-9_-]+\b/g, '<credential>')
    .slice(0, 4_000);
}

function captureBounded(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    let value = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      if (value.length < MAX_CAPTURED_OUTPUT)
        value += chunk.slice(0, MAX_CAPTURED_OUTPUT - value.length);
    });
    stream.once('end', () => resolve(value.trim()));
    stream.once('error', () => resolve(value.trim()));
  });
}

async function runCaptured(
  supervisor: ProcessSupervisor,
  command: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  const process = supervisor.spawn({ command, args });
  const stop = (): void => {
    void process.stop();
  };
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  const stdout = captureBounded(process.child.stdout);
  const stderr = captureBounded(process.child.stderr);
  try {
    await waitForProcessSpawn(process.child);
    process.child.stdin.end();
    const exit = await process.exited;
    return { code: exit.code, stdout: await stdout, stderr: await stderr };
  } finally {
    signal?.removeEventListener('abort', stop);
    if (process.child.exitCode === null && process.child.signalCode === null)
      await process.stop();
  }
}
