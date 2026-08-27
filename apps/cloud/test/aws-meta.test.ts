import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OpenAiCompatibleMetaProvider, SecretsManagerProvider } from '../src/aws.js';
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

  it('streams chat completions with the centrally configured output ceiling', async () => {
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
      for await (const event of new OpenAiCompatibleMetaProvider().stream(
        { ...config, maxOutputTokens: 4_096 },
        {
          turnId: 'turn-1',
          sessionId: 'session-1',
          model: 'super_nova_ext',
          messages: [{ role: 'user', content: 'hello' }],
        },
      )) {
        events.push(event);
      }

      assert.equal(submitted?.model, 'super_nova_ext');
      assert.equal(submitted?.stream, true);
      assert.equal(submitted?.max_tokens, 4_096);
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

  it('translates the Responses API into the same bounded Sia stream contract', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let submitted: Record<string, unknown> | undefined;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      requestUrl = String(input);
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        [
          'data: {"type":"response.output_text.delta","delta":"HELLO"}',
          '',
          'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","call_id":"call-1","name":"mail_search","arguments":""}}',
          '',
          'data: {"type":"response.function_call_arguments.delta","output_index":1,"delta":"{\\"query\\":\\"today\\"}"}',
          '',
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":12,"output_tokens":4,"total_tokens":16,"input_tokens_details":{"cached_tokens":3}}}}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }) as typeof fetch;

    try {
      const events = [];
      for await (const event of new OpenAiCompatibleMetaProvider().stream(
        { ...config, apiProtocol: 'openai_responses', maxOutputTokens: 8_192 },
        {
          turnId: 'turn-responses',
          sessionId: 'session-responses',
          model: 'super_nova_ext',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [
            {
              type: 'function',
              function: {
                name: 'mail_search',
                description: 'Search mail',
                parameters: { type: 'object' },
              },
            },
          ],
        },
      )) {
        events.push(event);
      }

      assert.equal(requestUrl, 'https://api.ai.meta.test/v1/responses');
      assert.equal(submitted?.model, 'super_nova_ext');
      assert.equal(submitted?.stream, true);
      assert.equal(submitted?.max_output_tokens, 8_192);
      assert.equal('messages' in (submitted ?? {}), false);
      assert.deepEqual(
        events.map(({ type }) => type),
        ['started', 'delta', 'tool_call_delta', 'tool_call_delta', 'usage', 'done'],
      );
      assert.deepEqual(events.at(-1), { type: 'done', finishReason: 'tool_calls' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('hosted model lab secret configuration', () => {
  it('loads additional labs and custom harness routes without a code change', async () => {
    const secret = {
      apiKey: 'primary-test-key-never-used',
      endpoint: 'https://primary.example/v1',
      model: 'primary/spark',
      allowedModels: ['primary/spark'],
      catalogId: 'primary-lab',
      displayName: 'Primary Lab',
      apiProtocol: 'openai_responses',
      enabled: true,
      additionalLabs: [
        {
          apiKey: 'second-test-key-never-used',
          endpoint: 'https://second.example/v1',
          model: 'second/fast',
          allowedModels: ['second/fast'],
          catalogId: 'second-lab',
          displayName: 'Second Lab',
          apiProtocol: 'openai_responses',
          enabled: true,
          defaultHarnessId: 'second_harness',
          harnessRoutes: [
            {
              model: 'second/fast',
              harnessId: 'second_harness',
              harnessModelId: 'fast-v2',
              apiProtocol: 'openai_responses',
              credentialSource: 'provider_api',
            },
          ],
        },
      ],
    };
    const client = {
      send: async () => ({ SecretString: JSON.stringify(secret) }),
    };
    const provider = new SecretsManagerProvider(
      client as never,
      'meta-secret',
      'voice-secret',
      'composio-secret',
      'google-secret',
      'registration-secret',
    );

    const parsed = await provider.meta();

    assert.equal(parsed.catalogId, 'primary-lab');
    assert.deepEqual(parsed.additionalLabs?.[0]?.harnessRoutes, [
      {
        model: 'second/fast',
        harnessId: 'second_harness',
        harnessModelId: 'fast-v2',
        apiProtocol: 'openai_responses',
        credentialSource: 'provider_api',
      },
    ]);
  });

  it('fails closed when two labs advertise the same canonical model', async () => {
    const client = {
      send: async () => ({
        SecretString: JSON.stringify({
          apiKey: 'primary-test-key-never-used',
          endpoint: 'https://primary.example/v1',
          model: 'shared/model',
          catalogId: 'primary-lab',
          enabled: true,
          additionalLabs: [
            {
              apiKey: 'second-test-key-never-used',
              endpoint: 'https://second.example/v1',
              model: 'shared/model',
              catalogId: 'second-lab',
              enabled: true,
            },
          ],
        }),
      }),
    };
    const provider = new SecretsManagerProvider(
      client as never,
      'meta-secret',
      'voice-secret',
      'composio-secret',
      'google-secret',
      'registration-secret',
    );

    await assert.rejects(provider.meta(), /model ids must be unique across labs/i);
  });
});
