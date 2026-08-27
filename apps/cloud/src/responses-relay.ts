import type {
  MetaMessage,
  MetaStreamEvent,
  MetaTool,
  MetaToolCall,
  MetaTurnRequest,
} from './contracts.js';
import { CloudError, ids, isRecord, requireString } from './domain.js';

interface ResponsesRequest {
  readonly model?: unknown;
  readonly instructions?: unknown;
  readonly input?: unknown;
  readonly tools?: unknown;
  readonly stream?: unknown;
  readonly prompt_cache_key?: unknown;
}

interface PendingFunctionCall {
  readonly sourceIndex: number;
  readonly outputIndex: number;
  id: string;
  callId: string;
  name: string;
  arguments: string;
  added: boolean;
}

/** Translate the OpenAI Responses request emitted by Codex into Sia's bounded relay contract. */
export function parseResponsesTurn(body: Record<string, unknown>): MetaTurnRequest {
  const request = body as ResponsesRequest;
  if (request.stream !== true) {
    throw new CloudError(400, 'invalid_responses_request', 'stream must be true');
  }
  const model = requireString(request.model, 'model', { max: 256 });
  const messages: MetaMessage[] = [];
  if (request.instructions !== undefined) {
    messages.push({
      role: 'system',
      content: requireString(request.instructions, 'instructions', { max: 1_000_000 }),
    });
  }
  parseResponsesInput(request.input, messages);
  if (messages.length === 0) {
    throw new CloudError(400, 'invalid_responses_request', 'input must contain a message');
  }
  const tools = request.tools === undefined ? undefined : parseResponsesTools(request.tools);
  const sessionId =
    typeof request.prompt_cache_key === 'string' && request.prompt_cache_key.length > 0
      ? requireString(request.prompt_cache_key, 'prompt_cache_key', { max: 128 })
      : ids.next();
  return {
    turnId: ids.next(),
    sessionId,
    model,
    messages,
    ...(tools === undefined ? {} : { tools }),
  };
}

function parseResponsesInput(value: unknown, messages: MetaMessage[]): void {
  if (typeof value === 'string') {
    if (value.length === 0)
      throw new CloudError(400, 'invalid_responses_request', 'input must not be empty');
    messages.push({ role: 'user', content: value });
    return;
  }
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_responses_request', 'input must be a string or array');
  }
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) {
      throw new CloudError(
        400,
        'invalid_responses_request',
        `input[${index}] must be an object`,
      );
    }
    const type = typeof item.type === 'string' ? item.type : undefined;
    if (type === 'reasoning') continue;
    if (type === 'function_call') {
      appendFunctionCall(messages, item, index);
      continue;
    }
    if (type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: requireString(item.call_id, `input[${index}].call_id`, { max: 256 }),
        content: responseOutput(item.output, `input[${index}].output`),
      });
      continue;
    }
    const role = responseRole(item.role, index);
    const content = responseMessageContent(item.content, index);
    messages.push({ role, content });
  }
}

function appendFunctionCall(
  messages: MetaMessage[],
  item: Record<string, unknown>,
  index: number,
): void {
  const call: MetaToolCall = {
    id: requireString(item.call_id ?? item.id, `input[${index}].call_id`, { max: 256 }),
    type: 'function',
    function: {
      name: requireString(item.name, `input[${index}].name`, { max: 128 }),
      arguments: requireString(item.arguments, `input[${index}].arguments`, {
        min: 0,
        max: 1_000_000,
      }),
    },
  };
  const previous = messages.at(-1);
  if (previous?.role === 'assistant' && previous.content === '') {
    previous.tool_calls = [...(previous.tool_calls ?? []), call];
  } else {
    messages.push({ role: 'assistant', content: '', tool_calls: [call] });
  }
}

