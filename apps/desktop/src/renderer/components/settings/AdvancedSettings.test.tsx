// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdvancedSettings } from './AdvancedSettings';

afterEach(cleanup);

describe('advanced settings', () => {
  it('keeps Developer tools off until the person turns it on', async () => {
    const onSetDeveloperTools = vi.fn(async () => undefined);
    render(
      <AdvancedSettings developerTools={false} onSetDeveloperTools={onSetDeveloperTools} />,
    );
    const toggle = screen.getByRole('switch', {
      name: /Developer tools/,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    await waitFor(() => expect(onSetDeveloperTools).toHaveBeenCalledWith(true));
  });
});
