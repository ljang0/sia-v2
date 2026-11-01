import { afterEach, expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

vi.mock('node:timers/promises', async (original) => ({
  ...(await original<typeof import('node:timers/promises')>()),
  setTimeout: vi.fn(async () => undefined),
}));
afterEach(() => vi.restoreAllMocks());

async function fixture(background = true) {
  let capture: 'image' | 'missing' | 'throw' | 'protected' | 'private-link' = 'image';
  // Transport fixture only: these tests prove the observation/authority boundary, not visual skill.
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(800, 16);
  png.writeUInt32BE(600, 20);
  let geometry: Record<string, unknown> | undefined = {
    surface: {
      window_id: 91,
      pid: 42,
      parent: { x: 100, y: 100, width: 800, height: 600 },
      sheet: null,
    },
    content: { x: 0, y: 0, width: 800, height: 600 },
    pixels_per_point: 1,
    width: 800,
    height: 600,
  };
  let pointerAllowed = true;
  const inputs: Array<{ tool: string; args: Record<string, unknown> }> = [];
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, title: 'Draft' }] };
    if (tool === 'get_window_state') {
      if (capture === 'throw') throw new Error('CUA refused: px_capture_unavailable');
      return {
        value: {
          capture_geometry: geometry,
          background_input: {
            exact_window: { pid: 42, window_id: 91, status: 'matched' },
            routes: ['accessibility', 'window_pointer', 'pid_keyboard'].map((route) => ({
              route,
              status: route === 'window_pointer' && !pointerAllowed ? 'refused' : 'available',
              ...(route === 'window_pointer' && !pointerAllowed
                ? { reason: 'window_hidden' }
                : {}),
            })),
          },
          elements: [
            {
              role: capture === 'protected' ? 'AXSecureTextField' : 'AXTextArea',
              label:
                capture === 'private-link'
                  ? 'https://example.com/?token=private-value'
                  : 'hidden-semantic-content',
              value: 'unseen-document-text',
              element_token: 'secret-element-token',
            },
          ],
        },
        ...(capture !== 'missing' && args.include_screenshot
          ? {
              images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
            }
          : {}),
      };
    }
    inputs.push({ tool, args });
    return { effect: 'unverifiable', delivery: { mode: 'background' } };
  });
  const readWindowContext = vi.fn();
  const readImageText = vi.fn();
  const backend = new DesktopActionBackend({
    cua,
    visionOnly: true,
    macBrowserAccess: () => true,
    macBackgroundControl: () => background,
    readWindowContext,
    readImageText,
  });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  return {
    cua,
    inputs,
    pointer: (allowed: boolean) => {
      pointerAllowed = allowed;
    },
    geometry: (next: typeof geometry) => {
      geometry = next;
    },
    readWindowContext,
    readImageText,
    mode: (value: typeof capture) => {
      capture = value;
    },
    snapshot: (args = {}) => backend.invoke(request('computer_snapshot', { ...ids, ...args })),
    act: (snapshot: unknown, args: Record<string, unknown>) =>
      backend.invoke(
        request('computer_action', {
          ...ids,
          snapshot_id: snapshot,
          ...args,
        }),
      ),
  };
}

it('requires pixels even when asked for semantic text and never exposes extracted content or targets', async () => {
  const h = await fixture();
  const result = await h.snapshot({ include_image: false, read_text: true });
  expect(result.outcome).toBe('verified');
  expect(result.images).toHaveLength(1);
  expect(result.data).toMatchObject({
    control_mode: 'vision',
    screenshot_size: { width: 800, height: 600 },
  });
  expect(
    h.cua.call.mock.calls
      .filter(([name]) => name === 'get_window_state')
      .map(([, args]) => args.include_screenshot),
  ).toEqual([true]);
  expect(h.readWindowContext).not.toHaveBeenCalled();
  expect(h.readImageText).not.toHaveBeenCalled();
  const serialized = JSON.stringify(result);
  for (const hidden of [
    'hidden-semantic-content',
    'unseen-document-text',
    'secret-element-token',
    'elements',
    'visible_text',
    'image_text',
    'pixel_bounds',
    'capture_geometry',
    'pixels_per_point',
  ])
    expect(serialized).not.toContain(hidden);
});

