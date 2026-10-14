import { randomUUID } from 'node:crypto';
import type { MetaStreamEvent, MetaTurnRequest } from '../contracts.js';
import { CloudError, isRecord } from '../domain.js';
import type { HostedLabConfig, MetaProvider } from '../ports.js';
import {
  anthropicHeaders,
  anthropicMessagesRequestBody,
  readAnthropicMessagesEvents,
} from './anthropic-messages.js';
import { ensureTrailingSlash } from './shared.js';
import { parseSseRecord, sseData } from './sse.js';

type ApiProtocol = NonNullable<HostedLabConfig['apiProtocol']>;

/** One entry per upstream wire protocol; everything else in the relay is protocol-neutral. */
const UPSTREAMS: Record<
  ApiProtocol,
  {
    turnPath: string;
    modelsPath: string;
    authHeaders(config: HostedLabConfig): Record<string, string>;
    body(config: HostedLabConfig, request: MetaTurnRequest): unknown;
    read(body: ReadableStream<Uint8Array>): AsyncIterable<MetaStreamEvent>;
  }
> = {
  openai_chat_completions: {
    turnPath: 'chat/completions',
    modelsPath: 'models',
    authHeaders: bearerHeaders,
    body: chatCompletionsRequestBody,
    read: readChatCompletionEvents,
  },
  openai_responses: {
    turnPath: 'responses',
    modelsPath: 'models',
    authHeaders: bearerHeaders,
    body: responsesRequestBody,
    read: readResponsesEvents,
  },
  anthropic_messages: {
    turnPath: 'messages',
    // Anthropic paginates its model list (default 20); ask for every page entry at once.
    modelsPath: 'models?limit=1000',
    authHeaders: anthropicHeaders,
    body: anthropicMessagesRequestBody,
    read: readAnthropicMessagesEvents,
  },
};

function upstreamFor(config: HostedLabConfig) {
  return UPSTREAMS[config.apiProtocol ?? 'openai_chat_completions'];
}

function bearerHeaders(config: HostedLabConfig): Record<string, string> {
  return { authorization: `Bearer ${config.apiKey}` };
}

export class HostedLabProvider implements MetaProvider {
  async capabilities(config: HostedLabConfig): Promise<{
    models: string[];
    streaming: boolean;
    tools: boolean;
  }> {
    const endpoint = new URL(
      upstreamFor(config).modelsPath,
      ensureTrailingSlash(config.endpoint),
    );
    if (endpoint.protocol !== 'https:')
      throw new CloudError(503, 'meta_config_invalid', 'Meta endpoint must use HTTPS');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          ...upstreamFor(config).authHeaders(config),
          accept: 'application/json',
          [config.sessionHeader ?? 'x-session-id']: randomUUID(),
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw metaUpstreamFailure(error);
    }
    if (!response.ok) {
      throw new CloudError(
        502,
        'meta_upstream_error',
        `Hosted model lab returned HTTP ${response.status}`,
        response.status >= 500,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];
    const upstreamModels = new Set(
      data.flatMap((entry) =>
        isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : [],
      ),
    );
    const configuredModels = config.allowedModels ?? [config.model];
    const models = configuredModels.filter((model) => upstreamModels.has(model));
    if (!models.length) {
      throw new CloudError(
        503,
        'meta_model_unavailable',
        'The configured hosted model is not available',
        true,
      );
    }
    return { models, streaming: true, tools: true };
  }

  async *stream(
    config: HostedLabConfig,
    request: MetaTurnRequest,
  ): AsyncIterable<MetaStreamEvent> {
    const upstream = upstreamFor(config);
    const endpoint = new URL(upstream.turnPath, ensureTrailingSlash(config.endpoint));
    if (endpoint.protocol !== 'https:')
      throw new CloudError(503, 'meta_config_invalid', 'Meta endpoint must use HTTPS');
    const sessionId = request.sessionId ?? randomUUID();
    const signal = AbortSignal.timeout(45_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...upstream.authHeaders(config),
          'content-type': 'application/json',
          accept: 'text/event-stream',
          [config.sessionHeader ?? 'x-session-id']: sessionId,
        },
        body: JSON.stringify(upstream.body(config, request)),
        signal,
      });
    } catch (error) {
      throw metaUpstreamFailure(error);
    }
    if (!response.ok || !response.body) {
      throw new CloudError(
        502,
        'meta_upstream_error',
        `Hosted model lab returned HTTP ${response.status}`,
        response.status >= 500,
      );
    }
    yield {
      type: 'started',
      turnId: request.turnId,
      sessionId: response.headers.get(config.sessionHeader ?? 'x-session-id') ?? sessionId,
      model: request.model ?? config.model,
    };
    try {
      yield* upstream.read(response.body);
    } catch (error) {
      if (error instanceof CloudError) throw error;
      throw metaUpstreamFailure(error);
    }
  }
}

function metaUpstreamFailure(error: unknown): CloudError {
  const name = error instanceof Error ? error.name : '';
  return ['AbortError', 'TimeoutError'].includes(name)
    ? new CloudError(
        504,
        'meta_upstream_timeout',
        'The included model did not respond in time. Try again or use your Codex plan.',
        true,
      )
    : new CloudError(
        502,
        'meta_upstream_unavailable',
        'The included model is temporarily unavailable. Try again or use your Codex plan.',
        true,
      );
}

