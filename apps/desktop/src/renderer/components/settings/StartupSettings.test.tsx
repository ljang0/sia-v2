// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartupSettings } from './StartupSettings';

afterEach(cleanup);

describe('open at login', () => {
  it('is off by default and explains why it helps schedules', async () => {
    const setOpenAtLogin = vi.fn(async () => undefined);
    render(<StartupSettings openAtLogin={false} onSetOpenAtLogin={setOpenAtLogin} />);
    expect(screen.getByText(/run only while Sia is open and your Mac is awake/)).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: /Open Sia at login/ });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(setOpenAtLogin).toHaveBeenCalledWith(true));
  });

  it('shows why the setting could not change', async () => {
    render(
      <StartupSettings
        openAtLogin
        onSetOpenAtLogin={async () => {
          throw new Error('Opening at login is available in the installed Sia app.');
        }}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: /Open Sia at login/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('installed Sia app');
  });
});
