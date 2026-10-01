// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserTaskRecovery, browserTaskRequest } from './BrowserTaskRecovery';
import { demoSnapshot } from '../demo/snapshot';
import type { ThreadDetail } from '../types';
afterEach(cleanup);
function fixture() {
  const thread = structuredClone(demoSnapshot.activeThread!);
  thread.status = 'idle';
  thread.events = [
    {
      id: 'user-1',
      type: 'message',
      role: 'user',
      content: 'Find my finals on Canvas',
      timestamp: '',
    },
    {
      id: 'tool-1',
      type: 'activity',
      kind: 'browser',
      toolName: 'browser_tabs',
      title: 'Finding browser tabs',
      status: 'complete',
      timestamp: '',
    },
    {
      id: 'reply-1',
      type: 'message',
      role: 'assistant',
      content: 'Please attach Chrome.',
      timestamp: '',
    },
  ];
  const browser = {
    ...structuredClone(demoSnapshot.browser),
    attached: false,
    status: 'detached' as const,
    availableWindows: [{ id: 7, label: 'Chrome window 1', detail: 'Canvas' }],
  };
  return { thread, browser };
}
it('connects from the existing request, then passes the explicitly chosen window', async () => {
  const { thread, browser } = fixture();
  const connect = vi.fn(async () => {});
  render(<BrowserTaskRecovery thread={thread} browser={browser} connect={connect} />);
  expect(connect).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Use Chrome window/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Connect Chrome & continue' }));
  await waitFor(() => expect(connect).toHaveBeenCalledWith(thread.id, 'user-1', undefined));
  fireEvent.click(screen.getByRole('button', { name: 'Use Chrome window 1: Canvas' }));
  await waitFor(() => expect(connect).toHaveBeenCalledWith(thread.id, 'user-1', 7));
});
it('shows connection errors and disables duplicate clicks during Chrome consent', async () => {
  const { thread, browser } = fixture();
  let fail!: (cause: Error) => void;
  const connect = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  render(<BrowserTaskRecovery thread={thread} browser={browser} connect={connect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Connect Chrome & continue' }));
  expect(
    (screen.getByRole('button', { name: 'Connecting to Chrome…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fail(new Error('Chrome needs your Allow click.'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Allow click'));
  expect(connect).toHaveBeenCalledTimes(1);
});
it('does not offer to replay old browser work after a new request, or connect an already connected window', () => {
  const { thread, browser } = fixture();
  render(
    <BrowserTaskRecovery
      thread={thread}
      browser={{ ...browser, attached: true }}
      connect={vi.fn()}
    />,
  );
  expect(screen.queryByRole('region')).toBeNull();
  thread.events.push({
    id: 'new-user',
    type: 'message',
    role: 'user',
    content: 'Write a poem',
    timestamp: '',
  });
  expect(browserTaskRequest(thread)).toBeUndefined();
  expect(browserTaskRequest({ ...thread, events: [] } as ThreadDetail)).toBeUndefined();
});
