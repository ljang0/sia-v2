import type {
  MetaMessage,
  MetaStreamEvent,
  MetaTool,
  MetaToolCall,
  MetaTurnRequest,
} from './contracts.js';
import { CloudError, ids, isRecord, requireString } from './domain.js';
import { collectTurn, toolCallDeltas, type CollectedTurn } from './relay-collect.js';

type Part = Record<string, unknown>;

/**
 * Translate an Anthropic Messages request (as sent by Claude Code or any Anthropic SDK client)
 * into Sia's bounded relay contract.
 */
export function parseAnthropicTurn(body: Record<string, unknown>): MetaTurnRequest {
  const model = requireString(body.model, 'model', { max: 256 });
  const messages: MetaMessage[] = [];
  const system = systemText(body.system);
  if (system) messages.push({ role: 'system', content: system });
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new CloudError(400, 'invalid_messages_request', 'messages must be a non-empty array');
  }
  body.messages.forEach((value, index) => appendMessage(messages, value, index));
  const tools = body.tools === undefined ? undefined : parseTools(body.tools);
  return {
    turnId: ids.next(),
    sessionId: sessionId(body.metadata),
    model,
    messages,
    ...(tools === undefined ? {} : { tools }),
  };
}

function systemText(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_messages_request', 'system must be text or blocks');
  }
  return value
    .map((block, index) =>
      isRecord(block) && block.type === 'text'
        ? requireString(block.text, `system[${index}].text`, { min: 0, max: 1_000_000 })
        : '',
    )
    .filter(Boolean)
    .join('\n\n');
}

function sessionId(metadata: unknown): string {
  const userId = isRecord(metadata) ? metadata.user_id : undefined;
  // The cloud derives the upstream session from the account; this only groups one client's turns.
  return typeof userId === 'string' && userId.length > 0 && userId.length <= 128
    ? userId
    : ids.next();
}

function appendMessage(messages: MetaMessage[], value: unknown, index: number): void {
  if (!isRecord(value)) {
    throw new CloudError(400, 'invalid_messages_request', `messages[${index}] is invalid`);
  }
  const role = value.role;
  if (role !== 'user' && role !== 'assistant') {
    throw new CloudError(400, 'invalid_messages_request', `messages[${index}].role is invalid`);
  }
  const blocks: Part[] =
    typeof value.content === 'string'
      ? [{ type: 'text', text: value.content }]
      : Array.isArray(value.content)
        ? value.content.filter(isRecord)
        : [];
  if (role === 'assistant') {
    const text = blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
    const toolCalls = blocks
      .filter((block) => block.type === 'tool_use')
      .map((block, callIndex): MetaToolCall => {
        const label = `messages[${index}].tool_use[${callIndex}]`;
        return {
          id: requireString(block.id, `${label}.id`, { max: 256 }),
          type: 'function',
          function: {
            name: requireString(block.name, `${label}.name`, { max: 128 }),
            arguments: JSON.stringify(isRecord(block.input) ? block.input : {}),
          },
        };
      });
    messages.push({
      role: 'assistant',
      content: text,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    });
    return;
  }
  // Tool results answer the preceding assistant turn, so they come before any new user text.
  for (const block of blocks) {
    if (block.type !== 'tool_result') continue;
    const output = block.content === undefined ? '' : contentParts(block.content, index);
    messages.push({
      role: 'tool',
      tool_call_id: requireString(block.tool_use_id, `messages[${index}].tool_use_id`, {
        max: 256,
      }),
      content:
        block.is_error === true && typeof output === 'string' ? `Error: ${output}` : output,
    });
  }
  const rest = blocks.filter((block) => block.type !== 'tool_result');
  if (rest.length) messages.push({ role: 'user', content: contentParts(rest, index) });
}

/** Anthropic text/image blocks become the same parts the Responses relay produces. */
function contentParts(value: unknown, index: number): MetaMessage['content'] {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) {
    throw new CloudError(
      400,
      'invalid_messages_request',
      `messages[${index}] content is invalid`,
    );
  }
  const parts: Part[] = [];
  for (const block of value) {
    if (!isRecord(block)) continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push({ type: 'input_text', text: block.text });
    } else if (block.type === 'image' && isRecord(block.source)) {
      parts.push({ type: 'input_image', image_url: imageUrl(block.source, index) });
    } else if (block.type !== 'thinking' && block.type !== 'redacted_thinking') {
      throw new CloudError(
        400,
        'unsupported_messages_content',
        `messages[${index}] contains a ${String(block.type)} block this relay does not support`,
      );
    }
  }
  return parts.some(({ type }) => type === 'input_image')
    ? parts
    : parts.map(({ text }) => String(text)).join('');
}

function imageUrl(source: Record<string, unknown>, index: number): string {
  if (source.type === 'url') return requireString(source.url, `messages[${index}].image.url`);
  return `data:${requireString(source.media_type, `messages[${index}].image.media_type`, {
    max: 64,
  })};base64,${requireString(source.data, `messages[${index}].image.data`, { max: 1_900_000 })}`;
}

