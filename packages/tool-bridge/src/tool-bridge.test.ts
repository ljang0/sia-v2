import { describe, expect, it, vi } from 'vitest';
import type { ToolDescriptor } from '@sia/protocol';
import {
  ShortLivedCapabilityClient,
  SiaMcpServer,
  createPackagedToolBridgeLaunchSpec,
  type CapabilityChannel,
} from './index.js';

const safeTool: ToolDescriptor = {
  name: 'browser_tabs',
  description: 'List tabs',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  annotations: { readOnly: true, requiresApproval: false, takesForeground: false },
};

function request(id: number, method: string, params?: unknown) {
  return { jsonrpc: '2.0' as const, id, method, ...(params === undefined ? {} : { params }) };
}

describe('short-lived capability client', () => {
  it('filters tools, forwards only allowed calls, and never exposes capability ids', async () => {
    const invoke = vi.fn(async () => ({ outcome: 'verified', summary: 'ok', data: [] }));
    const channel: CapabilityChannel = { invoke };
    const client = new ShortLivedCapabilityClient({
      capability: {
        id: 'opaque-secret',
        sessionId: 'session-1',
        expiresAt: 2_000,
        allowedTools: ['browser_tabs'],
      },
      channel,
      tools: [safeTool, { ...safeTool, name: 'computer_list' }],
      now: () => 1_000,
    });
    expect(client.listTools().map((tool) => tool.name)).toEqual(['browser_tabs']);
    await client.invoke('browser_tabs', {});
    expect(invoke).toHaveBeenCalledWith(
      {
        capabilityId: 'opaque-secret',
        sessionId: 'session-1',
        toolName: 'browser_tabs',
        arguments: {},
      },
      undefined,
    );
    await expect(client.invoke('computer_list', {})).rejects.toThrow(/outside/);
    expect(JSON.stringify(client.listTools())).not.toContain('opaque-secret');
  });

  it('fails closed after expiry', async () => {
    const client = new ShortLivedCapabilityClient({
      capability: {
        id: 'id',
        sessionId: 'session',
        expiresAt: 100,
        allowedTools: ['browser_tabs'],
      },
      channel: { invoke: async () => ({}) },
      tools: [safeTool],
      now: () => 100,
    });
    expect(() => client.listTools()).toThrow(/expired/);
    await expect(client.invoke('browser_tabs', {})).rejects.toThrow(/expired/);
  });

  it('builds an absolute packaged Electron stdio launch spec without secret environment values', () => {
    const launch = createPackagedToolBridgeLaunchSpec({
      electronExecutable: '/Applications/Sia.app/Contents/MacOS/Sia',
      entryPath: '/Applications/Sia.app/Contents/Resources/tool-bridge/stdio-entry.js',
      socketPath: '/Users/person/Library/Application Support/Sia/runtime/capability.sock',
      capabilityId: 'short-lived-capability',
      sessionId: 'session-1',
    });
    expect(launch.command).toBe('/Applications/Sia.app/Contents/MacOS/Sia');
    expect(launch.args).toContain('--capability');
    expect(launch.env).toEqual([{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }]);
    expect(JSON.stringify(launch.env)).not.toContain('short-lived-capability');
    expect(() =>
      createPackagedToolBridgeLaunchSpec({
        electronExecutable: 'electron',
        entryPath: '/entry.js',
        socketPath: '/capability.sock',
        capabilityId: 'id',
        sessionId: 'session',
      }),
    ).toThrow(/absolute/);
  });
});

describe('Sia MCP server', () => {
  function server(result: unknown = { outcome: 'verified', summary: 'Listed', data: [] }) {
    const client = {
      listTools: () => [safeTool],
      invoke: vi.fn(async () => result),
      close: vi.fn(async () => undefined),
    };
    return { client, server: new SiaMcpServer(client) };
  }

  it('implements initialize, initialized, tools/list, ping, and tools/call', async () => {
    const fixture = server();
    const initialized = await fixture.server.handle(
      request(1, 'initialize', { protocolVersion: '2025-03-26' }),
    );
    expect(initialized).toMatchObject({
      result: { protocolVersion: '2025-03-26', serverInfo: { name: 'sia-action-bridge' } },
    });
    expect(await fixture.server.handle(request(2, 'tools/list'))).toMatchObject({
      error: { code: -32002 },
    });
    await fixture.server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(await fixture.server.handle(request(3, 'tools/list'))).toMatchObject({
      result: { tools: [{ name: 'browser_tabs' }] },
    });
    expect(await fixture.server.handle(request(4, 'ping'))).toMatchObject({ result: {} });
    const called = await fixture.server.handle(
      request(5, 'tools/call', { name: 'browser_tabs', arguments: {} }),
    );
    expect(called).toMatchObject({
      result: { isError: false, structuredContent: { outcome: 'verified' } },
    });
    expect(fixture.client.invoke).toHaveBeenCalledWith('browser_tabs', {}, undefined);
    await fixture.server.close();
    expect(fixture.client.close).toHaveBeenCalled();
  });

  it('marks refused and stale action outcomes as MCP errors', async () => {
    const fixture = server({ outcome: 'refused', summary: 'Denied' });
    await fixture.server.handle(request(1, 'initialize'));
    await fixture.server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(
      await fixture.server.handle(
        request(2, 'tools/call', { name: 'browser_tabs', arguments: {} }),
      ),
    ).toMatchObject({ result: { isError: true } });
  });

  it('forwards CUA pixels as MCP images without duplicating base64 in text or structured data', async () => {
    const fixture = server({
      outcome: 'verified',
      summary: 'Captured semantic and pixel state',
      data: { elements: [] },
      images: [{ mimeType: 'image/png', dataBase64: 'cGl4ZWxz' }],
    });
    await fixture.server.handle(request(1, 'initialize'));
    await fixture.server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });

    const response = await fixture.server.handle(
      request(2, 'tools/call', { name: 'browser_tabs', arguments: {} }),
    );

    expect(response).toMatchObject({
      result: {
        content: [{ type: 'text' }, { type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' }],
        structuredContent: {
          outcome: 'verified',
          summary: 'Captured semantic and pixel state',
          data: { elements: [] },
        },
      },
    });
    expect(
      JSON.stringify(
        (response as { result: { structuredContent: unknown } }).result.structuredContent,
      ),
    ).not.toContain('cGl4ZWxz');
  });

  it('rejects visualization and raw-control descriptors at construction', () => {
    expect(
      () =>
        new SiaMcpServer({
          listTools: () => [{ ...safeTool, name: 'execute_javascript' }],
          invoke: async () => ({}),
          close: async () => undefined,
        }),
    ).toThrow(/Forbidden tool/);
  });

  it('does not route unknown or forbidden requested tools', async () => {
    const fixture = server();
    await fixture.server.handle(request(1, 'initialize'));
    await fixture.server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(
      await fixture.server.handle(request(2, 'tools/call', { name: 'raw_cdp', arguments: {} })),
    ).toMatchObject({ error: { code: -32601 } });
    expect(fixture.client.invoke).not.toHaveBeenCalled();
  });
});
