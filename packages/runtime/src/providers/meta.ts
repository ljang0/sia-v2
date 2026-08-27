import { randomUUID } from 'node:crypto';
import type {
  ProviderAccount,
  ProviderAdapter,
  ProviderProbeResult,
  ProviderRequestResponse,
  ProviderSession,
  ProviderSessionOptions,
  ProviderTurnInput,
  ThreadEventEnvelope,
  ToolDescriptor,
} from '@sia/protocol';
import { EventFactory } from '../events.js';

export interface MetaCapabilities {
  readonly available: boolean;
  readonly models: readonly string[];
  readonly streaming: boolean;
  readonly tools: boolean;
  readonly reason?: string;
}

export type MetaInput =
  | {
      readonly type: 'user_message';
      readonly text: string;
      readonly attachments?: readonly string[];
    }
  | {
      readonly type: 'tool_output';
      readonly callId: string;
      readonly output: unknown;
      readonly success: boolean;
    };

export interface MetaTurnRequest {
  readonly sessionId: string;
  readonly turnId: string;
  readonly model: string;
  readonly instructions: string;
  readonly input: readonly MetaInput[];
  readonly tools: readonly ToolDescriptor[];
  readonly previousResponseId?: string;
}

export type MetaStreamEvent =
  | { readonly type: 'text_delta'; readonly messageId: string; readonly text: string }
  | { readonly type: 'reasoning_delta'; readonly reasoningId: string; readonly text: string }
  | {
      readonly type: 'tool_call';
      readonly callId: string;
      readonly name: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'usage';
      readonly inputTokens?: number;
      readonly outputTokens?: number;
      readonly cachedInputTokens?: number;
    }
  | {
      readonly type: 'completed';
      readonly responseId: string;
      readonly stopReason: 'complete' | 'tool_calls';
    }
  | {
      readonly type: 'error';
      readonly code: string;
      readonly message: string;
      readonly recoverable: boolean;
    };

/** Implemented by the Sia cloud client; it must not expose the Meta credential. */
export interface MetaTransport {
  capabilities(signal?: AbortSignal): Promise<MetaCapabilities>;
  stream(request: MetaTurnRequest, signal?: AbortSignal): AsyncIterable<MetaStreamEvent>;
}

export interface MetaToolResult {
  readonly success: boolean;
  readonly content: unknown;
}

export type MetaToolHandler = (
  call: {
    readonly session: ProviderSession;
    readonly turnId: string;
    readonly callId: string;
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
  },
  signal?: AbortSignal,
) => Promise<MetaToolResult>;

interface MetaSessionState {
  readonly session: ProviderSession;
  readonly options: ProviderSessionOptions;
}

export class MetaStreamingAdapter implements ProviderAdapter {
  readonly id = 'meta' as const;
  readonly productionEnabled = true;
  readonly #transport: MetaTransport;
  readonly #toolHandler: MetaToolHandler;
  readonly #sessions = new Map<string, MetaSessionState>();
  readonly #turnAbort = new Map<string, AbortController>();
  readonly #maxToolRounds: number;
  #capabilities?: MetaCapabilities;

  constructor(options: {
    readonly transport: MetaTransport;
    readonly toolHandler: MetaToolHandler;
    readonly maxToolRounds?: number;
  }) {
    this.#transport = options.transport;
    this.#toolHandler = options.toolHandler;
    this.#maxToolRounds = options.maxToolRounds ?? 16;
  }