function parseTools(value: unknown): MetaTool[] {
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_messages_request', 'tools must be an array');
  }
  return value.map((tool, index) => {
    if (!isRecord(tool) || (tool.type !== undefined && tool.type !== 'custom')) {
      throw new CloudError(
        400,
        'unsupported_messages_tool',
        `tools[${index}] must be a custom tool`,
      );
    }
    return {
      type: 'function',
      function: {
        name: requireString(tool.name, `tools[${index}].name`, { max: 128 }),
        parameters: isRecord(tool.input_schema) ? tool.input_schema : {},
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      },
    };
  });
}

/** Encode Sia's provider-neutral stream as Anthropic Messages SSE. */
export async function* anthropicSse(
  events: AsyncIterable<MetaStreamEvent>,
): AsyncIterable<string> {
  const id = `msg_${ids.next().replaceAll('-', '')}`;
  let model = '';
  let started = false;
  let textIndex: number | undefined;
  let nextIndex = 0;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: Record<string, unknown> | undefined;
  const start = function* () {
    if (started) return;
    started = true;
    yield anthropicEvent('message_start', {
      message: {
        id,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });
  };
  for await (const event of events) {
    if (event.type === 'started') {
      model = event.model;
      yield* start();
      continue;
    }
    yield* start();
    if (event.type === 'delta') {
      if (textIndex === undefined) {
        textIndex = nextIndex++;
        yield anthropicEvent('content_block_start', {
          index: textIndex,
          content_block: { type: 'text', text: '' },
        });
      }
      yield anthropicEvent('content_block_delta', {
        index: textIndex,
        delta: { type: 'text_delta', text: event.text },
      });
    } else if (event.type === 'tool_call_delta') {
      // OpenAI-style deltas may interleave calls; Anthropic blocks must not, so buffer them.
      for (const delta of toolCallDeltas(event.delta)) {
        const call = calls.get(delta.index) ?? { id: '', name: '', arguments: '' };
        if (delta.id) call.id = delta.id;
        if (delta.name) call.name = delta.name;
        call.arguments += delta.arguments;
        calls.set(delta.index, call);
      }
    } else if (event.type === 'usage') {
      usage = event.usage;
    } else if (event.type === 'error') {
      yield anthropicEvent('error', { error: { type: 'api_error', message: event.message } });
      return;
    } else if (event.type === 'done') {
      if (textIndex !== undefined)
        yield anthropicEvent('content_block_stop', { index: textIndex });
      for (const [, call] of [...calls.entries()].sort(([left], [right]) => left - right)) {
        const index = nextIndex++;
        yield anthropicEvent('content_block_start', {
          index,
          content_block: {
            type: 'tool_use',
            id: call.id || `toolu_${ids.next().replaceAll('-', '')}`,
            name: call.name,
            input: {},
          },
        });
        yield anthropicEvent('content_block_delta', {
          index,
          delta: { type: 'input_json_delta', partial_json: call.arguments || '{}' },
        });
        yield anthropicEvent('content_block_stop', { index });
      }
      const tokens = tokenUsage(usage);
      yield anthropicEvent('message_delta', {
        delta: { stop_reason: stopReason(event.finishReason, calls.size), stop_sequence: null },
        usage: { input_tokens: tokens.input, output_tokens: tokens.output },
      });
      yield anthropicEvent('message_stop', {});
      return;
    }
  }
}

/** The non-streaming Messages response, for clients that send `stream: false`. */
export async function anthropicMessage(
  events: AsyncIterable<MetaStreamEvent>,
): Promise<Record<string, unknown>> {
  const turn: CollectedTurn = await collectTurn(events);
  const tokens = tokenUsage(turn.usage);
  return {
    id: `msg_${ids.next().replaceAll('-', '')}`,
    type: 'message',
    role: 'assistant',
    model: turn.model,
    content: [
      ...(turn.text ? [{ type: 'text', text: turn.text }] : []),
      ...turn.toolCalls.map((call) => ({
        type: 'tool_use',
        id: call.id || `toolu_${ids.next().replaceAll('-', '')}`,
        name: call.name,
        input: parseInput(call.arguments),
      })),
    ],
    stop_reason: stopReason(turn.finishReason, turn.toolCalls.length),
    stop_sequence: null,
    usage: { input_tokens: tokens.input, output_tokens: tokens.output },
  };
}

export function anthropicErrorEvent(message: string): string {
  return anthropicEvent('error', { error: { type: 'api_error', message } });
}

function stopReason(finishReason: string | undefined, toolCalls: number): string {
  if (toolCalls > 0 || finishReason === 'tool_calls') return 'tool_use';
  return finishReason === 'length' ? 'max_tokens' : 'end_turn';
}

function tokenUsage(usage: Record<string, unknown> | undefined) {
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {
    input: count(usage?.prompt_tokens ?? usage?.input_tokens),
    output: count(usage?.completion_tokens ?? usage?.output_tokens),
  };
}

function parseInput(argumentsJson: string): unknown {
  try {
    const value: unknown = JSON.parse(argumentsJson || '{}');
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function anthropicEvent(type: string, body: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...body })}\n\n`;
}
