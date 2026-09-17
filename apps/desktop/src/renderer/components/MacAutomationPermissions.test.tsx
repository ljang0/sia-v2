// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MacAutomationPermissions } from './MacAutomationPermissions';
afterEach(cleanup);
it('requests app permissions only on click, sequentially, and skips allowed or unavailable apps', async () => {
  let finish: () => void = () => {};
  const request = vi.fn(
    async () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <MacAutomationPermissions
      permissions={{
        system_events: 'ready',
        safari: 'ready',
        chrome: 'unavailable',
        calendar: 'needs_permission',
        reminders: 'denied',
        finder: 'ready',
        messages: 'unavailable',
      }}
      request={request}
      refresh={vi.fn()}
    />,
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow all Mac apps' }));
  expect(request).toHaveBeenCalledWith('calendar');
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status').textContent).toContain('Calendar');
  finish();
  await waitFor(() => expect(request).toHaveBeenCalledWith('reminders'));
  finish();
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(request).toHaveBeenCalledTimes(2);
});
it('offers a nonprompting recheck and displays failed requests without marking them allowed', async () => {
  const refresh = vi.fn(async () => {});
  const request = vi.fn(async () => {
    throw new Error('native details');
  });
  render(
    <MacAutomationPermissions permissions={undefined} request={request} refresh={refresh} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Check access' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow all Mac apps' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Setup needs attention'),
  );
  expect(screen.queryByRole('button', { name: 'Calendar allowed' })).toBeNull();
});
it('starts an authorized setup pass once and never replays it on rerender', async () => {
  const request = vi.fn(async () => {});
  const complete = vi.fn(async () => {});
  const props = {
    permissions: undefined,
    request,
    refresh: vi.fn(async () => {}),
    autoStart: true,
    onComplete: complete,
  };
  const view = render(
    <StrictMode>
      <MacAutomationPermissions {...props} />
    </StrictMode>,
  );
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenCalledTimes(7);
  view.rerender(
    <StrictMode>
      <MacAutomationPermissions {...props} />
    </StrictMode>,
  );
  expect(request).toHaveBeenCalledTimes(7);
});
