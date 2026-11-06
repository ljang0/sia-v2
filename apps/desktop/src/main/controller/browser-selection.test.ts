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

it.each([
  'restore',
  'other-app',
  'focus-changed',
  'new-process',
  'missing-window',
  'confirm',
  'connected',
  'disconnected',
] as const)(
  'startup restores only the chosen live window while Sia is active: %s',
  async (scenario) => {
    let restarted = false;
    let foregroundChecks = 0;
    const runCommand = vi.fn(async (file: string) =>
      file === '/bin/ps'
        ? restarted && scenario === 'new-process'
          ? 'Wed Nov  4 11:00:00 2026'
          : originalStart
        : '',
    );
    const call = vi.fn(async (tool: string, _args: Record<string, unknown>) => {
      if (tool === 'list_apps') return { apps: [{ pid: 42, name: 'Google Chrome' }] };
      if (tool === 'list_windows')
        return {
          windows:
            restarted && scenario === 'missing-window'
              ? [{ window_id: 8 }]
              : [{ window_id: 7 }, { window_id: 8 }],
        };
      if (tool === 'get_browser_state')
        return { target_id: 'fresh-target', tab_id: 'fresh-tab', url: 'https://example.test/' };
      return {};
    });
    const first = await createHarness({ computer: { ...computer, call }, runCommand });
    let saved: PersistedState;
    try {
      await first.controller.invoke('computer.setAccessMode', { mode: 'mac' });
      await first.controller.invoke('computer.setTrust', { trust: 'auto' });
      await first.controller.invoke('browser.attach', { windowId: 7 });
      if (scenario === 'confirm')
        await first.controller.invoke('computer.setTrust', { trust: 'ask' });
      if (scenario === 'connected')
        await first.controller.invoke('computer.setAccessMode', { mode: 'connected' });
      if (scenario === 'disconnected')
        await first.controller.invoke('browser.detach', undefined);
      saved = first.repository.get<PersistedState>('desktop', 'state')!;
    } finally {
      await first.controller.shutdown();
    }
    restarted = true;
    call.mockClear();
    const repository = new SqliteRecordRepository(':memory:', new PlaintextTestCipher());
    repository.put('desktop', 'state', saved);
    const returnToAppAfterBrowserSetup = vi.fn(async (_pid?: number) => undefined);
    const next = await createHarness({
      repository,
      computer: { ...computer, call },
      runCommand,
      returnToAppAfterBrowserSetup,
      startupForeground: async () => {
        foregroundChecks++;
        return (
          scenario !== 'other-app' && !(scenario === 'focus-changed' && foregroundChecks > 1)
        );
      },
    });
    try {
      const preparations = call.mock.calls.filter(([tool]) => tool === 'browser_prepare');
      if (scenario === 'restore') {
        expect(preparations).toHaveLength(1);
        expect(preparations[0]![1]).toMatchObject({
          pid: 42,
          window_id: 7,
          delivery_mode: 'foreground',
          strategy: { kind: 'existing_profile' },
        });
        expect(next.controller.snapshot().browser.status).toBe('attached');
        expect(returnToAppAfterBrowserSetup).toHaveBeenCalledExactlyOnceWith(42);
        expect(call.mock.calls.filter(([tool]) => tool === 'get_browser_state')).toHaveLength(
          1,
        );
        expect(next.controller.snapshot().browser.grantedOrigins).toEqual([
          'https://example.test',
        ]);
      } else {
        expect(preparations).toEqual([]);
        expect(call.mock.calls.some(([tool]) => tool === 'get_browser_state')).toBe(false);
        expect(returnToAppAfterBrowserSetup).not.toHaveBeenCalled();
        expect(next.controller.snapshot().browser.grantedOrigins).toEqual([]);
      }
    } finally {
      await next.controller.shutdown();
    }
  },
);
