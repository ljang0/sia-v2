// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AssistantLibraryView } from '../../../shared/assistant-library';
import type { RendererApi } from '../../types';
import { AssistantSettings } from './AssistantSettings';

afterEach(cleanup);
it.each([
  { accessMode: 'connected' as const, backgroundControl: false, execution: 'gateway' },
  { accessMode: 'mac' as const, backgroundControl: false, execution: 'native' },
  { accessMode: 'mac' as const, backgroundControl: true, execution: 'gateway' },
])(
  'creates and enables the appropriate skills for $accessMode, background=$backgroundControl',
  async ({ accessMode, backgroundControl, execution }) => {
    const library: AssistantLibraryView = {
      memories: [],
      workflows: [],
      context: false,
      skills: [
        {
          id: 'native',
          agentId: 'agent',
          title: 'Native skill',
          description: 'Native routine',
          source: 'printf native',
          execution: 'native',
          revision: '1',
        },
        {
          id: 'gateway',
          agentId: 'agent',
          title: 'Legacy gateway skill',
          description: 'Gateway routine',
          source: 'printf gateway',
          revision: '1',
        },
      ],
    };
    const api = { assistantLibrary: vi.fn(async () => library) };
    render(
      <AssistantSettings
        agents={[{ id: 'agent', name: 'Personal' }]}
        api={api}
        onRun={() => undefined}
        accessMode={accessMode}
        backgroundControl={backgroundControl}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    await screen.findByText('Native skill', { exact: true });
    for (const kind of ['native', 'gateway']) {
      const card = screen
        .getByText(kind === 'native' ? 'Native skill' : 'Legacy gateway skill', { exact: true })
        .closest('article')!;
      const run = within(card).getByRole('button', { name: 'Run skill' }) as HTMLButtonElement;
      expect(run.disabled).toBe(kind !== execution);
    }
    fireEvent.click(screen.getByRole('button', { name: 'New skill' }));
    fireEvent.change(screen.getByLabelText('Skill name'), { target: { value: 'New routine' } });
    fireEvent.change(screen.getByLabelText('When to use it'), {
      target: { value: 'Read app state' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save skill' }));
    await waitFor(() =>
      expect(api.assistantLibrary).toHaveBeenCalledWith({
        operation: 'saveSkill',
        entry: expect.objectContaining({ execution, title: 'New routine' }),
      }),
    );
  },
);

it('responds immediately to a context toggle and rolls back if persistence fails', async () => {
  let reject!: (cause: Error) => void;
  const save = new Promise<AssistantLibraryView>((_resolve, fail) => {
    reject = fail;
  });
  const api: Pick<RendererApi, 'assistantLibrary'> = {
    assistantLibrary: vi.fn(async (input) =>
      input.operation === 'list' ? { memories: [], workflows: [], context: false } : save,
    ),
  };
  render(<AssistantSettings agents={[]} api={api} onRun={() => undefined} />);
  const toggle = screen.getByRole('switch', {
    name: /Use context when I hold Fn/,
  }) as HTMLInputElement;
  await waitFor(() => expect(toggle.closest('fieldset')?.disabled).toBe(false));
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(true);
  expect(toggle.closest('fieldset')?.disabled).toBe(true);
  reject(new Error('Could not save preferences.'));
  await screen.findByRole('alert');
  expect(toggle.checked).toBe(false);
  expect(toggle.closest('fieldset')?.disabled).toBe(false);
});

it('updates the learning switch immediately and rolls back a failed save', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<AssistantLibraryView>((_resolve, fail) => {
    reject = fail;
  });
  const api: Pick<RendererApi, 'assistantLibrary'> = {
    assistantLibrary: vi.fn(async (input) =>
      input.operation === 'list'
        ? { memories: [], workflows: [], context: false, learningAgents: [] }
        : pending,
    ),
  };
  render(
    <AssistantSettings
      agents={[{ id: 'agent-1', name: 'Personal' }]}
      api={api}
      onRun={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Memory/ }));
  const toggle = screen.getByRole('switch', {
    name: /Learn from completed tasks/,
  }) as HTMLInputElement;
  await waitFor(() => expect(toggle.closest('fieldset')?.disabled).toBe(false));
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(true);
  reject(new Error('Learning could not be saved.'));
  await screen.findByRole('alert');
  expect(toggle.checked).toBe(false);
});

it('asks before deleting memory, workflows, skills, notes, or the journal', async () => {
  const library: AssistantLibraryView = {
    memories: [
      { id: 'memory', agentId: 'agent', title: 'Brief', text: 'Keep it brief', enabled: true },
    ],
    workflows: [
      {
        id: 'workflow',
        agentId: 'agent',
        title: 'Morning briefing',
        parameters: [],
        steps: [{ instruction: 'Read mail', expected: 'Summary' }],
      },
    ],
    skills: [
      {
        id: 'skill',
        agentId: 'agent',
        title: 'Native skill',
        description: 'Native routine',
        source: 'printf native',
        execution: 'native',
        revision: '1',
      },
    ],
    vaults: [
      {
        agentId: 'agent',
        notes: [{ name: 'people.md', text: 'Ana', revision: 'r1', readOnly: false }],
      },
    ],
    journal: [
      {
        id: 'journal',
        agentId: 'agent',
        threadId: 'thread',
        turnId: 'turn',
        timestamp: '2026-09-01T00:00:00.000Z',
        kind: 'task',
        title: 'Sent the summary',
        text: 'Done',
      },
    ],
    context: false,
  };
  const api = { assistantLibrary: vi.fn(async () => library) };
  render(
    <AssistantSettings
      agents={[{ id: 'agent', name: 'Personal' }]}
      api={api}
      onRun={() => undefined}
      accessMode="mac"
    />,
  );
  const deletes = () =>
    api.assistantLibrary.mock.calls.filter(
      ([input]: unknown[]) => (input as { operation: string }).operation !== 'list',
    );

  fireEvent.click(screen.getByRole('button', { name: /^Memory/ }));
  const memory = (await screen.findByText('Brief', { exact: true })).closest('article')!;
  fireEvent.click(within(memory).getByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('alertdialog', { name: 'Delete this memory?' }).textContent).toMatch(
    /Sia will forget it\. This can’t be undone\./,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(deletes()).toEqual([]);
  fireEvent.click(within(memory).getByRole('button', { name: 'Delete' }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
  );
  await waitFor(() =>
    expect(api.assistantLibrary).toHaveBeenCalledWith({
      operation: 'deleteMemory',
      id: 'memory',
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Clear journal' }));
  expect(screen.getByRole('alertdialog', { name: 'Clear the task journal?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  fireEvent.click(screen.getByRole('button', { name: 'Delete people.md' }));
  expect(screen.getByRole('alertdialog', { name: 'Delete this note?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  fireEvent.click(screen.getByRole('button', { name: /^Workflows/ }));
  const workflow = screen.getByText('Morning briefing', { exact: true }).closest('article')!;
  fireEvent.click(within(workflow).getByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('alertdialog', { name: 'Delete this workflow?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  fireEvent.click(screen.getByRole('button', { name: /^Skills/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete skill' }));
  expect(screen.getByRole('alertdialog', { name: 'Delete this skill?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(deletes()).toEqual([[{ operation: 'deleteMemory', id: 'memory' }]]);
});
