import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MetaStreamEvent } from '../src/contracts.js';
import { CloudError } from '../src/domain.js';
import { parseResponsesTurn, responsesSse } from '../src/responses-relay.js';

describe('Codex Responses relay', () => {
  it('translates messages, prior function calls, results, and tools without accepting provider keys', () => {
    const request = parseResponsesTurn({
      model: 'meta/spark',
      stream: true,
      instructions: 'Be concise.',
      prompt_cache_key: 'thread-1',
      input: [
        { role: 'user', content: [{ type: 'input_text', text: 'Find mail' }] },
        {
          type: 'function_call',
          call_id: 'call-1',
          name: 'mail_search',
          arguments: '{"query":"today"}',
        },
        {
          type: 'function_call_output',
          call_id: 'call-1',
          output: [
            { type: 'input_text', text: '{"matches":2}' },
            { type: 'input_image', image_url: 'data:image/png;base64,cGl4ZWxz' },
          ],
        },
        { type: 'reasoning', summary: [] },
      ],
      tools: [
        {
          type: 'function',
          name: 'mail_search',
          description: 'Search mail',
          parameters: { type: 'object' },
        },
      ],
    });

    assert.equal(request.model, 'meta/spark');
    assert.equal(request.sessionId, 'thread-1');
    assert.equal(request.turnId.length > 0, true);
    assert.deepEqual(request.messages, [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Find mail' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'mail_search', arguments: '{"query":"today"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call-1',
        content: [
          { type: 'input_text', text: '{"matches":2}' },
          { type: 'input_image', image_url: 'data:image/png;base64,cGl4ZWxz' },
        ],
      },
    ]);
    assert.deepEqual(request.tools, [
      {
        type: 'function',
        function: {
          name: 'mail_search',
          description: 'Search mail',
          parameters: { type: 'object' },
        },
      },
    ]);
    assert.equal('api_key' in request, false);
  });

  it('emits text, function calls, usage, completion, and the Responses terminator', async () => {
    async function* source(): AsyncIterable<MetaStreamEvent> {
      yield { type: 'started', turnId: 'turn-1', sessionId: 'session-1', model: 'meta/spark' };
      yield { type: 'delta', text: 'Done' };
      yield {
        type: 'tool_call_delta',
        delta: [
          {
            index: 0,
            id: 'call-1',
            function: { name: 'mail_search', arguments: '{"query":' },
          },
        ],
      };
      yield {
        type: 'tool_call_delta',
        delta: [{ index: 0, function: { arguments: '"today"}' } }],
      };
      yield {
        type: 'usage',
        usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
      };
      yield { type: 'done', finishReason: 'tool_calls' };
    }

    const chunks: string[] = [];
    for await (const chunk of responsesSse(source())) chunks.push(chunk);
    assert.equal(chunks.at(-1), 'data: [DONE]\n\n');
    const events = chunks.slice(0, -1).map(parseEvent);
    assert.deepEqual(
      events.map(({ type }) => type),
      [
        'response.created',
        'response.in_progress',
        'response.output_item.added',
        'response.content_part.added',
        'response.output_text.delta',
        'response.output_item.added',
        'response.function_call_arguments.delta',
        'response.function_call_arguments.delta',
        'response.output_text.done',
        'response.content_part.done',
        'response.output_item.done',
        'response.function_call_arguments.done',
        'response.output_item.done',
        'response.completed',
      ],
    );
    const completed = events.at(-1) as { response: Record<string, unknown> };
    assert.deepEqual(completed.response.usage, {
      input_tokens: 8,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 11,
    });
    const output = completed.response.output as Array<Record<string, unknown>>;
    assert.equal(output[0]?.type, 'message');
    assert.equal(output[1]?.type, 'function_call');
    assert.equal(output[1]?.arguments, '{"query":"today"}');
  });

  it('rejects non-streaming requests and non-function tools', () => {
    assert.throws(
      () => parseResponsesTurn({ model: 'meta/spark', stream: false, input: 'hello' }),
      (error: unknown) =>
        error instanceof CloudError && error.code === 'invalid_responses_request',
    );
    assert.throws(
      () =>
        parseResponsesTurn({
          model: 'meta/spark',
          stream: true,
          input: 'hello',
          tools: [{ type: 'web_search' }],
        }),
      (error: unknown) =>
        error instanceof CloudError && error.code === 'unsupported_responses_tool',
    );
  });
});

function parseEvent(chunk: string): Record<string, unknown> {
  const line = chunk.split('\n').find((candidate) => candidate.startsWith('data: '));
  assert.ok(line);
  return JSON.parse(line.slice('data: '.length)) as Record<string, unknown>;
}