function responseRole(value: unknown, index: number): 'system' | 'user' | 'assistant' {
  const role = requireString(value, `input[${index}].role`, { max: 16 });
  if (role === 'developer' || role === 'system') return 'system';
  if (role === 'user' || role === 'assistant') return role;
  throw new CloudError(400, 'invalid_responses_request', `input[${index}].role is invalid`);
}

function responseMessageContent(value: unknown, index: number): MetaMessage['content'] {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) {
    throw new CloudError(
      400,
      'invalid_responses_request',
      `input[${index}].content is invalid`,
    );
  }
  const parts: Array<Record<string, unknown>> = [];
  for (let partIndex = 0; partIndex < value.length; partIndex += 1) {
    const part = value[partIndex];
    if (!isRecord(part)) {
      throw new CloudError(
        400,
        'invalid_responses_request',
        `input[${index}].content[${partIndex}] must be an object`,
      );
    }
    if (part.type === 'input_image') {
      parts.push({
        type: 'input_image',
        image_url: requireString(
          part.image_url,
          `input[${index}].content[${partIndex}].image_url`,
          { max: 1_900_000 },
        ),
        ...(typeof part.detail === 'string' ? { detail: part.detail } : {}),
      });
      continue;
    }
    if (!['input_text', 'output_text', 'text'].includes(String(part.type))) {
      throw new CloudError(
        400,
        'unsupported_responses_content',
        `input[${index}].content[${partIndex}] is not supported by this model`,
      );
    }
    parts.push({
      type: part.type,
      text: requireString(part.text, `input[${index}].content[${partIndex}].text`, {
        min: 0,
        max: 1_000_000,
      }),
    });
  }
  return parts.some(({ type }) => type === 'input_image')
    ? parts
    : parts.map((part) => String(part.text ?? '')).join('');
}

function responseOutput(value: unknown, label: string): MetaMessage['content'] {
  if (typeof value === 'string') return value;
  if (value === undefined)
    throw new CloudError(400, 'invalid_responses_request', `${label} is required`);
  if (Array.isArray(value)) {
    return value.map((part, index) => {
      if (!isRecord(part)) {
        throw new CloudError(
          400,
          'invalid_responses_request',
          `${label}[${index}] must be an object`,
        );
      }
      if (part.type === 'input_text') {
        return {
          type: 'input_text',
          text: requireString(part.text, `${label}[${index}].text`, {
            min: 0,
            max: 1_000_000,
          }),
        };
      }
      if (part.type === 'input_image') {
        return {
          type: 'input_image',
          image_url: requireString(part.image_url, `${label}[${index}].image_url`, {
            max: 1_900_000,
          }),
          ...(typeof part.detail === 'string' ? { detail: part.detail } : {}),
        };
      }
      throw new CloudError(
        400,
        'unsupported_responses_content',
        `${label}[${index}] is not supported by this model`,
      );
    });
  }
  try {
    return JSON.stringify(value);
  } catch {
    throw new CloudError(400, 'invalid_responses_request', `${label} must be JSON-compatible`);
  }
}

function parseResponsesTools(value: unknown): MetaTool[] {
  if (!Array.isArray(value)) {
    throw new CloudError(400, 'invalid_responses_request', 'tools must be an array');
  }
  return value.map((item, index) => {
    if (!isRecord(item) || item.type !== 'function') {
      throw new CloudError(
        400,
        'unsupported_responses_tool',
        `tools[${index}] must be a function tool`,
      );
    }
    return {
      type: 'function',
      function: {
        name: requireString(item.name, `tools[${index}].name`, { max: 128 }),
        parameters: isRecord(item.parameters) ? item.parameters : {},
        ...(typeof item.description === 'string' ? { description: item.description } : {}),
      },
    } satisfies MetaTool;
  });
}

