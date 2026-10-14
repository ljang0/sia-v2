import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anthropicMessage, anthropicSse, parseAnthropicTurn } from '../src/anthropic-relay.js';
import {
  chatCompletion,
  chatCompletionsSse,
  parseChatCompletionsTurn,
} from '../src/chat-completions-relay.js';
import type { MetaStreamEvent } from '../src/contracts.js';
import { CloudError } from '../src/domain.js';
import { inboundWire, requestHarness, wantsStream } from '../src/inbound-wires.js';

async function* stream(events: MetaStreamEvent[]): AsyncIterable<MetaStreamEvent> {
  yield* events;
}

async function collect(chunks: AsyncIterable<string>): Promise<Array<Record<string, unknown>>> {
  const records: Array<Record<string, unknown>> = [];
  for await (const chunk of chunks) {
    const data = chunk
      .split('\n')
      .find((line) => line.startsWith('data: '))
      ?.slice(6);
    if (data && data !== '[DONE]') records.push(JSON.parse(data) as Record<string, unknown>);
    if (data === '[DONE]') records.push({ done: true });
  }
  return records;
}

/** A turn that writes text, then two interleaved tool calls, as an OpenAI-style lab would. */
const toolTurn: MetaStreamEvent[] = [
  { type: 'started', turnId: 't', sessionId: 's', model: 'sponsor/model' },
  { type: 'delta', text: 'Checking' },
  {
    type: 'tool_call_delta',
    delta: [
      { index: 0, id: 'call_a', function: { name: 'read', arguments: '{"pa' } },
      { index: 1, id: 'call_b', function: { name: 'list', arguments: '{}' } },
    ],
  },
  { type: 'tool_call_delta', delta: [{ index: 0, function: { arguments: 'th":"x"}' } }] },
  { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 } },
  { type: 'done', finishReason: 'tool_calls' },
];

describe('Anthropic Messages inbound relay', () => {
  it('maps system, images, tool use and tool results onto the relay contract', () => {
    const turn = parseAnthropicTurn({
      model: 'sponsor/model',
      system: [{ type: 'text', text: 'Be brief.' }],
      metadata: { user_id: 'claude-session' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is here?' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'hidden' },
            { type: 'text', text: 'Let me look.' },
            { type: 'tool_use', id: 'toolu_1', name: 'read', input: { path: 'x' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'denied', is_error: true },
            { type: 'text', text: 'Try again' },
          ],
        },
      ],
      tools: [{ name: 'read', description: 'Read', input_schema: { type: 'object' } }],
      stream: true,
    });

    assert.equal(turn.model, 'sponsor/model');
    assert.equal(turn.sessionId, 'claude-session');
    assert.deepEqual(turn.messages, [
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'What is here?' },
          { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
        ],
      },
      {
        role: 'assistant',
        content: 'Let me look.',
        tool_calls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'read', arguments: '{"path":"x"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: 'Error: denied' },
      { role: 'user', content: 'Try again' },
    ]);
    assert.deepEqual(turn.tools, [
      {
        type: 'function',
        function: { name: 'read', parameters: { type: 'object' }, description: 'Read' },
      },
    ]);
  });

  it('rejects provider-hosted tools it cannot run', () => {
    assert.throws(
      () =>
        parseAnthropicTurn({
          model: 'm',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        }),
      (error: unknown) =>
        error instanceof CloudError && error.code === 'unsupported_messages_tool',
    );
  });

  it('streams text live and emits each tool call as one whole block', async () => {
    const records = await collect(anthropicSse(stream(toolTurn)));
    assert.deepEqual(
      records.map(({ type }) => type),
      [
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'content_block_start',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop',
      ],
    );
    assert.deepEqual(records[4], {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'call_a', name: 'read', input: {} },
    });
    assert.deepEqual(records[5], {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"path":"x"}' },
    });
    assert.deepEqual(records[10], {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { input_tokens: 12, output_tokens: 4 },
    });
  });

  it('answers a non-streaming request with one Messages object', async () => {
    const message = await anthropicMessage(stream(toolTurn));
    assert.equal(message.stop_reason, 'tool_use');
    assert.deepEqual(message.content, [
      { type: 'text', text: 'Checking' },
      { type: 'tool_use', id: 'call_a', name: 'read', input: { path: 'x' } },
      { type: 'tool_use', id: 'call_b', name: 'list', input: {} },
    ]);
  });
});

describe('Chat Completions inbound relay', () => {
  it('normalizes developer prompts, image parts, tool calls and results', () => {
    const turn = parseChatCompletionsTurn({
      model: 'sponsor/model',
      messages: [
        { role: 'developer', content: 'Be brief.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look' },
            { type: 'image_url', image_url: { url: 'https://example.test/a.png' } },
          ],
        },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'read', arguments: '{}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
      ],
      tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
    });
    assert.deepEqual(turn.messages, [
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Look' },
          { type: 'input_image', image_url: 'https://example.test/a.png' },
        ],
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read', arguments: '{}' } },
        ],
      },
      { role: 'tool', content: 'ok', tool_call_id: 'call_1' },
    ]);
  });

  it('streams chunks, an optional usage chunk and the terminator', async () => {
    const records = await collect(chatCompletionsSse(stream(toolTurn), { includeUsage: true }));
    const choices = records.flatMap((record) =>
      Array.isArray(record.choices) ? (record.choices as Array<Record<string, unknown>>) : [],
    );
    assert.deepEqual(choices[0]?.delta, { role: 'assistant', content: 'Checking' });
    assert.deepEqual(choices[1]?.delta, {
      tool_calls: [
        {
          index: 0,
          id: 'call_a',
          type: 'function',
          function: { name: 'read', arguments: '{"pa' },
        },
        {
          index: 1,
          id: 'call_b',
          type: 'function',
          function: { name: 'list', arguments: '{}' },
        },
      ],
    });
    assert.equal(choices.at(-1)?.finish_reason, 'tool_calls');
    assert.deepEqual(records.at(-2)?.usage, {
      prompt_tokens: 12,
      completion_tokens: 4,
      total_tokens: 16,
    });
    assert.deepEqual(records.at(-1), { done: true });
  });

  it('answers a non-streaming request with one completion object', async () => {
    const completion = await chatCompletion(stream(toolTurn));
    const [choice] = completion.choices as Array<Record<string, unknown>>;
    assert.equal(choice?.finish_reason, 'tool_calls');
    assert.deepEqual((choice?.message as Record<string, unknown>).tool_calls, [
      { id: 'call_a', type: 'function', function: { name: 'read', arguments: '{"path":"x"}' } },
      { id: 'call_b', type: 'function', function: { name: 'list', arguments: '{}' } },
    ]);
  });
});

describe('inbound wire selection', () => {
  it('routes each model API path and attributes the harness', () => {
    const messages = inboundWire('/alpha/v1/messages');
    assert.equal(inboundWire('/v1/responses').defaultHarness, 'codex_app_server');
    assert.equal(messages.defaultHarness, 'claude_code');
    assert.equal(inboundWire('/v1/chat/completions').defaultHarness, 'unknown');
    assert.equal(inboundWire('/v1/meta/turns').defaultHarness, 'sia_direct');
    assert.equal(requestHarness({ 'X-Sia-Harness': 'opencode_acp' }, messages), 'opencode_acp');
    assert.equal(requestHarness({ 'x-sia-harness': 'Not A Harness' }, messages), 'claude_code');
    assert.equal(requestHarness(undefined, messages), 'claude_code');
    assert.equal(wantsStream(messages, { stream: false }), false);
    assert.equal(wantsStream(inboundWire('/v1/responses'), { stream: false }), true);
  });
});
