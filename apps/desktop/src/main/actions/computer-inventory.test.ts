import { describe, expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

// These fixtures advance app state with explicit mock observations. Real settle
// sleeps add load and timing failures without exercising an application's timing.
vi.mock('node:timers/promises', async (original) => ({
  ...(await original<typeof import('node:timers/promises')>()),
  setTimeout: vi.fn(
    async (_ms?: number, value?: unknown, options?: { signal?: AbortSignal }) => {
      options?.signal?.throwIfAborted();
      return value;
    },
  ),
}));

describe('DesktopActionBackend computer boundary', () => {
  it('opens Apple Notes through the trusted host before requesting fresh window ids', async () => {
    const openApplication = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      openApplication,
    });

    const result = await backend.invoke(request('computer_open_app', { application: 'notes' }));

    expect(result).toMatchObject({
      outcome: 'verified',
      summary: expect.stringContaining('opening Apple Notes'),
    });
    expect(openApplication).toHaveBeenCalledWith('notes', { background: false });
  });

  it('keeps a live computer grant usable for a slow model turn and expires it after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));
      const cua = fakeCua(async (tool) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 91, app_name: 'TextEdit' }] };
        }
        if (tool === 'get_window_state') {
          return {
            snapshot_id: 'native-snapshot-1',
            elements: [
              {
                element_index: 7,
                element_token: 'text-area-1',
                role: 'AXTextArea',
                value: 'Existing text',
              },
            ],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      });
      const backend = new DesktopActionBackend({ cua });
      const target = await grantedComputerTarget(backend);

      vi.advanceTimersByTime(9 * 60_000);
      const captured = await backend.invoke(
        request('computer_snapshot', {
          app_id: target.appId,
          window_id: target.windowId,
        }),
      );
      expect(captured.outcome).toBe('verified');
      const capturedData = dataRecord(captured.data);
      const element = (capturedData.elements as Array<Record<string, unknown>>)[0]!;
      expect(
        backend.trustedApprovalTarget('computer_action', {
          app_id: target.appId,
          window_id: target.windowId,
          snapshot_id: capturedData.snapshot_id,
          action: 'set',
          element_ref: element.element_ref,
        }),
      ).toMatch(/TextEdit: set text area/);

      vi.advanceTimersByTime(60_001);
      expect(
        backend.trustedApprovalTarget('computer_action', {
          app_id: target.appId,
          window_id: target.windowId,
          snapshot_id: capturedData.snapshot_id,
          action: 'set',
          element_ref: element.element_ref,
        }),
      ).toBeUndefined();
      const expired = await backend.invoke(
        request('computer_snapshot', {
          app_id: target.appId,
          window_id: target.windowId,
        }),
      );
      expect(expired.outcome).toBe('stale');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sanitizes inventory and does not expose launch paths', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return {
          apps: [
            {
              pid: 42,
              name: 'Notes',
              bundle_id: 'com.apple.Notes',
              launch_path: '/Applications/Notes.app',
              running: true,
            },
            { pid: 0, name: 'Not running', launch_path: '/Applications/Other.app' },
          ],
        };
      }
      return {
        windows: [
          {
            pid: 42,
            window_id: 91,
            app_name: 'Notes',
            title: 'Private note',
            z_index: 10,
            bounds: { x: 1, y: 2, width: 800, height: 600 },
          },
        ],
      };
    });
    const backend = new DesktopActionBackend({ cua });

    const result = await backend.invoke(request('computer_list', {}));

    expect(result.outcome).toBe('verified');
    const data = dataRecord(result.data);
    const appId = String((data.apps as Array<Record<string, unknown>>)[0]?.app_id);
    const windowId = String((data.windows as Array<Record<string, unknown>>)[0]?.window_id);
    expect(appId).toMatch(/^app:[0-9a-f-]{36}$/);
    expect(windowId).toMatch(/^window:[0-9a-f-]{36}$/);
    expect(result.data).toEqual({
      installed_apps: [],
      apps: [{ app_id: appId, name: 'Notes', bundle_id: 'com.apple.Notes' }],
      windows: [
        {
          app_id: appId,
          window_id: windowId,
          app_name: 'Notes',
          title: 'Private note',
          bounds: { x: 1, y: 2, width: 800, height: 600 },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('launch_path');
    expect(JSON.stringify(result)).not.toContain('"42"');
    expect(JSON.stringify(result)).not.toContain('"91"');
  });

  it('drops only confirmed hidden titleless WindowServer entries', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
      }
      return {
        windows: [
          {
            pid: 42,
            window_id: 90,
            app_name: 'TextEdit',
            title: '',
            is_on_screen: false,
            on_current_space: false,
          },
          {
            pid: 42,
            window_id: 93,
            app_name: 'TextEdit',
            title: '',
            is_on_screen: false,
            on_current_space: null,
          },
          {
            pid: 42,
            window_id: 91,
            app_name: 'TextEdit',
            title: '',
            is_on_screen: true,
            on_current_space: true,
          },
          {
            pid: 42,
            window_id: 92,
            app_name: 'TextEdit',
            title: 'Background draft',
            is_on_screen: false,
            on_current_space: false,
          },
        ],
      };
    });
    const backend = new DesktopActionBackend({ cua });

    const result = await backend.invoke(request('computer_list', {}));
    const windows = dataRecord(result.data).windows as Array<Record<string, unknown>>;

    expect(windows).toHaveLength(2);
    expect(windows.map(({ title }) => title)).toEqual(['', 'Background draft']);
  });

  it('filters sensitive apps and rejects guessed native process/window ids', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return {
          apps: [
            { pid: 10, name: 'Notes', bundle_id: 'com.apple.Notes' },
            { pid: 11, name: '1Password', bundle_id: 'com.1password.1password' },
            { pid: 12, name: 'Google Chrome', bundle_id: 'com.google.Chrome' },
            { pid: 13, name: 'Terminal', bundle_id: 'com.apple.Terminal' },
            { pid: 14, name: 'Sia', bundle_id: 'ai.sia.desktop' },
            { pid: 15, name: 'Keeper', bundle_id: 'com.callpod.keeper' },
          ],
        };
      }
      if (tool === 'list_windows') {
        return {
          windows: [
            { pid: 10, window_id: 20, app_name: 'Notes', title: 'Draft' },
            { pid: 11, window_id: 21, app_name: '1Password', title: 'Vault' },
            { pid: 12, window_id: 22, app_name: 'Chrome', title: 'Bank' },
            { pid: 13, window_id: 23, app_name: 'Terminal', title: 'shell' },
            { pid: 14, window_id: 24, app_name: 'Sia', title: 'Approve action' },
            { pid: 15, window_id: 25, app_name: 'Keeper', title: 'Vault' },
          ],
        };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });

    const listed = await backend.invoke(request('computer_list', {}));
    expect(JSON.stringify(listed)).toContain('Notes');
    expect(JSON.stringify(listed)).not.toMatch(
      /1Password|Chrome|Terminal|Sia|Keeper|Vault|Bank|shell|Approve action/,
    );

    const guessed = await backend.invoke(
      request('computer_snapshot', { app_id: '10', window_id: '20' }),
    );
    expect(guessed.outcome).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
  });

  it('revalidates the live process identity before using an opaque window grant', async () => {
    let appReads = 0;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        appReads += 1;
        return {
          apps: [
            appReads === 1
              ? { pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }
              : { pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' },
          ],
        };
      }
      if (tool === 'list_windows') {
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes' }] };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    const target = await grantedComputerTarget(backend);

    const result = await backend.invoke(
      request('computer_snapshot', {
        app_id: target.appId,
        window_id: target.windowId,
      }),
    );

    expect(result.outcome).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
  });
});

