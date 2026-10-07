// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextSiaSettings } from './TextSiaSettings';
import type { MessagesRelayApi, MessagesRelaySettings } from '../../../shared/messages-relay';

afterEach(cleanup);
const AGENT = '11111111-1111-4111-8111-111111111111';

it('shows a failed reply as needing attention even while incoming texts remain active', async () => {
  const replyError = 'A reply could not be sent. Check that Messages is signed in to iMessage.';
  const api = vi.fn<MessagesRelayApi>(async () => ({
    enabled: true,
    running: true,
    trusted: [{ handle: '+15551234567', label: 'Test phone' }],
    proactive: true,
    textApprovals: true,
    people: [],
    peoplePaused: false,
    bots: [],
    access: 'ready',
    replyError,
    detail: replyError,
  }));
  render(<TextSiaSettings api={api} agents={[{ id: AGENT, name: 'Sia' }]} />);
  expect(await screen.findByText('Needs attention')).toBeTruthy();
  expect(screen.queryByText('Ready')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe(replyError);
  expect(screen.getAllByText(replyError)).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Turn off texting' })).toBeTruthy();
});

it('adds your number, turns texting on for the chosen assistant, and turns it off', async () => {
  let state: MessagesRelaySettings = {
    enabled: false,
    running: false,
    trusted: [],
    proactive: true,
    textApprovals: true,
    people: [],
    peoplePaused: false,
    bots: [],
    access: 'ready',
    detail: 'Add your phone number to text Sia from anywhere.',
  };
  const api = vi.fn<MessagesRelayApi>(async (command) => {
    if (command.operation === 'trust')
      state = { ...state, trusted: [{ handle: '+15551234567', label: '+15551234567' }] };
    if (command.operation === 'enable')
      state = { ...state, enabled: true, running: true, agentId: command.agentId };
    if (command.operation === 'disable') state = { ...state, enabled: false, running: false };
    return state;
  });
  render(<TextSiaSettings api={api} agents={[{ id: AGENT, name: 'Sia' }]} />);
  expect(
    await screen.findByText('Add your phone number to text Sia from anywhere.'),
  ).toBeTruthy();
  const turnOn = screen.getByRole('button', { name: 'Turn on texting' }) as HTMLButtonElement;
  expect(turnOn.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Your phone number or iCloud email'), {
    target: { value: '(555) 123-4567' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('+15551234567')).toBeTruthy();
  expect(api).toHaveBeenCalledWith({ operation: 'trust', handle: '(555) 123-4567', label: '' });
  fireEvent.click(screen.getByRole('button', { name: 'Turn on texting' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith({ operation: 'enable', agentId: AGENT }),
  );
  expect(await screen.findByText('Ready')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Turn off texting' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'disable' }));
});
