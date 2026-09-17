// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MacAutomationPermissions } from './MacAutomationPermissions';
import { accessChecklist } from './OnboardingConnections';
import { demoSnapshot } from '../demo';
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
it('keeps unresolved app automation visible even when screen and accessibility permissions are ready', () => {
  const snapshot = structuredClone(demoSnapshot);
  snapshot.computer.automation = {
    calendar: 'denied',
    reminders: 'ready',
    finder: 'not_running',
    messages: 'needs_permission',
  };
  const checklist = accessChecklist(snapshot);
  expect(checklist.find((row) => row.label === 'Calendar automation')).toMatchObject({
    ready: false,
    detail: 'Allow in System Settings',
  });
  expect(checklist.find((row) => row.label === 'Reminders automation')).toMatchObject({
    ready: true,
  });
  expect(checklist.find((row) => row.label === 'Finder automation')).toMatchObject({
    ready: false,
  });
});
