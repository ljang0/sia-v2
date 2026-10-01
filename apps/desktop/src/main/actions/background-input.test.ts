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
