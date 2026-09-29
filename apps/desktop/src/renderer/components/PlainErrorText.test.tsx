// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ThreadDetail } from '../types';
import { Conversation } from './Conversation';

afterEach(cleanup);

const raw = 'stream disconnected before completion: error sending request for url';

function thread(): ThreadDetail {
  return {
    id: 'thread-1',
    agentId: 'agent-1',
    title: 'Test thread',
    updatedAt: '2026-08-13T00:00:00.000Z',
    status: 'error',
    error: raw,
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/workspace',
    events: [
      {
        id: 'notice',
        type: 'notice',
        tone: 'error',
        title: 'Task stopped',
        detail: raw,
      },
    ],
  };
}

describe('plain failure messages', () => {
  it('explains a dropped connection once, plainly, with the original text under Details', () => {
    render(
      <Conversation
        thread={thread()}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    expect(screen.getByText('Connection problem')).toBeTruthy();
    expect(
      screen.getAllByText(
        'Sia couldn’t reach the internet. Check your connection, then try again.',
      ),
    ).toHaveLength(1);
    const details = screen.getAllByText('Details');
    expect(details).toHaveLength(1);
    expect(details[0]!.closest('details')?.textContent).toContain(raw);
    expect(screen.getByRole('button', { name: /Continue task/ })).toBeTruthy();
  });
});

describe('plain failure banner', () => {
  it('explains a failure that has no conversation notice', () => {
    render(
      <Conversation
        thread={{ ...thread(), error: '429 Too Many Requests', events: [] }}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    expect(screen.getByText(/usage limit has been reached/)).toBeTruthy();
    expect(screen.getByText('429 Too Many Requests').closest('details')).toBeTruthy();
  });
});

describe('interrupted task banner', () => {
  it('keeps the reason beside Continue task and shows it once', () => {
    const reason =
      'The task was interrupted when Sia closed. Completed work is preserved, and it is safe to retry.';
    render(
      <Conversation
        thread={{
          ...thread(),
          error: reason,
          events: [
            {
              id: 'interrupted',
              type: 'notice',
              tone: 'error',
              title: 'Task was interrupted',
              detail: reason,
            },
          ],
        }}
        onSend={async () => undefined}
        onStop={async () => undefined}
        onRetry={async () => undefined}
        onResolveApproval={async () => undefined}
      />,
    );
    const banner = screen.getByTestId('interrupted-turn-banner');
    expect(banner.querySelector('span')?.textContent).toBe(reason);
    expect(screen.getAllByText(reason)).toHaveLength(1);
    expect(screen.getByText('Task was interrupted')).toBeTruthy();
  });
});
