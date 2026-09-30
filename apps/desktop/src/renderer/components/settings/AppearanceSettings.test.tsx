// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppearanceSettings } from './AppearanceSettings';
import { applyTextSize } from '../../textSize';

afterEach(cleanup);

function renderSettings(overrides: Partial<Parameters<typeof AppearanceSettings>[0]> = {}) {
  const props = {
    value: 'expressive' as const,
    onChange: vi.fn(async () => undefined),
    onSetTheme: vi.fn(async () => undefined),
    onSetTextSize: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<AppearanceSettings {...props} />);
  return props;
}

describe('Appearance settings', () => {
  it('defaults to System theme and Default text size, and saves a new choice', async () => {
    const props = renderSettings();
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    const size = screen.getByRole('radiogroup', { name: 'Text size' });
    expect((screen.getByRole('radio', { name: 'System' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('radio', { name: 'Default' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(theme.textContent).toBe('SystemLightDark');
    expect(size.textContent).toBe('SmallDefaultLargeLarger');
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(props.onSetTheme).toHaveBeenCalledWith('dark'));
    fireEvent.click(screen.getByRole('radio', { name: 'Larger' }));
    await waitFor(() => expect(props.onSetTextSize).toHaveBeenCalledWith('larger'));
    // The atmosphere choice is unchanged and still offered.
    expect(screen.getByRole('radio', { name: /Calm/ })).toBeTruthy();
  });

  it('shows the saved choices and explains a failed save', async () => {
    renderSettings({
      theme: 'light',
      textSize: 'large',
      onSetTheme: async () => {
        throw new Error('Theme could not be saved right now.');
      },
    });
    expect((screen.getByRole('radio', { name: 'Light' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('radio', { name: 'Large' }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Theme could not be saved right now.',
    );
  });
});

describe('applyTextSize', () => {
  it('sets the type scale on the window root and falls back to Default', () => {
    const root = document.documentElement;
    applyTextSize('larger');
    expect(root.dataset.textSize).toBe('larger');
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.22');
    applyTextSize('huge' as never);
    expect(root.dataset.textSize).toBe('default');
    expect(root.style.getPropertyValue('--text-scale')).toBe('1');
    applyTextSize(undefined);
    expect(root.dataset.textSize).toBe('default');
  });
});
