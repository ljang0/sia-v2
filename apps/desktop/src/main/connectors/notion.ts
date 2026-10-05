import { ConnectorRequestError } from './http.js';
import type { Fetch } from './oauth.js';
import { truncate } from './outlook.js';

/** Notion's hosted MCP server. It supports OAuth dynamic client registration, so Sia ships no secret. */
export const NOTION_MCP_URL = 'https://mcp.notion.com/mcp';
export const NOTION_OAUTH = {
  authorize: 'https://mcp.notion.com/authorize',
  token: 'https://mcp.notion.com/token',
  register: 'https://mcp.notion.com/register',
} as const;

const PROTOCOL_VERSION = '2025-06-18';

type Input = Record<string, unknown>;

interface McpTool {
  name: string;
  inputSchema?: { properties?: Record<string, unknown> };
}

/** Registers a public PKCE client for this one sign-in's loopback redirect. */
export async function registerNotionClient(
  fetchImpl: Fetch,
  redirectUri: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetchImpl(NOTION_OAUTH.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'Sia',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
    ...(signal ? { signal } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Input;
  if (!response.ok || typeof body.client_id !== 'string') {
    throw new Error('Notion sign-in could not start. Try again in a moment.');
  }
  return body.client_id;
}

/**
 * A minimal MCP Streamable HTTP client for Notion's hosted server. Only the curated Sia tools
 * below are callable; the server's wider tool list is never shown to the model.
 */
export class NotionMcpClient {
  #sessionId: string | undefined;
  #initialized = false;
  #tools: Map<string, McpTool> | undefined;
  #nextId = 1;

  constructor(
    private readonly fetchImpl: Fetch,
    private readonly token: () => Promise<string>,
  ) {}

  async callTool(name: string, args: Input, signal?: AbortSignal): Promise<unknown> {
    await this.#ensureInitialized(signal);
    const result = (await this.#rpc('tools/call', { name, arguments: args }, signal)) as {
      content?: { type: string; text?: string }[];
      structuredContent?: unknown;
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text!)
      .join('\n');
    if (result.isError)
      throw new ConnectorRequestError(
        400,
        truncate(text || 'Notion declined the request.', 1_000),
      );
    if (result.structuredContent !== undefined) return result.structuredContent;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { text: truncate(text, 200_000) };
    }
  }

  async tool(name: string, signal?: AbortSignal): Promise<McpTool> {
    await this.#ensureInitialized(signal);
    if (!this.#tools) {
      const listed = (await this.#rpc('tools/list', {}, signal)) as { tools?: McpTool[] };
      this.#tools = new Map((listed.tools ?? []).map((tool) => [tool.name, tool]));
    }
    const tool = this.#tools.get(name);
    if (!tool) {
      throw new ConnectorRequestError(
        503,
        'Notion changed its tools and this version of Sia cannot use them yet. Update Sia, then try again.',
      );
    }
    return tool;
  }

  async #ensureInitialized(signal?: AbortSignal): Promise<void> {
    if (this.#initialized) return;
    await this.#rpc(
      'initialize',
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'Sia', version: '1' },
      },
      signal,
    );
    await this.#post({ jsonrpc: '2.0', method: 'notifications/initialized' }, signal);
    this.#initialized = true;
  }

  async #rpc(method: string, params: Input, signal?: AbortSignal): Promise<unknown> {
    const id = this.#nextId++;
    let response = await this.#post({ jsonrpc: '2.0', id, method, params }, signal);
    if (response.status === 404 && this.#sessionId && method !== 'initialize') {
      // The server ended the session; start a new one and retry once.
      this.#sessionId = undefined;
      this.#initialized = false;
      this.#tools = undefined;
      await this.#ensureInitialized(signal);
      response = await this.#post({ jsonrpc: '2.0', id, method, params }, signal);
    }
    if (response.status === 401) {
      throw new ConnectorRequestError(
        401,
        'This app connection expired. Reconnect it in Settings > Connections.',
      );
    }
    if (!response.ok) {
      throw new ConnectorRequestError(
        response.status,
        `Notion returned an error (${response.status}).`,
      );
    }
    const message = await readRpcMessage(response, id);
    if (message.error) {
      const error = message.error as { message?: string };
      throw new ConnectorRequestError(
        400,
        truncate(error.message ?? 'Notion declined the request.', 1_000),
      );
    }
    return message.result;
  }

  async #post(body: Input, signal?: AbortSignal): Promise<Response> {
    const response = await this.fetchImpl(NOTION_MCP_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await this.token()}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL_VERSION,
        ...(this.#sessionId ? { 'mcp-session-id': this.#sessionId } : {}),
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const session = response.headers.get('mcp-session-id');
    if (session) this.#sessionId = session;
    return response;
  }
}

