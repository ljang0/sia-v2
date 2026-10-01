// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionList } from './MotionList';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const list = (ids: string[], instant = false) => (
  <MotionList items={ids.map((id) => ({ id }))} instant={instant}>
    {(item) => <span>{item.id}</span>}
  </MotionList>
);

describe('MotionList', () => {
  it('opens new rows into place and folds removed rows away before dropping them', () => {
    vi.useFakeTimers();
    const view = render(list(['a', 'b']));
    // Rows that were there from the start do not animate.
    expect(view.container.querySelectorAll('[data-motion]')).toHaveLength(0);

    view.rerender(list(['c', 'a', 'b']));
    expect(screen.getByText('c').closest('[data-motion]')?.getAttribute('data-motion')).toBe(
      'enter',
    );

    view.rerender(list(['c', 'a']));
    const leaving = screen.getByText('b').closest<HTMLElement>('[data-motion]')!;
    expect(leaving.dataset.motion).toBe('leave');
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(leaving.hasAttribute('inert')).toBe(true);
    // The folding row keeps its place at the end of the list.
    expect(
      [...view.container.firstElementChild!.children].map((row) => row.textContent),
    ).toEqual(['c', 'a', 'b']);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByText('b')).toBeNull();
  });

  it('removes rows at once when motion is reduced', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const view = render(list(['a', 'b']));
    view.rerender(list(['a']));
    expect(screen.queryByText('b')).toBeNull();
  });

  it('filters without motion and brings filtered rows back without replaying their entrance', () => {
    const view = render(list(['a', 'b', 'c']));
    view.rerender(list(['b'], true));
    expect(screen.queryByText('a')).toBeNull();
    expect(view.container.querySelectorAll('[data-motion]')).toHaveLength(0);
    view.rerender(list(['a', 'b', 'c']));
    expect(view.container.querySelectorAll('[data-motion]')).toHaveLength(0);
  });
});
