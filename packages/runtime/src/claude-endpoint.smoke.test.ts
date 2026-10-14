import { createServer, type IncomingMessage } from 'node:http';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClaudeCliAdapter } from './providers/claude.js';

/**
 * Opt-in: runs the installed Claude Code against a loopback Anthropic Messages stub, the way
 * Sia's model proxy serves an included model. No network, account, or model turn is used.
 *
 *   SIA_CLAUDE_ENDPOINT_SMOKE=1 pnpm --filter @sia/runtime exec vitest run src/claude-endpoint.smoke.test.ts
 */
const runReal = process.env.SIA_CLAUDE_ENDPOINT_SMOKE === '1';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((step) => step()));
});

interface RecordedRequest {
  path: string;
  apiKey: string | undefined;
  authorization: string | undefined;
  body: Record<string, unknown>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

function sse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

/** First call asks for the Sia tool; once its result is present, answers with the value. */
function stubTurn(body: Record<string, unknown>): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const answered = JSON.stringify(messages).includes('SIA_TOOL_RESULT');
  const start = {
    type: 'message_start',
    message: {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  };
  if (answered) {
    return sse([
      start,
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'SIA_TOOL_RESULT' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 3 },
      },
      { type: 'message_stop' },
    ]);
  }
  return sse([
    start,
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_stub',
        name: 'mcp__sia__smoke_tool',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 3 },
    },
    { type: 'message_stop' },
  ]);
}

describe.runIf(runReal)('real Claude Code on a loopback model endpoint', () => {
  it('sends the scoped model and capability to the endpoint and completes a Sia tool loop', async () => {
    const requests: RecordedRequest[] = [];
    const server = createServer((request, response) => {
      void (async () => {
        const body = await readJson(request);
        requests.push({
          path: request.url ?? '',
          apiKey: request.headers['x-api-key'] as string | undefined,
          authorization: request.headers.authorization,
          body,
        });
        if (!request.url?.startsWith('/v1/messages') || request.url.includes('count_tokens')) {
          response.writeHead(404, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error' } }));
          return;
        }
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(stubTurn(body));
      })();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => new Promise((resolve) => server.close(() => resolve())));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('stub did not bind');

    const workspace = await mkdtemp(join(tmpdir(), 'sia-claude-endpoint-'));
    cleanup.push(() => rm(workspace, { recursive: true, force: true }));
    const serverPath = join(workspace, 'sia-smoke-mcp.mjs');
    await writeFile(
      serverPath,
      [
        "import { createInterface } from 'node:readline';",
        'const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });',
        'for await (const line of lines) {',
        '  const request = JSON.parse(line);',
        '  if (request.id == null) continue;',
        "  if (request.method === 'initialize') respond(request.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sia-smoke', version: '1.0.0' } });",
        "  else if (request.method === 'tools/list') respond(request.id, { tools: [{ name: 'smoke_tool', description: 'Return the fixed Sia smoke value.', inputSchema: { type: 'object', additionalProperties: false, properties: {} } }] });",
        "  else if (request.method === 'tools/call') respond(request.id, { content: [{ type: 'text', text: 'SIA_TOOL_RESULT' }], isError: false });",
        '  else respond(request.id, {});',
        '}',
        "function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
      ].join('\n'),
      { encoding: 'utf8', mode: 0o700 },
    );

    const adapter = new ClaudeCliAdapter({
      providerId: 'meta',
      accountOverride: {
        state: 'authenticated',
        label: 'Included with Sia',
        billing: 'included',
      },
      modelEndpoint: async () => ({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        apiKey: 'loopback-capability',
      }),
      maxTurns: 3,
      mcpServerFactory: () => [{ name: 'sia', command: process.execPath, args: [serverPath] }],
    });
    cleanup.push(() => adapter.dispose());
    await expect(adapter.probe()).resolves.toMatchObject({ available: true, supported: true });
    const session = await adapter.createSession({
      threadId: 'claude-endpoint-smoke',
      model: 'sponsor/model',
      workspace,
      instructions: 'Use the supplied Sia tool when the user requests it.',
      tools: [],
    });
    const events = [];
    for await (const event of adapter.sendTurn(session, {
      turnId: 'claude-endpoint-turn',
      text: 'Call the Sia smoke_tool once, then reply with exactly its returned value.',
    })) {
      events.push(event);
    }

    const turns = requests.filter(({ path }) => path.startsWith('/v1/messages'));
    expect(turns.length).toBeGreaterThanOrEqual(2);
    for (const turn of turns) {
      expect(turn.apiKey).toBe('loopback-capability');
      expect(turn.body.model).toBe('sponsor/model');
    }
    expect(events.at(-1)).toMatchObject({
      type: 'completion',
      payload: { status: 'completed' },
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool',
          payload: expect.objectContaining({ name: 'smoke_tool', phase: 'completed' }),
        }),
      ]),
    );
    const text = events
      .filter((event) => event.type === 'message')
      .flatMap((event) => event.payload.parts)
      .filter((part) => part.kind === 'text')
      .map((part) => part.text)
      .join('');
    expect(text).toContain('SIA_TOOL_RESULT');
    expect(await readdir(workspace)).toEqual(['sia-smoke-mcp.mjs']);
  }, 90_000);
});