it.each(['missing', 'throw', 'protected', 'private-link'] as const)(
  'revokes old authority without semantic fallback when the next image is %s',
  async (mode) => {
    const h = await fixture();
    const first = await h.snapshot();
    const id = dataRecord(first.data).snapshot_id;
    h.mode(mode);
    const failed = await h.snapshot();
    expect(failed.outcome).toBe('refused');
    expect(failed.images).toBeUndefined();
    expect(dataRecord(failed.data).snapshot_id).toBeUndefined();
    expect((await h.act(id, { action: 'key', value: 'Return' })).outcome).toBe('stale');
    expect(h.inputs).toEqual([]);
    expect(
      h.cua.call.mock.calls
        .filter(([name]) => name === 'get_window_state')
        .map(([, args]) => args.include_screenshot),
    ).toEqual([true, true]);
  },
);

it.each([
  { action: 'click', element_ref: 'secret-element-token' },
  { action: 'type', element_ref: 'secret-element-token', text: 'replace' },
  { action: 'set', text: 'replace' },
  { action: 'menu', menu_path: ['File', 'Save'] },
])('rejects semantic input without dispatch: %o', async (args) => {
  const h = await fixture();
  const result = await h.snapshot();
  expect((await h.act(dataRecord(result.data).snapshot_id, args)).outcome).toBe('refused');
  expect(h.inputs).toEqual([]);
});

it('rejects keyboard input from an expired image', async () => {
  const h = await fixture();
  const now = Date.now();
  const time = vi.spyOn(Date, 'now').mockReturnValue(now);
  const result = await h.snapshot();
  time.mockReturnValue(now + 30_001);
  expect(
    (await h.act(dataRecord(result.data).snapshot_id, { action: 'key', value: 'Return' }))
      .outcome,
  ).toBe('stale');
  expect(h.inputs).toEqual([]);
});

it('does not silently route a visual session through semantic upload or Mac automation', async () => {
  const cua = fakeCua(async () => {
    throw new Error('Driver must not be called');
  });
  const backend = new DesktopActionBackend({ cua, visionOnly: true });
  for (const name of ['browser_upload', 'mac_automation'] as const) {
    const result = await backend.invoke(request(name, {}));
    expect(result.outcome).toBe('refused');
    expect(result.data).toMatchObject({ blocker_code: 'visual_route_unavailable' });
  }
  expect(cua.call).not.toHaveBeenCalled();
});

it('delivers visual coordinates in the background and returns another image without semantic refs', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  const result = await h.act(dataRecord(first.data).snapshot_id, {
    action: 'click',
    x: 25,
    y: 30,
  });
  expect(h.inputs).toEqual([
    {
      tool: 'click',
      args: expect.objectContaining({ x: 25, y: 30, delivery_mode: 'background' }),
    },
  ]);
  expect(h.inputs[0]!.args.element_token).toBeUndefined();
  expect(h.inputs[0]!.args.capture_geometry).toMatchObject({
    surface: { pid: 42, window_id: 91 },
    pixels_per_point: 1,
  });
  expect(result.outcome).toBe('accepted_unverified');
  expect(result.images).toHaveLength(1);
  expect(result.data).toMatchObject({ control_mode: 'vision' });
  expect(JSON.stringify(result)).not.toContain('hidden-semantic-content');
  expect(JSON.stringify(result)).not.toContain('secret-element-token');
});

