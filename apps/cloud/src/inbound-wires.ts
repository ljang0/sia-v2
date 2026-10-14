import { harnessIdSchema } from '@sia/protocol';
import {
  anthropicErrorEvent,
  anthropicMessage,
  anthropicSse,
  parseAnthropicTurn,
} from './anthropic-relay.js';
import {
  chatCompletion,
  chatCompletionsErrorEvent,
  chatCompletionsSse,
  parseChatCompletionsTurn,
} from './chat-completions-relay.js';
import type { MetaStreamEvent, MetaTurnRequest } from './contracts.js';
import { parseMetaTurn } from './meta-turn.js';
import { parseResponsesTurn, responsesSse } from './responses-relay.js';

/**
 * One entry per model API a harness can speak to Sia's relay. Every wire converts to the same
 * provider-neutral turn, so any harness reaches any admitted lab whatever the lab's own protocol.
 */
export interface InboundWire {
  /** Harness assumed for usage attribution when the desktop relay does not name one. */
  readonly defaultHarness: string;
  parse(body: Record<string, unknown>): MetaTurnRequest;
  stream(
    events: AsyncIterable<MetaStreamEvent>,
    body: Record<string, unknown>,
  ): AsyncIterable<string>;
  /** Present when the wire also supports `stream: false`. */
  complete?(events: AsyncIterable<MetaStreamEvent>): Promise<Record<string, unknown>>;
  errorEvent(code: string, message: string): string;
}

const responses: InboundWire = {
  defaultHarness: 'codex_app_server',
  parse: parseResponsesTurn,
  stream: (events) => responsesSse(events),
  errorEvent: (code, message) =>
    `event: error\ndata: ${JSON.stringify({ type: 'error', code, message })}\n\n`,
};

const anthropicMessages: InboundWire = {
  defaultHarness: 'claude_code',
  parse: parseAnthropicTurn,
  stream: (events) => anthropicSse(events),
  complete: anthropicMessage,
  errorEvent: (_code, message) => anthropicErrorEvent(message),
};

const chatCompletions: InboundWire = {
  defaultHarness: 'unknown',
  parse: parseChatCompletionsTurn,
  stream: (events, body) =>
    chatCompletionsSse(events, {
      includeUsage:
        typeof body.stream_options === 'object' &&
        body.stream_options !== null &&
        (body.stream_options as Record<string, unknown>).include_usage === true,
    }),
  complete: chatCompletion,
  errorEvent: (_code, message) => chatCompletionsErrorEvent(message),
};

const legacy: InboundWire = {
  defaultHarness: 'sia_direct',
  parse: parseMetaTurn,
  stream: async function* (events) {
    for await (const event of events)
      yield `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  },
  errorEvent: (code, message) =>
    `event: error\ndata: ${JSON.stringify({ type: 'error', code, message })}\n\n`,
};

const WIRES: ReadonlyArray<readonly [suffix: string, wire: InboundWire]> = [
  ['/v1/responses', responses],
  ['/v1/messages', anthropicMessages],
  ['/v1/chat/completions', chatCompletions],
];

export function inboundWire(path: string): InboundWire {
  return WIRES.find(([suffix]) => path.endsWith(suffix))?.[1] ?? legacy;
}

/** Streams unless the client asked for one JSON response and the wire supports that. */
export function wantsStream(wire: InboundWire, body: Record<string, unknown>): boolean {
  return body.stream === true || !wire.complete;
}

/**
 * The desktop's loopback relay names the calling harness for sponsor usage reports. It is
 * client-reported and used for attribution only.
 */
export function requestHarness(
  headers: Record<string, string | undefined> | null | undefined,
  wire: InboundWire,
): string {
  const header = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'x-sia-harness',
  )?.[1];
  const parsed = harnessIdSchema.safeParse(header);
  return parsed.success ? parsed.data : wire.defaultHarness;
}
