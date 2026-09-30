import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { MetaStreamEvent, MetaTurnRequest } from '../contracts.js';
import { CloudError, isRecord } from '../domain.js';
import type { HostedLabConfig, MetaProvider } from '../ports.js';
import { ensureTrailingSlash } from './shared.js';

export class OpenAiCompatibleMetaProvider implements MetaProvider {
  async capabilities(config: HostedLabConfig): Promise<{
    models: string[];
    streaming: boolean;
    tools: boolean;
  }> {
    const endpoint = new URL('models', ensureTrailingSlash(config.endpoint));
    if (endpoint.protocol !== 'https:')
      throw new CloudError(503, 'meta_config_invalid', 'Meta endpoint must use HTTPS');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
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
    const apiProtocol = config.apiProtocol ?? 'openai_chat_completions';
    const endpoint = new URL(
      apiProtocol === 'openai_responses' ? 'responses' : 'chat/completions',
      ensureTrailingSlash(config.endpoint),
    );
    if (endpoint.protocol !== 'https:')
      throw new CloudError(503, 'meta_config_invalid', 'Meta endpoint must use HTTPS');
    const sessionId = request.sessionId ?? randomUUID();
    const signal = AbortSignal.timeout(45_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
          [config.sessionHeader ?? 'x-session-id']: sessionId,
        },
        body: JSON.stringify(
          apiProtocol === 'openai_responses'
            ? responsesRequestBody(config, request)
            : chatCompletionsRequestBody(config, request),
        ),
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
      yield* apiProtocol === 'openai_responses'
        ? readResponsesEvents(response.body)
        : readChatCompletionEvents(response.body);
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
    messages: request.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(config.maxOutputTokens === undefined ? {} : { max_tokens: config.maxOutputTokens }),
    ...(request.tools === undefined ? {} : { tools: request.tools, tool_choice: 'auto' }),
  };
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

function parseSseRecord(data: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(data);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function responseOutputIndex(event: Record<string, unknown>): number {
  return typeof event.output_index === 'number' && Number.isSafeInteger(event.output_index)
    ? event.output_index
    : 0;
}

async function* sseData(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of Readable.fromWeb(stream as never)) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    buffer = buffer.replaceAll('\r\n', '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).replaceAll('\r', '');
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data.length > 0) yield data;
      boundary = buffer.indexOf('\n\n');
    }
  }
}