it('admits the same visual tools on screen without enabling semantic observation', async () => {
  const h = await fixture(false);
  const observed = await h.snapshot();
  expect(observed.outcome).toBe('verified');
  expect(observed.images).toHaveLength(1);
  expect(observed.data).toMatchObject({ control_mode: 'vision' });
  expect(JSON.stringify(observed)).not.toContain('hidden-semantic-content');
  const result = await h.act(dataRecord(observed.data).snapshot_id, {
    action: 'key',
    value: 'Return',
  });
  expect(['refused', 'stale']).not.toContain(result.outcome);
  expect(h.inputs.find((input) => input.tool === 'press_key')?.args.delivery_mode).toBe(
    'foreground',
  );
  expect(h.readWindowContext).not.toHaveBeenCalled();
  expect(h.readImageText).not.toHaveBeenCalled();
});

it.each(['changed', 'missing'] as const)(
  'refuses %s geometry even when PNG dimensions are unchanged',
  async (mode) => {
    const h = await fixture();
    const first = await h.snapshot();
    h.geometry(
      mode === 'missing'
        ? undefined
        : {
            surface: {
              window_id: 91,
              pid: 42,
              parent: { x: 100, y: 100, width: 800, height: 600 },
              sheet: { window_id: 92, bounds: { x: 0, y: 100, width: 1000, height: 600 } },
            },
            content: { x: 0, y: 0, width: 800, height: 480 },
            pixels_per_point: 0.8,
            width: 800,
            height: 600,
          },
    );
    expect(
      (await h.act(dataRecord(first.data).snapshot_id, { action: 'click', x: 25, y: 30 }))
        .outcome,
    ).toBe('stale');
    expect(h.inputs).toEqual([]);
  },
);

it.each([
  { value: 'Return', modifiers: [], tool: 'press_key', payload: { key: 'return' } },
  { value: 'a', modifiers: ['cmd'], tool: 'hotkey', payload: { keys: ['cmd', 'a'] } },
])(
  'focuses the screenshot point before $tool and retains its geometry proof',
  async ({ value, modifiers, tool, payload }) => {
    const h = await fixture();
    const first = await h.snapshot();
    const result = await h.act(dataRecord(first.data).snapshot_id, {
      action: 'key',
      value,
      modifiers,
      x: 25,
      y: 30,
    });
    expect(h.inputs).toEqual([
      {
        tool,
        args: expect.objectContaining({
          ...payload,
          x: 25,
          y: 30,
          delivery_mode: 'background',
          capture_geometry: expect.objectContaining({
            surface: expect.objectContaining({ pid: 42, window_id: 91 }),
          }),
        }),
      },
    ]);
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.images).toHaveLength(1);
  },
);

it('refuses a coordinate-targeted key when the field becomes protected before input', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  h.mode('protected');
  const result = await h.act(dataRecord(first.data).snapshot_id, {
    action: 'key',
    value: 'a',
    modifiers: ['cmd'],
    x: 25,
    y: 30,
  });
  expect(result.outcome).toBe('refused');
  expect(h.inputs).toEqual([]);
});

it('does not send a key when its coordinate focus route is refused', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  h.pointer(false);
  const result = await h.act(dataRecord(first.data).snapshot_id, {
    action: 'key',
    value: 'a',
    modifiers: ['cmd'],
    x: 25,
    y: 30,
  });
  expect(['stale', 'refused', 'needs_foreground']).toContain(result.outcome);
  expect(h.inputs).toEqual([]);
});

it.each([true, false])(
  'requires keyboard-only native typing when background=%s',
  async (background) => {
    const h = await fixture(background);
    const first = await h.snapshot();
    const result = await h.act(dataRecord(first.data).snapshot_id, {
      action: 'type',
      text: 'reviewer-brief.txt',
      x: 25,
      y: 30,
    });
    expect(h.inputs).toHaveLength(1);
    expect(h.inputs[0]).toMatchObject({
      tool: 'type_text',
      args: {
        keyboard_only: true,
        text: 'reviewer-brief.txt',
        x: 25,
        y: 30,
        delivery_mode: background ? 'background' : 'foreground',
      },
    });
    expect(h.inputs[0]?.args).not.toHaveProperty('element_token');
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.images).toHaveLength(1);
  },
);
