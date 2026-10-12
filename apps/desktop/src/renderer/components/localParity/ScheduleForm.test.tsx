// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { blankValues, ScheduleForm } from './ScheduleForm';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(['monthly', 'yearly'] as const)(
  'saves the displayed %s start even when the date changes before submission',
  (cadence) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 31, 23, 59, 30));
    const initial = { ...blankValues(), cadence, prompt: 'Prepare my recap', maxRuns: '' };
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ScheduleForm initial={initial} submitLabel="Create schedule" onSubmit={onSubmit} />,
    );
    const preview = screen.getByText(/^Runs every/).textContent;

    vi.setSystemTime(new Date(2030, 1, 1, 0, 0, 30));
    rerender(
      <ScheduleForm initial={initial} submitLabel="Create schedule" onSubmit={onSubmit} />,
    );
    expect(screen.getByText(/^Runs every/).textContent).toBe(preview);
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));

    const expected =
      cadence === 'monthly'
        ? new Date(2030, 1, 28, 23, 59, 30)
        : new Date(2031, 0, 31, 23, 59, 30);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ cadence, runAt: expected.toISOString() }),
    );
  },
);

it('keeps an unspecified hourly start relative to submission', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2030, 0, 31, 12));
  const onSubmit = vi.fn();
  render(
    <ScheduleForm
      initial={{ ...blankValues(), cadence: 'hourly', prompt: 'Check for updates' }}
      submitLabel="Create schedule"
      onSubmit={onSubmit}
    />,
  );
  vi.setSystemTime(new Date(2030, 0, 31, 12, 5));
  fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ runAt: new Date(2030, 0, 31, 13, 5).toISOString() }),
  );
});
