import type { MetaMessage, MetaTool, MetaToolCall, MetaTurnRequest } from './contracts.js';
import { CloudError, isRecord, requireString } from './domain.js';

/** Parses the legacy `/v1/meta/turns` body, which is already Sia's chat-shaped contract. */
export function parseMetaTurn(body: Record<string, unknown>): MetaTurnRequest {
  if (!Array.isArray(body.messages))
    throw new CloudError(400, 'invalid_meta_turn', 'messages must be an array');
  const messages = body.messages.map((value, index): MetaMessage => {
    if (!isRecord(value))
      throw new CloudError(400, 'invalid_meta_turn', `messages[${index}] must be an object`);
    const role = requireString(value.role, `messages[${index}].role`, { max: 16 });
    if (
      !(['system', 'user', 'assistant', 'tool'] as const).includes(role as MetaMessage['role'])
    ) {
      throw new CloudError(400, 'invalid_meta_turn', `messages[${index}].role is invalid`);
    }
    if (typeof value.content !== 'string' && !Array.isArray(value.content)) {
      throw new CloudError(400, 'invalid_meta_turn', `messages[${index}].content is invalid`);
    }
    return {
      role: role as MetaMessage['role'],
      content: value.content as MetaMessage['content'],
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      ...(typeof value.tool_call_id === 'string' ? { tool_call_id: value.tool_call_id } : {}),
      ...(value.tool_calls === undefined
        ? {}
        : { tool_calls: parseToolCalls(value.tool_calls, `messages[${index}].tool_calls`) }),
    };
  });
  const tools = body.tools === undefined ? undefined : parseTools(body.tools);
  return {
    turnId: requireString(body.turnId, 'turnId', { max: 128 }),
    messages,
    ...(typeof body.sessionId === 'string' ? { sessionId: body.sessionId } : {}),
    ...(typeof body.model === 'string' ? { model: body.model } : {}),
    ...(tools === undefined ? {} : { tools }),
  };
}

function parseToolCalls(value: unknown, label: string): MetaToolCall[] {
  if (!Array.isArray(value))
    throw new CloudError(400, 'invalid_meta_turn', `${label} must be an array`);
  return value.map((item, index) => {
    if (!isRecord(item) || item.type !== 'function' || !isRecord(item.function)) {
      throw new CloudError(400, 'invalid_meta_turn', `${label}[${index}] is invalid`);
    }
    return {
      id: requireString(item.id, `${label}[${index}].id`, { max: 256 }),
      type: 'function',
      function: {
        name: requireString(item.function.name, `${label}[${index}].function.name`, {
          max: 128,
        }),
        arguments: requireString(
          item.function.arguments,
          `${label}[${index}].function.arguments`,
          {
            max: 1_000_000,
          },
        ),
      },
    };
  });
}

function parseTools(value: unknown): MetaTool[] {
  if (!Array.isArray(value))
    throw new CloudError(400, 'invalid_meta_turn', 'tools must be an array');
  return value.map((item, index) => {
    if (!isRecord(item) || item.type !== 'function' || !isRecord(item.function)) {
      throw new CloudError(400, 'invalid_meta_turn', `tools[${index}] is invalid`);
    }
    return {
      type: 'function',
      function: {
        name: requireString(item.function.name, `tools[${index}].function.name`, { max: 128 }),
        parameters: isRecord(item.function.parameters) ? item.function.parameters : {},
        ...(typeof item.function.description === 'string'
          ? { description: item.function.description }
          : {}),
      },
    };
  });
}
