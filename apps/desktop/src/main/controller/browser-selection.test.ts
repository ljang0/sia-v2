import { expect, it, vi } from 'vitest';
import { PlaintextTestCipher, SqliteRecordRepository } from '../storage/persistence.js';
import type { PersistedState } from './persisted-state.js';
import { computer, createHarness } from './test-support.js';

const originalStart = 'Wed Nov  4 10:00:00 2026';

it('retains the chosen window across Sia restart without restoring browser authority', async () => {
  let processStart = originalStart;
  const runCommand = vi.fn(async (file: string) => (file === '/bin/ps' ? processStart : ''));
  const call = vi.fn(async (tool: string) => {
    if (tool === 'list_apps') return { apps: [{ pid: 42, name: 'Google Chrome' }] };
    if (tool === 'list_windows') return { windows: [{ window_id: 7, title: 'Private title' }] };
    if (tool === 'get_browser_state')
      return {
        target_id: 'private-target',
        tab_id: 'private-tab',
        url: 'https://example.test/',
      };
    return {};
  });
  const first = await createHarness({ computer: { ...computer, call }, runCommand });
  let saved: PersistedState;
  try {
    await first.controller.invoke('browser.attach', { windowId: 7 });
    saved = first.repository.get<PersistedState>('desktop', 'state')!;
    expect(saved.browserSelection).toEqual({
      pid: 42,
      windowId: 7,
      processStartedAt: originalStart,
    });
    expect(saved.browser.availableWindows).toBeUndefined();
  } finally {
    await first.controller.shutdown();
  }
  const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
  repository.put('desktop', 'state', saved);
  const next = await createHarness({ repository, computer: { ...computer, call }, runCommand });
  const sink = {
    acceptBrowserState: vi.fn(),
    resetBrowserCapabilities: vi.fn(),
    trustedApprovalTarget: () => undefined,
  };
  next.controller.attachBrowserCapabilitySink(sink);
  try {
    expect(next.controller.snapshot().browser).toEqual({
      status: 'detached',
      grantedOrigins: [],
    });
    call.mockClear();
    expect(await next.controller.preferredBrowserWindow()).toEqual({ pid: 42, windowId: 7 });
    expect(call).not.toHaveBeenCalled();
    expect(sink.acceptBrowserState).not.toHaveBeenCalled();

    // A transient process-query failure does not invent a match or erase the user's choice.
    processStart = '';
    expect(await next.controller.preferredBrowserWindow()).toBeUndefined();
    processStart = originalStart;
    expect(await next.controller.preferredBrowserWindow()).toEqual({ pid: 42, windowId: 7 });

    // Even if the operating system reuses both numeric ids, a replacement process is not selected.
    processStart = 'Wed Nov  4 11:00:00 2026';
    expect(await next.controller.preferredBrowserWindow()).toBeUndefined();
    expect(
      repository.get<PersistedState>('desktop', 'state')!.browserSelection,
    ).toBeUndefined();
  } finally {
    await next.controller.shutdown();
  }
});

it('forgets the selection on explicit disconnect and never records an unverified process', async () => {
  let processStart = originalStart;
  const h = await createHarness({
    runCommand: async (file) => (file === '/bin/ps' ? processStart : ''),
    computer: {
      ...computer,
      call: async (tool) => {
        if (tool === 'list_apps') return { apps: [{ pid: 42, name: 'Google Chrome' }] };
        if (tool === 'list_windows') return { windows: [{ window_id: 7 }] };
        if (tool === 'get_browser_state')
          return { target_id: 'target', tab_id: 'tab', url: 'https://example.test/' };
        return {};
      },
    },
  });
  try {
    await h.controller.invoke('browser.attach', { windowId: 7 });
    expect(await h.controller.preferredBrowserWindow()).toEqual({ pid: 42, windowId: 7 });
    await h.controller.invoke('browser.detach', undefined);
    expect(await h.controller.preferredBrowserWindow()).toBeUndefined();
    processStart = '';
    await h.controller.invoke('browser.attach', { windowId: 7 });
    expect(h.controller.snapshot().browser.status).toBe('attached');
    expect(await h.controller.preferredBrowserWindow()).toBeUndefined();
  } finally {
    await h.controller.shutdown();
  }
});
