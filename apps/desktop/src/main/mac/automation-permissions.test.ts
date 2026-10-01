import { expect, it, vi } from 'vitest';
import { AutomationPermissionService } from './automation-permissions.js';
const statuses = {
  calendar: 'ready',
  reminders: 'denied',
  finder: 'not_running',
  messages: 'needs_permission',
};
it('only prompts for a fixed requested app and otherwise checks without opening settings', async () => {
  const run = vi.fn(async () => JSON.stringify(statuses));
  const openSettings = vi.fn(async () => {});
  const service = new AutomationPermissionService({
    helperPath: '/helper',
    platform: 'darwin',
    run,
    openSettings,
  });
  expect(await service.check()).toEqual(statuses);
  expect(run).toHaveBeenLastCalledWith('/helper', ['--automation-check']);
  expect(openSettings).not.toHaveBeenCalled();
  await service.check('calendar');
  expect(run).toHaveBeenLastCalledWith('/helper', ['--automation-request', 'calendar']);
  expect(openSettings).not.toHaveBeenCalled();
  await service.check('reminders');
  expect(openSettings).toHaveBeenCalledTimes(1);
  await expect(service.check('com.apple.keychainaccess' as never)).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(3);
});
it('fails closed for malformed output, timeouts and unavailable platforms', async () => {
  const run = vi.fn(async () => '{"calendar":"ready"}');
  const openSettings = vi.fn(async () => {});
  const service = new AutomationPermissionService({
    helperPath: '/helper',
    platform: 'darwin',
    run,
    openSettings,
  });
  expect((await service.check()).calendar).toBe('error');
  run.mockRejectedValueOnce(new Error('private stderr'));
  expect(JSON.stringify(await service.check('calendar'))).not.toContain('private');
  const unsupported = new AutomationPermissionService({
    helperPath: '/helper',
    platform: 'linux',
    run,
    openSettings,
  });
  expect((await unsupported.check('calendar')).calendar).toBe('unavailable');
  expect(run).toHaveBeenCalledTimes(2);
  expect(openSettings).not.toHaveBeenCalled();
});
it('fake setup changes only requested permissions without touching macOS', async () => {
  const run = vi.fn();
  const service = new AutomationPermissionService({
    helperPath: '/helper',
    fake: true,
    run,
    openSettings: vi.fn(),
  });
  expect((await service.check()).calendar).toBe('needs_permission');
  expect(await service.check('calendar')).toMatchObject({
    calendar: 'ready',
    reminders: 'needs_permission',
  });
  expect((await service.check()).calendar).toBe('ready');
  expect(run).not.toHaveBeenCalled();
});
