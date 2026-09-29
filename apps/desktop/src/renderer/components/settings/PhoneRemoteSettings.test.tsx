// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhoneRemoteSettings } from './PhoneRemoteSettings';
import type {
  PhoneRemoteApi,
  PhoneRemoteSettings as Settings,
} from '../../../shared/phone-remote';

afterEach(cleanup);
it('explains how to enable phone remote when no assistant exists', async () => {
  const api = vi.fn<PhoneRemoteApi>(async () => ({
    enabled: false,
    running: false,
    detail: 'Ready to pair.',
  }));
  render(<PhoneRemoteSettings api={api} agents={[]} providers={[]} />);
  expect(
    await screen.findByText('Set up an assistant in Sia before connecting your phone.'),
  ).toBeTruthy();
  expect((screen.getByLabelText('Assistant') as HTMLSelectElement).disabled).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Enable phone remote' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(api.mock.calls.every(([command]) => command.operation === 'status')).toBe(true);
});

it('enables the chosen assistant, displays pairing, copies through the typed bridge, rotates and disables', async () => {
  let state: Settings = { enabled: false, running: false, detail: 'Ready to pair.' };
  const api = vi.fn<PhoneRemoteApi>(async (command) => {
    if (command.operation === 'enable')
      state = {
        enabled: true,
        running: true,
        agentId: command.agentId,
        detail: 'Ready.',
        url: 'http://192.168.1.2:8738/t/private-test-link/',
        qr: 'data:image/png;base64,cXI=',
      };
    if (command.operation === 'disable')
      state = { enabled: false, running: false, detail: 'Off.' };
    return state;
  });
  render(
    <PhoneRemoteSettings
      api={api}
      agents={[
        { id: 'a', name: 'Personal', provider: 'codex', model: 'gpt-6-astra' },
        { id: 'b', name: 'Work', provider: 'codex', model: 'gpt-6-astra' },
      ]}
      providers={[]}
    />,
  );
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Enable phone remote' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('Assistant'), { target: { value: 'b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enable phone remote' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'enable', agentId: 'b' }));
  expect(await screen.findByRole('img', { name: /Scan this private QR code/ })).toBeTruthy();
  expect(screen.getByText('This phone uses Work · gpt-6-astra.')).toBeTruthy();
  expect(screen.getByText(/asks for your OK here on the Mac, one at a time/)).toBeTruthy();
  expect((screen.getByLabelText('Assistant') as HTMLSelectElement).value).toBe('b');
  fireEvent.change(screen.getByLabelText('Assistant'), { target: { value: 'a' } });
  expect(screen.getByText(/Switching creates a new private link/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Switch assistant' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'enable', agentId: 'a' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copy private link' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'copy' }));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Create a new link' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith({ operation: 'rotate' }));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Turn off remote' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Turn off remote' }));
  expect(await screen.findByRole('button', { name: 'Enable phone remote' })).toBeTruthy();
});

it('warns when the phone assistant model is no longer available', async () => {
  const api = vi.fn<PhoneRemoteApi>(async () => ({
    enabled: true,
    running: true,
    agentId: 'a',
    detail: 'Ready.',
  }));
  render(
    <PhoneRemoteSettings
      api={api}
      agents={[{ id: 'a', name: 'Personal', provider: 'codex', model: 'retired-model' }]}
      providers={[
        {
          id: 'codex',
          name: 'Codex',
          status: 'ready',
          model: 'gpt-6-astra',
          description: 'Connected',
          billedBy: '',
          models: [
            {
              id: 'gpt-6-astra',
              label: 'GPT-6 Astra',
              description: '',
              reasoningEfforts: [],
            },
          ],
        },
      ]}
    />,
  );
  expect(await screen.findByText(/choose an available model/)).toBeTruthy();
});

it('names the paired model the way the model menu does', async () => {
  const api = vi.fn<PhoneRemoteApi>(async () => ({
    enabled: true,
    running: true,
    agentId: 'a',
    detail: 'Ready.',
  }));
  render(
    <PhoneRemoteSettings
      api={api}
      agents={[{ id: 'a', name: 'Personal', provider: 'codex', model: 'gpt-6-astra' }]}
      providers={[
        {
          id: 'codex',
          name: 'Codex',
          status: 'ready',
          model: 'gpt-6-astra',
          description: 'Connected',
          billedBy: '',
          models: [
            { id: 'gpt-6-astra', label: 'GPT-6 Astra', description: '', reasoningEfforts: [] },
          ],
        },
      ]}
    />,
  );
  expect(await screen.findByText('This phone uses Personal · GPT-6 Astra.')).toBeTruthy();
});
