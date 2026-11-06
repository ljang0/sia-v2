// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReadOnScreen, useWindowAttended } from './readOnScreen';
import type { ThreadStatus } from './types';

type Props = {
  conversation: { id: string; status: ThreadStatus; unread?: boolean } | undefined;
  onScreen: boolean;
};

afterEach(() => vi.restoreAllMocks());

it('does not treat a background-rendered conversation as read until the person returns', () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const markRead = vi.fn();
  const hook = renderHook(
    ({ status }: { status: ThreadStatus }) => {
      useReadOnScreen({ id: 't1', status, unread: true }, useWindowAttended(), markRead);
    },
    { initialProps: { status: 'running' as ThreadStatus } },
  );
  hook.rerender({ status: 'idle' });
  expect(markRead).not.toHaveBeenCalled();
  act(() => {
    focus.mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
  });
  expect(markRead).toHaveBeenCalledExactlyOnceWith('t1');
  hook.unmount();
});

function setup(initial: Props) {
  const markRead = vi.fn();
  const hook = renderHook(
    ({ conversation, onScreen }: Props) => useReadOnScreen(conversation, onScreen, markRead),
    { initialProps: initial },
  );
  return { markRead, rerender: hook.rerender };
}

describe('useReadOnScreen', () => {
  it('reads the open conversation as its work finishes on screen', () => {
    const { markRead, rerender } = setup({
      conversation: { id: 't1', status: 'running' },
      onScreen: true,
    });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: true });
    expect(markRead).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('keeps work that finished elsewhere unread until the conversation is on screen', () => {
    const { markRead, rerender } = setup({
      conversation: { id: 't1', status: 'running' },
      onScreen: false,
    });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: false });
    expect(markRead).not.toHaveBeenCalled();
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: true });
    expect(markRead).toHaveBeenCalledExactlyOnceWith('t1');
  });

  it('leaves a conversation the person marked unread alone', () => {
    const { markRead, rerender } = setup({
      conversation: { id: 't1', status: 'idle' },
      onScreen: true,
    });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: true });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: false });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: true });
    expect(markRead).not.toHaveBeenCalled();
  });

  it('does not carry a finish over to another conversation', () => {
    const { markRead, rerender } = setup({
      conversation: { id: 't1', status: 'running' },
      onScreen: false,
    });
    rerender({ conversation: { id: 't1', status: 'idle', unread: true }, onScreen: false });
    rerender({ conversation: { id: 't2', status: 'idle', unread: true }, onScreen: true });
    expect(markRead).not.toHaveBeenCalled();
  });
});
