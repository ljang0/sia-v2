import { expect, it, vi } from 'vitest';
import { runMacAutomation, MAC_AUTOMATION_SCRIPT } from './mac-automation.js';
it('passes native automation values only as JSON argv and reads back the result', async () => {
  const run = vi.fn(async (_input: string) => '{"id":"event-1"}');
  const title = '\"); do shell script "bad"';
  const result = await runMacAutomation(
    {
      operation: 'calendar_create',
      calendar: 'calendar-1',
      title,
      start: '2026-09-07T09:00:00-04:00',
      end: '2026-09-07T10:00:00-04:00',
    },
    undefined,
    run,
  );
  expect(result.outcome).toBe('verified');
  expect(JSON.parse(run.mock.calls[0]![0]! as string).title).toBe(title);
  expect(MAC_AUTOMATION_SCRIPT).not.toContain(title);
});
it('rejects arbitrary scripts, invalid ranges and unconfirmed writes', async () => {
  const run = vi.fn(async () => {
    throw new Error('private native error');
  });
  await expect(
    runMacAutomation(
      { operation: 'finder_selection', script: 'do shell script' },
      undefined,
      run,
    ),
  ).rejects.toThrow();
  await expect(
    runMacAutomation(
      {
        operation: 'calendar_events',
        calendar: 'x',
        start: '2026-10-01T00:00:00Z',
        end: '2026-09-01T00:00:00Z',
      },
      undefined,
      run,
    ),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
  const result = await runMacAutomation(
    { operation: 'reminders_create', list: 'x', title: 'test' },
    undefined,
    run,
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(JSON.stringify(result)).not.toContain('private native error');
});
