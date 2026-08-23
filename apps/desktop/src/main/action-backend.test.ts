import type { ValidatedActionInvocation } from '@sia/action-gateway';
import {
  getActionToolDescriptor,
  parseActionArguments,
  type ActionToolName,
} from '@sia/action-gateway';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  truncate,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DesktopActionBackend,
  sweepStaleBrowserVaults,
  type CloudActionClient,
  type CuaToolCaller,
} from './action-backend.js';

function request(
  name: ActionToolName,
  args: Record<string, unknown>,
): ValidatedActionInvocation {
  const descriptor = getActionToolDescriptor(name)!;
  return {
    name,
    arguments: args,
    descriptor,
    ...(descriptor.annotations.requiresApproval ? { approvalId: 'approval-1' } : {}),
    context: {
      sessionId: 'provider-session',
      threadId: 'thread-1',
      turnId: 'turn-1',
      provider: 'codex',
      workspace: '/workspace',
    },
  };
}

function fakeCua(
  implementation: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
): CuaToolCaller & { call: ReturnType<typeof vi.fn> } {
  return { call: vi.fn(implementation) };
}

function dataRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object');
  return value as Record<string, unknown>;
}

async function grantedComputerTarget(
  backend: DesktopActionBackend,
): Promise<{ appId: string; windowId: string; appName: string }> {
  const listed = await backend.invoke(request('computer_list', {}));
  expect(listed.outcome).toBe('verified');
  const data = dataRecord(listed.data);
  const app = (data.apps as Array<Record<string, unknown>>)[0]!;
  const window = (data.windows as Array<Record<string, unknown>>)[0]!;
  expect(app.app_id).toMatch(/^app:[0-9a-f-]{36}$/);
  expect(window.window_id).toMatch(/^window:[0-9a-f-]{36}$/);
  return {
    appId: String(app.app_id),
    windowId: String(window.window_id),
    appName: String(app.name),
  };
}