it('discovers and launches ordinary installed apps while rejecting sensitive apps and arbitrary paths', async () => {
  const openApplication = vi.fn(async () => undefined);
  const backend = new DesktopActionBackend({
    cua: fakeCua(async () => ({})),
    openApplication,
    installedApplications: async () => [
      { id: 'com.apple.Preview', name: 'Preview' },
      { id: 'com.apple.Terminal', name: 'Terminal' },
    ],
  });
  const listed = await backend.invoke(request('computer_list', {}));
  expect(dataRecord(listed.data).installed_apps).toEqual([
    { application: 'com.apple.Preview', name: 'Preview' },
  ]);
  expect(
    (await backend.invoke(request('computer_open_app', { application: 'com.apple.Preview' })))
      .outcome,
  ).toBe('verified');
  expect(
    (await backend.invoke(request('computer_open_app', { application: 'com.apple.Terminal' })))
      .outcome,
  ).toBe('refused');
  expect(
    (await backend.invoke(request('computer_open_app', { application: '/tmp/evil.app' })))
      .outcome,
  ).toBe('refused');
  expect(openApplication).toHaveBeenCalledExactlyOnceWith('com.apple.Preview', {
    background: false,
  });
});

it.each([undefined, 'background', 'foreground'] as const)(
  'routes Mac application opening with explicit delivery: %s',
  async (delivery) => {
    const cua = fakeCua(async () => ({ apps: [], windows: [] }));
    const openApplication = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua,
      openApplication,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const result = await backend.invoke(
      request('computer_open_app', { application: 'notes', ...(delivery ? { delivery } : {}) }),
    );
    expect(result.outcome).toBe('verified');
    expect(openApplication).toHaveBeenCalledExactlyOnceWith('notes', {
      background: delivery !== 'foreground',
    });
    expect(dataRecord(result.data).delivery_requested).toBe(delivery ?? 'background');
  },
);
