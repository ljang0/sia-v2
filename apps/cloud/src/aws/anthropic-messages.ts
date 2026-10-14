import type { MetaMessage, MetaStreamEvent, MetaTurnRequest } from '../contracts.js';
import { CloudError, isRecord } from '../domain.js';
import type { HostedLabConfig } from '../ports.js';
import { parseSseRecord, sseData } from './sse.js';

/** Anthropic requires an explicit output ceiling; labs can lower it with `maxOutputTokens`. */
const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;
export const ANTHROPIC_VERSION = '2023-06-01';

export function anthropicHeaders(config: HostedLabConfig): Record<string, string> {
  return { 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_VERSION };
}

type Block = Record<string, unknown>;
type AnthropicMessage = { role: 'user' | 'assistant'; content: Block[] };

/** Translates Sia's chat-shaped turn into an Anthropic Messages request. */
export function anthropicMessagesRequestBody(
  config: HostedLabConfig,
  request: MetaTurnRequest,
) {
  const system: string[] = [];
  const messages: AnthropicMessage[] = [];
  const append = (role: AnthropicMessage['role'], content: Block[]) => {
    if (!content.length) return;
    const previous = messages.at(-1);
    // Anthropic requires alternating roles; consecutive tool results share one user turn.
    if (previous?.role === role) previous.content.push(...content);
    else messages.push({ role, content });
  };
  for (const message of request.messages) {
    if (message.role === 'system') {
      const text = contentText(message.content);
      if (text) system.push(text);
      continue;
    }
    if (message.role === 'tool') {
      append('user', [
        {
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: contentBlocks(message.content),
        },
      ]);
      continue;
    }
    const blocks = contentBlocks(message.content);
    if (message.role === 'assistant') {
      for (const call of message.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.function.name,
          input: toolInput(call.function.arguments),
        });
      }
    }
    append(message.role, blocks);
  }
  return {
    model: request.model ?? config.model,
    max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    stream: true,
    ...(system.length ? { system: system.join('\n\n') } : {}),
    messages,
    ...(request.tools === undefined
      ? {}
      : {
          tools: request.tools.map(({ function: tool }) => ({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            input_schema: tool.parameters,
          })),
          tool_choice: { type: 'auto' },
        }),
  };
}

function contentText(content: MetaMessage['content']): string {
  return typeof content === 'string'
    ? content
    : content.map((part) => (typeof part.text === 'string' ? part.text : '')).join('');
}

function contentBlocks(content: MetaMessage['content']): Block[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  return content.flatMap((part): Block[] => {
    if (part.type === 'input_image' && typeof part.image_url === 'string') {
      return [{ type: 'image', source: imageSource(part.image_url) }];
    }
    return typeof part.text === 'string' && part.text
      ? [{ type: 'text', text: part.text }]
      : [];
  });
}

function imageSource(url: string): Block {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return match
    ? { type: 'base64', media_type: match[1], data: match[2] }
    : { type: 'url', url };
}

function toolInput(argumentsJson: string): unknown {
  if (!argumentsJson.trim()) return {};
  try {
    const value: unknown = JSON.parse(argumentsJson);
    return isRecord(value) ? value : {};
  } catch {
    throw new CloudError(400, 'invalid_responses_request', 'Tool call arguments must be JSON');
  }
}

const STOP_REASONS: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'tool_calls',
  max_tokens: 'length',
};

/** Maps Anthropic's SSE stream onto the same bounded Sia stream contract as OpenAI labs. */
export async function* readAnthropicMessagesEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<MetaStreamEvent> {
  // Anthropic indexes all content blocks; Sia indexes tool calls only.
  const toolIndexByBlock = new Map<number, number>();
  let inputTokens = 0;
  let cachedTokens = 0;
  let stopReason: string | undefined;
  for await (const data of sseData(body)) {
    const event = parseSseRecord(data);
    if (!event || typeof event.type !== 'string') continue;
    const blockIndex = typeof event.index === 'number' ? event.index : 0;
    if (event.type === 'message_start' && isRecord(event.message)) {
      const usage = isRecord(event.message.usage) ? event.message.usage : {};
      inputTokens =
        tokenCount(usage.input_tokens) + tokenCount(usage.cache_creation_input_tokens);
      cachedTokens = tokenCount(usage.cache_read_input_tokens);
      inputTokens += cachedTokens;
      continue;
    }
    if (event.type === 'content_block_start' && isRecord(event.content_block)) {
      const block = event.content_block;
      if (block.type !== 'tool_use') continue;
      const index = toolIndexByBlock.size;
      toolIndexByBlock.set(blockIndex, index);
      yield {
        type: 'tool_call_delta',
        delta: [
          {
            index,
            id: typeof block.id === 'string' ? block.id : '',
            function: { name: typeof block.name === 'string' ? block.name : '', arguments: '' },
          },
        ],
      };
      continue;
    }
    if (event.type === 'content_block_delta' && isRecord(event.delta)) {
      const delta = event.delta;
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
        yield { type: 'delta', text: delta.text };
      }
      const index = toolIndexByBlock.get(blockIndex);
      if (
        delta.type === 'input_json_delta' &&
        typeof delta.partial_json === 'string' &&
        index !== undefined
      ) {
        yield {
          type: 'tool_call_delta',
          delta: [{ index, function: { name: '', arguments: delta.partial_json } }],
        };
      }
      continue;
    }
    if (event.type === 'message_delta') {
      if (isRecord(event.delta) && typeof event.delta.stop_reason === 'string') {
        stopReason = event.delta.stop_reason;
      }
      const outputTokens = isRecord(event.usage) ? tokenCount(event.usage.output_tokens) : 0;
      yield {
        type: 'usage',
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
          prompt_tokens_details: { cached_tokens: cachedTokens },
        },
      };
      continue;
    }
    if (event.type === 'message_stop') break;
    if (event.type === 'error') {
      const error = isRecord(event.error) ? event.error : {};
      yield {
        type: 'error',
        code: typeof error.type === 'string' ? error.type : 'hosted_model_error',
        message: typeof error.message === 'string' ? error.message : 'Hosted model failed',
      };
    }
  }
  const finishReason =
    (stopReason && STOP_REASONS[stopReason]) ?? (toolIndexByBlock.size ? 'tool_calls' : 'stop');
  yield { type: 'done', finishReason };
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
