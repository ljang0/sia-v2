import type { BrowserWindowState } from './browser-window.js';
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
import { CloudRequestError } from './cloud-client.js';

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
  it.each(['image', 'explicit-text', 'image-unavailable', 'protected', 'refused'] as const)(
    'recovers empty background accessibility with pixels only when allowed: %s',
    async (scenario) => {
      const png = Buffer.alloc(24);
      Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
      png.write('IHDR', 12);
      png.writeUInt32BE(800, 16);
      png.writeUInt32BE(600, 20);
      const cua = fakeCua(async (tool, args) => {
        if (tool === 'list_apps')
          return { apps: [{ pid: 42, name: 'Calculator', bundle_id: 'com.apple.calculator' }] };
        if (tool === 'list_windows')
          return { windows: [{ pid: 42, window_id: 91, app_name: 'Calculator' }] };
        if (tool === 'get_window_state') {
          if (scenario === 'refused') return { error_code: 'permission_denied' };
          if (args.include_screenshot && scenario === 'image-unavailable')
            throw new Error('CUA refused: px_capture_unavailable');
          return {
            value: {
              snapshot_id: 'empty-ax',
              elements:
                scenario === 'protected'
                  ? [{ role: 'AXSecureTextField', element_index: 1 }]
                  : [],
            },
            ...(args.include_screenshot
              ? {
                  images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
                }
              : {}),
          };
        }
        return { effect: 'unverifiable', delivery: { mode: 'background' } };
      });
      const backend = new DesktopActionBackend({
        cua,
        macBrowserAccess: () => true,
        macBackgroundControl: () => true,
      });
      const target = await grantedComputerTarget(backend);
      const ids = { app_id: target.appId, window_id: target.windowId };
      const result = await backend.invoke(
        request('computer_snapshot', {
          ...ids,
          ...(scenario === 'explicit-text' ? { include_image: false } : {}),
        }),
      );
      const captures = cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state');
      expect(captures.map(([, args]) => args.include_screenshot)).toEqual(
        ['image', 'image-unavailable'].includes(scenario) ? [false, true] : [false],
      );
      if (scenario === 'refused') {
        expect(result.outcome).toBe('refused');
        expect(result.images).toBeUndefined();
        return;
      }
      const data = dataRecord(result.data);
      expect(data.pixel_actions_available).toBe(scenario === 'image');
      if (scenario === 'image') {
        expect(data.accessibility_empty).toBe(true);
        expect(result.images).toHaveLength(1);
        const clicked = await backend.invoke(
          request('computer_action', {
            ...ids,
            snapshot_id: data.snapshot_id,
            action: 'click',
            x: 20,
            y: 30,
          }),
        );
        expect(clicked.outcome).toBe('accepted_unverified');
        expect(cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1]).toMatchObject({
          delivery_mode: 'background',
          x: 20,
          y: 30,
        });
      } else {
        expect(result.images).toBeUndefined();
        await backend.invoke(
          request('computer_action', {
            ...ids,
            snapshot_id: data.snapshot_id,
            action: 'click',
            x: 20,
            y: 30,
          }),
        );
        expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
      }
    },
  );

  it('reads an actually changed Calculator result after an unconfirmed background input without replay', async () => {
    let displayed = '0';
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Calculator', bundle_id: 'com.apple.calculator' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Calculator' }] };
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'calculator',
          elements: [{ element_index: 1, role: 'AXStaticText', value: displayed }],
        };
      if (tool === 'type_text') {
        expect(args).toMatchObject({ text: '246*17+31=', delivery_mode: 'background' });
        displayed = '4213';
        return {
          effect: 'suspected_noop',
          delivery: { mode: 'background' },
          escalation: { target: 'foreground', reason: 'effect_unconfirmed' },
        };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const before = await backend.invoke(request('computer_snapshot', ids));
    const result = await backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: dataRecord(before.data).snapshot_id,
        action: 'type',
        text: '246*17+31=',
      }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    const data = dataRecord(result.data);
    expect(data.elements).toEqual([expect.objectContaining({ value: '4213' })]);
    expect(data.delivery).toMatchObject({ background_verification_needed: true });
    expect(data.snapshot_id).not.toBe(dataRecord(before.data).snapshot_id);
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'type_text')).toHaveLength(1);
    expect(cua.call.mock.calls.some(([, args]) => args.delivery_mode === 'foreground')).toBe(
      false,
    );
  });

  it('uses text observations in background, exposes context/double clicks, and requires images for pixels', async () => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(800, 16);
    png.writeUInt32BE(600, 20);
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Preview', bundle_id: 'com.apple.Preview' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Preview' }] };
      if (tool === 'get_window_state')
        return {
          value: {
            snapshot_id: 'native',
            elements: [{ element_index: 1, role: 'AXButton', label: 'Document' }],
          },
          ...(args.include_screenshot
            ? { images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }] }
            : {}),
        };
      return { effect: 'unverifiable', delivery: { mode: 'background' } };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const first = await backend.invoke(request('computer_snapshot', ids));
    const data = dataRecord(first.data);
    expect(first.images).toBeUndefined();
    expect(data.pixel_actions_available).toBe(false);
    expect(cua.call).toHaveBeenLastCalledWith(
      'get_window_state',
      expect.objectContaining({ include_screenshot: false }),
      expect.anything(),
      undefined,
    );
    expect(
      (
        await backend.invoke(
          request('computer_action', {
            ...ids,
            snapshot_id: data.snapshot_id,
            action: 'click',
            x: 10,
            y: 20,
          }),
        )
      ).outcome,
    ).toBe('stale');
    const ref = (data.elements as Record<string, unknown>[])[0]!.element_ref;
    expect(() =>
      parseActionArguments('computer_action', {
        ...ids,
        snapshot_id: data.snapshot_id,
        action: 'click',
        element_ref: ref,
        count: 2,
      }),
    ).toThrow();
    const clicked = await backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: data.snapshot_id,
        action: 'click',
        element_ref: ref,
        button: 'right',
      }),
    );
    expect(clicked.outcome).toBe('accepted_unverified');
    expect(clicked.images).toBeUndefined();
    expect(cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1]).toMatchObject({
      button: 'right',
      delivery_mode: 'background',
    });
    const visual = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true }),
    );
    expect(visual.images).toHaveLength(1);
    const doubled = await backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: dataRecord(visual.data).snapshot_id,
        action: 'click',
        x: 20,
        y: 30,
        count: 2,
      }),
    );
    expect(doubled.outcome).toBe('accepted_unverified');
    expect(doubled.images).toHaveLength(1);
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'click').at(-1)?.[1]).toMatchObject({
      count: 2,
      x: 20,
      y: 30,
      delivery_mode: 'background',
    });
  });
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
    expect(acted.images).toBeUndefined(); // No pixel exposure for a window containing secure controls.
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
    expect(replaced.outcome).toBe('accepted_unverified');
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
    expect(shortcut.outcome).toBe('accepted_unverified');
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

    expect(typed.outcome).toBe('accepted_unverified');
    expect(cua.call.mock.calls.find(([tool]) => tool === 'type_text')?.[1]).toMatchObject({
      pid: 77,
      window_id: 88,
      text: 'Hello from Sia',
      delivery_mode: 'foreground',
    });
  });

  it('returns a newly created document window instead of re-observing the old document', async () => {
    let created = false;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
      if (tool === 'list_windows')
        return {
          windows: [
            { pid: 42, window_id: 91, title: 'Existing document', app_name: 'TextEdit' },
            ...(created
              ? [{ pid: 42, window_id: 92, title: 'Untitled', app_name: 'TextEdit' }]
              : []),
          ],
        };
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'native-1',
          elements: [
            { element_index: 0, role: 'AXTextArea', value: 'Existing document text' },
            {
              element_index: 1,
              role: 'AXMenuBarItem',
              label: 'File',
              frame: { x: 10, y: 0, width: 50, height: 24 },
            },
          ],
        };
      if (tool === 'hotkey') {
        created = true;
        return { effect: 'unverifiable', delivery: { mode: 'foreground' } };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const first = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(JSON.stringify(first.data)).not.toContain('AXMenuBarItem');
    const result = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: dataRecord(first.data).snapshot_id,
        action: 'key',
        value: 'n',
        delivery: 'foreground',
        modifiers: ['cmd'],
      }),
    );
    const data = dataRecord(result.data);
    expect(result.outcome).toBe('accepted_unverified');
    expect(data.observation_pending).toBe(true);
    const next = (data.new_windows as Record<string, unknown>[])[0]!;
    expect(next.title).toBe('Untitled');
    expect(next.window_id).not.toBe(target.windowId);
    expect(data.elements).toBeUndefined();
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'hotkey')).toHaveLength(1);
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(1);
  });

  it('reads pixels on demand only from an unprotected granted snapshot', async () => {
    const readImageText = vi.fn(async () => 'Instructor: Example Person');
    let protectedControl = false;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Preview', bundle_id: 'com.apple.Preview' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Preview' }] };
      return {
        value: {
          snapshot_id: 'native-1',
          elements: protectedControl ? [{ role: 'AXSecureTextField', element_index: 0 }] : [],
        },
        images: [{ mimeType: 'image/png', dataBase64: 'captured-image' }],
      };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
      readImageText,
    });
    const target = await grantedComputerTarget(backend);
    const args = { app_id: target.appId, window_id: target.windowId };
    await backend.invoke(request('computer_snapshot', args));
    expect(readImageText).not.toHaveBeenCalled();
    const observed = await backend.invoke(
      request('computer_snapshot', { ...args, read_text: true }),
    );
    expect(readImageText).toHaveBeenCalledExactlyOnceWith('captured-image');
    const data = dataRecord(observed.data);
    expect(data.image_text).toBe('Instructor: Example Person');
    protectedControl = true;
    await backend.invoke(request('computer_snapshot', { ...args, read_text: true }));
    expect(readImageText).toHaveBeenCalledTimes(1);
  });

  it('does not pass an element snapshot to an unaddressed keyboard action', async () => {
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Calculator', bundle_id: 'com.apple.calculator' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Calculator' }] };
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'native-1',
          elements: [
            { element_index: 0, role: 'AXWindow', label: 'Calculator' },
            { role: 'AXStaticText', value: 254 },
            { role: 'AXHeading', value: 2, label: 'Result' },
          ],
        };
      if (tool === 'press_key') {
        if (args.snapshot_id || args.element_index !== undefined)
          throw new Error('CUA refused: element_index_required');
        expect(args).toMatchObject({ pid: 42, window_id: 91, delivery_mode: 'foreground' });
        return { effect: 'unverifiable', delivery: { mode: 'foreground' } };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
      readWindowContext: async () => ({
        status: 'ready',
        bundleID: 'com.apple.calculator',
        title: 'Calculator',
        text: '7 × 24 + 86\n254',
      }),
    });
    const target = await grantedComputerTarget(backend);
    const captured = await backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const data = dataRecord(captured.data);
    expect(data.visible_text).toContain('254');
    const elements = data.elements as Record<string, unknown>[];
    expect(elements[1]).toMatchObject({ role: 'AXStaticText', value: '254' });
    expect(elements[1]!.element_ref).toBeUndefined();
    expect(elements[2]!.value).toBeUndefined();
    const result = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: data.snapshot_id,
        element_ref: elements[0]!.element_ref,
        action: 'key',
        value: '1',
        delivery: 'foreground',
      }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'press_key')).toHaveLength(1);
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

    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).snapshot_id).toBeTypeOf('string');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(2);
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

  it('reports a connection blocker after the host revokes the attachment', async () => {
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

    expect(result).toMatchObject({ outcome: 'refused', data: { tabs: [] } });
    expect(result.summary).toContain('Browser access needs setup.');
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
      for (const secret of [
        join(directory, '.codex', 'auth.json'),
        join(directory, 'Google', 'Chrome', 'Default', 'Login Data'),
      ]) {
        await mkdir(dirname(secret), { recursive: true });
        await writeFile(secret, 'secret');
        const refused = await backend.invoke(
          request('browser_upload', {
            tab_id: 'tab-1',
            snapshot_id: snapshotData.snapshot_id,
            element_ref: uploadElement.element_ref,
            file_paths: [secret],
            origin: 'https://files.example.test',
          }),
        );
        expect(refused.outcome, secret).toBe('refused');
      }
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
    expect(result.reason).toContain('connect it later in Settings > Connections');
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

  it('marks an editor grant for reconnect when a read discovers expired authorization', async () => {
    const reconnect = vi.fn();
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async () => {
        throw new CloudRequestError(409, 'connection_reconnect_required', 'request-1');
      }),
      commitAction: vi.fn(),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-docs',
      onConnectionReconnectRequired: reconnect,
    });

    await expect(
      backend.invoke(request('docs_read', { account_id: 'docs', document_id: 'document-1' })),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('authorization expired'),
    });
    expect(reconnect).toHaveBeenCalledWith('docs', 'connection-docs');
  });

  it('marks an editor grant for reconnect when a mutation commit discovers expired authorization', async () => {
    const reconnect = vi.fn();
    const cloud: CloudActionClient = {
      configured: true,
      prepareAction: vi.fn(async ({ input }) => ({
        status: 'approval_required' as const,
        actionId: 'action-docs',
        digest: 'digest-docs',
        expiresAt: '2030-01-01T00:00:00.000Z',
        preview: structuredClone(input),
      })),
      commitAction: vi.fn(async () => {
        throw new CloudRequestError(409, 'connection_reconnect_required', 'request-2');
      }),
    };
    const backend = new DesktopActionBackend({
      cua: fakeCua(async () => ({})),
      cloud,
      resolveConnectionId: () => 'connection-docs',
      onConnectionReconnectRequired: reconnect,
    });

    await expect(
      backend.invoke(
        request('docs_create', {
          account_id: 'docs',
          title: 'Fixture',
          markdown: 'read-back',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'refused',
      reason: expect.stringContaining('authorization expired'),
    });
    expect(reconnect).toHaveBeenCalledWith('docs', 'connection-docs');
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

it('binds pixel clicks and drags to fresh window images and rechecks protected controls before delivery', async () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(800, 16);
  png.writeUInt32BE(600, 20);
  let protectedWindow = false;
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Preview', bundle_id: 'com.apple.Preview' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Preview' }] };
    if (tool === 'get_window_state')
      return {
        value: {
          snapshot_id: 'native',
          elements: protectedWindow ? [{ role: 'AXSecureTextField' }] : [],
        },
        images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
      };
    return { effect: 'confirmed', route: 'synthetic_events', delivery: { mode: 'foreground' } };
  });
  const backend = new DesktopActionBackend({ cua });
  const target = await grantedComputerTarget(backend);
  const captured = await backend.invoke(
    request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
  );
  expect(dataRecord(captured.data).pixel_actions_available).toBe(true);
  const args = {
    app_id: target.appId,
    window_id: target.windowId,
    snapshot_id: dataRecord(captured.data).snapshot_id,
    action: 'click',
    x: 20,
    y: 30,
  };
  expect((await backend.invoke(request('computer_action', { ...args, x: 800 }))).outcome).toBe(
    'stale',
  );
  expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  const clicked = await backend.invoke(request('computer_action', args));
  expect(clicked.outcome).toBe('accepted_unverified');
  expect(cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1]).toMatchObject({
    pid: 42,
    window_id: 91,
    x: 20,
    y: 30,
    delivery_mode: 'foreground',
  });
  const dragged = await backend.invoke(
    request('computer_action', {
      ...args,
      snapshot_id: dataRecord(clicked.data).snapshot_id,
      action: 'drag',
      to_x: 200,
      to_y: 250,
    }),
  );
  expect(dragged.outcome).toBe('accepted_unverified');
  expect(cua.call.mock.calls.find(([tool]) => tool === 'drag')?.[1]).toMatchObject({
    from_x: 20,
    from_y: 30,
    to_x: 200,
    to_y: 250,
  });
  protectedWindow = true;
  expect(
    (
      await backend.invoke(
        request('computer_action', {
          ...args,
          snapshot_id: dataRecord(dragged.data).snapshot_id,
        }),
      )
    ).outcome,
  ).toBe('refused');
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
});

