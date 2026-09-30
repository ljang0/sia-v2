// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { cancelComposerFocus, focusComposer } from './composerFocus';
import { createDemoRendererApi, demoSnapshot } from './demo';
import { conversationForShortcut } from './shortcuts';
import type { RendererApi, RendererSnapshot } from './types';

afterEach(cleanup);

const composer = () => screen.getByRole('textbox', { name: 'Message' });

async function renderApp(configure?: (snapshot: RendererSnapshot) => void) {
  const snapshot = structuredClone(demoSnapshot);
  configure?.(snapshot);
  const api = createDemoRendererApi(snapshot);
  render(<App api={api} />);
  await screen.findByRole('button', { name: 'Access' });
  return api;
}

function runningInbox(snapshot: RendererSnapshot) {
  snapshot.selectedThreadId = 'thread-inbox';
  const thread = snapshot.agents
    .flatMap(({ threads }) => threads)
    .find(({ id }) => id === 'thread-inbox')!;
  snapshot.activeThread = {
    ...structuredClone(snapshot.activeThread!),
    ...thread,
    events: [],
    status: 'running',
    queuedMessages: [
      {
        id: 'queued-1',
        type: 'message',
        role: 'user',
        content: 'Then check my calendar',
        timestamp: thread.updatedAt,
      },
    ],
  };
}

describe('focus after actions that remove the focused control', () => {
  it('focuses a newly arrived approval card, not its Approve button, then the composer', async () => {
    await renderApp();
    const card = await screen.findByTestId('approval-card');
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(card.getAttribute('tabindex')).toBe('-1');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('returns to the composer after Don’t allow', async () => {
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: "Don't allow" }));
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('returns to the composer after Stop and after removing a queued message', async () => {
    await renderApp(runningInbox);
    const stop = await screen.findByRole('button', { name: 'Stop current turn' });
    const remove = screen.getByRole('button', { name: 'Remove queued message' });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(document.activeElement).toBe(composer()));

    stop.focus();
    fireEvent.click(stop);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Stop current turn' })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('opens a conversation from ⌘K with the composer focused', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const search = await screen.findByRole('combobox', {
      name: 'Search conversations and actions',
    });
    fireEvent.change(search, { target: { value: 'inbox' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Triage today’s inbox' })
          .getAttribute('aria-current'),
      ).toBe('page'),
    );
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('focuses the composer when a notification opens a conversation', async () => {
    const snapshot = structuredClone(demoSnapshot);
    const api: RendererApi = createDemoRendererApi(snapshot);
    let reveal: (() => void) | undefined;
    api.onOpenConversation = (listener) => {
      reveal = listener;
      return () => undefined;
    };
    render(<App api={api} />);
    await screen.findByRole('button', { name: 'Access' });
    await act(async () => {
      await api.selectThread('thread-inbox');
    });
    act(() => reveal?.());
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('returns to the composer after archiving from the thread menu', async () => {
    await renderApp();
    // Settle the open thread's approval so its composer accepts focus.
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(composer().hasAttribute('disabled')).toBe(false));
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation actions for Triage today’s inbox' }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(await screen.findByText('Conversation archived')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('returns Escape out of the delete dialog to the thread menu button', async () => {
    await renderApp();
    const trigger = screen.getByRole('button', {
      name: 'Conversation actions for Triage today’s inbox',
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Delete this conversation?',
    });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe('keyboard shortcuts', () => {
  it('stops the running task with Esc', async () => {
    await renderApp(runningInbox);
    await screen.findByRole('button', { name: 'Stop current turn' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Stop current turn' })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(composer()));
  });

  it('leaves the task running when Esc closes a dialog', async () => {
    await renderApp(runningInbox);
    await screen.findByRole('button', { name: 'Stop current turn' });
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.textContent).toContain('Stop the running task');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Stop current turn' })).toBeTruthy();
  });

  it('opens the nth sidebar conversation with ⌘1–9', async () => {
    await renderApp();
    const threadId = conversationForShortcut(demoSnapshot.agents, 2)!;
    const title = demoSnapshot.agents
      .flatMap(({ threads }) => threads)
      .find(({ id }) => id === threadId)!.title;
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: title }).getAttribute('aria-current')).toBe(
        'page',
      ),
    );
  });
});

describe('focusComposer', () => {
  it('waits for a disabled composer and never takes focus the person moved elsewhere', async () => {
    document.body.innerHTML =
      '<textarea data-composer-input disabled></textarea><input aria-label="Other" />';
    const field = document.querySelector('textarea')!;
    focusComposer();
    expect(document.activeElement).toBe(document.body);
    field.disabled = false;
    await waitFor(() => expect(document.activeElement).toBe(field));

    field.blur();
    const other = document.querySelector('input')!;
    focusComposer();
    other.focus();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(document.activeElement).toBe(other);
    document.body.innerHTML = '';
  });

  it('stops retrying when the page goes away or the app cancels it', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<textarea data-composer-input disabled></textarea>';
      const field = document.querySelector('textarea')!;
      focusComposer();
      vi.stubGlobal('document', undefined);
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
      vi.unstubAllGlobals();

      focusComposer();
      cancelComposerFocus();
      field.disabled = false;
      vi.advanceTimersByTime(200);
      expect(document.activeElement).toBe(document.body);
      document.body.innerHTML = '';
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
