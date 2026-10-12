// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ThreadSummary } from '../../types';
import { ThreadLabel } from './ThreadLabel';

afterEach(cleanup);

const thread = (overrides: Partial<ThreadSummary>) =>
  ({ id: 'thread-1', title: 'Invoices', status: 'running', ...overrides }) as ThreadSummary;

it('says what a running conversation is doing now', () => {
  const { rerender } = render(
    <ThreadLabel
      thread={thread({
        preview: { label: 'Latest activity', text: 'Searching your mail', active: true },
      })}
    />,
  );
  expect(screen.getByText('Searching your mail')).toBeTruthy();
  rerender(
    <ThreadLabel
      thread={thread({ preview: { label: 'Latest reply', text: 'Here is', active: true } })}
    />,
  );
  expect(screen.getByText('Writing the reply')).toBeTruthy();
  rerender(
    <ThreadLabel
      thread={thread({ preview: { label: 'Latest activity', text: 'Searching your mail' } })}
    />,
  );
  expect(screen.getByText('Working')).toBeTruthy();
});
