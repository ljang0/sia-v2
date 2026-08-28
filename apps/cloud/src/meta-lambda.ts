import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createAwsDependencies } from './aws.js';
import type { MetaMessage, MetaTool, MetaToolCall, MetaTurnRequest } from './contracts.js';
import { CloudError, isRecord, requireString } from './domain.js';
import { authFromEvent, normalizeError, parseBody } from './router.js';
import { parseResponsesTurn, responsesSse } from './responses-relay.js';
import { createServices } from './services.js';

declare const awslambda: {
  streamifyResponse(
    callback: (event: APIGatewayProxyEvent, stream: NodeJS.WritableStream) => Promise<void>,
  ): (event: APIGatewayProxyEvent, stream: NodeJS.WritableStream) => Promise<void>;
  HttpResponseStream: {
    from(
      stream: NodeJS.WritableStream,
      metadata: { statusCode: number; headers: Record<string, string> },
    ): NodeJS.WritableStream;
  };
};

let services: ReturnType<typeof createServices> | undefined;
const getServices = () => (services ??= createServices(createAwsDependencies()));

export const handler = awslambda.streamifyResponse(async (event, rawStream) => {
  let stream = rawStream;
  const responsesRoute = event.path.endsWith('/v1/responses');
  try {
    const user = authFromEvent(event);
    const request = responsesRoute
      ? parseResponsesTurn(parseBody(event))
      : parseMetaTurn(parseBody(event));
    const source = getServices().meta.stream(user, request);
    const iterator = (responsesRoute ? responsesSse(source) : legacySse(source))[
      Symbol.asyncIterator
    ]();
    const first = await iterator.next();
    stream = awslambda.HttpResponseStream.from(stream, {
      statusCode: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      },
    });
    if (!first.done) stream.write(first.value);
    try {
      while (true) {
        const item = await iterator.next();
        if (item.done) break;
        stream.write(item.value);
      }
    } catch (error) {
      const normalized = normalizeError(error);
      stream.write(
        responsesRoute
          ? `event: error\ndata: ${JSON.stringify({ type: 'error', code: normalized.code, message: normalized.message })}\n\n`
          : sse({ type: 'error', code: normalized.code, message: normalized.message }),
      );
    } finally {
      await iterator.return?.();
    }
    stream.end();
  } catch (error) {
    const normalized = normalizeError(error);
    stream = awslambda.HttpResponseStream.from(stream, {
      statusCode: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      },
    });
    stream.end(
      responsesRoute
        ? `event: error\ndata: ${JSON.stringify({ type: 'error', code: normalized.code, message: normalized.message })}\n\n`
        : sse({ type: 'error', code: normalized.code, message: normalized.message }),
    );
  }
});

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

function sse(event: { type: string; [key: string]: unknown }): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function* legacySse(events: AsyncIterable<{ type: string; [key: string]: unknown }>) {
  for await (const event of events) yield sse(event);
}
