import { createServer, type IncomingMessage, type Server } from 'node:http';

/**
 * Test-only loopback model API for opt-in real-harness smoke tests. It plays the part of Sia's
 * model proxy: the first turn asks for the Sia `smoke_tool`, and once the tool's result is in
 * the conversation it answers with that value. It records what each harness sent.
 */
export interface StubRequest {
  readonly path: string;
  readonly authorization: string | undefined;
  readonly apiKey: string | undefined;
  readonly body: Record<string, unknown>;
}

export interface HarnessEndpointStub {
  readonly baseUrl: string;
  readonly requests: readonly StubRequest[];
  close(): Promise<void>;
}

export const SMOKE_RESULT = 'SIA_TOOL_RESULT';

/** A stdio MCP server exposing Sia's `smoke_tool`, which returns SMOKE_RESULT. */
export const SMOKE_MCP_SERVER = [
  "import { createInterface } from 'node:readline';",
  'const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });',
  'for await (const line of lines) {',
  '  const request = JSON.parse(line);',
  '  if (request.id == null) continue;',
  "  if (request.method === 'initialize') respond(request.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sia-smoke', version: '1.0.0' } });",
  "  else if (request.method === 'tools/list') respond(request.id, { tools: [{ name: 'smoke_tool', description: 'Return the fixed Sia smoke value.', inputSchema: { type: 'object', additionalProperties: false, properties: {} } }] });",
  `  else if (request.method === 'tools/call') respond(request.id, { content: [{ type: 'text', text: '${SMOKE_RESULT}' }], isError: false });`,
  '  else respond(request.id, {});',
  '}',
  "function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n'); }",
].join('\n');

export async function startHarnessEndpointStub(): Promise<HarnessEndpointStub> {
  const requests: StubRequest[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      const body = await readJson(request);
      requests.push({
        path: request.url ?? '',
        authorization: request.headers.authorization,
        apiKey: request.headers['x-api-key'] as string | undefined,
        body,
      });
      const answered = JSON.stringify(body).includes(SMOKE_RESULT);
      const toolName = smokeToolName(body);
      if (request.url?.startsWith('/v1/responses')) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(responsesTurn(String(body.model), answered || !toolName, toolName));
        return;
      }
      if (request.url?.startsWith('/v1/chat/completions')) {
        response.writeHead(200, {
          'content-type': body.stream ? 'text/event-stream' : 'application/json',
        });
        response.end(chatTurn(body, answered || !toolName, toolName, smokeToolArguments(body)));
        return;
      }
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"not found"}}');
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

/** The harness-visible name of Sia's smoke tool, e.g. `sia_smoke_tool`. */
function smokeToolName(body: Record<string, unknown>): string | undefined {
  return smokeTool(body)?.name;
}

/** Arguments the harness's schema for the smoke tool requires (OpenHands adds `security_risk`). */
function smokeToolArguments(body: Record<string, unknown>): string {
  const parameters = smokeTool(body)?.parameters as Record<string, unknown> | undefined;
  const properties = (parameters?.properties ?? {}) as Record<string, unknown>;
  return JSON.stringify('security_risk' in properties ? { security_risk: 'LOW' } : {});
}

function smokeTool(
  body: Record<string, unknown>,
): { name: string; parameters: unknown } | undefined {
  const tools = Array.isArray(body.tools) ? (body.tools as Array<Record<string, unknown>>) : [];
  return tools
    .map((tool) => {
      const fn = tool.function as Record<string, unknown> | undefined;
      return {
        name: String(tool.name ?? fn?.name ?? ''),
        parameters: tool.parameters ?? fn?.parameters,
      };
    })
    .find(({ name }) => name.endsWith('smoke_tool'));
}

function sse(events: Array<Record<string, unknown>>): string {
  return events
    .map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
}

function responsesTurn(model: string, answer: boolean, toolName: string | undefined): string {
  const base = {
    id: 'resp_stub',
    object: 'response',
    model,
    status: 'in_progress',
    output: [],
  };
  const usage = { input_tokens: 5, output_tokens: 3, total_tokens: 8 };
  if (answer) {
    const item = {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: SMOKE_RESULT, annotations: [] }],
    };
    return sse([
      { type: 'response.created', response: base },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...item, status: 'in_progress', content: [] },
      },
      {
        type: 'response.content_part.added',
        item_id: 'msg_stub',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'msg_stub',
        output_index: 0,
        content_index: 0,
        delta: SMOKE_RESULT,
      },
      {
        type: 'response.output_text.done',
        item_id: 'msg_stub',
        output_index: 0,
        content_index: 0,
        text: SMOKE_RESULT,
      },
      { type: 'response.output_item.done', output_index: 0, item },
      {
        type: 'response.completed',
        response: { ...base, status: 'completed', output: [item], usage },
      },
    ]);
  }
  const call = {
    id: 'fc_stub',
    type: 'function_call',
    call_id: 'call_stub',
    name: toolName,
    arguments: '{}',
    status: 'completed',
  };
  return sse([
    { type: 'response.created', response: base },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { ...call, arguments: '', status: 'in_progress' },
    },
    {
      type: 'response.function_call_arguments.delta',
      item_id: 'fc_stub',
      output_index: 0,
      delta: '{}',
    },
    {
      type: 'response.function_call_arguments.done',
      item_id: 'fc_stub',
      output_index: 0,
      arguments: '{}',
    },
    { type: 'response.output_item.done', output_index: 0, item: call },
    {
      type: 'response.completed',
      response: { ...base, status: 'completed', output: [call], usage },
    },
  ]);
}

function chatTurn(
  body: Record<string, unknown>,
  answer: boolean,
  toolName: string | undefined,
  toolArguments: string,
): string {
  const model = String(body.model);
  const usage = { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 };
  const message = answer
    ? { role: 'assistant', content: SMOKE_RESULT }
    : {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_stub',
            type: 'function',
            function: { name: toolName, arguments: toolArguments },
          },
        ],
      };
  const finish = answer ? 'stop' : 'tool_calls';
  if (!body.stream) {
    return JSON.stringify({
      id: 'chatcmpl_stub',
      object: 'chat.completion',
      created: 0,
      model,
      choices: [{ index: 0, message, finish_reason: finish }],
      usage,
    });
  }
  const chunk = (delta: Record<string, unknown>, finishReason: string | null) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl_stub',
      object: 'chat.completion.chunk',
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finishReason }],
      ...(finishReason ? { usage } : {}),
    })}\n\n`;
  const delta = answer
    ? { role: 'assistant', content: SMOKE_RESULT }
    : {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'call_stub',
            type: 'function',
            function: { name: toolName, arguments: toolArguments },
          },
        ],
      };
  return `${chunk(delta, null)}${chunk({}, finish)}data: [DONE]\n\n`;
}
