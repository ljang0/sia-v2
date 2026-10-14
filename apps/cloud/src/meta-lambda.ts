import type { APIGatewayProxyEvent } from 'aws-lambda';
import { createAwsDependencies } from './aws.js';
import { inboundWire, requestHarness, wantsStream } from './inbound-wires.js';
import { normalizeError, authFromEvent, parseBody } from './router.js';
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

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store, no-cache',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
  'x-content-type-options': 'nosniff',
};
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export const handler = awslambda.streamifyResponse(async (event, rawStream) => {
  const wire = inboundWire(event.path);
  let streaming = true;
  try {
    const user = authFromEvent(event);
    const body = parseBody(event);
    streaming = wantsStream(wire, body);
    const request = { ...wire.parse(body), harnessId: requestHarness(event.headers, wire) };
    const source = getServices().meta.stream(user, request);
    if (!streaming && wire.complete) {
      const response = await wire.complete(source);
      const stream = awslambda.HttpResponseStream.from(rawStream, {
        statusCode: 200,
        headers: JSON_HEADERS,
      });
      stream.end(JSON.stringify(response));
      return;
    }
    const iterator = wire.stream(source, body)[Symbol.asyncIterator]();
    // Pull the first event before committing to 200 so admission errors reach the client.
    const first = await iterator.next();
    const stream = awslambda.HttpResponseStream.from(rawStream, {
      statusCode: 200,
      headers: SSE_HEADERS,
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
      stream.write(wire.errorEvent(normalized.code, normalized.message));
    } finally {
      await iterator.return?.();
    }
    stream.end();
  } catch (error) {
    const normalized = normalizeError(error);
    if (!streaming) {
      awslambda.HttpResponseStream.from(rawStream, {
        statusCode: normalized.status,
        headers: JSON_HEADERS,
      }).end(
        JSON.stringify({
          error: { type: normalized.code, code: normalized.code, message: normalized.message },
        }),
      );
      return;
    }
    const stream = awslambda.HttpResponseStream.from(rawStream, {
      statusCode: 200,
      headers: SSE_HEADERS,
    });
    stream.write(wire.errorEvent(normalized.code, normalized.message));
    stream.end();
  }
});
