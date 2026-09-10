// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhoneRemoteSettings } from './PhoneRemoteSettings';
import type {
  PhoneRemoteApi,
  PhoneRemoteSettings as Settings,
} from '../../../shared/phone-remote';

afterEach(cleanup);
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
        { id: 'a', name: 'Personal' },
        { id: 'b', name: 'Work' },
      ]}
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
