// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandLauncher } from './CommandLauncher';
afterEach(cleanup);
function setup(
  agents = [
    { id: 'first', name: 'Personal' },
    { id: 'second', name: 'Work' },
  ],
) {
  window.siaLauncher = {
    onState: vi.fn(() => () => undefined),
    cancel: vi.fn(async () => undefined),
    newRequest: vi.fn(async () => undefined),
    state: vi.fn(async () => ({ agents, agentId: 'first' })),
    send: vi.fn(async () => undefined),
    dismiss: vi.fn(async () => undefined),
    openSia: vi.fn(async () => undefined),
  };
  render(<CommandLauncher />);
  return window.siaLauncher;
}
it('sends the typed request to the selected agent; Shift+Enter and composition do not send', async () => {
  const api = setup();
  const field = await screen.findByRole('textbox', { name: 'Your request' });
  fireEvent.change(field, { target: { value: 'Plan my day' } });
  fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'second' } });
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
  expect(api.send).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() =>
    expect(api.send).toHaveBeenCalledWith({
      kind: 'new',
      agentId: 'second',
      text: 'Plan my day',
    }),
  );
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(api.dismiss).toHaveBeenCalledOnce();
});
it('keeps a failed request available to retry and shows setup when no agents are available', async () => {
  const api = setup();
  vi.mocked(api.send).mockRejectedValue(new Error('Check sign-in.'));
  const field = await screen.findByRole('textbox', { name: 'Your request' });
  fireEvent.change(field, { target: { value: 'Keep this draft' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await screen.findByRole('alert');
  expect((field as HTMLTextAreaElement).value).toBe('Keep this draft');
  cleanup();
  const empty = setup([]);
  fireEvent.click(await screen.findByRole('button', { name: 'Open Sia to get started' }));
  expect(empty.openSia).toHaveBeenCalledOnce();
});

it('routes reply and Stop through the displayed session, and clears drafts when the target changes', async () => {
  const api = setup();
  await screen.findByRole('textbox', { name: 'Your request' });
  const receive = vi.mocked(api.onState).mock.calls[0]![0];
  const state = {
    agents: [{ id: 'first', name: 'Personal' }],
    task: {
      sessionId: 'voice-session',
      agentId: 'first',
      title: 'Voice request',
      status: 'idle' as const,
      progress: 'Ready for a follow-up',
      response: 'Finished',
      truncated: false,
    },
  };
  await act(() => receive(state));
  const field = screen.getByRole('textbox', { name: 'Your request' });
  fireEvent.change(field, { target: { value: 'Explain that' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await waitFor(() =>
    expect(api.send).toHaveBeenCalledWith({
      kind: 'reply',
      sessionId: 'voice-session',
      text: 'Explain that',
    }),
  );
  await waitFor(() => expect((field as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(field, { target: { value: 'Unsent old draft' } });
  await act(() =>
    receive({
      ...state,
      task: {
        ...state.task,
        sessionId: 'next-session',
        status: 'waiting',
        progress: 'Sia needs your approval or answer',
      },
    }),
  );
  expect((field as HTMLTextAreaElement).value).toBe('');
  expect((field as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('next-session'));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Review in Sia' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review in Sia' }));
  expect(api.openSia).toHaveBeenCalledWith('next-session');
});

it('restores input focus when the command box is reopened', async () => {
  setup();
  const field = await screen.findByRole('textbox', { name: 'Your request' });
  screen.getByRole('button', { name: 'Close launcher' }).focus();
  fireEvent.focus(window);
  await waitFor(() => expect(document.activeElement).toBe(field));
});