describe('DesktopActionBackend computer boundary', () => {
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

  it('mints Sia refs, excludes protected inputs, and binds actions to the latest snapshot', async () => {
    let snapshot = 0;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
      }
      if (tool === 'list_windows') {
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes' }] };
      }
      if (tool === 'get_window_state') {
        snapshot += 1;
        return {
          value: {
            snapshot_id: snapshot === 1 ? 's12345678' : 's87654321',
            tree_markdown: 'AXSecureTextField value=never expose tree secret',
            structuredContent: {
              elements: [
                {
                  element_index: 7,
                  element_token: `native-token-${snapshot}`,
                  role: 'AXButton',
                  label: 'Save',
                },
                {
                  element_index: 8,
                  element_token: 'password-token',
                  role: 'AXSecureTextField',
                  value: 'never expose me',
                },
                {
                  element_index: 9,
                  element_token: 'hidden-menu-token',
                  role: 'AXMenuItem',
                  label: 'Hidden menu item',
                },
              ],
            },
          },
          images: [{ mimeType: 'image/png', dataBase64: `pixels-${snapshot}` }],
        };
      }
      if (tool === 'click') {
        return {
          effect: 'unverifiable',
          route: 'accessibility',
          delivery: { mode: 'background' },
        };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    const target = await grantedComputerTarget(backend);
    const captured = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const capturedData = dataRecord(captured.data);
    const elements = capturedData.elements as Array<Record<string, unknown>>;
    expect(elements).toHaveLength(1);
    expect(JSON.stringify(captured)).not.toContain('native-token');
    expect(JSON.stringify(captured)).not.toContain('never expose me');
    expect(JSON.stringify(captured)).not.toContain('tree secret');
    expect(JSON.stringify(captured)).not.toContain('Hidden menu item');
    expect(
      backend.trustedApprovalTarget('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: capturedData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
      }),
    ).toMatch(/Notes: click “Save” \(AXButton, exact snapshot ref w:/);

    const acted = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        app_name: target.appName,
        snapshot_id: capturedData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
      }),
    );

    expect(acted.outcome).toBe('accepted_unverified');
    expect(acted.verification?.snapshotId).not.toBe(capturedData.snapshot_id);
    expect(acted.images).toEqual([{ mimeType: 'image/png', dataBase64: 'pixels-2' }]);
    const actedData = dataRecord(acted.data);
    expect(actedData.snapshot_id).toBe(acted.verification?.snapshotId);
    expect(actedData).not.toHaveProperty('snapshot');
    const click = cua.call.mock.calls.find(([tool]) => tool === 'click');
    expect(click?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      snapshot_id: 's12345678',
      element_token: 'native-token-1',
      delivery_mode: 'background',
    });

    const staleResult = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        app_name: target.appName,
        snapshot_id: capturedData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
      }),
    );
    expect(staleResult.outcome).toBe('stale');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('routes exact replacement and modifier shortcuts to bounded CUA primitives', async () => {
    let snapshot = 0;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
      }
      if (tool === 'list_windows') {
        return { windows: [{ pid: 42, window_id: 91, app_name: 'TextEdit' }] };
      }
      if (tool === 'get_window_state') {
        snapshot += 1;
        return {
          snapshot_id: `native-snapshot-${snapshot}`,
          elements: [
            {
              element_index: 7,
              element_token: `text-area-${snapshot}`,
              role: 'AXTextArea',
              name: snapshot === 1 ? 'Existing text' : 'Replacement text',
              value: snapshot === 1 ? 'Existing text' : 'Replacement text',
            },
          ],
        };
      }
      if (tool === 'set_value' || tool === 'hotkey') {
        return { effect: 'confirmed', delivery: { mode: 'background' } };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    const target = await grantedComputerTarget(backend);
    const firstSnapshot = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const firstData = dataRecord(firstSnapshot.data);
    const firstElement = (firstData.elements as Array<Record<string, unknown>>)[0]!;
    expect(firstElement.label).toBeUndefined();
    expect(
      backend.trustedApprovalTarget('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: firstData.snapshot_id,
        action: 'set',
        element_ref: firstElement.element_ref,
      }),
    ).toMatch(/TextEdit: set text area \(AXTextArea, exact snapshot ref w:/);

    const replaced = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        app_name: target.appName,
        snapshot_id: firstData.snapshot_id,
        action: 'set',
        element_ref: firstElement.element_ref,
        text: 'Replacement text',
      }),
    );
    expect(replaced.outcome).toBe('verified');
    expect(cua.call.mock.calls.find(([tool]) => tool === 'set_value')?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      element_token: 'text-area-1',
      value: 'Replacement text',
      delivery_mode: 'background',
    });

    const replacedData = dataRecord(replaced.data);
    const nextElement = (replacedData.elements as Array<Record<string, unknown>>)[0]!;
    const shortcut = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        app_name: target.appName,
        snapshot_id: replacedData.snapshot_id,
        action: 'key',
        element_ref: nextElement.element_ref,
        value: 'a',
        modifiers: ['cmd'],
      }),
    );
    expect(shortcut.outcome).toBe('verified');
    expect(cua.call.mock.calls.find(([tool]) => tool === 'hotkey')?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      element_token: 'text-area-2',
      keys: ['cmd', 'a'],
      delivery_mode: 'background',
    });
  });

  it('types into the focused control when an exact app window exposes no elements', async () => {
    let snapshot = 0;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return { apps: [{ pid: 77, name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap' }] };
      }
      if (tool === 'list_windows') {
        return { windows: [{ pid: 77, window_id: 88, app_name: 'Slack', title: 'Lawrence' }] };
      }
      if (tool === 'get_window_state') {
        snapshot += 1;
        return { snapshot_id: `slack-native-${snapshot}`, elements: [] };
      }
      if (tool === 'type_text') {
        return { effect: 'confirmed', delivery: { mode: 'foreground' } };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    const target = await grantedComputerTarget(backend);
    const captured = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const capturedData = dataRecord(captured.data);

    expect(
      backend.trustedApprovalTarget('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: capturedData.snapshot_id,
        action: 'type',
        text: 'Hello from Sia',
      }),
    ).toBe('Slack, window “Lawrence”: type the currently focused control');

    const typed = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: capturedData.snapshot_id,
        action: 'type',
        text: 'Hello from Sia',
      }),
    );

    expect(typed.outcome).toBe('verified');
    expect(cua.call.mock.calls.find(([tool]) => tool === 'type_text')?.[1]).toMatchObject({
      pid: 77,
      window_id: 88,
      text: 'Hello from Sia',
      delivery_mode: 'foreground',
    });
  });

  it('never performs an implicit foreground retry', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps') {
        return { apps: [{ pid: 5, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
      }
      if (tool === 'list_windows') {
        return { windows: [{ pid: 5, window_id: 6, app_name: 'Notes' }] };
      }
      if (tool === 'get_window_state') {
        return {
          snapshot_id: 's12345678',
          elements: [{ element_index: 1, element_token: 'native', role: 'AXButton' }],
        };
      }
      return {
        effect: 'suspected_noop',
        route: 'accessibility',
        delivery: { mode: 'background' },
        escalation: { target: 'foreground', reason: 'effect_unconfirmed' },
      };
    });
    const backend = new DesktopActionBackend({ cua });
    const target = await grantedComputerTarget(backend);
    const snapshotResult = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const snapshotData = dataRecord(snapshotResult.data);
    const element = (snapshotData.elements as Array<Record<string, unknown>>)[0]!;

    const result = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        app_name: target.appName,
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: element.element_ref,
      }),
    );

    expect(result.outcome).toBe('needs_foreground');
    const actionArgs = cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1] as Record<
      string,
      unknown
    >;
    expect(actionArgs.delivery_mode).toBe('background');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
    expect(
      cua.call.mock.calls.some(([tool]) => /foreground|bring_to_front|activate/i.test(tool)),
    ).toBe(false);
  });
});