  async probe(signal?: AbortSignal): Promise<ProviderProbeResult> {
    try {
      const capabilities = await this.#transport.capabilities(signal);
      this.#capabilities = capabilities;
      return {
        available: capabilities.available,
        supported: capabilities.available && capabilities.streaming && capabilities.tools,
        version: 'relay-v1',
        ...(!capabilities.available || !capabilities.streaming || !capabilities.tools
          ? {
              reason:
                capabilities.reason ??
                'Hosted model relay is missing required streaming or tool capabilities',
            }
          : {}),
      };
    } catch (error) {
      return {
        available: false,
        supported: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async account(_signal?: AbortSignal): Promise<ProviderAccount> {
    return { state: 'authenticated', label: 'Included with Sia alpha', billing: 'included' };
  }

  async createSession(
    options: ProviderSessionOptions,
    signal?: AbortSignal,
  ): Promise<ProviderSession> {
    const capabilities = this.#capabilities ?? (await this.#transport.capabilities(signal));
    this.#capabilities = capabilities;
    if (!capabilities.available || !capabilities.streaming || !capabilities.tools) {
      throw new Error(capabilities.reason ?? 'Hosted model relay is unavailable');
    }
    if (capabilities.models.length > 0 && !capabilities.models.includes(options.model)) {
      throw new Error(`Hosted model ${options.model} is not enabled by the relay`);
    }
    const session: ProviderSession = {
      id: options.threadId,
      provider: this.id,
      nativeId: randomUUID(),
      threadId: options.threadId,
    };
    this.#sessions.set(session.id, { session, options });
    return session;
  }

  async *sendTurn(
    session: ProviderSession,
    input: ProviderTurnInput,
    signal?: AbortSignal,
  ): AsyncIterable<ThreadEventEnvelope> {
    const state = this.#sessions.get(session.id);
    if (!state) throw new Error('Unknown Meta session');
    const turnKey = `${session.id}:${input.turnId}`;
    if (this.#turnAbort.has(turnKey)) throw new Error('Meta turn is already running');
    const controller = new AbortController();
    this.#turnAbort.set(turnKey, controller);
    const abort = (): void => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const events = new EventFactory(this.id, session.threadId, input.turnId);
    let nextInput: readonly MetaInput[] = [
      {
        type: 'user_message',
        text: input.text,
        ...(input.attachments?.length
          ? { attachments: input.attachments.map(({ path }) => path) }
          : {}),
      },
    ];
    let previousResponseId: string | undefined;

    try {
      for (let round = 0; round <= this.#maxToolRounds; round += 1) {
        if (round === this.#maxToolRounds) {
          yield events.create('error', {
            code: 'tool_round_limit',
            message: 'Meta exceeded the tool round limit',
            recoverable: true,
          });
          yield events.create('completion', {
            status: 'failed',
            ...(previousResponseId ? { providerTurnId: previousResponseId } : {}),
          });
          return;
        }
        const toolOutputs: MetaInput[] = [];
        let stopReason: 'complete' | 'tool_calls' | undefined;
        for await (const event of this.#transport.stream(
          {
            sessionId: session.nativeId,
            turnId: input.turnId,
            model: state.options.model,
            instructions: state.options.instructions,
            input: nextInput,
            tools: state.options.tools,
            ...(previousResponseId ? { previousResponseId } : {}),
          },
          controller.signal,
        )) {
          if (event.type === 'text_delta') {
            yield events.create('message', {
              messageId: event.messageId,
              role: 'assistant',
              parts: [{ kind: 'text', text: event.text }],
              delta: true,
            });
          } else if (event.type === 'reasoning_delta') {
            yield events.create('reasoning', {
              reasoningId: event.reasoningId,
              text: event.text,
              delta: true,
            });
          } else if (event.type === 'usage') {
            yield events.create('usage', {
              ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
              ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
              ...(event.cachedInputTokens === undefined
                ? {}
                : { cachedInputTokens: event.cachedInputTokens }),
              providerReported: true,
            });
          } else if (event.type === 'tool_call') {
            yield events.create('tool', {
              callId: event.callId,
              name: event.name,
              phase: 'started',
              arguments: { ...event.arguments },
              native: false,
            });
            try {
              const result = await this.#toolHandler(
                {
                  session,
                  turnId: input.turnId,
                  callId: event.callId,
                  name: event.name,
                  arguments: event.arguments,
                },
                controller.signal,
              );
              toolOutputs.push({
                type: 'tool_output',
                callId: event.callId,
                output: result.content,
                success: result.success,
              });
              yield events.create('tool', {
                callId: event.callId,
                name: event.name,
                phase: result.success ? 'completed' : 'failed',
                result: result.content,
                native: false,
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              toolOutputs.push({
                type: 'tool_output',
                callId: event.callId,
                output: { error: message },
                success: false,
              });
              yield events.create('tool', {
                callId: event.callId,
                name: event.name,
                phase: 'failed',
                error: message,
                native: false,
              });
            }
          } else if (event.type === 'error') {
            yield events.create('error', {
              code: event.code,
              message: event.message,
              recoverable: event.recoverable,
            });
          } else {
            previousResponseId = event.responseId;
            stopReason = event.stopReason;
          }
        }
        if (stopReason !== 'tool_calls') {
          yield events.create('completion', {
            status: 'completed',
            ...(previousResponseId ? { providerTurnId: previousResponseId } : {}),
          });
          return;
        }
        if (toolOutputs.length === 0) {
          yield events.create('error', {
            code: 'missing_tool_calls',
            message: 'Meta requested another tool round without providing tool calls',
            recoverable: true,
          });
          yield events.create('completion', {
            status: 'failed',
            ...(previousResponseId ? { providerTurnId: previousResponseId } : {}),
          });
          return;
        }
        nextInput = toolOutputs;
      }
    } catch (error) {
      const cancelled = controller.signal.aborted;
      if (!cancelled) {
        yield events.create('error', {
          code: 'meta_stream_failed',
          message: error instanceof Error ? error.message : String(error),
          recoverable: true,
        });
      }
      yield events.create('completion', {
        status: cancelled ? 'cancelled' : 'failed',
        ...(previousResponseId ? { providerTurnId: previousResponseId } : {}),
      });
    } finally {
      signal?.removeEventListener('abort', abort);
      this.#turnAbort.delete(turnKey);
    }
  }

  async cancelTurn(session: ProviderSession, turnId: string): Promise<void> {
    this.#turnAbort.get(`${session.id}:${turnId}`)?.abort(new Error('Turn cancelled'));
  }

  async respondToRequest(
    _session: ProviderSession,
    _response: ProviderRequestResponse,
  ): Promise<void> {
    throw new Error('Meta approvals are handled by Sia tools, not provider requests');
  }

  async dispose(): Promise<void> {
    for (const controller of this.#turnAbort.values())
      controller.abort(new Error('Meta adapter disposed'));
    this.#turnAbort.clear();
    this.#sessions.clear();
  }
}

export function createMetaAdapter(options: {
  readonly transport: MetaTransport;
  readonly toolHandler: MetaToolHandler;
  readonly maxToolRounds?: number;
}): MetaStreamingAdapter {
  return new MetaStreamingAdapter(options);
}
