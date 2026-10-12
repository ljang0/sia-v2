import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostedResponsesProxy } from './hosted-responses-proxy.js';

const proxies: HostedResponsesProxy[] = [];

afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.dispose()));
});

describe('HostedResponsesProxy', () => {
  it('revokes an in-progress startup and can issue a fresh capability after reset', async () => {
    const proxy = new HostedResponsesProxy({
      forwardHostedResponses: vi.fn(async () => new Response('fresh')),
    });
    proxies.push(proxy);
    const issued = proxy.issue('meta/spark');
    const settled = issued.then(
      () => 'issued',
      () => 'revoked',
    );
    await proxy.dispose();
    expect(await settled).toBe('revoked');

    const provider = await proxy.issue('meta/spark');
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
    const proxy = new HostedResponsesProxy({
      forwardHostedResponses: vi.fn(async (_body, signal) => {
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
    const provider = await proxy.issue('meta/spark');
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
    const forwardHostedResponses = vi.fn(async (body: string) => {
      expect(JSON.parse(body)).toMatchObject({ model: 'meta/spark', stream: true });
      return new Response('data: {"type":"response.completed"}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });
    const proxy = new HostedResponsesProxy({ forwardHostedResponses });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark');
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
    expect(forwardHostedResponses).toHaveBeenCalledTimes(1);
  });

  it('exposes no route beyond Responses and bounds request bodies', async () => {
    const proxy = new HostedResponsesProxy({
      forwardHostedResponses: vi.fn(async () => new Response('unexpected')),
    });
    proxies.push(proxy);
    const provider = await proxy.issue('meta/spark');
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
