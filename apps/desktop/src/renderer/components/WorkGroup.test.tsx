// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent, ThreadEvent } from '../types';
import { ActivityRow } from './ActivityRow';
import { conversationBlocks } from './Conversation';
import { elapsed, planProgress, WorkGroup, WorkingStatus } from './WorkGroup';
import activityRow from './ActivityRow.module.css';

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
    cleanup();
    render(<WorkingStatus writing={false} thinking="Checking free slots" />);
    expect(screen.getByRole('status').textContent).toContain('Checking free slots');
    expect(screen.getByRole('status').textContent).not.toContain('Thinking');
  });

  it('formats elapsed time', () => {
    expect(elapsed('2026-09-28T10:00:00Z', '2026-09-28T10:00:09Z')).toBe('9s');
    expect(elapsed('2026-09-28T10:00:00Z', '2026-09-28T11:05:00Z')).toBe('1h 5m');
    expect(elapsed('2026-09-28T10:00:09Z', '2026-09-28T10:00:00Z')).toBe('');
  });

  it('marks a failed step with the danger icon', () => {
    const { container } = render(<ActivityRow event={step('failed', { status: 'error' })} />);
    expect(container.querySelector(`svg.${activityRow.activityErrorIcon}`)).not.toBeNull();
  });
});

describe('file change steps', () => {
  const fileStep = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
    id: 'files',
    type: 'activity',
    kind: 'command',
    title: 'Changed 2 files',
    status: 'complete',
    timestamp: '2026-09-28T10:00:05.000Z',
    presentation: {
      kind: 'file_change',
      files: [
        { path: '/Users/me/notes/new.md', change: 'add', diff: 'one\ntwo\n' },
        {
          path: '/Users/me/draft.md',
          change: 'rename',
          movePath: '/Users/me/final.md',
          diff: '@@ -1,2 +1,2 @@\n-a\n+b\n c\n',
        },
      ],
    },
    ...overrides,
  });

  it('lists each file with a plain change word and line counts', () => {
    render(<ActivityRow event={fileStep()} />);
    fireEvent.click(screen.getByRole('button'));
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items[0]).toContain('/Users/me/notes/new.md');
    expect(items[0]).toContain('Added +2');
    expect(items[1]).toContain('/Users/me/draft.md → /Users/me/final.md');
    expect(items[1]).toContain('Renamed +1 −1');
    expect(screen.queryByText('Preparing file changes…')).toBeNull();
  });

  it('only says it is preparing while the step runs', () => {
    render(
      <ActivityRow event={fileStep({ presentation: { kind: 'file_change', files: [] } })} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('Preparing file changes…')).toBeNull();
  });
});

describe('plan steps', () => {
  const steps = [
    { id: '1', text: 'Find the flights', status: 'completed' as const },
    { id: '2', text: 'Compare prices', status: 'in_progress' as const },
    { id: '3', text: 'Book the best one', status: 'pending' as const },
  ];

  it('marks the step in progress apart from the pending ones', () => {
    render(
      <ActivityRow
        event={step('plan', {
          kind: 'plan',
          toolName: 'plan.update',
          title: 'Plan',
          status: 'running',
          presentation: { kind: 'plan', steps },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    const current = screen.getByText('Compare prices').closest('li')!;
    const pending = screen.getByText('Book the best one').closest('li')!;
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(current.querySelector('svg')).not.toBeNull();
    expect(pending.getAttribute('aria-current')).toBeNull();
    expect(pending.querySelector('svg')).toBeNull();
  });

  it('shows the step count on the live line', () => {
    expect(planProgress(steps)).toEqual({ current: 2, total: 3 });
    expect(planProgress(steps.map((item) => ({ ...item, status: 'completed' as const })))).toBe(
      undefined,
    );
    render(<WorkingStatus writing={false} plan={planProgress(steps)} />);
    expect(screen.getByRole('status').textContent).toContain('Step 2 of 3');
  });
});

describe('activity detail', () => {
  it('never shows the raw tool name', () => {
    render(
      <ActivityRow
        event={{
          id: 'mail',
          type: 'activity',
          kind: 'connector',
          toolName: 'mail_send',
          title: 'Sent the note to Avery',
          detail: 'avery@example.com',
          status: 'complete',
          timestamp: '2026-09-28T10:00:05.000Z',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('mail_send')).toBeNull();
    expect(screen.getAllByText('Sent the note to Avery').length).toBeGreaterThan(0);
    expect(screen.getByText('avery@example.com')).toBeTruthy();
  });
});

describe('image steps', () => {
  const imageStep = (path: string): ActivityEvent => ({
    id: path,
    type: 'activity',
    kind: 'other',
    toolName: 'imageView',
    title: 'Viewed',
    status: 'complete',
    timestamp: '2026-09-28T10:00:05.000Z',
    presentation: { kind: 'image', path },
  });

  it('words a screen capture as looking at the screen, without the temp path', () => {
    const { container } = render(
      <ActivityRow event={imageStep('/private/var/folders/x1/T/sia-screen.png')} />,
    );
    expect(screen.getByRole('button').textContent).toContain('Looked at the screen');
    fireEvent.click(screen.getByRole('button'));
    expect(container.textContent).not.toContain('/private/var');
    expect(container.textContent).not.toContain('Ran a command');
  });

  it('shows only the file name of a viewed image', () => {
    const { container } = render(
      <ActivityRow event={imageStep('/Users/me/Pictures/receipt.jpg')} />,
    );
    expect(screen.getByRole('button').textContent).toContain('receipt.jpg');
    fireEvent.click(screen.getByRole('button'));
    expect(container.textContent).not.toContain('/Users/me/Pictures');
  });
});
