import type {
  MetaMessage,
  MetaStreamEvent,
  MetaTool,
  MetaToolCall,
  MetaTurnRequest,
} from './contracts.js';
import { CloudError, ids, isRecord, requireString } from './domain.js';
import { collectTurn, toolCallDeltas } from './relay-collect.js';

/**
 * Translate an OpenAI Chat Completions request (as sent by LiteLLM-based harnesses such as
 * OpenHands) into Sia's bounded relay contract.
 */
export function parseChatCompletionsTurn(body: Record<string, unknown>): MetaTurnRequest {
  const model = requireString(body.model, 'model', { max: 256 });
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new CloudError(400, 'invalid_chat_request', 'messages must be a non-empty array');
  }
  const messages = body.messages.map((value, index): MetaMessage => {
    if (!isRecord(value)) {
      throw new CloudError(400, 'invalid_chat_request', `messages[${index}] is invalid`);
    }
    const role = value.role === 'developer' ? 'system' : value.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
      throw new CloudError(400, 'invalid_chat_request', `messages[${index}].role is invalid`);
    }
    const toolCalls =
      role === 'assistant' && Array.isArray(value.tool_calls)
        ? value.tool_calls.map((call, callIndex) => toolCall(call, index, callIndex))
        : [];
    return {
      role,
      content: content(value.content, index),
      ...(role === 'tool'
        ? {
            tool_call_id: requireString(value.tool_call_id, `messages[${index}].tool_call_id`, {
              max: 256,
            }),
          }
        : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  });
  const tools = body.tools === undefined ? undefined : parseTools(body.tools);
  return {
    turnId: ids.next(),
    sessionId:
      typeof body.user === 'string' && body.user ? body.user.slice(0, 128) : ids.next(),
    model,
    messages,
    ...(tools === undefined ? {} : { tools }),
  };
}

function content(value: unknown, index: number): MetaMessage['content'] {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_chat_request', `messages[${index}].content is invalid`);
  }
  const parts = value.filter(isRecord).map((part) => {
    if (part.type === 'text') {
      return { type: 'input_text', text: requireString(part.text, 'text', { min: 0 }) };
    }
    if (part.type === 'image_url') {
      const url = isRecord(part.image_url) ? part.image_url.url : part.image_url;
      return {
        type: 'input_image',
        image_url: requireString(url, `messages[${index}].image_url`, { max: 1_900_000 }),
      };
    }
    throw new CloudError(
      400,
      'unsupported_chat_content',
      `messages[${index}] contains ${String(part.type)} content this relay does not support`,
    );
  });
  return parts.some(({ type }) => type === 'input_image')
    ? parts
    : parts.map((part) => String(part.text)).join('');
}

function toolCall(value: unknown, index: number, callIndex: number): MetaToolCall {
  const label = `messages[${index}].tool_calls[${callIndex}]`;
  if (!isRecord(value) || !isRecord(value.function)) {
    throw new CloudError(400, 'invalid_chat_request', `${label} is invalid`);
  }
  return {
    id: requireString(value.id, `${label}.id`, { max: 256 }),
    type: 'function',
    function: {
      name: requireString(value.function.name, `${label}.name`, { max: 128 }),
      arguments: requireString(value.function.arguments ?? '{}', `${label}.arguments`, {
        min: 0,
        max: 1_000_000,
      }),
    },
  };
}

function parseTools(value: unknown): MetaTool[] {
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_chat_request', 'tools must be an array');
  }
  return value.map((tool, index) => {
    if (!isRecord(tool) || tool.type !== 'function' || !isRecord(tool.function)) {
      throw new CloudError(400, 'unsupported_chat_tool', `tools[${index}] must be a function`);
    }
    return {
      type: 'function',
      function: {
        name: requireString(tool.function.name, `tools[${index}].name`, { max: 128 }),
        parameters: isRecord(tool.function.parameters) ? tool.function.parameters : {},
        ...(typeof tool.function.description === 'string'
          ? { description: tool.function.description }
          : {}),
      },
    };
  });
}

/** Encode Sia's provider-neutral stream as Chat Completions chunks. */
export async function* chatCompletionsSse(
  events: AsyncIterable<MetaStreamEvent>,
  options: { includeUsage: boolean },
): AsyncIterable<string> {
  const id = `chatcmpl-${ids.next().replaceAll('-', '')}`;
  const created = Math.floor(Date.now() / 1_000);
  let model = '';
  let roleSent = false;
  let sawToolCall = false;
  let usage: Record<string, unknown> | undefined;
  const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) =>
    data({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
    });
  const role = () => (roleSent ? {} : ((roleSent = true), { role: 'assistant' }));
  for await (const event of events) {
    if (event.type === 'started') model = event.model;
    else if (event.type === 'delta') yield chunk({ ...role(), content: event.text });
    else if (event.type === 'tool_call_delta') {
      const deltas = toolCallDeltas(event.delta);
      if (!deltas.length) continue;
      sawToolCall = true;
      yield chunk({
        ...role(),
        tool_calls: deltas.map((delta) => ({
          index: delta.index,
          ...(delta.id ? { id: delta.id, type: 'function' } : {}),
          function: {
            ...(delta.name ? { name: delta.name } : {}),
            arguments: delta.arguments,
          },
        })),
      });
    } else if (event.type === 'usage') usage = event.usage;
    else if (event.type === 'error') {
      yield chatCompletionsErrorEvent(event.message);
      return;
    } else if (event.type === 'done') {
      yield chunk({}, sawToolCall ? 'tool_calls' : (event.finishReason ?? 'stop'));
      if (options.includeUsage) {
        yield data({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [],
          usage: chatUsage(usage),
        });
      }
      yield 'data: [DONE]\n\n';
      return;
    }
  }
}

/** The non-streaming Chat Completions response, for clients that send `stream: false`. */
export async function chatCompletion(
  events: AsyncIterable<MetaStreamEvent>,
): Promise<Record<string, unknown>> {
  const turn = await collectTurn(events);
  return {
    id: `chatcmpl-${ids.next().replaceAll('-', '')}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1_000),
    model: turn.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: turn.text || null,
          ...(turn.toolCalls.length
            ? {
                tool_calls: turn.toolCalls.map((call) => ({
                  id: call.id || `call_${ids.next().replaceAll('-', '')}`,
                  type: 'function',
                  function: { name: call.name, arguments: call.arguments || '{}' },
                })),
              }
            : {}),
        },
        finish_reason: turn.toolCalls.length ? 'tool_calls' : (turn.finishReason ?? 'stop'),
      },
    ],
    usage: chatUsage(turn.usage),
  };
}

export function chatCompletionsErrorEvent(message: string): string {
  return data({ error: { message, type: 'api_error' } });
}

function chatUsage(usage: Record<string, unknown> | undefined) {
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const prompt = count(usage?.prompt_tokens ?? usage?.input_tokens);
  const completion = count(usage?.completion_tokens ?? usage?.output_tokens);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: count(usage?.total_tokens) || prompt + completion,
  };
}

function data(value: Record<string, unknown>): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
