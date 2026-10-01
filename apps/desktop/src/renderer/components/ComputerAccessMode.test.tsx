// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { demoSnapshot } from '../demo/snapshot';
import { ComputerAccessMode } from './ComputerAccessMode';

afterEach(cleanup);
it('switches Mac execution independently of approvals and preserves the chosen foreground fallback', () => {
  const computer = {
    ...demoSnapshot.computer,
    accessMode: 'mac' as const,
    backgroundControl: false,
    backgroundFallback: 'pause' as const,
  };
  const change = vi.fn();
  const { rerender } = render(
    <ComputerAccessMode computer={computer} change={change} showBackgroundOption />,
  );
  expect(
    (screen.getByRole('radio', { name: /On my screen/ }) as HTMLInputElement).checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: /Work in background/ }));
  expect(change).toHaveBeenLastCalledWith('mac', true);
  rerender(
    <ComputerAccessMode
      computer={{ ...computer, backgroundControl: true }}
      change={change}
      showBackgroundOption
    />,
  );
  expect(
    (screen.getByRole('combobox', { name: 'Background fallback' }) as HTMLSelectElement).value,
  ).toBe('pause');
  fireEvent.change(screen.getByRole('combobox', { name: 'Background fallback' }), {
    target: { value: 'foreground' },
  });
  expect(change).toHaveBeenLastCalledWith('mac', true, 'foreground');
  fireEvent.click(screen.getByRole('radio', { name: /On my screen/ }));
  expect(change).toHaveBeenLastCalledWith('mac', false);
  rerender(
    <ComputerAccessMode
      computer={{ ...computer, accessMode: 'connected' }}
      change={change}
      showBackgroundOption
    />,
  );
  expect(screen.queryByRole('radio', { name: /Work in background/ })).toBeNull();
});
