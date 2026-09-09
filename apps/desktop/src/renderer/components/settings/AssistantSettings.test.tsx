// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AssistantLibraryView } from '../../../shared/assistant-library';
import type { RendererApi } from '../../types';
import { AssistantSettings } from './AssistantSettings';

afterEach(cleanup);
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
  const toggle = screen.getByRole('checkbox', {
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
  const toggle = screen.getByRole('checkbox', {
    name: /Learn from completed tasks/,
  }) as HTMLInputElement;
  await waitFor(() => expect(toggle.closest('fieldset')?.disabled).toBe(false));
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(true);
  reject(new Error('Learning could not be saved.'));
  await screen.findByRole('alert');
  expect(toggle.checked).toBe(false);
});