describe('DesktopActionBackend browser boundary', () => {
  it('opens the Full Disk Access pane once when local Messages reads are blocked', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const openFullDiskAccessSettings = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua,
      openFullDiskAccessSettings,
      messages: {
        search: () => {
          throw new Error(
            'Reading Messages needs Full Disk Access for Sia: System Settings → Privacy & Security → Full Disk Access, add Sia, then retry.',
          );
        },
        readThread: () => [],
        send: async () => undefined,
      },
    });
    const first = await backend.invoke(request('messages_search', {}));
    expect(first.outcome).toBe('refused');
    expect(first.reason).toContain('System Settings has been opened');
    await backend.invoke(request('messages_search', {}));
    expect(openFullDiskAccessSettings).toHaveBeenCalledOnce();
  });

  it('refuses a message send that skipped the host authorization boundary', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const send = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua,
      messages: { search: () => [], readThread: () => [], send },
    });
    const { approvalId: _approvalId, ...unapproved } = request('messages_send', {
      recipient: '+15551234567',
      text: 'hi',
    });
    const result = await backend.invoke(unapproved);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('action authorization');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports zero granted tabs after the trusted host revokes the attachment', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      },
      'sia-browser-revoked-session',
    );

    backend.resetBrowserCapabilities();
    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result).toMatchObject({ outcome: 'verified', data: { tabs: [] } });
    expect(result.summary).toContain('Found 0 granted browser tabs.');
    expect(result.summary).toContain('rather than concluding Chrome is closed');
    expect(cua.call).not.toHaveBeenCalled();
  });

  it('uses the current host-minted browser attachment session', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      },
      'sia-browser-fresh-session',
    );

    await backend.invoke(request('browser_tabs', {}));

    expect(cua.call.mock.calls[0]?.[1]).toMatchObject({
      session: 'sia-browser-fresh-session',
      target_id: 'target-1',
      tab_id: 'tab-1',
    });
  });

  it('revokes stale tab bindings when the trusted attachment session rotates', async () => {
    const cua = fakeCua(async (tool, args) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      expect(args).toMatchObject({
        session: 'sia-browser-current',
        target_id: 'target-current',
        tab_id: 'tab-current',
      });
      return {
        target_id: 'target-current',
        tab_id: 'tab-current',
        url: 'https://current.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-expired',
        tab_id: 'tab-expired',
        url: 'https://expired.example.test/',
      },
      'sia-browser-expired',
    );
    backend.acceptBrowserState(
      {
        target_id: 'target-current',
        tab_id: 'tab-current',
        url: 'https://current.example.test/',
      },
      'sia-browser-current',
    );

    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result.outcome).toBe('verified');
    expect(cua.call).toHaveBeenCalledTimes(1);
    const tabs = dataRecord(result.data).tabs as Array<Record<string, unknown>>;
    expect(tabs).toEqual([
      expect.objectContaining({ tab_id: 'tab-current', url: 'https://current.example.test' }),
    ]);
  });

  it('drops a replaced Chrome route while retaining another live route in the grant', async () => {
    const cua = fakeCua(async (tool, args) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      if (args.tab_id === 'tab-replaced') {
        throw new Error('CUA refused: browser_route_unavailable');
      }
      return {
        target_id: 'target-live',
        tab_id: 'tab-live',
        url: 'https://live.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        tabs: [
          {
            target_id: 'target-replaced',
            tab_id: 'tab-replaced',
            url: 'https://replaced.example.test/',
          },
          {
            target_id: 'target-live',
            tab_id: 'tab-live',
            url: 'https://live.example.test/',
          },
        ],
      },
      'sia-browser-current',
    );

    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result.outcome).toBe('verified');
    expect(cua.call).toHaveBeenCalledTimes(2);
    expect(dataRecord(result.data).tabs).toEqual([
      expect.objectContaining({ tab_id: 'tab-live', url: 'https://live.example.test' }),
    ]);
  });

  it('redacts model-visible URLs and denies credential-management locations', async () => {
    let url = 'https://mail.example.test/inbox?view=all#message-42';
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url,
        title: 'Inbox',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({ target_id: 'target-1', tab_id: 'tab-1', url });

    const listed = await backend.invoke(request('browser_tabs', {}));
    const tabs = dataRecord(listed.data).tabs as Array<Record<string, unknown>>;
    expect(cua.call.mock.calls[0]?.slice(0, 2)).toEqual([
      'get_browser_state',
      { session: 'sia-browser', target_id: 'target-1', tab_id: 'tab-1' },
    ]);
    expect(tabs[0]?.url).toBe('https://mail.example.test');
    expect(JSON.stringify(listed)).not.toContain('view=all');
    expect(JSON.stringify(listed)).not.toContain('message-42');

    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    expect(dataRecord(snapshot.data).url).toBe('https://mail.example.test');
    expect(JSON.stringify(snapshot)).not.toContain('view=all');
    expect(JSON.stringify(snapshot)).not.toContain('message-42');

    url = 'https://mail.example.test/settings/api-keys';
    expect(
      await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' })),
    ).toMatchObject({ outcome: 'refused' });

    url = 'https://mail.example.test/inbox?access_token=private-token';
    const secretQuery = await backend.invoke(request('browser_tabs', {}));
    expect(dataRecord(secretQuery.data).tabs).toEqual([]);
    expect(JSON.stringify(secretQuery)).not.toContain('private-token');
  });

  it('keeps target ids and native refs private while using exact tab capabilities', async () => {
    let stateCount = 0;
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'get_browser_state') {
        stateCount += 1;
        return {
          value: {
            page: { url: 'https://mail.example.test/inbox', title: 'Inbox' },
            outline: '- button "Compose"',
            refs: [
              {
                ref: `p${stateCount}:1`,
                role: 'button',
                name: 'Compose',
                states: { disabled: false },
                actions: ['click'],
              },
              {
                ref: `p${stateCount}:2`,
                role: 'password',
                value: 'secret',
                actions: ['type'],
              },
            ],
            request_debug: args,
          },
          images: [{ mimeType: 'image/png', dataBase64: `browser-pixels-${stateCount}` }],
        };
      }
      if (tool === 'browser_click') {
        return {
          effect: 'confirmed',
          route: 'trusted_input',
          delivery: { mode: 'background' },
        };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      isBrowserOriginAllowed: (origin) => origin === 'https://mail.example.test',
    });
    backend.acceptBrowserState({ target_id: 'target-secret', tab_id: 'tab-1' });

    const snapshotResult = await backend.invoke(
      request('browser_snapshot', { tab_id: 'tab-1' }),
    );
    const snapshotData = dataRecord(snapshotResult.data);
    const elements = snapshotData.elements as Array<Record<string, unknown>>;
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ label: 'Compose', disabled: false });
    expect(snapshotData.text).toBe('- button "Compose"');
    expect(JSON.stringify(snapshotResult)).not.toContain('target-secret');
    expect(JSON.stringify(snapshotResult)).not.toContain('p1:1');
    expect(JSON.stringify(snapshotResult)).not.toContain('secret');
    expect(
      backend.trustedApprovalTarget('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
        origin: 'https://mail.example.test',
      }),
    ).toMatch(
      process.platform === 'darwin'
        ? /^https:\/\/mail\.example\.test: click via an explicit page DOM event on “Compose” \(button, exact snapshot ref b:/
        : /^https:\/\/mail\.example\.test: click “Compose” \(button, exact snapshot ref b:/,
    );

    const result = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
        origin: 'https://mail.example.test',
      }),
    );

    expect(result.outcome).toBe('verified');
    expect(result.images).toEqual([{ mimeType: 'image/png', dataBase64: 'browser-pixels-2' }]);
    const resultData = dataRecord(result.data);
    expect(resultData.snapshot_id).toBe(result.verification?.snapshotId);
    expect(resultData).not.toHaveProperty('snapshot');
    const call = cua.call.mock.calls.find(([tool]) => tool === 'browser_click');
    expect(call?.[1]).toEqual({
      session: 'sia-browser',
      target_id: 'target-secret',
      tab_id: 'tab-1',
      ref: 'p1:1',
      input_route: process.platform === 'darwin' ? 'dom_event' : 'trusted',
    });
    expect(JSON.stringify(result)).not.toContain('target-secret');
    expect(JSON.stringify(result)).not.toContain('p1:1');
  });

  it('accepts a targeted semantic snapshot without repeated route ids only on the granted origin', async () => {
    let url = 'http://127.0.0.1:8765/local-browser-acceptance.html';
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        page: {
          url,
          title: 'Sia local browser acceptance fixture',
          elements: [{ ref: 'fixture:text', role: 'textbox', label: 'Acceptance text' }],
        },
      };
    });
    const backend = new DesktopActionBackend({
      cua,
      isBrowserOriginAllowed: (origin) => origin === 'http://127.0.0.1:8765',
    });
    backend.acceptBrowserState({
      target_id: 'target-fixture',
      tab_id: 'tab-fixture',
      url,
    });

    const snapshot = await backend.invoke(
      request('browser_snapshot', { tab_id: 'tab-fixture' }),
    );
    expect(snapshot.outcome).toBe('verified');
    expect(dataRecord(snapshot.data)).toMatchObject({
      origin: 'http://127.0.0.1:8765',
      url: 'http://127.0.0.1:8765',
    });

    url = 'https://other.example.test/redirected';
    expect(
      await backend.invoke(request('browser_snapshot', { tab_id: 'tab-fixture' })),
    ).toMatchObject({ outcome: 'refused' });
  });

  it('rejects authentication tabs and preserves the driver stale-ref refusal on redirect', async () => {
    let url = 'https://mail.example.test/inbox';
    const cua = fakeCua(async (tool) => {
      if (tool === 'get_browser_state') {
        return {
          target_id: 'target-1',
          tab_id: 'tab-1',
          url,
          elements: [{ ref: 'p1:compose', role: 'button', label: 'Compose' }],
        };
      }
      if (tool === 'browser_click') {
        return url === 'https://mail.example.test/inbox'
          ? { effect: 'confirmed' }
          : { refusal: 'browser_ref_stale' };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url,
    });
    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    const snapshotData = dataRecord(snapshot.data);
    const element = (snapshotData.elements as Array<Record<string, unknown>>)[0]!;

    url = 'https://evil.example.test/redirected';
    const redirected = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: element.element_ref,
      }),
    );
    expect(redirected.outcome).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(true);

    const authBackend = new DesktopActionBackend({ cua });
    url = 'https://accounts.google.com/signin';
    authBackend.acceptBrowserState({ target_id: 'target-1', tab_id: 'tab-1', url });
    const auth = await authBackend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    expect(auth.outcome).toBe('refused');
  });

  it('fails closed on an origin mismatch and never falls back to global keys', async () => {
    const cua = fakeCua(async (tool) =>
      tool === 'get_browser_state'
        ? {
            target_id: 'target-1',
            tab_id: 'tab-1',
            url: 'https://one.example/path',
          }
        : { effect: 'confirmed' },
    );
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url: 'https://one.example/path',
    });
    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    const snapshotData = dataRecord(snapshot.data);

    const mismatch = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'scroll',
        direction: 'down',
        origin: 'https://two.example',
      }),
    );
    expect(mismatch.outcome).toBe('stale');

    expect(() =>
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'key',
        value: 'Enter',
      }),
    ).not.toThrow();
    expect(() =>
      parseActionArguments('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'key',
        value: 'Enter',
        origin: 'https://one.example',
      }),
    ).toThrow();
    expect(cua.call.mock.calls.some(([tool]) => tool === 'press_key')).toBe(false);
  });

  it('isolates uploads in a private temporary vault', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'sia-browser-files-')));
    const upload = join(directory, 'report.txt');
    const sensitive = join(directory, '.env');
    const uploadLink = join(directory, 'harmless.txt');
    await Promise.all([writeFile(upload, 'approved report'), writeFile(sensitive, 'secret')]);
    await symlink(sensitive, uploadLink);
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'get_browser_state') {
        return {
          target_id: 'target-1',
          tab_id: 'tab-1',
          url: 'https://files.example.test/report',
          elements: [{ ref: 'p1:upload', role: 'file input', label: 'Upload' }],
        };
      }
      if (tool === 'browser_set_input_files') return { effect: 'confirmed' };
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url: 'https://files.example.test/report',
    });

    try {
      const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
      const snapshotData = dataRecord(snapshot.data);
      const elements = snapshotData.elements as Array<Record<string, unknown>>;
      const uploadElement = elements.find(({ label }) => label === 'Upload')!;
      const uploadBypass = await backend.invoke(
        request('browser_upload', {
          tab_id: 'tab-1',
          snapshot_id: snapshotData.snapshot_id,
          element_ref: uploadElement.element_ref,
          file_paths: [uploadLink],
          origin: 'https://files.example.test',
        }),
      );
      expect(uploadBypass.outcome).toBe('refused');
      expect(cua.call.mock.calls.some(([tool]) => tool === 'browser_set_input_files')).toBe(
        false,
      );

      const uploaded = await backend.invoke(
        request('browser_upload', {
          tab_id: 'tab-1',
          snapshot_id: snapshotData.snapshot_id,
          element_ref: uploadElement.element_ref,
          file_paths: [upload],
          origin: 'https://files.example.test',
        }),
      );
      expect(uploaded.outcome, JSON.stringify(uploaded)).toBe('verified');
      const uploadNative = cua.call.mock.calls.find(
        ([tool]) => tool === 'browser_set_input_files',
      );
      const stagedUpload = String((uploadNative?.[1].files as string[] | undefined)?.[0]);
      expect(basename(stagedUpload)).toBe('report.txt');
      expect((await stat(dirname(stagedUpload))).mode & 0o777).toBe(0o700);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('sweeps only stale private Sia vaults after an unclean exit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-vault-sweep-test-'));
    const stale = join(root, 'sia-browser-download-ABCDEF');
    const fresh = join(root, 'sia-browser-upload-GHIJKL');
    const insecure = join(root, 'sia-browser-upload-MNOPQR');
    const symlinkTarget = join(root, 'unrelated-target');
    const symlinkVault = join(root, 'sia-browser-download-STUVWX');
    const now = Date.now();
    try {
      await Promise.all([
        mkdir(stale, { mode: 0o700 }),
        mkdir(fresh, { mode: 0o700 }),
        mkdir(insecure, { mode: 0o755 }),
        mkdir(symlinkTarget, { mode: 0o700 }),
      ]);
      await writeFile(join(stale, 'private.bin'), 'private');
      const old = new Date(now - 11 * 60_000);
      await Promise.all([utimes(stale, old, old), utimes(insecure, old, old)]);
      await chmod(insecure, 0o755);
      await symlink(symlinkTarget, symlinkVault);

      await sweepStaleBrowserVaults(root, now);

      await expect(stat(stale)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(fresh)).resolves.toBeDefined();
      await expect(stat(insecure)).resolves.toBeDefined();
      await expect(stat(symlinkVault)).resolves.toBeDefined();
      await expect(stat(symlinkTarget)).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('DesktopActionBackend connector boundary', () => {
  it('offers browser continuation when an optional connector is not connected', async () => {
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud: {
        configured: true,
        prepareAction: vi.fn(),
        commitAction: vi.fn(),
      },
      resolveConnectionId: () => undefined,
    });

    const result = await backend.invoke(
      request('drive_search', { account_id: 'drive', query: 'budget', limit: 20 }),
    );

    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('Google Drive is not connected');
    expect(result.reason).toContain('https://drive.google.com');
    expect(result.reason).toContain('connect it later in Settings > Apps');
  });

  it('resolves stable account aliases to trusted cloud ids and strips account_id from input', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => ({
        status: 'executed' as const,
        executionId: 'execution-1',
        result: { threads: [{ id: 'opaque-1' }] },
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'connection-42' : undefined,
    });

    const result = await backend.invoke(
      request('drive_search', { account_id: 'drive', query: 'budget', limit: 20 }),
    );

    expect(result.outcome).toBe('verified');
    expect(cloud.prepareAction).toHaveBeenCalledWith(
      {
        connectionId: 'connection-42',
        tool: 'drive.search',
        input: { query: 'budget', limit: 20 },
      },
      undefined,
    );
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });

  it.each([
    [
      'docs_read',
      'docs',
      'docs.read',
      { account_id: 'docs', document_id: 'document-1' },
      { document_id: 'document-1' },
    ],
    [
      'sheets_read',
      'sheets',
      'sheets.read',
      {
        account_id: 'sheets',
        spreadsheet_id: 'sheet-1',
        range: 'Sheet1!A1:B20',
        start_row: 1,
        end_row: 20,
      },
      { spreadsheet_id: 'sheet-1', range: 'Sheet1!A1:B20', start_row: 1, end_row: 20 },
    ],
    [
      'slides_read',
      'slides',
      'slides.read',
      { account_id: 'slides', presentation_id: 'deck-1' },
      { presentation_id: 'deck-1' },
    ],
    [
      'slack_find_users',
      'slack',
      'slack.find_users',
      { account_id: 'slack', query: 'Lawrence Jang', limit: 10 },
      { query: 'Lawrence Jang', limit: 10 },
    ],
    [
      'slack_open_dm',
      'slack',
      'slack.open_dm',
      { account_id: 'slack', user_id: 'U012ABCDEF' },
      { user_id: 'U012ABCDEF' },
    ],
  ] as const)(
    'routes %s through its exact editor account',
    async (toolName, account, cloudTool, argumentsValue, cloudInput) => {
      const cloud: CloudActionClient = {
        configured: true,
        prepareAction: vi.fn(async () => ({
          status: 'executed' as const,
          executionId: 'execution-editor',
          result: { ok: true },
        })),
        commitAction: vi.fn(),
      };
      const backend = new DesktopActionBackend({
        cua: fakeCua(async () => ({})),
        cloud,
        resolveConnectionId: (app, selector) =>
          app === account && selector === account ? `connection-${account}` : undefined,
      });

      await expect(backend.invoke(request(toolName, argumentsValue))).resolves.toMatchObject({
        outcome: 'verified',
      });
      expect(cloud.prepareAction).toHaveBeenCalledWith(
        {
          connectionId: `connection-${account}`,
          tool: cloudTool,
          input: cloudInput,
        },
        undefined,
      );
    },
  );

  it('commits mutation input against the exact cloud digest', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => ({
        status: 'completed' as const,
        actionId: 'action-1',
        result: { message_id: 'opaque-message' },
      })),
    };
    const resolveConnectionId = vi.fn(
      (app: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack', selector: string) =>
        app === 'slack' && selector === 'slack' ? 'connection-9' : undefined,
    );
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId,
    });

    const result = await backend.invoke(
      request('slack_post', {
        account_id: 'slack',
        channel_id: 'team',
        text: 'Status is ready.',
      }),
    );

    expect(result.outcome).toBe('verified');
    expect(resolveConnectionId).toHaveBeenCalledWith('slack', 'slack', 'approval-1');
    expect(cloud.prepareAction).toHaveBeenCalledWith(
      {
        connectionId: 'connection-9',
        tool: 'slack.post',
        input: { channel_id: 'team', text: 'Status is ready.' },
      },
      undefined,
    );
    expect(cloud.commitAction).toHaveBeenCalledWith(
      {
        actionId: 'action-1',
        digest: 'digest-1',
        input: { channel_id: 'team', text: 'Status is ready.' },
      },
      undefined,
    );
  });

  it('refuses connector mutations that did not cross the host authorization boundary', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-9',
    });
    const { approvalId: _, ...unapproved } = request('slack_post', {
      account_id: 'slack',
      channel_id: 'team',
      text: 'Status is ready.',
    });

    await expect(backend.invoke(unapproved)).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('missing its exact action authorization'),
    });
    expect(cloud.prepareAction).not.toHaveBeenCalled();
  });

  it('refuses a connector mutation when the cloud preview omits or changes input', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: { channel_id: 'other-channel' },
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'slack' && selector === 'slack' ? 'connection-9' : undefined,
    });

    await expect(
      backend.invoke(
        request('slack_post', {
          account_id: 'slack',
          channel_id: 'team',
          text: 'Status is ready.',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('did not exactly match'),
    });
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });

  it('stages approved Drive bytes and sends no local path or raw bytes to action execution', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-drive-upload-'));
    const filePath = join(directory, 'report.txt');
    await writeFile(filePath, 'private report bytes');
    let stagedBytes: Buffer | undefined;
    const file = {
      uploadId: 'upload-opaque',
      fileName: 'renamed-report.txt',
      mimeType: 'text/plain',
      byteLength: Buffer.byteLength('private report bytes'),
      sha256: 'A'.repeat(43),
    };
    const cloud: CloudActionClient = {
      configured: true,
      stageConnectorFile: vi.fn(async (metadata, bytes) => {
        stagedBytes = Buffer.from(bytes);
        return { ...file, sha256: metadata.sha256 };
      }),
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-1',
        digest: 'digest-1',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => ({
        status: 'completed' as const,
        actionId: 'action-1',
        result: { file_id: 'opaque-file' },
      })),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'drive-connection' : undefined,
    });

    try {
      const result = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: filePath,
          parent_id: 'folder-1',
          name: 'renamed-report.txt',
        }),
      );

      expect(result.outcome).toBe('verified');
      expect(stagedBytes).toEqual(Buffer.from('private report bytes'));
      expect(cloud.stageConnectorFile).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: 'drive-connection',
          fileName: 'renamed-report.txt',
          mimeType: 'text/plain',
          byteLength: Buffer.byteLength('private report bytes'),
          md5: expect.stringMatching(/^[a-f0-9]{32}$/),
          sha256: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        }),
        expect.any(Uint8Array),
        undefined,
      );
      const prepareAction = cloud.prepareAction as ReturnType<typeof vi.fn>;
      const stagedDescriptor = dataRecord(prepareAction.mock.calls[0]?.[0]).input;
      expect(stagedDescriptor).toEqual({
        file: expect.objectContaining({
          uploadId: 'upload-opaque',
          fileName: 'renamed-report.txt',
          mimeType: 'text/plain',
        }),
        parent_id: 'folder-1',
      });
      expect(JSON.stringify(prepareAction.mock.calls)).not.toContain(filePath);
      expect(JSON.stringify(prepareAction.mock.calls)).not.toContain('private report bytes');
      expect(cloud.commitAction).toHaveBeenCalledWith(
        {
          actionId: 'action-1',
          digest: 'digest-1',
          input: stagedDescriptor,
        },
        undefined,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses unsupported and oversized Drive files before requesting a presigned URL', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-drive-bounds-'));
    const unsupportedPath = join(directory, 'payload.bin');
    const oversizedPath = join(directory, 'oversized.pdf');
    await writeFile(unsupportedPath, 'opaque');
    await writeFile(oversizedPath, 'x');
    await truncate(oversizedPath, 5_000_001);
    const cloud: CloudActionClient = {
      configured: true,
      stageConnectorFile: vi.fn(),
      prepareAction: vi.fn(),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: (app, selector) =>
        app === 'drive' && selector === 'drive' ? 'drive-connection' : undefined,
    });

    try {
      const unsupported = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: unsupportedPath,
        }),
      );
      const oversized = await backend.invoke(
        request('drive_upload', {
          account_id: 'drive',
          file_path: oversizedPath,
        }),
      );

      expect(unsupported.outcome).toBe('refused');
      expect(unsupported.reason).toMatch(/file type is not supported/);
      expect(oversized.outcome).toBe('refused');
      expect(oversized.reason).toMatch(/between 1 byte and 5000000 bytes/);
      expect(cloud.stageConnectorFile).not.toHaveBeenCalled();
      expect(cloud.prepareAction).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses connector calls when cloud is not configured', async () => {
    const backend = new DesktopActionBackend({ cua: fakeCua(async () => ({})) });
    const result = await backend.invoke(
      request('mail_search', { account_id: 'gmail', query: 'from:me', limit: 5 }),
    );
    expect(result.outcome).toBe('refused');
  });

  it('never commits when cloud turns a read-only connector request into a mutation', async () => {
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'unexpected-action',
        digest: 'digest',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-1',
    });

    await expect(
      backend.invoke(request('mail_search', { account_id: 'gmail', query: 'status' })),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('read-only request into a mutation'),
    });
    expect(cloud.commitAction).not.toHaveBeenCalled();
  });
});

