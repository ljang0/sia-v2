// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiaPresence } from './SiaPresence';

afterEach(cleanup);

describe('Sia presence', () => {
  it('reflects real state and clamps microphone energy to five visual levels', () => {
    const view = render(<SiaPresence state="listening" audioLevel={8} />);
    const mark = view.container.querySelector('[data-state="listening"]');
    expect(mark?.getAttribute('data-level')).toBe('4');

    view.rerender(<SiaPresence state="complete" audioLevel={-2} />);
    expect(
      view.container.querySelector('[data-state="complete"]')?.getAttribute('data-level'),
    ).toBe('0');
  });
});
