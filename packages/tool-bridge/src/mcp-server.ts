import { randomUUID } from 'node:crypto';
import type { ToolDescriptor } from '@sia/protocol';
import { toolDescriptorSchema, toolResultImages, withoutToolResultImages } from '@sia/protocol';
import {
  JsonLinesTransport,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcTransport,
} from '@sia/runtime';
import type { ToolCapabilityClient } from './capability-client.js';

const FORBIDDEN_TOOL =
  /(?:visuali[sz]|canvas|render|execute_?javascript|raw_?cdp|cookie|browser_?profile|shell|terminal)/i;
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26'] as const;

interface McpRequest {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, (_key, candidate: unknown) =>
      typeof candidate === 'bigint' ? candidate.toString() : candidate,
    );
  } catch {
    return 'Tool returned a non-serializable result';
  }
}

function mcpTool(descriptor: ToolDescriptor): Record<string, unknown> {
  return {
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    annotations: {
      readOnlyHint: descriptor.annotations.readOnly,
      destructiveHint: descriptor.annotations.requiresApproval,
      openWorldHint:
        descriptor.name.startsWith('browser_') ||
        descriptor.name.startsWith('mail_') ||
        descriptor.name.startsWith('drive_') ||
        descriptor.name.startsWith('slack_'),
    },
  };
}

export class SiaMcpServer {
  readonly #client: ToolCapabilityClient;
  #initialized = false;
  #closed = false;

  constructor(client: ToolCapabilityClient) {
    this.#client = client;
    for (const raw of client.listTools()) {
      const descriptor = toolDescriptorSchema.parse(raw);
      if (FORBIDDEN_TOOL.test(descriptor.name))
        throw new Error(`Forbidden tool ${descriptor.name} cannot be bridged`);
    }
  }

  async handle(
    message: JsonRpcMessage,
    signal?: AbortSignal,
  ): Promise<JsonRpcMessage | undefined> {
    if (this.#closed) throw new Error('MCP server is closed');
    if (!('method' in message)) return undefined;
    if (!('id' in message)) {
      if (message.method === 'notifications/initialized') this.#initialized = true;
      return undefined;
    }
    try {
      const result = await this.#dispatch(message, signal);
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (error) {
      const candidate = error as { code?: unknown; message?: unknown; data?: unknown };
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: typeof candidate.code === 'number' ? candidate.code : -32603,
          message: typeof candidate.message === 'string' ? candidate.message : 'Internal error',
          ...(candidate.data === undefined ? {} : { data: candidate.data }),
        },
      };
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#client.close();
  }

  async #dispatch(request: McpRequest, signal?: AbortSignal): Promise<unknown> {
    if (request.method === 'initialize') {
      const requested = record(request.params).protocolVersion;
      const protocolVersion =
        typeof requested === 'string' &&
        (SUPPORTED_PROTOCOLS as readonly string[]).includes(requested)
          ? requested
          : SUPPORTED_PROTOCOLS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'sia-action-bridge', version: '0.1.0' },
        instructions:
          'Use only the listed Sia tools. Foreground takeover and credentials are controlled by the Sia host.',
      };
    }
    if (request.method === 'ping') return {};
    if (!this.#initialized)
      throw Object.assign(new Error('MCP client has not sent notifications/initialized'), {
        code: -32002,
      });
    if (request.method === 'tools/list') {
      return { tools: this.#client.listTools().map(mcpTool) };
    }
    if (request.method === 'tools/call') {
      const params = record(request.params);
      const name = params.name;
      if (typeof name !== 'string')
        throw Object.assign(new Error('tools/call requires a tool name'), { code: -32602 });
      if (FORBIDDEN_TOOL.test(name))
        throw Object.assign(new Error('Tool is not available'), { code: -32601 });
      const argumentsValue = params.arguments === undefined ? {} : record(params.arguments);
      const result = await this.#client.invoke(name, argumentsValue, signal);
      const outcome =
        typeof result === 'object' && result !== null
          ? (result as Record<string, unknown>).outcome
          : undefined;
      const images = toolResultImages(result);
      const structuredResult = withoutToolResultImages(result);
      return {
        content: [
          { type: 'text', text: safeText(structuredResult) },
          ...images.map((image) => ({
            type: 'image',
            mimeType: image.mimeType,
            data: image.dataBase64,
          })),
        ],
        structuredContent: structuredResult,
        isError: outcome === 'refused' || outcome === 'stale',
      };
    }
    throw Object.assign(new Error(`Method not found: ${request.method}`), { code: -32601 });
  }
}

export async function serveMcpTransport(options: {
  readonly transport: JsonRpcTransport;
  readonly client: ToolCapabilityClient;
  readonly signal?: AbortSignal;
}): Promise<() => Promise<void>> {
  const server = new SiaMcpServer(options.client);
  const unsubscribe = options.transport.onMessage((message) => {
    void server
      .handle(message, options.signal)
      .then(async (response) => {
        if (response) await options.transport.send(response);
      })
      .catch(async (error: unknown) => {
        if ('id' in message) {
          await options.transport.send({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: error instanceof Error ? error.message : 'Internal error',
            },
          });
        }
      });
  });
  const close = async (): Promise<void> => {
    unsubscribe();
    await server.close();
    await options.transport.close();
  };
  options.signal?.addEventListener('abort', () => void close(), { once: true });
  return close;
}

export async function serveMcpStdio(
  client: ToolCapabilityClient,
  signal?: AbortSignal,
): Promise<() => Promise<void>> {
  const transport = new JsonLinesTransport(process.stdin, process.stdout);
  return await serveMcpTransport({ transport, client, ...(signal ? { signal } : {}) });
}

export function createEphemeralCapabilityId(): string {
  return randomUUID();
}
