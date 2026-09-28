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

  it('keeps a pending approval cancellable and prevents an invalid text reply', () => {
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
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
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
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('Review the pending approval or stop this turn');
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
    expect(scrollTo).toHaveBeenCalledWith({ top: 1_000, behavior: 'auto' });
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