async function readRpcMessage(response: Response, id: number): Promise<Input> {
  const text = await response.text();
  const type = response.headers.get('content-type') ?? '';
  const candidates: string[] = type.includes('text/event-stream')
    ? text
        .split(/\r?\n\r?\n/)
        .map((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        )
        .filter(Boolean)
    : [text];
  for (const candidate of candidates) {
    try {
      const message = JSON.parse(candidate) as Input;
      if (message.id === id) return message;
    } catch {
      // Ignore keep-alives and unrelated events.
    }
  }
  throw new ConnectorRequestError(502, 'Notion returned an unreadable response. Try again.');
}

/** Maps Sia's curated Notion tools onto the hosted server's tools. */
export async function runNotionTool(
  client: NotionMcpClient,
  tool: string,
  input: Input,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (tool) {
    case 'notion_search':
      return client.callTool(
        'notion-search',
        { query: input.query, ...(input.limit === undefined ? {} : { limit: input.limit }) },
        signal,
      );
    case 'notion_fetch':
      return client.callTool('notion-fetch', { id: input.id }, signal);
    case 'notion_create_page':
      return client.callTool(
        'notion-create-pages',
        {
          pages: [
            {
              properties: { title: input.title },
              ...(input.content === undefined ? {} : { content: input.content }),
            },
          ],
          ...(input.parent_page_id === undefined
            ? {}
            : { parent: { page_id: input.parent_page_id } }),
        },
        signal,
      );
    case 'notion_edit_page': {
      // Notion has shipped this command both flat and wrapped in `data`, with either a single
      // search/replace pair or a list. Shape the call from the schema the server advertises.
      const schema =
        (await client.tool('notion-update-page', signal)).inputSchema?.properties ?? {};
      const wrapped = 'data' in schema && !('page_id' in schema);
      const inner = (
        wrapped
          ? ((schema.data as { properties?: Record<string, unknown> }).properties ?? {})
          : schema
      ) as Record<string, unknown>;
      const change =
        'content_updates' in inner
          ? { content_updates: [{ old_str: input.old_text, new_str: input.new_text }] }
          : { old_str: input.old_text, new_str: input.new_text };
      const args = { page_id: input.page_id, command: 'update_content', ...change };
      return client.callTool('notion-update-page', wrapped ? { data: args } : args, signal);
    }
    case 'notion_comment': {
      // Shaped from the advertised schema: newer servers take rich_text, older ones a parent.
      const schema =
        (await client.tool('notion-create-comment', signal)).inputSchema?.properties ?? {};
      const body =
        'rich_text' in schema
          ? { rich_text: [{ type: 'text', text: { content: input.text } }] }
          : { text: input.text };
      const target =
        'page_id' in schema || !('parent' in schema)
          ? { page_id: input.page_id }
          : { parent: { page_id: input.page_id } };
      return client.callTool('notion-create-comment', { ...target, ...body }, signal);
    }
    default:
      throw new ConnectorRequestError(400, `Unknown Notion tool ${tool}.`);
  }
}

/** The workspace label Notion's MCP server reports for the signed-in user, when it offers one. */
export async function notionAccount(client: NotionMcpClient): Promise<string> {
  try {
    const properties = (await client.tool('notion-get-users')).inputSchema?.properties ?? {};
    const key = 'user_id' in properties ? 'user_id' : 'id' in properties ? 'id' : undefined;
    if (!key) return 'Notion workspace';
    const self = (await client.callTool('notion-get-users', { [key]: 'self' })) as Input;
    const users = (self.results ?? self.users) as Input[] | undefined;
    const first = users?.[0] ?? self;
    const label = first?.email ?? first?.name;
    if (typeof label === 'string' && label) return label;
  } catch {
    // The label is cosmetic; a connected workspace is still usable without it.
  }
  return 'Notion workspace';
}
