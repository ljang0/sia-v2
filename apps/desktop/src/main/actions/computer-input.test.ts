import { describe, expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

it.each([
  { action: 'menu', menu_path: ['File', 'Save'], native: 'invoke_menu' },
  { action: 'click', count: 2, native: 'double_click' },
])(
  'delivers $native through the exact captured window without a keyboard fallback',
  async (operation) => {
    const cua = fakeCua(async (name) => {
      if (name === 'list_apps')
        return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
      if (name === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'TextEdit', title: 'Draft' }] };
      if (name === 'get_window_state')
        return {
          elements: [{ element_token: 's00000001:3', role: 'AXTextArea', value: 'Draft text' }],
        };
      if (name === operation.native)
        return { effect: 'unverifiable', delivery: { mode: 'background' } };
      throw new Error(`Unexpected ${name}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const snapshot = dataRecord(
      (
        await backend.invoke(
          request('computer_snapshot', {
            app_id: target.appId,
            window_id: target.windowId,
            include_image: false,
          }),
        )
      ).data,
    );
    if (operation.action === 'menu')
      expect(
        backend.trustedApprovalTarget('computer_action', {
          app_id: target.appId,
          window_id: target.windowId,
          snapshot_id: snapshot.snapshot_id,
          action: 'menu',
          menu_path: operation.menu_path,
        }),
      ).toBe('TextEdit, window “Draft”: native menu File → Save');
    const result = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: snapshot.snapshot_id,
        ...(operation.action === 'click'
          ? {
              action: 'click',
              count: 2,
              element_ref: (snapshot.elements as Record<string, unknown>[])[0]!.element_ref,
            }
          : { action: 'menu', menu_path: operation.menu_path }),
      }),
    );
    expect(result.outcome, result.summary).toBe('accepted_unverified');
    const calls = cua.call.mock.calls.filter(([name]) => name === operation.native);
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toEqual({
      pid: 42,
      window_id: 91,
      session: expect.any(String),
      ...(operation.action === 'click'
        ? { element_token: 's00000001:3', delivery_mode: 'background' }
        : { path: ['File', 'Save'] }),
    });
  },
);

it.each(['Passwords', 'New Terminal at Folder', 'Web Inspector', 'Sign In', 'Run Script'])(
  'blocks a sensitive native menu: %s',
  async (label) => {
    const cua = fakeCua(async (name) => {
      if (name === 'list_apps')
        return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
      if (name === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes' }] };
      if (name === 'get_window_state') return { elements: [] };
      throw new Error(`Unexpected ${name}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const args = { app_id: target.appId, window_id: target.windowId };
    const snapshot = dataRecord(
      (await backend.invoke(request('computer_snapshot', args))).data,
    );
    expect(
      (
        await backend.invoke(
          request('computer_action', {
            ...args,
            snapshot_id: snapshot.snapshot_id,
            action: 'menu',
            menu_path: ['File', label],
          }),
        )
      ).outcome,
    ).toBe('refused');
    expect(cua.call.mock.calls.some(([name]) => name === 'invoke_menu')).toBe(false);
  },
);

it('keeps attached Save sheet controls bound to their exact parent window', async () => {
  let opened = false;
  let filename = 'Untitled';
  const cua = fakeCua(async (name, args) => {
    if (name === 'list_apps')
      return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
    if (name === 'list_windows')
      return {
        windows: [
          { pid: 42, window_id: 91, title: 'Draft', app_name: 'TextEdit' },
          ...(opened ? [{ pid: 42, window_id: 92, title: 'Save', app_name: 'TextEdit' }] : []),
        ],
      };
    if (name === 'get_window_state') {
      expect(args.window_id).toBe(91);
      return {
        elements: opened
          ? [
              { element_token: 's00000002:0', role: 'AXSheet', label: 'save' },
              {
                element_token: 's00000002:1',
                role: 'AXTextField',
                label: 'Save As',
                value: filename,
              },
              { element_token: 's00000002:2', role: 'AXButton', label: 'Save' },
            ]
          : [{ element_token: 's00000001:0', role: 'AXTextArea', value: 'Checklist' }],
      };
    }
    if (name === 'hotkey') {
      opened = true;
      return { effect: 'unverifiable', delivery: { mode: 'background' } };
    }
    if (name === 'set_value') {
      expect(args.window_id).toBe(91);
      expect(args.element_token).toBe('s00000002:1');
      filename = String(args.value);
      return { effect: 'unverifiable', delivery: { mode: 'background' } };
    }
    throw new Error(`Unexpected ${name}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  const target = await grantedComputerTarget(backend);
  const original = dataRecord(
    (
      await backend.invoke(
        request('computer_snapshot', {
          app_id: target.appId,
          window_id: target.windowId,
        }),
      )
    ).data,
  );
  const saved = await backend.invoke(
    request('computer_action', {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: original.snapshot_id,
      action: 'key',
      value: 's',
      modifiers: ['cmd'],
    }),
  );
  const fresh = dataRecord(saved.data);
  expect(fresh.window_id).toBe(target.windowId);
  expect(fresh.snapshot_id).not.toBe(original.snapshot_id);
  expect(fresh.next_step).toContain('attached sheet');
  expect((fresh.new_windows as Record<string, unknown>[])[0]?.title).toBe('Save');
  const field = (fresh.elements as Record<string, unknown>[]).find(
    (row) => row.role === 'AXTextField',
  )!;
  const changed = await backend.invoke(
    request('computer_action', {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: fresh.snapshot_id,
      element_ref: field.element_ref,
      action: 'set',
      text: 'checklist.txt',
    }),
  );
  expect(changed.outcome, changed.summary).toBe('accepted_unverified');
  expect(filename).toBe('checklist.txt');
  expect(cua.call.mock.calls.filter(([name]) => name === 'hotkey')).toHaveLength(1);
});

it('sets an exact field with the current driver contract and observes its new value', async () => {
  let value = '';
  const cua = fakeCua(async (name, args) => {
    if (name === 'list_apps')
      return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
    if (name === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes', title: 'Draft' }] };
    if (name === 'get_window_state')
      return {
        snapshot_id: 's00000001',
        elements: [
          { element_token: 's00000001:9', role: 'AXTextField', label: 'Title', value },
        ],
      };
    if (name === 'set_value') {
      expect(args).toEqual({
        pid: 42,
        window_id: 91,
        session: expect.any(String),
        element_token: 's00000001:9',
        value: 'Revised title',
      });
      value = String(args.value);
      return { effect: 'unverifiable', delivery: { mode: 'background' } };
    }
    throw new Error(`Unexpected fixture tool ${name}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  const target = await grantedComputerTarget(backend);
  const args = { app_id: target.appId, window_id: target.windowId, include_image: false };
  const snapshot = dataRecord((await backend.invoke(request('computer_snapshot', args))).data);
  const result = await backend.invoke(
    request('computer_action', {
      ...args,
      snapshot_id: snapshot.snapshot_id,
      element_ref: (snapshot.elements as Record<string, unknown>[])[0]!.element_ref,
      action: 'set',
      text: 'Revised title',
    }),
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(dataRecord(result.data).elements).toEqual([
    expect.objectContaining({ label: 'Title', value: 'Revised title' }),
  ]);
  expect(cua.call.mock.calls.filter(([name]) => name === 'set_value')).toHaveLength(1);
});

it.each(['Timed out waiting for input acknowledgement', 'read ECONNRESET'])(
  'preserves uncertain delivery and revokes the old input target after %s',
  async (message) => {
    let saved = 0;
    const cua = fakeCua(async (name) => {
      if (name === 'list_apps')
        return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
      if (name === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes', title: 'Draft' }] };
      if (name === 'get_window_state')
        return {
          snapshot_id: 'native-snapshot',
          elements: [{ element_token: 'save', role: 'AXButton', label: 'Save' }],
        };
      if (name === 'click') {
        saved++;
        throw new Error(message);
      }
      throw new Error(`Unexpected fixture tool ${name}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
    });
    const target = await grantedComputerTarget(backend);
    const snapshot = dataRecord(
      (
        await backend.invoke(
          request('computer_snapshot', {
            app_id: target.appId,
            window_id: target.windowId,
            include_image: false,
          }),
        )
      ).data,
    );
    const element = (snapshot.elements as Record<string, unknown>[])[0]!;
    const action = request('computer_action', {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: snapshot.snapshot_id,
      element_ref: element.element_ref,
      action: 'click',
    });
    const result = await backend.invoke(action);
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.data).toMatchObject({ input_delivery_uncertain: true });
    expect(result.summary).toMatch(/inspect|observe/i);
    expect(saved).toBe(1);
    expect((await backend.invoke(action)).outcome).toBe('stale');
    expect(saved).toBe(1);
  },
);

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
      element_token: 'native-token-1',
      delivery_mode: 'background',
    });
    expect(click?.[1]).not.toHaveProperty('snapshot_id');
    expect(click?.[1]).not.toHaveProperty('element_index');

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
    });
    expect(cua.call.mock.calls.find(([tool]) => tool === 'set_value')?.[1]).not.toHaveProperty(
      'delivery_mode',
    );

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

  it('points at a genuinely new document when no attached sheet appears in the parent', async () => {
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
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(2);
  });

  it('points at a sheet that took focus when a key is refused on the window behind it', async () => {
    let sheetListed = false;
    let hotkeyDone = false;
    let listsAfterHotkey = 0;
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 7, name: 'Finder', bundle_id: 'com.apple.finder' }] };
      if (tool === 'list_windows') {
        // The sheet slides in after the post-action check, as Go to Folder does.
        if (hotkeyDone && ++listsAfterHotkey > 1) sheetListed = true;
        return {
          windows: [
            { pid: 7, window_id: 70, title: 'Recents', app_name: 'Finder' },
            ...(sheetListed
              ? [{ pid: 7, window_id: 71, title: 'Go to Folder', app_name: 'Finder' }]
              : []),
          ],
        };
      }
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'native-7',
          elements: [{ element_index: 0, role: 'AXTextField', value: '' }],
        };
      if (tool === 'hotkey') {
        hotkeyDone = true;
        return { effect: 'unverifiable', delivery: { mode: 'foreground' } };
      }
      if (tool === 'press_key')
        return {
          effect: 'refused',
          delivery: { mode: 'foreground' },
          escalation: { target: 'foreground', reason: 'delivery_failed' },
        };
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
    const opened = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: dataRecord(first.data).snapshot_id,
        action: 'key',
        value: 'g',
        delivery: 'foreground',
        modifiers: ['cmd', 'shift'],
      }),
    );
    expect(opened.outcome).toBe('accepted_unverified');
    const result = await backend.invoke(
      request('computer_action', {
        app_id: target.appId,
        window_id: target.windowId,
        snapshot_id: dataRecord(opened.data).snapshot_id,
        action: 'key',
        value: 'return',
        delivery: 'foreground',
      }),
    );
    expect(result.outcome).toBe('stale');
    expect(result.summary).toContain('dialog or sheet');
    const next = (dataRecord(result.data).new_windows as Record<string, unknown>[])[0]!;
    expect(next.title).toBe('Go to Folder');
    expect(next.window_id).not.toBe(target.windowId);
    // The refused key is never replayed.
    expect(cua.call.mock.calls.filter(([tool]) => tool === 'press_key')).toHaveLength(1);
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
  const typed = await backend.invoke(
    request('computer_action', {
      ...args,
      snapshot_id: dataRecord(dragged.data).snapshot_id,
      action: 'type',
      text: 'Focus and insert together',
    }),
  );
  expect(typed.outcome).toBe('accepted_unverified');
  const typing = cua.call.mock.calls.filter(([tool]) => tool === 'type_text');
  expect(typing).toHaveLength(1);
  expect(typing[0]![1]).toMatchObject({
    pid: 42,
    window_id: 91,
    x: 20,
    y: 30,
    text: 'Focus and insert together',
    delivery_mode: 'foreground',
  });
  expect(typing[0]![1].element_token).toBeUndefined();
  expect(typing[0]![1].snapshot_id).toBeUndefined();
  // No separate click to lose focus, and no insertion if a secure control appears.
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  protectedWindow = true;
  expect(
    (
      await backend.invoke(
        request('computer_action', {
          ...args,
          snapshot_id: dataRecord(typed.data).snapshot_id,
          action: 'type',
          text: 'Must not be inserted',
        }),
      )
    ).outcome,
  ).toBe('refused');
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  expect(cua.call.mock.calls.filter(([tool]) => tool === 'type_text')).toHaveLength(1);
});

it('provides screenshot field centers only with stable, fresh Mac window geometry', async () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(1344, 16);
  png.writeUInt32BE(1568, 20);
  let x = 0,
    move = false;
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
    if (tool === 'list_windows')
      return {
        windows: [
          {
            pid: 42,
            window_id: 91,
            app_name: 'TextEdit',
            bounds: { x, y: 34, width: 841, height: 981 },
          },
        ],
      };
    if (tool === 'get_window_state') {
      if (move) x += 20;
      return {
        value: {
          snapshot_id: 'native',
          elements: [
            {
              element_index: 1,
              element_token: 'title',
              role: 'AXTextField',
              label: 'Event title',
              frame: { x: 120, y: 323, w: 157, h: 22 },
            },
            {
              element_index: 2,
              element_token: 'clipped',
              role: 'AXTextField',
              label: 'Clipped',
              frame: { x: -100, y: 323, w: 10, h: 22 },
            },
          ],
        },
        images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
      };
    }
    throw new Error('Unexpected tool');
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  const target = await grantedComputerTarget(backend);
  const args = { app_id: target.appId, window_id: target.windowId, include_image: true };
  const capture = async (input = args) =>
    dataRecord((await backend.invoke(request('computer_snapshot', input))).data)
      .elements as Record<string, unknown>[];
  const elements = await capture();
  expect(elements[0]!.pixel_bounds).toMatchObject({ center_x: 317.2, center_y: 479.5 });
  expect(elements[0]!.frame).toBeUndefined();
  expect(elements[1]!.pixel_bounds).toBeUndefined();
  expect((await capture({ ...args, include_image: false }))[0]!.pixel_bounds).toBeUndefined();
  move = true;
  expect((await capture())[0]!.pixel_bounds).toBeUndefined();
});

it.each([
  {
    tool: 'scroll',
    code: 'background_unavailable',
    action: { action: 'scroll', direction: 'down', amount: 3 },
  },
  {
    tool: 'hotkey',
    code: 'window_not_key',
    action: { action: 'key', value: 's', modifiers: ['cmd'] },
  },
])('keeps an explicit $code refusal distinct from uncertain delivery', async (scenario) => {
  const cua = fakeCua(async (name) => {
    if (name === 'list_apps')
      return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
    if (name === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes', title: 'Draft' }] };
    if (name === 'get_window_state')
      return {
        snapshot_id: 's00000001',
        elements: [
          { element_token: 's00000001:9', role: 'AXTextArea', value: 'Existing text' },
        ],
      };
    if (name === scenario.tool) throw new Error('CUA refused: ' + scenario.code);
    throw new Error('Unexpected fixture action ' + name);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  const target = await grantedComputerTarget(backend);
  const args = { app_id: target.appId, window_id: target.windowId, include_image: false };
  const snapshot = dataRecord((await backend.invoke(request('computer_snapshot', args))).data);
  const result = await backend.invoke(
    request('computer_action', {
      ...args,
      snapshot_id: snapshot.snapshot_id,
      ...scenario.action,
    }),
  );
  expect(result.outcome).toBe('needs_foreground');
  expect(dataRecord(result.data).input_delivery_uncertain).toBeUndefined();
  expect(cua.call.mock.calls.filter(([name]) => name === scenario.tool)).toHaveLength(1);
  expect(cua.call.mock.calls.every(([, args]) => args.delivery_mode !== 'foreground')).toBe(
    true,
  );
});
