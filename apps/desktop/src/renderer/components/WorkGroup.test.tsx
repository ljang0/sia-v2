// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent, ThreadEvent } from '../types';
import { ActivityRow } from './ActivityRow';
import { conversationBlocks } from './Conversation';
import { elapsed, WorkGroup, WorkingStatus } from './WorkGroup';

afterEach(cleanup);

const step = (id: string, overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id,
  type: 'activity',
  kind: 'command',
  title: 'ls',
  status: 'complete',
  timestamp: '2026-09-28T10:00:05.000Z',
  presentation: { kind: 'command', command: `ls ${id}` },
  ...overrides,
});

describe('work groups', () => {
  it('groups consecutive steps and leaves messages alone', () => {
    const events: ThreadEvent[] = [
      {
        id: 'u',
        type: 'message',
        role: 'user',
        content: 'Tidy',
        timestamp: 't',
      } as ThreadEvent,
      step('a'),
      step('b'),
      {
        id: 'r',
        type: 'message',
        role: 'assistant',
        content: 'Done',
        timestamp: 't',
      } as ThreadEvent,
      step('c'),
    ];
    expect(
      conversationBlocks(events).map((block) =>
        block.kind === 'work' ? block.events.map(({ id }) => id).join('+') : block.event.id,
      ),
    ).toEqual(['u', 'a+b', 'r', 'c']);
  });

  it('folds a finished run into one line and opens it on request', () => {
    let open = false;
    const props = {
      events: [step('a'), step('b'), step('c', { status: 'error' })],
      live: false,
      startedAt: '2026-09-28T10:00:00.000Z',
      endedAt: '2026-09-28T10:01:12.000Z',
      onToggle: () => {
        open = !open;
      },
      renderStep: (event: ActivityEvent) => <ActivityRow key={event.id} event={event} />,
    };
    const { rerender } = render(<WorkGroup {...props} open={open} />);
    const summary = screen.getByRole('button', { name: /Worked for 1m 12s · 3 steps/ });
    expect(summary.textContent).toContain('1 step had a problem');
    expect(screen.queryByText('ls a')).toBeNull();
    fireEvent.click(summary);
    rerender(<WorkGroup {...props} open={open} />);
    expect(screen.getByText('ls a')).toBeTruthy();
  });

  it('keeps steps of the running turn visible', () => {
    render(
      <WorkGroup
        events={[step('a'), step('b', { status: 'running' })]}
        live
        open={false}
        onToggle={() => undefined}
        renderStep={(event) => <ActivityRow key={event.id} event={event} />}
      />,
    );
    expect(screen.getByText('ls a')).toBeTruthy();
    expect(screen.getByText('Running a command')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Worked for/ })).toBeNull();
  });

  it('shows what Sia is doing now', () => {
    render(<WorkingStatus step={step('a', { status: 'running' })} writing={false} />);
    expect(screen.getByRole('status').textContent).toContain('Working');
    cleanup();
    render(<WorkingStatus writing={false} />);
    expect(screen.getByRole('status').textContent).toContain('Thinking');
  });

  it('formats elapsed time', () => {
    expect(elapsed('2026-09-28T10:00:00Z', '2026-09-28T10:00:09Z')).toBe('9s');
    expect(elapsed('2026-09-28T10:00:00Z', '2026-09-28T11:05:00Z')).toBe('1h 5m');
    expect(elapsed('2026-09-28T10:00:09Z', '2026-09-28T10:00:00Z')).toBe('');
  });

  it('reads a failed step as finished, not still running', () => {
    render(<ActivityRow event={step('failed', { status: 'error' })} />);
    expect(screen.getByText('Ran a command')).toBeTruthy();
    expect(screen.queryByText('Running a command')).toBeNull();
  });
});