it('stops a failed control loop after two attempts without posting any input', async () => {
  const cua = fakeCua(async () => ({}));
  const backend = new DesktopActionBackend({ cua });
  const input = request('computer_action', {
    app_id: 'expired',
    window_id: 'expired',
    snapshot_id: 'expired',
    action: 'click',
    element_ref: 'expired',
  });
  expect((await backend.invoke(input)).outcome).toBe('stale');
  expect((await backend.invoke(input)).outcome).toBe('stale');
  expect((await backend.invoke(input)).summary).toContain('Two control attempts failed');
  expect(cua.call).not.toHaveBeenCalled();
});

it('requires an approved native automation invocation and fails closed when no assistant host exists', async () => {
  const macAutomation = vi.fn(async () => ({
    outcome: 'verified' as const,
    summary: 'Read selected items.',
  }));
  const backend = new DesktopActionBackend({ cua: fakeCua(async () => ({})), macAutomation });
  const approved = request('mac_automation', { operation: 'finder_selection' });
  const unapproved = { ...approved };
  delete (unapproved as { approvalId?: string }).approvalId;
  expect((await backend.invoke(unapproved)).outcome).toBe('refused');
  expect(macAutomation).not.toHaveBeenCalled();
  expect((await backend.invoke(approved)).outcome).toBe('verified');
  expect((await backend.invoke(request('skill_run', {}))).outcome).toBe('refused');
});