/** Encode Sia's provider-neutral stream as the Responses SSE protocol consumed by Codex. */
export async function* responsesSse(
  events: AsyncIterable<MetaStreamEvent>,
): AsyncIterable<string> {
  let responseId = `resp_${ids.next().replaceAll('-', '')}`;
  let model = '';
  let createdAt = Math.floor(Date.now() / 1_000);
  let sequence = 0;
  let started = false;
  let textStarted = false;
  let textOutputIndex: number | undefined;
  let text = '';
  const messageId = `msg_${ids.next().replaceAll('-', '')}`;
  const calls = new Map<number, PendingFunctionCall>();
  let nextOutputIndex = 0;
  let usage: Record<string, unknown> | undefined;

  const emit = (event: Record<string, unknown>): string =>
    responsesEvent({ ...event, sequence_number: sequence++ });

  const ensureStarted = (event?: Extract<MetaStreamEvent, { type: 'started' }>): string[] => {
    if (started) return [];
    started = true;
    if (event) {
      responseId = `resp_${event.turnId.replaceAll('-', '')}`;
      model = event.model;
    }
    createdAt = Math.floor(Date.now() / 1_000);
    const response = responseObject(responseId, createdAt, model, 'in_progress', [], undefined);
    return [
      emit({ type: 'response.created', response }),
      emit({ type: 'response.in_progress', response }),
    ];
  };

  for await (const event of events) {
    if (event.type === 'started') {
      for (const chunk of ensureStarted(event)) yield chunk;
      continue;
    }
    for (const chunk of ensureStarted()) yield chunk;
    if (event.type === 'delta') {
      if (!textStarted) {
        textStarted = true;
        textOutputIndex = nextOutputIndex;
        yield emit({
          type: 'response.output_item.added',
          output_index: textOutputIndex,
          item: messageItem(messageId, 'in_progress', []),
        });
        yield emit({
          type: 'response.content_part.added',
          item_id: messageId,
          output_index: nextOutputIndex,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [], logprobs: [] },
        });
        nextOutputIndex += 1;
      }
      text += event.text;
      yield emit({
        type: 'response.output_text.delta',
        item_id: messageId,
        output_index: textOutputIndex,
        content_index: 0,
        delta: event.text,
        logprobs: [],
      });
      continue;
    }
    if (event.type === 'tool_call_delta') {
      for (const delta of functionCallDeltas(event.delta)) {
        let call = calls.get(delta.index);
        if (!call) {
          call = {
            sourceIndex: delta.index,
            outputIndex: nextOutputIndex++,
            id: `fc_${ids.next().replaceAll('-', '')}`,
            callId: delta.id || `call_${ids.next().replaceAll('-', '')}`,
            name: delta.name,
            arguments: '',
            added: false,
          };
          calls.set(delta.index, call);
        }
        if (delta.id) call.callId = delta.id;
        if (delta.name) call.name = delta.name;
        if (!call.added && call.name) {
          call.added = true;
          yield emit({
            type: 'response.output_item.added',
            output_index: call.outputIndex,
            item: functionCallItem(call, 'in_progress'),
          });
        }
        if (delta.arguments) {
          call.arguments += delta.arguments;
          if (call.added) {
            yield emit({
              type: 'response.function_call_arguments.delta',
              item_id: call.id,
              output_index: call.outputIndex,
              delta: delta.arguments,
            });
          }
        }
      }
      continue;
    }
    if (event.type === 'usage') {
      usage = event.usage;
      continue;
    }
    if (event.type === 'error') {
      yield emit({
        type: 'error',
        code: event.code,
        message: event.message,
        param: null,
      });
      return;
    }
    if (event.type !== 'done') continue;

    const output = new Map<number, Record<string, unknown>>();
    if (textStarted) {
      const outputIndex = textOutputIndex ?? 0;
      const content = [{ type: 'output_text', text, annotations: [], logprobs: [] }];
      yield emit({
        type: 'response.output_text.done',
        item_id: messageId,
        output_index: outputIndex,
        content_index: 0,
        text,
        logprobs: [],
      });
      yield emit({
        type: 'response.content_part.done',
        item_id: messageId,
        output_index: outputIndex,
        content_index: 0,
        part: content[0],
      });
      const message = messageItem(messageId, 'completed', content);
      yield emit({
        type: 'response.output_item.done',
        output_index: outputIndex,
        item: message,
      });
      output.set(outputIndex, message);
    }
    for (const call of [...calls.values()].sort(
      (left, right) => left.outputIndex - right.outputIndex,
    )) {
      if (!call.name) {
        yield emit({
          type: 'error',
          code: 'invalid_tool_call',
          message: 'The hosted model returned a function call without a name.',
          param: null,
        });
        return;
      }
      if (!call.added) {
        call.added = true;
        yield emit({
          type: 'response.output_item.added',
          output_index: call.outputIndex,
          item: functionCallItem(call, 'in_progress'),
        });
        if (call.arguments) {
          yield emit({
            type: 'response.function_call_arguments.delta',
            item_id: call.id,
            output_index: call.outputIndex,
            delta: call.arguments,
          });
        }
      }
      yield emit({
        type: 'response.function_call_arguments.done',
        item_id: call.id,
        output_index: call.outputIndex,
        arguments: call.arguments,
      });
      const item = functionCallItem(call, 'completed');
      yield emit({ type: 'response.output_item.done', output_index: call.outputIndex, item });
      output.set(call.outputIndex, item);
    }
    const normalizedUsage = responseUsage(usage);
    yield emit({
      type: 'response.completed',
      response: responseObject(
        responseId,
        createdAt,
        model,
        'completed',
        [...output.entries()].sort(([left], [right]) => left - right).map(([, item]) => item),
        normalizedUsage,
      ),
    });
    yield 'data: [DONE]\n\n';
    return;
  }
}