describe('DesktopActionBackend schedule boundary', () => {
  it('creates, lists, updates, and deletes only through the controller-owned host', async () => {
    const schedules = {
      create: vi.fn(() => ({ id: 'schedule-1', cadence: 'hourly' })),
      list: vi.fn(() => [{ id: 'schedule-1', cadence: 'hourly' }]),
      update: vi.fn(() => ({ id: 'schedule-1', enabled: false })),
      delete: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      schedules,
    });

    await expect(
      backend.invoke(
        request('schedule_create', {
          task: 'Search the web and report changes.',
          cadence: 'hourly',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'verified',
      data: { schedule: { id: 'schedule-1' } },
    });
    await expect(backend.invoke(request('schedule_list', {}))).resolves.toMatchObject({
      outcome: 'verified',
      data: { schedules: [{ id: 'schedule-1' }] },
    });
    await backend.invoke(
      request('schedule_update', { schedule_id: 'schedule-1', enabled: false }),
    );
    await backend.invoke(request('schedule_delete', { schedule_id: 'schedule-1' }));

    expect(schedules.create).toHaveBeenCalledWith('thread-1', {
      task: 'Search the web and report changes.',
      cadence: 'hourly',
    });
    expect(schedules.list).toHaveBeenCalledWith('thread-1');
    expect(schedules.update).toHaveBeenCalledWith('thread-1', {
      scheduleId: 'schedule-1',
      enabled: false,
    });
    expect(schedules.delete).toHaveBeenCalledWith('thread-1', 'schedule-1');
  });

  it('fails closed when a schedule mutation reaches the backend without authorization', async () => {
    const schedules = {
      create: vi.fn(),
      list: vi.fn(() => []),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      schedules,
    });
    const invocation = request('schedule_create', {
      task: 'Check every hour.',
      cadence: 'hourly',
    });
    const unapproved: ValidatedActionInvocation = {
      name: invocation.name,
      arguments: invocation.arguments,
      descriptor: invocation.descriptor,
      context: invocation.context,
    };

    await expect(backend.invoke(unapproved)).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringMatching(/authorization/i),
    });
    expect(schedules.create).not.toHaveBeenCalled();
  });
});
