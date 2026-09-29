// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ThreadDetail, ThreadEvent } from '../types';

const markdownRenders = vi.hoisted(() => new Map<string, number>());
// An unmemoized stand-in counts how often each transcript row renders its message body.
vi.mock('./SafeMarkdown', () => ({
  SafeMarkdown: ({ content }: { content: string }) => {
    markdownRenders.set(content, (markdownRenders.get(content) ?? 0) + 1);
    return <p>{content}</p>;
  },
}));

import { Conversation } from './Conversation';

afterEach(() => {
  cleanup();
  markdownRenders.clear();
});

function history(turns: number): ThreadEvent[] {
  const events: ThreadEvent[] = [];
  for (let turn = 0; turn < turns; turn += 1) {
    const timestamp = new Date(1_700_000_000_000 + turn * 60_000).toISOString();
    events.push(
      { id: `ask-${turn}`, type: 'message', role: 'user', content: `Ask ${turn}`, timestamp },
      {
        id: `step-${turn}`,
        type: 'activity',
        kind: 'command',
        title: 'Ran a command',
        status: 'complete',
        timestamp,
      },
      {
        id: `reply-${turn}`,
        type: 'message',
        role: 'assistant',
        content: `Reply ${turn}`,
        timestamp,
      },
    );
  }
  return events;
}

const thread = (events: ThreadEvent[]): ThreadDetail => ({
  id: 'thread-1',
  agentId: 'agent-1',
  title: 'Long history',
  updatedAt: '2026-08-13T00:00:00.000Z',
  status: 'running',
  provider: 'codex',
  model: 'gpt-5.6-sol',
  workspace: '/tmp/workspace',
  events,
});

it('re-renders only the streaming reply when earlier rows are unchanged', () => {
  const props = {
    onSend: async () => undefined,
    onStop: async () => undefined,
    onRetry: async () => undefined,
    onResolveApproval: async () => undefined,
  };
  let events = history(30);
  const view = render(<Conversation thread={thread(events)} {...props} />);
  expect(markdownRenders.get('Reply 0')).toBe(1);

  for (const token of [' and', ' more']) {
    const last = events.at(-1)! as Extract<ThreadEvent, { type: 'message' }>;
    events = [...events.slice(0, -1), { ...last, content: last.content + token }];
    view.rerender(<Conversation thread={thread(events)} {...props} />);
  }

  expect(markdownRenders.get('Reply 0')).toBe(1);
  expect(markdownRenders.get('Reply 15')).toBe(1);
  expect(markdownRenders.get('Reply 29 and more')).toBe(1);
  expect(view.container.querySelectorAll('[data-message-role]').length).toBe(60);
});
