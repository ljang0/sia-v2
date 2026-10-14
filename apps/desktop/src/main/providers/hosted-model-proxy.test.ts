import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostedModelProxy, type ModelApiRoute } from './hosted-model-proxy.js';

const proxies: HostedModelProxy[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.dispose()));
});

describe('HostedModelProxy', () => {
  it('revokes an in-progress startup and can issue a fresh capability after reset', async () => {
    const proxy = new HostedModelProxy({
      forwardModelRequest: vi.fn(async () => new Response('fresh')),
    });
    proxies.push(proxy);
    const issued = proxy.issue('meta/spark', 'codex_app_server');
    const settled = issued.then(
      () => 'issued',
      () => 'revoked',
    );
    await proxy.dispose();
    expect(await settled).toBe('revoked');

    const provider = await proxy.issue('meta/spark', 'codex_app_server');
    const response = await fetch(`${provider.baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.bearerToken}` },
      body: JSON.stringify({ model: 'meta/spark' }),
    });
    expect(await response.text()).toBe('fresh');
  });

  it('aborts active model streams when reset instead of waiting for them to finish', async () => {
    let upstreamSignal: AbortSignal | undefined;
    let closeUpstream: (() => void) | undefined;
    const proxy = new HostedModelProxy({
      forwardModelRequest: vi.fn(async (_route, _body, signal) => {
        upstreamSignal = signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: ready\n\n'));
              closeUpstream = () => controller.close();
            },
          }),
        );
      }),
    });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark', 'codex_app_server');
    const client = new AbortController();
    const response = await fetch(`${provider.baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.bearerToken}` },
      body: JSON.stringify({ model: 'meta/spark' }),
      signal: client.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    const disposed = proxy.dispose();
    try {
      await vi.waitFor(() => expect(upstreamSignal?.aborted).toBe(true), { timeout: 300 });
      await disposed;
    } finally {
      client.abort();
      closeUpstream?.();
      await reader.cancel().catch(() => undefined);
      await disposed;
    }
  });

  it('uses an opaque model-scoped loopback capability and streams the forwarded response', async () => {
    const forwardModelRequest = vi.fn(
      async (
        _route: ModelApiRoute,
        body: string,
        _signal?: AbortSignal,
        _attribution?: { harnessId: string },
      ) => {
        expect(JSON.parse(body)).toMatchObject({ model: 'meta/spark', stream: true });
        return new Response('data: {"type":"response.completed"}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    );
    const proxy = new HostedModelProxy({ forwardModelRequest });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark', 'codex_app_server');
    const endpoint = `${provider.baseUrl}/responses`;

    expect(provider.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    expect(provider.bearerToken).not.toContain('meta/spark');

    const unauthenticated = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ model: 'meta/spark', stream: true }),
      headers: { 'content-type': 'application/json' },
    });
    expect(unauthenticated.status).toBe(401);

    const wrongModel = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ model: 'other/model', stream: true }),
      headers: {
        authorization: `Bearer ${provider.bearerToken}`,
        'content-type': 'application/json',
      },
    });
    expect(wrongModel.status).toBe(403);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ model: 'meta/spark', stream: true, input: 'hello' }),
      headers: {
        authorization: `Bearer ${provider.bearerToken}`,
        'content-type': 'application/json',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toContain('response.completed');
    expect(forwardModelRequest).toHaveBeenCalledTimes(1);
    expect(forwardModelRequest.mock.calls[0]?.[0]).toBe('responses');
    expect(forwardModelRequest.mock.calls[0]?.[3]).toEqual({
      harnessId: 'codex_app_server',
    });
  });

  it('rejects a capability request for an unsafe harness id', async () => {
    const proxy = new HostedModelProxy({
      forwardModelRequest: vi.fn(async () => new Response('unexpected')),
    });
    proxies.push(proxy);
    await expect(proxy.issue('meta/spark', 'Codex App Server')).rejects.toThrow(
      'Harness id is invalid.',
    );
  });

  it('serves Anthropic and Chat Completions clients with the same model-scoped capability', async () => {
    const forwardModelRequest = vi.fn(
      async (route: ModelApiRoute) => new Response(`relayed ${route}`, { status: 200 }),
    );
    const proxy = new HostedModelProxy({ forwardModelRequest });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark', 'claude_code');
    const body = JSON.stringify({ model: 'meta/spark', stream: true, messages: [] });

    // Anthropic SDKs send x-api-key and may append a query string.
    const messages = await fetch(`${provider.baseUrl}/messages?beta=true`, {
      method: 'POST',
      headers: { 'x-api-key': provider.bearerToken, 'content-type': 'application/json' },
      body,
    });
    expect(await messages.text()).toBe('relayed messages');
    const chat = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${provider.bearerToken}` },
      body,
    });
    expect(await chat.text()).toBe('relayed chat/completions');
    expect(forwardModelRequest.mock.calls.map(([route]) => route)).toEqual([
      'messages',
      'chat/completions',
    ]);
    const wrongKey = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'not-the-capability' },
      body,
    });
    expect(wrongKey.status).toBe(401);
  });

  it('limits a proxy to the routes it was built for', async () => {
    const proxy = new HostedModelProxy(
      { forwardModelRequest: vi.fn(async () => new Response('unexpected')) },
      { id: 'sia_byok', name: 'Your API key' },
      ['responses'],
    );
    proxies.push(proxy);
    const provider = await proxy.issue('lab/spark', 'codex_app_server');
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': provider.bearerToken },
      body: JSON.stringify({ model: 'lab/spark' }),
    });
    expect(response.status).toBe(404);
  });

  it('exposes no other route and bounds request bodies', async () => {
    const proxy = new HostedModelProxy({
      forwardModelRequest: vi.fn(async () => new Response('unexpected')),
    });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark', 'codex_app_server');
    const headers = { authorization: `Bearer ${provider.bearerToken}` };

    const unknown = await fetch(`${provider.baseUrl}/models`, { method: 'POST', headers });
    expect(unknown.status).toBe(404);

    const oversized = await fetch(`${provider.baseUrl}/responses`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'meta/spark', input: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(oversized.status).toBe(413);
  });
});
