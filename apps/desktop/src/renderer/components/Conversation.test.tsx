// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageEvent, ThreadDetail } from '../types';
import { Conversation } from './Conversation';

afterEach(cleanup);

const baseThread = (overrides: Partial<ThreadDetail>): ThreadDetail => ({
  id: 'thread-1',
  agentId: 'agent-1',
  title: 'Test thread',
  updatedAt: '2026-08-13T00:00:00.000Z',
  status: 'waiting',
  provider: 'codex',
  model: 'gpt-5.6-sol',
  workspace: '/tmp/workspace',
  events: [],
  ...overrides,
});

const renderConversation = (thread: ThreadDetail) => {
  const onSend = vi.fn(async () => undefined);
  const onStop = vi.fn(async () => undefined);
  render(
    <Conversation
      thread={thread}
      onSend={onSend}
      onStop={onStop}
      onRetry={async () => undefined}
      onResolveApproval={async () => undefined}
    />,
  );
  return { onSend, onStop };
};

describe('Conversation waiting controls', () => {
  it('shows an explained task failure once and keeps the continue control', () => {
    const explanation = 'The browser needs a fresh window snapshot.';
    renderConversation(
      baseThread({
        status: 'error',
        error: explanation,
        events: [
          {
            id: 'failure',
            type: 'message',
            role: 'assistant',
            content: explanation,
            timestamp: '2026-08-13T00:00:00.000Z',
          },
          {
            id: 'notice',
            type: 'notice',
            tone: 'error',
            title: 'Task needs attention',
            detail: explanation,
          },
        ],
      }),
    );
    expect(screen.getAllByText(explanation)).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).toContain('Task needs attention');
    expect(screen.getByRole('button', { name: 'Continue task' })).toBeTruthy();
  });

  it('preserves a distinct failure reason after an earlier response', () => {
    renderConversation(
      baseThread({
        status: 'error',
        error: 'Connection lost.',
        events: [
          {
            id: 'earlier',
            type: 'message',
            role: 'assistant',
            content: 'Checking the window.',
            timestamp: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(screen.getByRole('alert').textContent).toContain('Connection lost.');
  });

  it('copies a message without changing the transcript', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderConversation(
      baseThread({
        status: 'idle',
        events: [
          {
            id: 'reply-copy',
            type: 'message',
            role: 'assistant',
            content: 'Copy this exact reply.',
            timestamp: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Copy this exact reply.'));
    expect(screen.getByRole('button', { name: 'Message copied' })).toBeTruthy();
  });

  it('keeps a pending approval cancellable and treats text as a follow-up', () => {
    const { onStop } = renderConversation(
      baseThread({
        events: [
          {
            id: 'approval-1',
            type: 'approval',
            status: 'pending',
            timestamp: '2026-08-13T00:00:00.000Z',
            request: {
              id: 'approval-1',
              kind: 'action',
              title: 'Click Send',
              category: 'Browser',
              summary: 'Click the reviewed control',
              target: 'Send button',
              reversible: false,
            },
          },
        ],
      }),
    );

    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).disabled,
    ).toBe(false);
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Queue follow-up message' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stop current turn' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('allows answering or cancelling a real provider question', () => {
    const { onSend, onStop } = renderConversation(
      baseThread({
        events: [
          {
            id: 'question-1',
            type: 'question',
            prompt: 'Which branch should I use?',
            status: 'pending',
            timestamp: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    );

    const input = screen.getByRole('textbox', { name: 'Message' });
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: 'Use main.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onSend).toHaveBeenCalledWith('Use main.', []);
    fireEvent.click(screen.getByRole('button', { name: 'Stop current turn' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('names the agent on replies and questions and keeps typed line breaks', () => {
    render(
      <Conversation
        agentName="Research partner"
        thread={baseThread({
          events: [
            {
              id: 'user-1',
              type: 'message',
              role: 'user',
              content: 'Plan my trip:\n- Friday\n- Sunday',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
            {
              id: 'reply-1',
              type: 'message',
              role: 'assistant',
              content: 'Which seat?',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
            {
              id: 'question-1',
              type: 'question',
              prompt: 'Do you prefer an **aisle** seat?',
              status: 'pending',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
          ],
        })}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    expect(screen.getByText('Research partner has a question')).toBeTruthy();
    expect(screen.queryByText('Provider needs input')).toBeNull();
    expect(screen.getByText('aisle').tagName).toBe('STRONG');
    expect(
      document.querySelector('[data-message-role="assistant"] header span')?.textContent,
    ).toBe('Research partner');
    expect(document.querySelector('[data-message-role="user"] p')?.textContent).toBe(
      'Plan my trip:\n- Friday\n- Sunday',
    );
  });

  it('ignores an answered-turn question once the thread is no longer waiting', () => {
    renderConversation(
      baseThread({
        status: 'idle',
        events: [
          {
            id: 'stale-question',
            type: 'question',
            prompt: 'Old prompt',
            status: 'pending',
            timestamp: '2026-08-13T00:00:00.000Z',
          },
        ],
      }),
    );

    expect(screen.getByRole('textbox', { name: 'Message' }).getAttribute('placeholder')).toBe(
      'Ask Sia to continue',
    );
  });

  it('prioritizes a real pending approval over a stale question', () => {
    renderConversation(
      baseThread({
        events: [
          {
            id: 'stale-question',
            type: 'question',
            prompt: 'Old prompt',
            status: 'pending',
            timestamp: '2026-08-13T00:00:00.000Z',
          },
          {
            id: 'approval-1',
            type: 'approval',
            status: 'pending',
            timestamp: '2026-08-13T00:01:00.000Z',
            request: {
              id: 'approval-1',
              kind: 'action',
              title: 'Click Send',
              category: 'Browser',
              summary: 'Click the reviewed control',
              target: 'Send button',
              reversible: false,
            },
          },
        ],
      }),
    );

    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('Add a follow-up — Sia will pick it up after the approval');
  });

  it('keeps the composer open while an approval waits, and queues what is sent', async () => {
    const { onSend } = renderConversation(
      baseThread({
        status: 'waiting',
        events: [
          {
            id: 'approval-1',
            type: 'approval',
            status: 'pending',
            timestamp: '2026-08-13T00:01:00.000Z',
            request: {
              id: 'approval-1',
              kind: 'action',
              title: 'Click Send',
              category: 'Browser',
              summary: 'Click the reviewed control',
              target: 'Send button',
              reversible: false,
            },
          },
        ],
      }),
    );
    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Also check the calendar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue follow-up message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Also check the calendar', []));
  });

  it('keeps a typed message when sending fails', async () => {
    const onSend = vi.fn(async () => {
      throw new Error('Provider unavailable');
    });
    render(
      <Conversation
        thread={baseThread({ status: 'idle' })}
        onSend={onSend}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Do not lose this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce());
    expect(input.value).toBe('Do not lose this draft');
  });

  it('restores a persisted draft and flushes edits when switching threads', () => {
    const onDraftChange = vi.fn();
    const view = render(
      <Conversation
        thread={baseThread({ status: 'idle', draft: 'A thought worth keeping' })}
        onDraftChange={onDraftChange}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(input.value).toBe('A thought worth keeping');

    fireEvent.change(input, { target: { value: 'A revised thought' } });
    view.unmount();
    expect(onDraftChange).toHaveBeenCalledWith('A revised thought');
  });

  it('allows a new message after a turn error', () => {
    renderConversation(
      baseThread({
        status: 'error',
        error: 'Provider failed.',
      }),
    );

    expect(
      (screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).disabled,
    ).toBe(false);
  });

  it('follows streaming output only while the reader is near the latest content', () => {
    const first = baseThread({
      status: 'running',
      events: [
        {
          id: 'streaming-message',
          type: 'message',
          role: 'assistant',
          content: 'First chunk',
          timestamp: '2026-08-13T00:00:00.000Z',
        },
      ],
    });
    const props = {
      onSend: async () => undefined,
      onStop: async () => undefined,
      onRetry: async () => undefined,
      onResolveApproval: async () => undefined,
    };
    const streamingMessage = first.events[0] as MessageEvent;
    const view = render(<Conversation thread={first} {...props} />);
    const scroller = screen.getByLabelText('Conversation') as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 100, writable: true },
      scrollTo: { configurable: true, value: scrollTo },
    });

    fireEvent.scroll(scroller);
    expect(screen.getByRole('button', { name: 'Jump to latest' })).toBeTruthy();

    view.rerender(
      <Conversation
        thread={{
          ...first,
          events: [{ ...streamingMessage, content: 'First chunk, still streaming' }],
        }}
        {...props}
      />,
    );
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_000, behavior: 'smooth' });

    scroller.scrollTop = 600;
    fireEvent.scroll(scroller);
    scrollTo.mockClear();
    view.rerender(
      <Conversation
        thread={{
          ...first,
          events: [{ ...streamingMessage, content: 'Another streaming chunk' }],
        }}
        {...props}
      />,
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: 'instant' });
  });

  it('brings a new question into view once and names it on Jump to latest', () => {
    const reply: MessageEvent = {
      id: 'reply',
      type: 'message',
      role: 'assistant',
      content: 'Checking your calendars.',
      timestamp: '2026-08-13T00:00:00.000Z',
    };
    const running = baseThread({ status: 'running', events: [reply] });
    const props = {
      onSend: async () => undefined,
      onStop: async () => undefined,
      onRetry: async () => undefined,
      onResolveApproval: async () => undefined,
    };
    const view = render(<Conversation thread={running} {...props} />);
    const scroller = screen.getByLabelText('Conversation') as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 100, writable: true },
      scrollTo: { configurable: true, value: scrollTo },
    });
    // The reader scrolled up to read; a question then arrives below.
    fireEvent.scroll(scroller);
    const question = {
      id: 'question',
      type: 'question' as const,
      prompt: 'Which calendar should I use?',
      status: 'pending' as const,
      timestamp: '2026-08-13T00:01:00.000Z',
    };
    const waiting = { ...running, status: 'waiting' as const, events: [reply, question] };
    view.rerender(<Conversation thread={waiting} {...props} />);
    expect(scrollTo).toHaveBeenCalledOnce();

    // Scrolling back up to read is respected: the same question does not pull again.
    fireEvent.scroll(scroller);
    view.rerender(<Conversation thread={{ ...waiting, title: 'Renamed' }} {...props} />);
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: '1 question waiting' })).toBeTruthy();
  });

  it('follows the new turn after a send, even if the welcome screen was scrolled', () => {
    const props = {
      onSend: async () => undefined,
      onStop: async () => undefined,
      onRetry: async () => undefined,
      onResolveApproval: async () => undefined,
    };
    const empty = baseThread({ status: 'idle', events: [] });
    const view = render(<Conversation thread={empty} {...props} />);
    const scroller = screen.getByLabelText('Conversation') as HTMLDivElement;
    const scrollTo = vi.fn();
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 700 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 0, writable: true },
      scrollTo: { configurable: true, value: scrollTo },
    });
    // The tall welcome screen was scrolled away from its bottom before the first send.
    fireEvent.scroll(scroller);
    scrollTo.mockClear();

    view.rerender(
      <Conversation
        thread={{
          ...empty,
          status: 'running',
          events: [
            {
              id: 'first-request',
              type: 'message',
              role: 'user',
              content: 'Plan a trip',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
          ],
        }}
        {...props}
      />,
    );
    expect(scrollTo).toHaveBeenCalledWith({ top: 700, behavior: 'instant' });
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
  });

  it('does not mark an earlier reply as streaming before the new reply begins', () => {
    const { container } = render(
      <Conversation
        thread={baseThread({
          status: 'running',
          events: [
            {
              id: 'old-reply',
              type: 'message',
              role: 'assistant',
              content: 'Earlier answer.',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
            {
              id: 'new-request',
              type: 'message',
              role: 'user',
              content: 'New task.',
              timestamp: '2026-08-13T00:01:00.000Z',
            },
          ],
        })}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );

    expect(container.querySelector('[data-streaming="true"]')).toBeNull();
  });

  it('keeps a reply in one frame while it streams, finishes, and is followed up', () => {
    const reply: MessageEvent = {
      id: 'reply-1',
      type: 'message',
      role: 'assistant',
      content: 'Here is the first part',
      timestamp: '2026-08-13T00:00:00.000Z',
    };
    const request: MessageEvent = {
      id: 'request-1',
      type: 'message',
      role: 'user',
      content: 'Find my urgent emails.',
      timestamp: '2026-08-13T00:00:00.000Z',
    };
    const props = {
      onSend: async () => undefined,
      onStop: async () => undefined,
      onRetry: async () => undefined,
      onResolveApproval: async () => undefined,
    };
    const streaming = baseThread({ status: 'running', events: [request, reply] });
    const view = render(<Conversation thread={streaming} {...props} />);
    const article = view.container.querySelector('[data-message-role="assistant"]');
    const frame = article?.parentElement;
    expect(screen.queryByRole('region', { name: 'Task result' })).toBeNull();

    view.rerender(
      <Conversation
        thread={{
          ...streaming,
          status: 'idle',
          events: [request, { ...reply, content: 'Done.' }],
        }}
        {...props}
      />,
    );
    const result = screen.getByRole('region', { name: 'Task result' });
    // The same nodes stay mounted: the reply is not re-wrapped, so it cannot jump.
    expect(result).toBe(frame);
    expect(view.container.querySelector('[data-message-role="assistant"]')).toBe(article);
    expect(result.textContent).toContain('Reply ready');

    view.rerender(
      <Conversation
        thread={{
          ...streaming,
          status: 'running',
          events: [
            request,
            { ...reply, content: 'Done.' },
            { ...request, id: 'request-2', content: 'Thanks, now archive them.' },
          ],
        }}
        {...props}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Task result' })).toBeNull();
    expect(view.container.querySelector('[data-message-role="assistant"]')).toBe(article);
    expect(article?.parentElement).toBe(frame);
  });

  it('moves the compact presence from working to a brief completed state', async () => {
    const thread = baseThread({
      status: 'running',
      events: [
        {
          id: 'reply-1',
          type: 'message',
          role: 'assistant',
          content: 'Finishing the task.',
          timestamp: '2026-08-13T00:00:00.000Z',
        },
      ],
    });
    const props = {
      onSend: async () => undefined,
      onStop: async () => undefined,
      onRetry: async () => undefined,
      onResolveApproval: async () => undefined,
    };
    const view = render(<Conversation thread={thread} {...props} />);

    expect(view.container.querySelector('[data-state="working"]')).toBeTruthy();
    view.rerender(<Conversation thread={{ ...thread, status: 'idle' }} {...props} />);

    await waitFor(() => {
      expect(view.container.querySelector('[data-state="complete"]')).toBeTruthy();
      expect(view.container.querySelector('[data-completed="true"]')).toBeTruthy();
    });
  });

  it('ends voice conversation while a spoken reply is still loading', async () => {
    const onSpeak = vi.fn(
      async () =>
        await new Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }>(() => undefined),
    );
    const onAcquireVoiceCapture = vi.fn(async () => 'lease');
    const props = {
      voiceEnabled: true,
      onSpeak,
      onAcquireVoiceCapture,
      onTranscribeVoice: vi.fn(async () => 'voice request'),
      onSend: vi.fn(async () => undefined),
      onStop: vi.fn(async () => undefined),
      onRetry: vi.fn(async () => undefined),
      onResolveApproval: vi.fn(async () => undefined),
    };
    const thread = baseThread({ status: 'running' });
    const view = render(<Conversation thread={thread} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start voice conversation' }));
    view.rerender(
      <Conversation
        thread={{
          ...thread,
          status: 'idle',
          events: [
            {
              id: 'spoken-reply',
              type: 'message',
              role: 'assistant',
              content: 'Finished your request.',
              timestamp: '2026-09-23T00:00:00.000Z',
            },
          ],
        }}
        {...props}
      />,
    );
    await waitFor(() => expect(onSpeak).toHaveBeenCalledWith('Finished your request.'));
    fireEvent.click(screen.getByRole('button', { name: 'End voice conversation' }));
    expect(screen.getByRole('button', { name: 'Start voice conversation' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel read aloud' })).toBeNull();
    expect(onAcquireVoiceCapture).not.toHaveBeenCalled();
  });

  it('keeps only one read-aloud request active across replies', async () => {
    const onSpeak = vi.fn(
      async () =>
        await new Promise<{ audioBase64: string; mimeType: 'audio/mpeg' }>(() => undefined),
    );
    render(
      <Conversation
        thread={baseThread({
          status: 'idle',
          events: [
            {
              id: 'reply-1',
              type: 'message',
              role: 'assistant',
              content: 'First reply.',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
            {
              id: 'reply-2',
              type: 'message',
              role: 'assistant',
              content: 'Second reply.',
              timestamp: '2026-08-13T00:01:00.000Z',
            },
          ],
        })}
        voiceEnabled
        onSpeak={onSpeak}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: 'Read reply aloud' });
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(onSpeak).toHaveBeenCalledWith('First reply.'));
    expect(screen.getByRole('button', { name: 'Cancel read aloud' })).toBeTruthy();

    fireEvent.click(screen.getAllByTestId('message-read-aloud')[1]!);
    await waitFor(() => expect(onSpeak).toHaveBeenCalledWith('Second reply.'));
    expect(screen.getAllByRole('button', { name: 'Read reply aloud' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel read aloud' })).toBeTruthy();
  });
});

describe('Conversation continuity tools', () => {
  it('starts an empty thread from a contextual prompt', () => {
    const onSend = vi.fn(async () => undefined);
    render(
      <Conversation
        thread={baseThread({ status: 'idle', events: [] })}
        starterPrompts={['Review the release blockers.']}
        onSend={onSend}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Review the release blockers/ }));
    expect(onSend).toHaveBeenCalledWith('Review the release blockers.');
  });

  it('finds matching events inside the open thread', () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    render(
      <Conversation
        thread={baseThread({
          status: 'idle',
          events: [
            {
              id: 'one',
              type: 'message',
              role: 'assistant',
              content: 'The release gate is green.',
              timestamp: '2026-08-13T00:00:00.000Z',
            },
            {
              id: 'two',
              type: 'message',
              role: 'assistant',
              content: 'The design audit is complete.',
              timestamp: '2026-08-13T00:01:00.000Z',
            },
          ],
        })}
        findOpen
        onFindOpenChange={() => undefined}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find in this thread' }), {
      target: { value: 'release gate' },
    });
    expect(screen.getByText('1 found')).toBeTruthy();
  });
});

describe('Conversation follow-ups while running', () => {
  const queuedMessage: MessageEvent = {
    id: 'queued-1',
    type: 'message',
    role: 'user',
    content: 'Also add the dates',
    timestamp: '2026-09-28T00:00:00.000Z',
  };

  it('accepts a follow-up while the turn runs and keeps Stop visible', async () => {
    const { onSend } = renderConversation(baseThread({ status: 'running' }));
    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(input.placeholder).toBe('Add a follow-up — Sia will pick it up next');
    expect(screen.getByRole('button', { name: 'Stop current turn' })).toBeTruthy();

    fireEvent.change(input, { target: { value: 'Also add the dates' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('Also add the dates', []));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('accepts a follow-up while a stopped turn winds down', () => {
    renderConversation(
      baseThread({ status: 'queued', queueReason: 'Finishing the stopped task.' }),
    );
    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Queue follow-up message' })).toBeTruthy();
    expect(screen.getByText('Finishing the stopped task.')).toBeTruthy();
  });

  it('shows queued follow-ups apart from the transcript and removes one', async () => {
    const onRemoveQueued = vi.fn(async () => undefined);
    render(
      <Conversation
        thread={baseThread({
          status: 'running',
          events: [
            {
              id: 'first',
              type: 'message',
              role: 'user',
              content: 'Draft the plan',
              timestamp: '2026-09-28T00:00:00.000Z',
            },
          ],
          queuedMessages: [queuedMessage],
        })}
        onSend={vi.fn(async () => undefined)}
        onStop={vi.fn(async () => undefined)}
        onRemoveQueued={onRemoveQueued}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    const queue = screen.getByRole('region', { name: 'Queued messages' });
    expect(queue.textContent).toContain('Queued · Sia will pick this up next');
    expect(queue.textContent).toContain('Also add the dates');
    expect(screen.getAllByText('Also add the dates')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remove queued message' }));
    await waitFor(() => expect(onRemoveQueued).toHaveBeenCalledWith('queued-1'));
  });

  it('offers Send now on a queued message only while the task runs', async () => {
    const onSendQueuedNow = vi.fn(async () => undefined);
    const view = (status: 'running' | 'queued') => (
      <Conversation
        thread={baseThread({ status, queuedMessages: [queuedMessage] })}
        onSend={vi.fn(async () => undefined)}
        onStop={vi.fn(async () => undefined)}
        onSendQueuedNow={onSendQueuedNow}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />
    );
    const { rerender } = render(view('running'));
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(onSendQueuedNow).toHaveBeenCalledWith('queued-1'));
    rerender(view('queued'));
    expect(screen.queryByRole('button', { name: 'Send now' })).toBeNull();
  });
});
