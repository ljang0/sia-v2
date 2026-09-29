// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { demoSnapshot } from '../demo';
import type { ThreadDetail } from '../types';
import { Composer } from './Composer';
import { RoomHeader } from './RoomHeader';
import { WorkingStatus } from './WorkGroup';

afterEach(cleanup);

function runningThread(events: ThreadDetail['events']): ThreadDetail {
  return { ...structuredClone(demoSnapshot.activeThread!), status: 'running', events };
}

const user = {
  id: 'user-1',
  type: 'message',
  role: 'user',
  content: 'Summarize my week',
  timestamp: '2026-09-29T10:00:00.000Z',
} as const;

describe('RoomHeader', () => {
  it('uses the same working words as the live status line', () => {
    const agent = demoSnapshot.agents[0]!;
    const { rerender } = render(
      <RoomHeader agent={agent} thread={runningThread([user])} controls={null} />,
    );
    render(<WorkingStatus writing={false} />);
    expect(screen.getByText(`${agent.name} · Thinking`)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Thinking');

    rerender(
      <RoomHeader
        agent={agent}
        thread={runningThread([
          user,
          {
            id: 'reply-1',
            type: 'message',
            role: 'assistant',
            content: 'Here is',
            timestamp: '2026-09-29T10:00:02.000Z',
          },
        ])}
        controls={null}
      />,
    );
    expect(screen.getByText(`${agent.name} · Writing the reply`)).toBeTruthy();
  });

  it('calls a queued thread Queued, like the sidebar and the composer', () => {
    const agent = demoSnapshot.agents[0]!;
    render(
      <RoomHeader
        agent={agent}
        thread={{ ...runningThread([user]), status: 'queued' }}
        controls={null}
      />,
    );
    expect(screen.getByText(`${agent.name} · Queued`)).toBeTruthy();
    render(
      <Composer
        queued
        presence="working"
        executionLabel="Included with Sia"
        onSend={() => undefined}
        onStop={() => undefined}
      />,
    );
    expect(screen.getByText('Queued · Included with Sia')).toBeTruthy();
  });

  it('describes an empty workspace in plain language', () => {
    const { rerender } = render(<RoomHeader controls={null} />);
    expect(screen.getByText('Your conversations')).toBeTruthy();
    rerender(<RoomHeader agent={demoSnapshot.agents[0]} controls={null} />);
    expect(screen.getByText('New conversation')).toBeTruthy();
    rerender(<RoomHeader agent={demoSnapshot.agents[0]} controls={null} setup />);
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText(/· getting set up/)).toBeTruthy();
  });
});
