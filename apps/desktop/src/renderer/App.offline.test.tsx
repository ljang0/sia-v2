// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createDemoRendererApi } from './demo/api';
import { demoSnapshot } from './demo/snapshot';

afterEach(() => {
  cleanup();
  setOnline(true);
});

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

describe('offline sending', () => {
  it('holds a message while offline and sends it when the Mac is back online', async () => {
    const snapshot = structuredClone(demoSnapshot);
    // An idle thread with nothing waiting, so Send goes straight to the thread.
    snapshot.activeThread = { ...snapshot.activeThread!, status: 'idle', events: [] };
    const api = createDemoRendererApi(snapshot);
    const send = vi.spyOn(api, 'sendMessage');
    render(<App api={api} />);
    await screen.findByRole('button', { name: 'Access' });

    act(() => setOnline(false));
    expect(screen.getByTestId('offline-banner').textContent).toContain(
      'You’re offline — Sia will send when you’re back.',
    );

    const input = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Draft my weekly update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByTestId('queued-message').textContent).toContain(
      'Draft my weekly update',
    );

    act(() => setOnline(true));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        snapshot.activeThread!.id,
        'Draft my weekly update',
        [],
      ),
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('lets the person remove a held message before it is sent', async () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.activeThread = { ...snapshot.activeThread!, status: 'idle', events: [] };
    const api = createDemoRendererApi(snapshot);
    const send = vi.spyOn(api, 'sendMessage');
    render(<App api={api} />);
    await screen.findByRole('button', { name: 'Access' });
    act(() => setOnline(false));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Never mind' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove queued message' }));
    await waitFor(() => expect(screen.queryByTestId('queued-message')).toBeNull());
    act(() => setOnline(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(send).not.toHaveBeenCalled();
  });
});
