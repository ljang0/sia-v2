// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoRendererApi, demoSnapshot } from '../demo';
import type { ProviderId, RendererApi } from '../types';
import { ARCHIVE_UNDO_MS, useAppController } from '../useAppController';
import { WorkspaceNotice } from './AppStates';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('workspace diagnostics', () => {
  it('deduplicates repeated failures and copies a support-ready diagnostic', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    api.refreshProvider = vi
      .fn<(provider: ProviderId) => Promise<void>>()
      .mockRejectedValue(new Error('Sia cloud request failed (503), request request-alpha12.'));

    render(<DiagnosticHarness api={api} />);
    await screen.findByRole('button', { name: 'Trigger failure' });

    fireEvent.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await screen.findByTestId('diagnostic-tray');
    fireEvent.click(screen.getByRole('button', { name: 'Trigger failure' }));
    await screen.findByText(/repeated 2 times/);

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]?.[0]).toContain('Sia support ID: request-alpha12');
    expect(writeText.mock.calls[0]?.[0]).toContain('Occurrences: 2');
  });
});

describe('archive feedback', () => {
  it('confirms an archive and restores the open conversation on Undo', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    await api.selectThread('thread-inbox');
    render(<ArchiveHarness api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive inbox' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Conversation archived');
    let current = await api.getSnapshot();
    expect(current.archivedThreads.map(({ id }) => id)).toContain('thread-inbox');
    expect(current.selectedThreadId).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.queryByText('Conversation archived')).toBeNull());
    current = await api.getSnapshot();
    expect(current.archivedThreads.map(({ id }) => id)).not.toContain('thread-inbox');
    expect(current.selectedThreadId).toBe('thread-inbox');
  });

  it('clears the archive notice on its own', async () => {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    render(<ArchiveHarness api={api} />);
    const archive = await screen.findByRole('button', { name: 'Archive inbox' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(archive);
    });
    expect(screen.getByText('Conversation archived')).toBeTruthy();
    act(() => vi.advanceTimersByTime(ARCHIVE_UNDO_MS));
    expect(screen.queryByText('Conversation archived')).toBeNull();
  });
});

describe('archive undo notice', () => {
  async function archive() {
    const api = createDemoRendererApi(structuredClone(demoSnapshot));
    render(<ArchiveHarness api={api} />);
    const button = await screen.findByRole('button', { name: 'Archive inbox' });
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(button);
    });
    return api;
  }

  it('pauses its countdown while hovered or focused', async () => {
    await archive();
    const notice = screen.getByText('Conversation archived').closest('[role="status"]')!;
    act(() => vi.advanceTimersByTime(ARCHIVE_UNDO_MS - 1000));
    fireEvent.pointerEnter(notice);
    act(() => vi.advanceTimersByTime(ARCHIVE_UNDO_MS * 2));
    expect(screen.getByText('Conversation archived')).toBeTruthy();
    fireEvent.pointerLeave(notice);
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    act(() => vi.advanceTimersByTime(ARCHIVE_UNDO_MS * 2));
    expect(screen.getByText('Conversation archived')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Undo' }).blur());
    act(() => vi.advanceTimersByTime(999));
    expect(screen.getByText('Conversation archived')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText('Conversation archived')).toBeNull();
  });

  it('dismisses with Escape', async () => {
    await archive();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Undo' }), { key: 'Escape' });
    expect(screen.queryByText('Conversation archived')).toBeNull();
  });

  it('keeps Undo available when a later action fails', async () => {
    const api = await archive();
    api.refreshProvider = vi.fn().mockRejectedValue(new Error('Model check failed.'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trigger failure' }));
    });
    expect(screen.getByTestId('diagnostic-tray').textContent).toContain('Model check failed.');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  });
});

function ArchiveHarness({ api }: { api: RendererApi }) {
  const app = useAppController(api);
  if (!app.snapshot) return null;
  return (
    <>
      <button type="button" onClick={() => void app.archiveThread('thread-inbox')}>
        Archive inbox
      </button>
      <button type="button" onClick={() => void app.run(() => api.refreshProvider('codex'))}>
        Trigger failure
      </button>
      <WorkspaceNotice app={app} />
    </>
  );
}

function DiagnosticHarness({ api }: { api: RendererApi }) {
  const app = useAppController(api);
  return (
    <>
      <button type="button" onClick={() => void app.run(() => api.refreshProvider('codex'))}>
        Trigger failure
      </button>
      <WorkspaceNotice app={app} />
    </>
  );
}
