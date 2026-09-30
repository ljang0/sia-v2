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

it('eases in only rows that arrive after the thread opened', () => {
  const props = {
    onSend: async () => undefined,
    onStop: async () => undefined,
    onRetry: async () => undefined,
    onResolveApproval: async () => undefined,
  };
  const events = history(2);
  const view = render(<Conversation thread={thread(events)} {...props} />);
  expect(view.container.querySelectorAll('[data-entering]').length).toBe(0);

  const next: ThreadEvent[] = [
    ...events,
    {
      id: 'ask-new',
      type: 'message',
      role: 'user',
      content: 'One more thing',
      timestamp: '2026-08-13T00:10:00.000Z',
    },
  ];
  view.rerender(<Conversation thread={thread(next)} {...props} />);
  const entering = view.container.querySelectorAll('[data-entering="true"]');
  expect(entering.length).toBe(1);
  expect(entering[0]!.textContent).toContain('One more thing');

  // Opening the thread again shows its whole history still.
  view.rerender(<Conversation thread={{ ...thread(next), id: 'thread-2' }} {...props} />);
  expect(view.container.querySelectorAll('[data-entering]').length).toBe(0);
});

it('offers copy and read aloud only once a reply is finished', () => {
  const props = {
    onSend: async () => undefined,
    onStop: async () => undefined,
    onRetry: async () => undefined,
    onResolveApproval: async () => undefined,
    voiceEnabled: true,
    onSpeak: async () => ({ audioBase64: '', mimeType: 'audio/wav' as const }),
  };
  const events = history(1);
  const view = render(<Conversation thread={thread(events)} {...props} />);
  const reply = () => view.container.querySelector('[data-message-role="assistant"]')!;
  expect(reply().querySelector('[aria-label="Copy message"]')).toBeNull();
  expect(reply().querySelector('[data-testid="message-read-aloud"]')).toBeNull();

  view.rerender(<Conversation thread={{ ...thread(events), status: 'idle' }} {...props} />);
  expect(reply().querySelector('[aria-label="Copy message"]')).not.toBeNull();
  expect(reply().querySelector('[data-testid="message-read-aloud"]')).not.toBeNull();
});

it('keeps rows memoized while offering Undo changes under finished replies that edited files', () => {
  const edits = (events: ThreadEvent[]) =>
    events.map((event) =>
      event.type === 'activity'
        ? {
            ...event,
            presentation: {
              kind: 'file_change' as const,
              files: [{ path: `/notes/${event.id}.md`, change: 'add', diff: 'hi\n' }],
            },
          }
        : event,
    );
  const props = {
    onSend: async () => undefined,
    onStop: async () => undefined,
    onRetry: async () => undefined,
    onResolveApproval: async () => undefined,
  };
  // App passes a fresh object each render; rows must not notice.
  const turnChanges = () => ({
    read: vi.fn(),
    apply: vi.fn(),
  });
  let events = edits(history(5));
  const view = render(
    <Conversation thread={thread(events)} turnChanges={turnChanges()} {...props} />,
  );
  // The running reply has no Undo yet; the four finished ones do.
  expect(view.getAllByTestId('turn-changes')).toHaveLength(4);

  for (const token of [' and', ' more']) {
    const last = events.at(-1)! as Extract<ThreadEvent, { type: 'message' }>;
    events = [...events.slice(0, -1), { ...last, content: last.content + token }];
    view.rerender(
      <Conversation thread={thread(events)} turnChanges={turnChanges()} {...props} />,
    );
  }
  expect(markdownRenders.get('Reply 0')).toBe(1);
  expect(markdownRenders.get('Reply 4 and more')).toBe(1);

  view.rerender(
    <Conversation
      thread={{ ...thread(events), status: 'idle' }}
      turnChanges={turnChanges()}
      {...props}
    />,
  );
  expect(view.getAllByTestId('turn-changes')).toHaveLength(5);
  expect(view.getAllByTestId('turn-changes-undo')[0]!.hasAttribute('disabled')).toBe(false);
});