describe('Use my Mac browser routing', () => {
  function browserHarness() {
    let enabled = true;
    let url = 'https://example.com/';
    const openUrl = vi.fn(async (value: string) => {
      url = value;
    });
    const inspect = vi.fn(async (): Promise<BrowserWindowState> => ({
      status: 'ready' as const,
      url,
      bundleID: 'com.apple.Safari',
    }));
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return {
          apps: [
            { pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari', active: true },
            { pid: 43, name: '1Password', bundle_id: 'com.1password.1password' },
          ],
        };
      if (tool === 'list_windows')
        return {
          windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Example Domain' }],
        };
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'native-browser-snapshot',
          elements: [
            { element_index: 1, element_token: 'link', role: 'AXLink', label: 'Learn more' },
          ],
        };
      if (tool === 'click') return { success: true };
      throw new Error(`Unexpected tool ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => enabled,
      macBackgroundControl: () => true,
      inspectBrowserWindow: inspect,
      openUrl,
    });
    return {
      backend,
      cua,
      inspect,
      openUrl,
      disable: () => {
        enabled = false;
      },
      navigate: (value: string) => {
        url = value;
      },
    };
  }
  async function capture(h: ReturnType<typeof browserHarness>) {
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const data = dataRecord(result.data);
    return {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: data.snapshot_id,
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
    };
  }

  it.each([
    ['Root Key Signing Key (DNSSEC)', false],
    ['Key Signing Ceremonies', false],
    ['Blogging information', false],
    ['Sign in', true],
    ['Sign-in', true],
    ['Signin', true],
    ['SIGN_IN', true],
    ['Signing in to your account', true],
    ['Log in', true],
    ['Log-in', true],
    ['Login', true],
    ['Log_in', true],
    ['Logging in to your account', true],
  ])(
    'distinguishes public signing text from authentication: %s',
    async (label, protectedPage) => {
      const h = browserHarness();
      h.navigate('https://www.iana.org/domains/reserved');
      const implementation = h.cua.call.getMockImplementation() as (
        tool: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;
      h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
        tool === 'get_window_state'
          ? {
              snapshot_id: 'iana-fixture',
              elements: [{ element_index: 1, element_token: 'link', role: 'AXLink', label }],
            }
          : implementation(tool, args),
      );
      const target = await grantedComputerTarget(h.backend);
      const result = await h.backend.invoke(
        request('computer_snapshot', {
          app_id: target.appId,
          window_id: target.windowId,
          expected_url: 'https://www.iana.org/domains/reserved',
        }),
      );
      expect(result.outcome).toBe(protectedPage ? 'refused' : 'verified');
      if (protectedPage) {
        expect(dataRecord(result.data).blocker_code).toBe('protected_window');
        expect(dataRecord(result.data).elements).toBeUndefined();
        expect(dataRecord(result.data).snapshot_id).toBeUndefined();
        expect(result.images).toBeUndefined();
      } else {
        expect(dataRecord(result.data).source_url).toBe(
          'https://www.iana.org/domains/reserved',
        );
        expect(dataRecord(result.data).elements).toEqual([
          expect.objectContaining({ label, element_ref: expect.any(String) }),
        ]);
      }
    },
  );

  it('gives a later turn a fresh computer session and revokes the previous window refs', async () => {
    const h = browserHarness();
    const previous = await capture(h);
    const oldSession = h.cua.call.mock.calls.find(([tool]) => tool === 'get_window_state')![1]
      .session;
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) => {
      if (args.session === oldSession) throw new Error('CUA refused: session_ended');
      return implementation(tool, args);
    });
    const next = (name: ActionToolName, args: Record<string, unknown>) => {
      const value = request(name, args);
      return { ...value, context: { ...value.context, turnId: 'turn-2' } };
    };
    h.cua.call.mockClear();
    expect((await h.backend.invoke(next('computer_snapshot', previous))).outcome).toBe('stale');
    expect(h.cua.call).not.toHaveBeenCalled();
    const inventory = dataRecord((await h.backend.invoke(next('computer_list', {}))).data);
    const window = (inventory.windows as Record<string, unknown>[])[0]!;
    const ids = { app_id: window.app_id, window_id: window.window_id };
    expect(ids.window_id).not.toBe(previous.window_id);
    const snapshot = await h.backend.invoke(next('computer_snapshot', ids));
    expect(snapshot.outcome).toBe('verified');
    const data = dataRecord(snapshot.data);
    const newSession = h.cua.call.mock.calls.find(([tool]) => tool === 'get_window_state')![1]
      .session;
    expect(newSession).toEqual(expect.any(String));
    expect(newSession).not.toBe(oldSession);
    const cancelled = request('computer_list', {});
    const callCount = h.cua.call.mock.calls.length;
    expect(
      (
        await h.backend.invoke({
          ...cancelled,
          context: { ...cancelled.context, signal: AbortSignal.abort() },
        })
      ).outcome,
    ).toBe('refused');
    expect(h.cua.call).toHaveBeenCalledTimes(callCount);
    expect(
      (await h.backend.invoke(next('computer_action', { ...previous, action: 'click' })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    const fresh = {
      ...ids,
      snapshot_id: data.snapshot_id,
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
      action: 'click',
    };
    expect((await h.backend.invoke(next('computer_action', fresh))).outcome).toBe(
      'accepted_unverified',
    );
    const clicks = h.cua.call.mock.calls.filter(([tool]) => tool === 'click');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]![1].session).toBe(newSession);
  });

  it('binds browser facts to the expected course and role query without exposing query secrets', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const expected = 'https://canvas.cmu.edu/api/v1/courses/22/users?role=teacher&per_page=100';
    h.navigate('https://canvas.cmu.edu/api/v1/courses/11/users?role=teacher&per_page=100');
    expect(
      (await h.backend.invoke(request('computer_snapshot', { ...ids, expected_url: expected })))
        .outcome,
    ).toBe('stale');
    h.navigate('https://canvas.cmu.edu/api/v1/courses/22/users?role=ta&per_page=100');
    expect(
      (await h.backend.invoke(request('computer_snapshot', { ...ids, expected_url: expected })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
    h.navigate('https://canvas.cmu.edu/api/v1/courses/22/users?per_page=100&role=teacher#top');
    const matched = await h.backend.invoke(
      request('computer_snapshot', { ...ids, expected_url: expected }),
    );
    expect(matched.outcome).toBe('verified');
    expect(dataRecord(matched.data).source_url).toBe(
      'https://canvas.cmu.edu/api/v1/courses/22/users',
    );
    expect(JSON.stringify(matched)).not.toContain('per_page');
    expect(JSON.stringify(matched)).not.toContain('#top');
  });

  it('discovers Safari without Chrome attachment and returns the native route to the same task', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('browser_tabs', {}));
    expect(result.outcome).toBe('verified');
    expect(dataRecord(result.data).route).toBe('computer');
    expect(JSON.stringify(result)).toContain('Safari');
    expect(JSON.stringify(result)).not.toContain('1Password');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
    const args = await capture(h);
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(true);
  });

  it('preserves live window ids through refresh and activation but revokes a closed window', async () => {
    const h = browserHarness();
    const args = await capture(h);
    const again = await grantedComputerTarget(h.backend);
    expect(again.appId).toBe(args.app_id);
    expect(again.windowId).toBe(args.window_id);
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'list_windows' ? { windows: [] } : implementation(tool, args),
    );
    await h.backend.invoke(request('computer_list', {}));
    expect(
      (
        await h.backend.invoke(
          request('computer_snapshot', { app_id: again.appId, window_id: again.windowId }),
        )
      ).outcome,
    ).toBe('stale');
  });

  it('distinguishes an ambiguous window from a protected page', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const unavailable = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(unavailable.data)).toMatchObject({
      blocker_code: 'window_unavailable',
      blocker_detail: 'ambiguous',
      window_id: target.windowId,
    });
    expect(unavailable.summary).toContain('not evidence of a login');
    expect(dataRecord(unavailable.data)).toMatchObject({
      driver_observation_attempted: true,
      driver_screenshot_available: false,
      driver_element_count: 1,
    });
    expect(unavailable.images).toBeUndefined();
    expect(dataRecord(unavailable.data).elements).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    h.cua.call.mockClear();
    h.inspect.mockResolvedValue({ status: 'protected' });
    const protectedPage = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(protectedPage.data).blocker_code).toBe('protected_window');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
  });

  it('recovers a missing helper window through one exact CUA observation before allowing a background click', async () => {
    const h = browserHarness();
    h.inspect.mockResolvedValueOnce({ status: 'unavailable', reason: 'ambiguous' });
    const args = await capture(h);
    const captures = h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state');
    expect(captures).toHaveLength(1);
    expect(captures[0]?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      include_screenshot: true,
    });
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    expect(h.cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      delivery_mode: 'background',
      element_token: 'link',
    });
  });

  it('stops a driver refusal without replaying observation or issuing input', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) => {
      if (tool === 'get_window_state') throw new Error('CUA refused: window_not_found');
      return implementation(tool, args);
    });
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).not.toBe('verified');
    expect(result.images).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('keeps expected-page validation after driver recovery and never publishes mismatched content', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValueOnce({ status: 'unavailable', reason: 'ambiguous' });
    const result = await h.backend.invoke(
      request('computer_snapshot', {
        app_id: target.appId,
        window_id: target.windowId,
        expected_url: 'https://example.com/another-page',
      }),
    );
    expect(result.outcome).toBe('stale');
    expect(result.images).toBeUndefined();
    expect(dataRecord(result.data).snapshot_id).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('drops recovered driver content when it contains protected controls', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'get_window_state'
        ? {
            snapshot_id: 'private',
            elements: [
              { role: 'AXSecureTextField', label: 'Password', value: 'must-not-leak' },
            ],
          }
        : implementation(tool, args),
    );
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(result.images).toBeUndefined();
  });

  it('keeps the native browser route when Chrome also has an attached tab', async () => {
    const h = browserHarness();
    h.backend.acceptBrowserState({
      target_id: 'attached-target',
      tab_id: 'attached-tab',
      url: 'https://mail.google.com/',
    });
    const result = await h.backend.invoke(request('browser_tabs', {}));
    expect(result.outcome).toBe('verified');
    expect(dataRecord(result.data).route).toBe('computer');
    expect(JSON.stringify(result)).toContain('Safari');
    expect(JSON.stringify(result)).not.toContain('mail.google.com');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_browser_state')).toBe(false);
  });

  it('opens an ordinary website itself and directs the same task to inspect it', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.summary).toContain('Use the returned window ids');
    expect(dataRecord(result.data).windows).toHaveLength(1);
    expect(h.openUrl).toHaveBeenCalledWith('https://canvas.cmu.edu/', { background: true });
    expect(dataRecord(result.data).delivery_requested).toBe('background');
    expect(
      h.backend.trustedApprovalTarget('computer_open_url', {
        url: 'https://canvas.cmu.edu/',
      }),
    ).toBe('Open https://canvas.cmu.edu in the default browser');
  });

  it('only requests browser activation for explicit foreground navigation', async () => {
    const h = browserHarness();
    await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/', delivery: 'foreground' }),
    );
    expect(h.openUrl).toHaveBeenCalledExactlyOnceWith('https://canvas.cmu.edu/', {
      background: false,
    });
  });

  it('recovers a navigation race by observing again without replaying the click', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/course');
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).browser_origin).toBe('https://example.com');
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      3,
    );
  });

  it('preserves delivered action status when the destination becomes protected', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/login');
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).observation_pending).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toHaveLength(1);
    expect(result.images).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('refuses connected tools even when invoked indirectly in Mac mode', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('browser_snapshot', { tab_id: 'old-tab' }));
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('selected Mac control route');
    expect(h.cua.call).not.toHaveBeenCalled();
  });

  it('keeps delivery status when post-action capture throws', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.cua.call.mockImplementation(async (tool: string) => {
      if (tool === 'click') return { success: true };
      if (tool === 'get_window_state') throw new Error('capture timed out');
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Safari' }] };
      throw new Error(`Unexpected ${tool}`);
    });
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).observation_pending).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toHaveLength(1);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('bounds loading observations and excludes them from recovery targets', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'get_window_state'
        ? {
            snapshot_id: 'loading',
            elements: [
              {
                element_index: 1,
                element_token: 'spinner',
                role: 'AXProgressIndicator',
                label: 'Loading',
              },
            ],
          }
        : implementation(tool, args),
    );
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(result.data).loading).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toEqual([]);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      3,
    );
  });

  it.each([
    'https://accounts.google.com/',
    'https://example.com/login',
    'file:///etc/passwd',
    'chrome://settings',
    'javascript:alert(1)',
  ])('does not open protected or internal website %s', async (url) => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('computer_open_url', { url }));
    expect(result.outcome).toBe('refused');
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it('does not open a website outside Use my Mac mode', async () => {
    const h = browserHarness();
    h.disable();
    const result = await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('refused');
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it.each([
    'https://accounts.google.com/',
    'https://example.com/login',
    'file:///etc/passwd',
    'chrome://settings',
    'javascript:alert(1)',
  ])('blocks protected and internal page %s before returning a snapshot', async (url) => {
    const h = browserHarness();
    h.navigate(url);
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
    expect(result.images).toBeUndefined();
  });

  it.each(['protected', 'unavailable'] as const)(
    'does not publish private or unverified browser state (%s)',
    async (status) => {
      const h = browserHarness();
      h.inspect.mockResolvedValue({ status });
      const target = await grantedComputerTarget(h.backend);
      const result = await h.backend.invoke(
        request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
      );
      expect(result.outcome).toBe('refused');
      expect(result.images).toBeUndefined();
      expect(dataRecord(result.data).snapshot_id).toBeUndefined();
      expect(dataRecord(result.data).elements).toBeUndefined();
      expect(
        h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state'),
      ).toHaveLength(status === 'unavailable' ? 1 : 0);
    },
  );

  it('invalidates a captured browser action after a tab switch and does not replay a click', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.navigate('https://example.com/another-page');
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('revokes native browser grants as soon as the mode is disabled', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.disable();
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('stale');
    const listed = await h.backend.invoke(request('computer_list', {}));
    expect(dataRecord(listed.data).apps).toEqual([]);
  });

  it('blocks browser script injection and developer shortcuts', async () => {
    const h = browserHarness();
    const args = await capture(h);
    for (const action of [
      { action: 'type', text: 'javascript:alert(1)' },
      { action: 'key', value: 'i', modifiers: ['cmd', 'option'] },
    ]) {
      expect(
        (await h.backend.invoke(request('computer_action', { ...args, ...action }))).outcome,
      ).toBe('refused');
    }
  });

  it('drops page content if the browser changes during capture', async () => {
    const h = browserHarness();
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/login');
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(dataRecord(result.data).blocker_code).toBe('protected_window');
    expect(dataRecord(result.data).elements).toBeUndefined();
    expect(result.images).toBeUndefined();
  });
});

it('keeps accessibility usable when screenshot capture fails and omits hidden history menus', async () => {
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes' }] };
    if (tool === 'get_window_state' && args.include_screenshot)
      throw new Error('CUA refused: px_capture_unavailable');
    return {
      snapshot_id: 'native',
      elements: [
        {
          element_index: 1,
          element_token: 'text',
          role: 'AXStaticText',
          value: 'Visible content',
        },
        {
          element_index: 2,
          element_token: 'history',
          role: 'AXMenuItem',
          label: 'Sign in to old site',
        },
      ],
    };
  });
  const backend = new DesktopActionBackend({ cua });
  const target = await grantedComputerTarget(backend);
  const result = await backend.invoke(
    request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
  );
  expect(result.outcome).toBe('verified');
  expect(JSON.stringify(result)).toContain('Visible content');
  expect(JSON.stringify(result)).not.toContain('Sign in');
  expect(dataRecord(result.data).pixel_actions_available).toBe(false);
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(2);
});

it.each([
  { action: 'key', value: 'a', tool: 'press_key' },
  { action: 'type', text: 'hello', tool: 'type_text' },
  { action: 'click', x: 20, y: 30, tool: 'click' },
  { action: 'drag', x: 20, y: 30, to_x: 40, to_y: 50, tool: 'drag' },
  { action: 'scroll', direction: 'down', tool: 'scroll' },
])(
  'keeps Mac $action in the background and never automatically replays a refusal',
  async ({ tool: expectedTool, ...action }) => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(800, 16);
    png.writeUInt32BE(600, 20);
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Preview', bundle_id: 'com.apple.Preview' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Preview' }] };
      if (tool === 'get_window_state')
        return {
          value: { snapshot_id: 'native', elements: [] },
          images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
        };
      expect(tool).toBe(expectedTool);
      return args.delivery_mode === 'background'
        ? { error_code: 'background_unavailable' }
        : { effect: 'unverifiable', delivery: { mode: 'foreground' } };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const observe = async () =>
      dataRecord(
        (await backend.invoke(request('computer_snapshot', { ...ids, include_image: true })))
          .data,
      );
    const before = await observe();
    const args = { ...ids, snapshot_id: before.snapshot_id, ...action };
    expect((await backend.invoke(request('computer_action', args))).outcome).toBe(
      'needs_foreground',
    );
    const calls = cua.call.mock.calls.filter(([tool]) => tool === expectedTool);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      delivery_mode: 'background',
    });
    expect(calls[0]?.[1]).not.toHaveProperty('snapshot_id');
    const fresh = await observe();
    const fallback = await backend.invoke(
      request('computer_action', {
        ...args,
        snapshot_id: fresh.snapshot_id,
        delivery: 'foreground',
      }),
    );
    expect(fallback.outcome).toBe('accepted_unverified');
    expect(cua.call.mock.calls.filter(([tool]) => tool === expectedTool)).toHaveLength(2);
  },
);

it('keeps window tools out of the default native Mac route', async () => {
  const cua = fakeCua(async () => {
    throw new Error('The native route must not dispatch window tools');
  });
  const backend = new DesktopActionBackend({ cua, macBrowserAccess: () => true });
  const result = await backend.invoke(request('computer_list', {}));
  expect(result.outcome).toBe('refused');
  expect(cua.call).not.toHaveBeenCalled();
});

it('routes native vault reviews through the controller authorization boundary', async () => {
  const cua = fakeCua(async () => {
    throw new Error('No GUI in a vault review');
  });
  const assistantAction = vi.fn(async () => ({
    outcome: 'verified' as const,
    summary: 'Read the authorized vault.',
  }));
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    assistantAction,
  });
  const action = request('memory_vault', {
    operation: 'list',
    name: '',
    text: '',
    revision: '',
  });
  expect((await backend.invoke(action)).outcome).toBe('verified');
  expect(assistantAction).toHaveBeenCalledExactlyOnceWith(action);
  expect(cua.call).not.toHaveBeenCalled();
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

describe('native window input availability', () => {
  function harness() {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(800, 16);
    png.writeUInt32BE(600, 20);
    const state = {
      status: 'ax_unresolved',
      windowId: 91,
      keyboardOnly: false,
      reportInElement: false,
      malformed: false,
      protected: false,
    };
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Slack', bundle_id: 'com.tinyspeck.slackmacgap' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Slack' }] };
      if (tool === 'get_window_state') {
        const report = {
          exact_window: { status: state.status, pid: 42, window_id: state.windowId },
          routes: ['accessibility', 'window_pointer', 'pid_keyboard'].map((route) => ({
            route,
            status:
              state.status === 'matched' && !(state.keyboardOnly && route === 'pid_keyboard')
                ? 'available'
                : 'refused',
            reason:
              state.status === 'matched'
                ? 'same_pid_keyboard_ambiguity'
                : 'off_space_or_ax_unresolved',
          })),
          secret: 'not forwarded',
        };
        return {
          value: {
            snapshot_id: 'native-snapshot',
            ...(state.reportInElement
              ? {}
              : { background_input: state.malformed ? {} : report }),
            elements: state.protected
              ? [{ role: 'AXSecureTextField' }]
              : state.reportInElement
                ? [{ role: 'AXStaticText', background_input: report }]
                : [],
          },
          images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
        };
      }
      return { effect: 'unverifiable', delivery: { mode: 'background' } };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    return { backend, cua, state };
  }

  it.each([true, false])(
    'keeps an unresolved Slack screenshot observation-only and respects foreground policy (%s)',
    async (backgroundOnly) => {
      const { backend, cua } = harness();
      const target = await grantedComputerTarget(backend);
      const ids = { app_id: target.appId, window_id: target.windowId };
      const snapshotRequest = request('computer_snapshot', { ...ids, include_image: true });
      const scopedSnapshot = {
        ...snapshotRequest,
        context: { ...snapshotRequest.context, backgroundOnly },
      };
      const snapshot = await backend.invoke(scopedSnapshot);
      const data = dataRecord(snapshot.data);
      expect(snapshot.outcome).toBe('verified');
      expect(snapshot.images).toHaveLength(1);
      expect(data).toMatchObject({
        observation_only: true,
        pixel_actions_available: false,
        screenshot_size: { width: 800, height: 600 },
      });
      expect(dataRecord(data.background_input).exact_window).toEqual({
        status: 'ax_unresolved',
      });
      expect(JSON.stringify(data)).not.toContain('not forwarded');
      expect(data.next_step).toContain(
        backgroundOnly ? 'disabled for this turn' : 'delivery:"foreground"',
      );
      const action = request('computer_action', {
        ...ids,
        snapshot_id: data.snapshot_id,
        action: 'click',
        x: 20,
        y: 30,
      });
      expect(
        (await backend.invoke({ ...action, context: { ...action.context, backgroundOnly } }))
          .outcome,
      ).toBe('needs_foreground');
      expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    },
  );

  it('uses empty-AX screenshot controls when the exact pointer route is available, despite a refused keyboard route', async () => {
    const { backend, cua, state } = harness();
    state.status = 'matched';
    state.keyboardOnly = true;
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const snapshot = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true }),
    );
    const data = dataRecord(snapshot.data);
    expect(data).toMatchObject({ observation_only: false, pixel_actions_available: true });
    expect(
      (
        await backend.invoke(
          request('computer_action', {
            ...ids,
            snapshot_id: data.snapshot_id,
            action: 'key',
            value: 'return',
          }),
        )
      ).outcome,
    ).toBe('needs_foreground');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'press_key')).toBe(false);
    expect(
      (
        await backend.invoke(
          request('computer_action', {
            ...ids,
            snapshot_id: data.snapshot_id,
            action: 'click',
            x: 20,
            y: 30,
          }),
        )
      ).outcome,
    ).toBe('accepted_unverified');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('rechecks route availability before pixel input and resumes after a fresh matched observation', async () => {
    const { backend, cua, state } = harness();
    state.status = 'matched';
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const snapshot = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true }),
    );
    state.status = 'ax_unresolved';
    const action = {
      ...ids,
      snapshot_id: dataRecord(snapshot.data).snapshot_id,
      action: 'click',
      x: 20,
      y: 30,
    };
    expect((await backend.invoke(request('computer_action', action))).outcome).toBe(
      'needs_foreground',
    );
    expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    state.status = 'matched';
    const fresh = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true }),
    );
    expect(
      (
        await backend.invoke(
          request('computer_action', {
            ...action,
            snapshot_id: dataRecord(fresh.data).snapshot_id,
          }),
        )
      ).outcome,
    ).toBe('accepted_unverified');
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it.each(['foreign-window', 'malformed', 'protected', 'page-content'] as const)(
    'does not use invalid report authority or bypass protected controls: %s',
    async (scenario) => {
      const { backend, cua, state } = harness();
      state.status = 'matched';
      state.windowId = scenario === 'foreign-window' ? 92 : 91;
      state.malformed = scenario === 'malformed';
      state.protected = scenario === 'protected';
      state.reportInElement = scenario === 'page-content';
      const target = await grantedComputerTarget(backend);
      const ids = { app_id: target.appId, window_id: target.windowId };
      const snapshot = await backend.invoke(
        request('computer_snapshot', { ...ids, include_image: true }),
      );
      const data = dataRecord(snapshot.data);
      if (scenario === 'page-content') {
        expect(data.background_input).toBeUndefined();
        return;
      }
      expect(data.pixel_actions_available).toBe(false);
      await backend.invoke(
        request('computer_action', {
          ...ids,
          snapshot_id: data.snapshot_id,
          action: 'click',
          x: 20,
          y: 30,
        }),
      );
      expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    },
  );
});
