// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityDashboard } from './ActivityDashboard';
import { ChangesReview } from './ChangesReview';
import { TerminalDrawer } from './TerminalDrawer';
import { ArchivedThreadsSection } from './ThreadLifecycle';
import { TranscriptSearch } from './TranscriptSearch';
import { GoalControls, ScheduleControls, ThreadModelControls } from './WorkControls';

afterEach(cleanup);

describe('local parity renderer contracts', () => {
  it('changes model and reasoning independently', () => {
    const onChangeModel = vi.fn();
    const onChangeReasoning = vi.fn();
    render(
      <ThreadModelControls
        modelId="gpt-5.6-sol"
        reasoningId="high"
        models={[
          { id: 'gpt-5.6-sol', label: 'GPT-5.6' },
          { id: 'gpt-5.4', label: 'GPT-5.4' },
        ]}
        reasoningOptions={[
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ]}
        onChangeModel={onChangeModel}
        onChangeReasoning={onChangeReasoning}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'gpt-5.4' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Reasoning' }), {
      target: { value: 'medium' },
    });
    expect(onChangeModel).toHaveBeenCalledWith('gpt-5.4');
    expect(onChangeReasoning).toHaveBeenCalledWith('medium');
  });

  it('summarizes attention states and opens the selected activity', () => {
    const onOpenThread = vi.fn();
    render(
      <ActivityDashboard
        activities={[
          {
            id: 'activity-1',
            threadId: 'thread-1',
            title: 'Release checks',
            detail: 'Waiting for approval',
            agentName: 'Release partner',
            status: 'waiting',
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'activity-2',
            threadId: 'thread-2',
            title: 'Finished notes',
            detail: 'Done',
            agentName: 'Research partner',
            status: 'complete',
            updatedAt: new Date().toISOString(),
          },
        ]}
        onOpenThread={onOpenThread}
      />,
    );

    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.queryByText('Finished notes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /release checks/i }));
    expect(onOpenThread).toHaveBeenCalledWith('thread-1');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Finished notes')).toBeTruthy();
  });

  it('gives an empty transcript search a useful starting state', () => {
    render(<TranscriptSearch search={vi.fn()} onOpen={vi.fn()} />);

    expect(
      screen.getByText('Searches every local thread, including archived ones.'),
    ).toBeTruthy();
  });

  it('opens and restores archived threads as distinct actions', () => {
    const onOpen = vi.fn();
    const onRestore = vi.fn();
    render(
      <ArchivedThreadsSection
        threads={[
          {
            id: 'thread-2',
            title: 'Old research',
            agentName: 'Research partner',
            archivedAt: '2026-08-10T00:00:00.000Z',
          },
        ]}
        onOpen={onOpen}
        onRestore={onRestore}
      />,
    );

    fireEvent.click(screen.getByText('Old research').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Old research' }));
    expect(onOpen).toHaveBeenCalledWith('thread-2');
    expect(onRestore).toHaveBeenCalledWith('thread-2');
  });

  it('focuses the archived section when navigation targets it', () => {
    render(
      <ArchivedThreadsSection focusOnMount threads={[]} onOpen={vi.fn()} onRestore={vi.fn()} />,
    );

    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Archived' }));
  });

  it('sets a goal and supports active goal lifecycle controls', async () => {
    const onSetGoal = vi.fn(async () => undefined);
    const lifecycle = {
      onSetGoal,
      onPauseGoal: vi.fn(),
      onResumeGoal: vi.fn(),
      onClearGoal: vi.fn(),
    };
    const view = render(<GoalControls {...lifecycle} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Goal' }), {
      target: { value: 'Ship the release checklist' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set goal' }));
    await waitFor(() => expect(onSetGoal).toHaveBeenCalledWith('Ship the release checklist'));

    view.rerender(
      <GoalControls
        goal={{
          text: 'Ship the release checklist',
          status: 'running',
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        }}
        {...lifecycle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear goal' }));
    expect(lifecycle.onPauseGoal).toHaveBeenCalledWith();
    expect(lifecycle.onClearGoal).toHaveBeenCalledWith();
  });

  it('creates, pauses, and deletes a schedule through explicit callbacks', async () => {
    const onCreate = vi.fn(async () => undefined);
    const onSetEnabled = vi.fn();
    const onDelete = vi.fn();
    render(
      <ScheduleControls
        schedules={[
          {
            id: 'schedule-1',
            label: 'Morning summary',
            prompt: 'Summarize updates',
            cadence: 'daily',
            nextRunAt: '2026-08-15T09:00:00.000Z',
            enabled: true,
          },
        ]}
        onCreate={onCreate}
        onSetEnabled={onSetEnabled}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Check release status' },
    });
    fireEvent.change(screen.getByLabelText('First run'), {
      target: { value: '2026-08-15T09:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        prompt: 'Check release status',
        cadence: 'once',
        runAt: '2026-08-15T09:30',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Morning summary' }));
    expect(onSetEnabled).toHaveBeenCalledWith('schedule-1', false);
    expect(onDelete).toHaveBeenCalledWith('schedule-1');
  });

  it('shows the latest schedule outcome and an expandable bounded run history', () => {
    render(
      <ScheduleControls
        schedules={[
          {
            id: 'schedule-1',
            label: 'Morning summary',
            prompt: 'Summarize updates',
            cadence: 'daily',
            nextRunAt: '2026-08-16T09:00:00.000Z',
            enabled: true,
            runCount: 2,
            lastRun: {
              id: 'run-2',
              startedAt: '2026-08-15T09:00:00.000Z',
              finishedAt: '2026-08-15T09:01:00.000Z',
              outcome: 'completed',
            },
            runHistory: [
              {
                id: 'run-2',
                startedAt: '2026-08-15T09:00:00.000Z',
                finishedAt: '2026-08-15T09:01:00.000Z',
                outcome: 'completed',
              },
              {
                id: 'run-1',
                startedAt: '2026-08-14T09:00:00.000Z',
                finishedAt: '2026-08-14T09:01:00.000Z',
                outcome: 'failed',
              },
            ],
          },
        ]}
        onCreate={vi.fn()}
        onSetEnabled={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId('schedule-next-run').textContent).toContain('Next');
    expect(screen.getByText(/Last Completed/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show run history for Morning summary' }),
    );

    const history = screen.getByRole('list', { name: 'Run history for Morning summary' });
    expect(history.textContent).toContain('Completed');
    expect(history.textContent).toContain('Failed');
    expect(
      screen
        .getByRole('button', { name: 'Hide run history for Morning summary' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('infers the first run when a recurring schedule omits it', async () => {
    const onCreate = vi.fn(async () => undefined);
    render(
      <ScheduleControls
        schedules={[]}
        onCreate={onCreate}
        onSetEnabled={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task' }), {
      target: { value: 'Check the web for new release notes' },
    });
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'hourly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith({
      prompt: 'Check the web for new release notes',
      cadence: 'hourly',
      runAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('stages directly but confirms destructive file restoration', async () => {
    const onStage = vi.fn();
    const onRestore = vi.fn();
    render(
      <ChangesReview
        workspace="/Users/me/project"
        files={[
          {
            path: 'src/app.ts',
            status: 'modified',
            additions: 2,
            deletions: 1,
            staged: false,
            patch: '@@ -1,2 +1,3 @@\n-old\n+new',
          },
        ]}
        onStage={onStage}
        onRestore={onRestore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stage' }));
    expect(onStage).toHaveBeenCalledWith('src/app.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(onRestore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore file' }));
    expect(onRestore).toHaveBeenCalledWith('src/app.ts');
  });

  it('submits one scoped command and exposes its result', () => {
    const onRun = vi.fn();
    render(
      <TerminalDrawer
        open
        workspace="/Users/me/project"
        run={{
          status: 'succeeded',
          command: 'pnpm test',
          output: '42 tests passed',
          exitCode: 0,
        }}
        onOpenChange={() => undefined}
        onRun={onRun}
      />,
    );

    expect(screen.getByText('42 tests passed')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Command' }), {
      target: { value: 'pnpm typecheck' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run once' }));
    expect(onRun).toHaveBeenCalledWith({
      command: 'pnpm typecheck',
      workspace: '/Users/me/project',
    });
  });

  it('focuses the command field and restores focus after dismissal', async () => {
    render(<TerminalFocusHarness />);
    const trigger = screen.getByRole('button', { name: 'Command' });

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Command' })),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

function TerminalFocusHarness() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Command
      </button>
      <TerminalDrawer
        open={open}
        workspace="/Users/me/project"
        run={{ status: 'idle' }}
        returnFocusRef={trigger}
        onOpenChange={setOpen}
        onRun={() => undefined}
      />
    </>
  );
}
