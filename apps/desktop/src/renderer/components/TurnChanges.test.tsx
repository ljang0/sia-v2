// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, ThreadEvent, TurnChanges } from '../types';
import { TurnChangesBar, turnChangeSummaries } from './TurnChanges';

afterEach(cleanup);

const message = (id: string, role: 'user' | 'assistant'): ThreadEvent => ({
  id,
  type: 'message',
  role,
  content: id,
  timestamp: '2026-09-30T10:00:00.000Z',
});
const edit = (
  id: string,
  files: Array<{ path: string; change: string; movePath?: string; diff?: string }>,
  status: ActivityEvent['status'] = 'complete',
): ThreadEvent => ({
  id,
  type: 'activity',
  kind: 'other',
  title: 'Changed files',
  status,
  timestamp: '2026-09-30T10:00:00.000Z',
  presentation: { kind: 'file_change', files },
});
const diff = '@@ -1 +1 @@\n-a\n+b\n';

describe('turnChangeSummaries', () => {
  it('offers Undo under the last event of each reply whose file changes are all recorded', () => {
    const events = [
      message('ask-1', 'user'),
      edit('e1', [{ path: 'a.md', change: 'update', diff }]),
      edit('e2', [
        { path: 'a.md', change: 'update', diff },
        { path: 'b.md', change: 'add', diff: 'b\n' },
      ]),
      message('reply-1', 'assistant'),
      message('ask-2', 'user'),
      edit('e3', [{ path: 'c.md', change: 'update' }]),
      message('reply-2', 'assistant'),
      message('ask-3', 'user'),
      edit('e4', [{ path: 'd.md', change: 'update', diff }], 'error'),
      message('ask-4', 'user'),
      edit('e5', [{ path: 'old.md', change: 'rename', movePath: 'new.md', diff: '' }]),
    ];
    expect([...turnChangeSummaries(events)]).toEqual([
      [3, { eventId: 'e2', fileCount: 2 }],
      [10, { eventId: 'e5', fileCount: 1 }],
    ]);
  });
});

describe('TurnChangesBar', () => {
  const ready: TurnChanges = {
    state: 'ready',
    files: [
      { path: 'trip.md', change: 'edited' },
      { path: 'packing.md', change: 'added' },
    ],
    blocked: [],
  };

  it('asks first, lists the files, then offers Redo', async () => {
    const actions = {
      read: vi.fn(async () => ready),
      apply: vi.fn(async (_id: string, direction: 'undo' | 'redo') => ({
        ...ready,
        state: direction === 'undo' ? ('undone' as const) : ('ready' as const),
      })),
    };
    render(<TurnChangesBar eventId="e1" fileCount={2} busy={false} actions={actions} />);
    expect(screen.getByText('Changed 2 files')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-undo')));
    const dialog = screen.getByTestId('turn-changes-dialog');
    expect(dialog.textContent).toContain('trip.md');
    expect(dialog.textContent).toContain('packing.md');
    expect(dialog.textContent).toContain('Messages or emails that were sent');
    expect(actions.apply).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-confirm')));
    expect(actions.apply).toHaveBeenCalledWith('e1', 'undo');
    expect(screen.getByText('Changes undone')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-redo')));
    expect(actions.apply).toHaveBeenLastCalledWith('e1', 'redo');
    expect(screen.getByText('Changed 2 files')).toBeTruthy();
  });

  it('explains when files changed since, and changes nothing', async () => {
    const actions = {
      read: vi.fn(async () => ({ ...ready, state: 'changed' as const, blocked: ['trip.md'] })),
      apply: vi.fn(),
    };
    render(<TurnChangesBar eventId="e1" fileCount={2} busy={false} actions={actions} />);
    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-undo')));
    const dialog = screen.getByTestId('turn-changes-dialog');
    expect(dialog.textContent).toContain('These files changed since');
    expect(dialog.textContent).toContain('trip.md');
    expect(screen.queryByTestId('turn-changes-confirm')).toBeNull();
    expect(actions.apply).not.toHaveBeenCalled();
  });

  it('shows an undo made earlier as undone, and waits while a task runs', async () => {
    const actions = {
      read: vi.fn(async () => ({ ...ready, state: 'undone' as const })),
      apply: vi.fn(),
    };
    const view = render(<TurnChangesBar eventId="e1" fileCount={2} busy actions={actions} />);
    expect(screen.getByTestId('turn-changes-undo').hasAttribute('disabled')).toBe(true);
    view.rerender(<TurnChangesBar eventId="e1" fileCount={2} busy={false} actions={actions} />);
    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-undo')));
    expect(screen.getByText('Changes undone')).toBeTruthy();
    expect(screen.queryByTestId('turn-changes-dialog')).toBeNull();
  });

  it('shows a failure in plain words', async () => {
    const actions = {
      read: vi.fn(async () => {
        throw new Error(
          "Error invoking remote method 'sia:request': Error: Stop the active task before you undo changes.",
        );
      }),
      apply: vi.fn(),
    };
    render(<TurnChangesBar eventId="e1" fileCount={1} busy={false} actions={actions} />);
    await act(async () => fireEvent.click(screen.getByTestId('turn-changes-undo')));
    expect(screen.getByRole('alert').textContent).toBe(
      'Stop the active task before you undo changes.',
    );
  });
});
