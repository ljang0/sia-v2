import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OpenAiCompatibleMetaProvider } from '../src/aws.js';
import type { MetaConfig } from '../src/ports.js';

const config: MetaConfig = {
  apiKey: 'meta-secret-never-returned',
  endpoint: 'https://api.ai.meta.test/v1',
  model: 'super_nova_ext',
  enabled: true,
  sessionHeader: 'x-session-id',
  allowedModels: ['super_nova_ext'],
};

describe('OpenAI-compatible Meta adapter', () => {
  it('authenticates the models endpoint and intersects it with the release allowlist', async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; init: RequestInit | undefined } | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      request = { url: String(input), init };
      return Response.json({
        data: [{ id: 'playground-only' }, { id: 'super_nova_ext' }],
      });
    }) as typeof fetch;

    try {
      const capabilities = await new OpenAiCompatibleMetaProvider().capabilities(config);

      assert.deepEqual(capabilities, {
        models: ['super_nova_ext'],
        streaming: true,
        tools: true,
      });
      assert.equal(request?.url, 'https://api.ai.meta.test/v1/models');
      assert.equal(
        (request?.init?.headers as Record<string, string>).authorization,
        'Bearer meta-secret-never-returned',
      );
      assert.match(
        (request?.init?.headers as Record<string, string>)['x-session-id'] ?? '',
        /^[0-9a-f-]{36}$/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('streams chat completions without imposing an artificial token budget', async () => {
    const originalFetch = globalThis.fetch;
    let submitted: Record<string, unknown> | undefined;
    let submittedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      submittedHeaders = init?.headers as Record<string, string>;
      return new Response(
        [
          'data: {"choices":[{"delta":{"content":"META_OK"},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }) as typeof fetch;

    try {
      const events = [];
      for await (const event of new OpenAiCompatibleMetaProvider().stream(config, {
        turnId: 'turn-1',
        sessionId: 'session-1',
        model: 'super_nova_ext',
        messages: [{ role: 'user', content: 'hello' }],
      })) {
        events.push(event);
      }

      assert.equal(submitted?.model, 'super_nova_ext');
      assert.equal(submitted?.stream, true);
      assert.equal('max_tokens' in (submitted ?? {}), false);
      assert.equal('max_completion_tokens' in (submitted ?? {}), false);
      assert.equal(submittedHeaders?.['x-session-id'], 'session-1');
      assert.deepEqual(
        events.map(({ type }) => type),
        ['started', 'delta', 'done'],
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
