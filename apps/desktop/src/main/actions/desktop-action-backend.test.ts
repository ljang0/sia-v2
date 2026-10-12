import { expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { fakeCua, request } from './test-support.js';

// These fixtures advance app state with explicit mock observations. Real settle
// sleeps add load and timing failures without exercising an application's timing.
vi.mock('node:timers/promises', async (original) => ({
  ...(await original<typeof import('node:timers/promises')>()),
  setTimeout: vi.fn(
    async (_ms?: number, value?: unknown, options?: { signal?: AbortSignal }) => {
      options?.signal?.throwIfAborted();
      return value;
    },
  ),
}));

it('checks Mac access only for computer actions, before dispatch, and rechecks after a grant', async () => {
  const cua = fakeCua(async () => ({}));
  const access = vi
    .fn<() => Promise<string | undefined>>()
    .mockResolvedValueOnce('Allow Screen Recording in Settings → Computer.')
    .mockResolvedValue(undefined);
  const assistantAction = vi.fn(async () => ({
    outcome: 'verified' as const,
    summary: 'Read notes.',
  }));
  const backend = new DesktopActionBackend({
    cua,
    computerUnavailable: access,
    assistantAction,
  });
  expect((await backend.invoke(request('memory_learn', {}))).outcome).toBe('verified');
  expect(access).not.toHaveBeenCalled();
  expect((await backend.invoke(request('computer_list', {}))).summary).toContain(
    'Allow Screen Recording',
  );
  expect(cua.call).not.toHaveBeenCalled();
  await backend.invoke(request('computer_list', {}));
  expect(access).toHaveBeenCalledTimes(2);
  expect(cua.call).toHaveBeenCalled();
});

it('stops a failed control loop after two attempts without posting any input', async () => {
  const cua = fakeCua(async () => ({}));
  const backend = new DesktopActionBackend({ cua });
  const input = request('computer_action', {
    app_id: 'expired',
    window_id: 'expired',
    snapshot_id: 'expired',
    action: 'click',
    element_ref: 'expired',
  });
  expect((await backend.invoke(input)).outcome).toBe('stale');
  expect((await backend.invoke(input)).outcome).toBe('stale');
  expect((await backend.invoke(input)).summary).toContain('Two control attempts failed');
  expect(cua.call).not.toHaveBeenCalled();
});

it('requires an approved native automation invocation and fails closed when no assistant host exists', async () => {
  const macAutomation = vi.fn(async () => ({
    outcome: 'verified' as const,
    summary: 'Read selected items.',
  }));
  const backend = new DesktopActionBackend({ cua: fakeCua(async () => ({})), macAutomation });
  const approved = request('mac_automation', { operation: 'finder_selection' });
  const unapproved = { ...approved };
  delete (unapproved as { approvalId?: string }).approvalId;
  expect((await backend.invoke(unapproved)).outcome).toBe('refused');
  expect(macAutomation).not.toHaveBeenCalled();
  expect((await backend.invoke(approved)).outcome).toBe('verified');
  expect((await backend.invoke(request('skill_run', {}))).outcome).toBe('refused');
});

it('keeps window tools out of the default native Mac route', async () => {
  const cua = fakeCua(async () => {
    throw new Error('The native route must not dispatch window tools');
  });
  const backend = new DesktopActionBackend({ cua, macBrowserAccess: () => true });
  const result = await backend.invoke(request('computer_list', {}));
  expect(result.outcome).toBe('refused');
  expect(cua.call).not.toHaveBeenCalled();
});

it('routes native vault reviews through the controller authorization boundary', async () => {
  const cua = fakeCua(async () => {
    throw new Error('No GUI in a vault review');
  });
  const assistantAction = vi.fn(async () => ({
    outcome: 'verified' as const,
    summary: 'Read the authorized vault.',
  }));
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    assistantAction,
  });
  const action = request('memory_vault', {
    operation: 'list',
    name: '',
    text: '',
    revision: '',
  });
  expect((await backend.invoke(action)).outcome).toBe('verified');
  expect(assistantAction).toHaveBeenCalledExactlyOnceWith(action);
  expect(cua.call).not.toHaveBeenCalled();
});