function chatCompletionsRequestBody(config: HostedLabConfig, request: MetaTurnRequest) {
  return {
    model: request.model ?? config.model,
    messages: request.messages.map((message) =>
      typeof message.content === 'string'
        ? message
        : { ...message, content: message.content.map(chatContentPart) },
    ),
    stream: true,
    stream_options: { include_usage: true },
    ...(config.maxOutputTokens === undefined ? {} : { max_tokens: config.maxOutputTokens }),
    ...(request.tools === undefined ? {} : { tools: request.tools, tool_choice: 'auto' }),
  };
}

/** Relay parts use Responses names; Chat Completions labs expect `text` and `image_url`. */
function chatContentPart(part: Record<string, unknown>): Record<string, unknown> {
  if (part.type === 'input_image') {
    return {
      type: 'image_url',
      image_url: {
        url: part.image_url,
        ...(typeof part.detail === 'string' ? { detail: part.detail } : {}),
      },
    };
  }
  if (part.type === 'input_text' || part.type === 'output_text') {
    return { type: 'text', text: part.text };
  }
  return part;
}

function responsesRequestBody(config: HostedLabConfig, request: MetaTurnRequest) {
  const input: unknown[] = [];
  for (const message of request.messages) {
    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: message.content,
      });
      continue;
    }
    if (
      (typeof message.content === 'string' && message.content.length > 0) ||
      (Array.isArray(message.content) && message.content.length > 0)
    ) {
      input.push({ role: message.role, content: message.content });
    }
    for (const call of message.tool_calls ?? []) {
      input.push({
        type: 'function_call',
        call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }
  return {
    model: request.model ?? config.model,
    input,
    stream: true,
    ...(config.maxOutputTokens === undefined
      ? {}
      : { max_output_tokens: config.maxOutputTokens }),
    ...(request.tools === undefined
      ? {}
      : {
          tools: request.tools.map(({ function: tool }) => ({
            type: 'function',
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            parameters: tool.parameters,
          })),
          tool_choice: 'auto',
        }),
  };
}

async function* readChatCompletionEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<MetaStreamEvent> {
  let finishReason: string | undefined;
  for await (const data of sseData(body)) {
    if (data === '[DONE]') {
      yield { type: 'done', ...(finishReason === undefined ? {} : { finishReason }) };
      return;
    }
    const chunk = parseSseRecord(data);
    if (!chunk) continue;
    if (isRecord(chunk.usage)) yield { type: 'usage', usage: chunk.usage };
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) continue;
      const delta = isRecord(choice.delta) ? choice.delta : undefined;
      if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
        yield { type: 'delta', text: delta.content };
      }
      if (delta && delta.tool_calls !== undefined) {
        yield { type: 'tool_call_delta', delta: delta.tool_calls };
      }
      if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
    }
  }
  yield { type: 'done', ...(finishReason === undefined ? {} : { finishReason }) };
}

async function* readResponsesEvents(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<MetaStreamEvent> {
  let sawToolCall = false;
  let completed = false;
  for await (const data of sseData(body)) {
    if (data === '[DONE]') break;
    const event = parseSseRecord(data);
    if (!event || typeof event.type !== 'string') continue;
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      yield { type: 'delta', text: event.delta };
      continue;
    }
    if (event.type === 'response.output_item.added' && isRecord(event.item)) {
      if (event.item.type !== 'function_call') continue;
      sawToolCall = true;
      yield {
        type: 'tool_call_delta',
        delta: [
          {
            index: responseOutputIndex(event),
            id:
              typeof event.item.call_id === 'string'
                ? event.item.call_id
                : typeof event.item.id === 'string'
                  ? event.item.id
                  : '',
            function: {
              name: typeof event.item.name === 'string' ? event.item.name : '',
              arguments: typeof event.item.arguments === 'string' ? event.item.arguments : '',
            },
          },
        ],
      };
      continue;
    }
    if (
      event.type === 'response.function_call_arguments.delta' &&
      typeof event.delta === 'string'
    ) {
      sawToolCall = true;
      yield {
        type: 'tool_call_delta',
        delta: [
          {
            index: responseOutputIndex(event),
            function: { name: '', arguments: event.delta },
          },
        ],
      };
      continue;
    }
    if (event.type === 'response.completed' && isRecord(event.response)) {
      if (isRecord(event.response.usage)) {
        const usage = event.response.usage;
        const inputDetails = isRecord(usage.input_tokens_details)
          ? usage.input_tokens_details
          : {};
        yield {
          type: 'usage',
          usage: {
            prompt_tokens: usage.input_tokens,
            completion_tokens: usage.output_tokens,
            total_tokens: usage.total_tokens,
            prompt_tokens_details: { cached_tokens: inputDetails.cached_tokens },
          },
        };
      }
      completed = true;
      yield { type: 'done', finishReason: sawToolCall ? 'tool_calls' : 'stop' };
      continue;
    }
    if (event.type === 'error') {
      yield {
        type: 'error',
        code: typeof event.code === 'string' ? event.code : 'hosted_model_error',
        message: typeof event.message === 'string' ? event.message : 'Hosted model failed',
      };
    }
  }
  if (!completed) yield { type: 'done', finishReason: sawToolCall ? 'tool_calls' : 'stop' };
}

function responseOutputIndex(event: Record<string, unknown>): number {
  return typeof event.output_index === 'number' && Number.isSafeInteger(event.output_index)
    ? event.output_index
    : 0;
}