function functionCallDeltas(value: unknown): Array<{
  index: number;
  id: string;
  name: string;
  arguments: string;
}> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, fallbackIndex) => {
    if (!isRecord(entry)) return [];
    const fn = isRecord(entry.function) ? entry.function : {};
    const rawIndex = entry.index;
    return [
      {
        index:
          typeof rawIndex === 'number' && Number.isSafeInteger(rawIndex)
            ? rawIndex
            : fallbackIndex,
        id: typeof entry.id === 'string' ? entry.id : '',
        name: typeof fn.name === 'string' ? fn.name : '',
        arguments: typeof fn.arguments === 'string' ? fn.arguments : '',
      },
    ];
  });
}

function messageItem(
  id: string,
  status: 'in_progress' | 'completed',
  content: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return { id, type: 'message', status, role: 'assistant', content };
}

function functionCallItem(
  call: PendingFunctionCall,
  status: 'in_progress' | 'completed',
): Record<string, unknown> {
  return {
    id: call.id,
    type: 'function_call',
    status,
    arguments: status === 'completed' ? call.arguments : '',
    call_id: call.callId,
    name: call.name,
  };
}

function responseUsage(value: Record<string, unknown> | undefined): Record<string, unknown> {
  const input = nonNegativeInteger(value?.input_tokens ?? value?.prompt_tokens);
  const output = nonNegativeInteger(value?.output_tokens ?? value?.completion_tokens);
  const details = isRecord(value?.input_tokens_details)
    ? value.input_tokens_details
    : isRecord(value?.prompt_tokens_details)
      ? value.prompt_tokens_details
      : {};
  const cached = nonNegativeInteger(details.cached_tokens);
  return {
    input_tokens: input,
    input_tokens_details: { cached_tokens: cached },
    output_tokens: output,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: nonNegativeInteger(value?.total_tokens) || input + output,
  };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function responseObject(
  id: string,
  createdAt: number,
  model: string,
  status: 'in_progress' | 'completed',
  output: readonly Record<string, unknown>[],
  usage: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    id,
    object: 'response',
    created_at: createdAt,
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model,
    output,
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    temperature: null,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    top_p: null,
    truncation: 'disabled',
    usage: usage ?? null,
  };
}

function responsesEvent(event: Record<string, unknown>): string {
  return `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`;
}
