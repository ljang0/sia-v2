// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadDetail } from '../types';
import { Conversation } from './Conversation';
import { AppErrorBoundary, RowErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);
beforeEach(() => {
  // React and the boundaries log caught render errors; keep test output readable.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return () => vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error('render failed');
}

describe('error boundaries', () => {
  it('replaces a crashed window with a plain message and Reload', () => {
    const reload = vi.fn();
    render(
      <AppErrorBoundary onReload={reload}>
        <Broken />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('keeps one broken row from taking the others with it, and retries when it changes', () => {
    const view = render(
      <>
        <RowErrorBoundary resetKey="first">
          <Broken />
        </RowErrorBoundary>
        <p>Neighbour row</p>
      </>,
    );
    expect(screen.getByText('This message couldn’t be shown')).toBeTruthy();
    expect(screen.getByText('Neighbour row')).toBeTruthy();
    view.rerender(
      <>
        <RowErrorBoundary resetKey="second">
          <p>Fixed row</p>
        </RowErrorBoundary>
        <p>Neighbour row</p>
      </>,
    );
    expect(screen.getByText('Fixed row')).toBeTruthy();
  });

  it('shows a conversation whose reply arrived without a body', () => {
    const thread: ThreadDetail = {
      id: 'thread-1',
      agentId: 'agent-1',
      title: 'Test thread',
      updatedAt: '2026-08-13T00:00:00.000Z',
      status: 'error',
      error: 'Provider failed.',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/workspace',
      events: [
        {
          id: 'user',
          type: 'message',
          role: 'user',
          content: 'Summarize my notes',
          timestamp: '2026-08-13T00:00:00.000Z',
        },
        {
          id: 'reply',
          type: 'message',
          role: 'assistant',
          content: null as unknown as string,
          timestamp: '2026-08-13T00:00:01.000Z',
        },
        {
          id: 'notice',
          type: 'notice',
          tone: 'error',
          title: 'Task needs attention',
          detail: 'Provider failed.',
        },
      ],
    };
    render(
      <Conversation
        thread={thread}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    expect(screen.getByText('Summarize my notes')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
  });
});
