// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACK_ONLINE_MS, ConnectionBanner } from './offline';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConnectionBanner', () => {
  it('shows nothing when launch starts online', () => {
    render(<ConnectionBanner online />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('confirms the connection briefly after being offline, then clears', () => {
    vi.useFakeTimers();
    const { rerender } = render(<ConnectionBanner online={false} />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();

    rerender(<ConnectionBanner online />);
    expect(screen.queryByTestId('offline-banner')).toBeNull();
    expect(screen.getByTestId('online-banner').textContent).toContain('Back online');

    act(() => {
      vi.advanceTimersByTime(BACK_ONLINE_MS);
    });
    expect(screen.queryByTestId('online-banner')).toBeNull();
  });

  it('returns to the offline banner if the connection drops again', () => {
    const { rerender } = render(<ConnectionBanner online={false} />);
    rerender(<ConnectionBanner online />);
    rerender(<ConnectionBanner online={false} />);
    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.queryByTestId('online-banner')).toBeNull();
  });
});
