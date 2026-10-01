import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { describe, expect, it } from 'vitest';
import { CodexAppServerAdapter } from './providers/codex.js';

const realSmoke = process.env.SIA_CODEX_CUSTOM_PROVIDER_SMOKE === '1' ? it : it.skip;

describe('Codex custom Responses provider smoke', () => {
  realSmoke(
    'completes a real Codex App Server turn against a model-scoped local relay',
    async () => {
      const requests: Array<{ url: string; authorization?: string; body: string }> = [];
      const server = await startFakeResponsesServer(requests);
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fake relay did not bind');
      const toolCalls: string[] = [];
      const adapter = new CodexAppServerAdapter({
        providerId: 'meta',
        accountOverride: { state: 'authenticated', billing: 'included' },
        sessionEphemeral: true,
        customModelProvider: async () => ({
          id: 'sia_included',
          name: 'Sia included models',
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          bearerToken: 'local-smoke-capability',
        }),
        dynamicToolHandler: async (call) => {
          toolCalls.push(call.name);
          return {
            success: true,
            content: {
              screenshot: 'bounded-local-fixture',
              images: [
                {
                  mimeType: 'image/png',
                  dataBase64:
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                },
              ],
            },
          };
        },
      });
      try {
        const session = await adapter.createSession({
          threadId: 'codex-custom-provider-smoke',
          model: 'meta/spark',
          workspace: process.cwd(),
          instructions: 'This is a local protocol smoke test.',
          tools: [
            {
              name: 'computer_snapshot',
              description: 'Read one granted application window.',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              annotations: {
                readOnly: true,
                requiresApproval: false,
                takesForeground: false,
              },
            },
          ],
        });
        const events = [];
        for await (const event of adapter.sendTurn(session, {
          turnId: 'turn-custom-provider-smoke',
          text: 'Return the relay response.',
        })) {
          events.push(event);
        }

        expect(requests).toHaveLength(2);
        expect(requests[0]).toMatchObject({
          url: '/v1/responses',
          authorization: 'Bearer local-smoke-capability',
        });
        const firstRequest = JSON.parse(requests[0]!.body) as {
          model?: string;
          stream?: boolean;
          tools?: Array<{ type?: string; name?: string }>;
        };
        expect(firstRequest).toMatchObject({ model: 'meta/spark', stream: true });
        expect(firstRequest.tools).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: 'function', name: 'computer_snapshot' }),
          ]),
        );
        expect(firstRequest.tools?.every(({ type }) => type === 'function')).toBe(true);
        expect(requests[1]!.body).toContain('function_call_output');
        expect(requests[1]!.body).toContain('bounded-local-fixture');
        expect(requests[1]!.body).toContain('data:image/png;base64,');
        expect(toolCalls).toEqual(['computer_snapshot']);
        expect(
          events.some(
            (event) =>
              event.type === 'message' &&
              event.payload.parts.some(
                (part) => part.kind === 'text' && part.text.includes('META_HARNESS_OK'),
              ),
          ),
        ).toBe(true);
        expect(events.at(-1)).toMatchObject({
          provider: 'meta',
          type: 'completion',
          payload: { status: 'completed' },
        });
      } finally {
        await adapter.dispose();
        await closeServer(server);
      }
    },
    120_000,
  );
});

async function startFakeResponsesServer(
  requests: Array<{ url: string; authorization?: string; body: string }>,
): Promise<Server> {
  const respond = async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');
    requests.push({
      url: request.url ?? '',
      ...(request.headers.authorization
        ? { authorization: request.headers.authorization }
        : {}),
      body,
    });
    if (request.method !== 'POST' || request.url !== '/v1/responses') {
      response.writeHead(404).end();
      return;
    }
    const payload = JSON.parse(body) as { model?: string; input?: unknown[] };
    const responseId = 'resp_sia_smoke';
    const messageId = 'msg_sia_smoke';
    const model = payload.model ?? 'meta/spark';
    const createdAt = Math.floor(Date.now() / 1_000);
    const base = {
      id: responseId,
      object: 'response',
      created_at: createdAt,
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model,
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
    };
    const hasToolOutput = (payload.input ?? []).some(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        (item as { type?: unknown }).type === 'function_call_output',
    );
    const usage = {
      input_tokens: 5,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 2,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 7,
    };
    let events: Array<Record<string, unknown>>;
    if (!hasToolOutput) {
      const call = {
        id: 'fc_sia_smoke',
        type: 'function_call',
        status: 'completed',
        arguments: '{}',
        call_id: 'call_sia_smoke',
        name: 'computer_snapshot',
      };
      events = [
        {
          type: 'response.created',
          sequence_number: 0,
          response: { ...base, status: 'in_progress', output: [], usage: null },
        },
        {
          type: 'response.in_progress',
          sequence_number: 1,
          response: { ...base, status: 'in_progress', output: [], usage: null },
        },
        {
          type: 'response.output_item.added',
          sequence_number: 2,
          output_index: 0,
          item: { ...call, status: 'in_progress', arguments: '' },
        },
        {
          type: 'response.function_call_arguments.delta',
          sequence_number: 3,
          item_id: call.id,
          output_index: 0,
          delta: '{}',
        },
        {
          type: 'response.function_call_arguments.done',
          sequence_number: 4,
          item_id: call.id,
          output_index: 0,
          arguments: '{}',
        },
        { type: 'response.output_item.done', sequence_number: 5, output_index: 0, item: call },
        {
          type: 'response.completed',
          sequence_number: 6,
          response: { ...base, status: 'completed', output: [call], usage },
        },
      ];
    } else {
      const content = [
        { type: 'output_text', text: 'META_HARNESS_OK', annotations: [], logprobs: [] },
      ];
      const message = {
        id: messageId,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content,
      };
      events = [
        {
          type: 'response.created',
          sequence_number: 0,
          response: { ...base, status: 'in_progress', output: [], usage: null },
        },
        {
          type: 'response.in_progress',
          sequence_number: 1,
          response: { ...base, status: 'in_progress', output: [], usage: null },
        },
        {
          type: 'response.output_item.added',
          sequence_number: 2,
          output_index: 0,
          item: { ...message, status: 'in_progress', content: [] },
        },
        {
          type: 'response.content_part.added',
          sequence_number: 3,
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: '', annotations: [], logprobs: [] },
        },
        {
          type: 'response.output_text.delta',
          sequence_number: 4,
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          delta: 'META_HARNESS_OK',
          logprobs: [],
        },
        {
          type: 'response.output_text.done',
          sequence_number: 5,
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          text: 'META_HARNESS_OK',
          logprobs: [],
        },
        {
          type: 'response.content_part.done',
          sequence_number: 6,
          item_id: messageId,
          output_index: 0,
          content_index: 0,
          part: content[0],
        },
        {
          type: 'response.output_item.done',
          sequence_number: 7,
          output_index: 0,
          item: message,
        },
        {
          type: 'response.completed',
          sequence_number: 8,
          response: { ...base, status: 'completed', output: [message], usage },
        },
      ];
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
    });
    for (const event of events) {
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  };
  const server = createServer((request, response) => void respond(request, response));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
