import { afterEach, expect, it, vi } from 'vitest';
import { parseActionArguments } from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { browserImageGeometry } from './browser-vision.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const state = {
    image: true,
    document: 'a'.repeat(64),
    protected: false,
    scale: 0.5,
    url: 'https://example.com/plan',
    permission: true,
    inputError: '',
    incompleteReceipt: false,
    inputCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  };
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.write('IHDR', 12);
  png.writeUInt32BE(1600, 16);
  png.writeUInt32BE(1200, 20);
  const observation = () => ({
    value: {
      target_id: 'driver-target',
      tab_id: 'driver-tab',
      url: state.url,
      outline: 'DOM-only content must never reach the model',
      elements: [
        {
          ref: 'driver-ref',
          role: state.protected ? 'password' : 'textbox',
          label: 'Hidden semantic label',
        },
      ],
      screenshot: {
        source: 'cdp_tab',
        visual_document: state.document,
        scope: 'viewport',
        coordinate_space: 'viewport_css_px',
        width: 1600,
        height: 1200,
        viewport_css_width: 800,
        viewport_css_height: 600,
        pixel_to_css_scale_x: state.scale,
        pixel_to_css_scale_y: state.scale,
      },
    },
    images: state.image ? [{ mimeType: 'image/png', dataBase64: png.toString('base64') }] : [],
  });
  const cua = fakeCua(async (name, args) => {
    if (name === 'list_apps')
      return { apps: [{ pid: 42, name: 'Chrome', bundle_id: 'com.google.Chrome' }] };
    if (name === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, title: 'Public plan' }] };
    if (name === 'get_browser_state') {
      if (!state.permission) throw new Error('CUA refused: browser_consent_required');
      if (args.pid)
        return {
          target_id: 'driver-target',
          tabs: [{ tab_id: 'driver-tab', url: state.url, active: true }],
        };
      return observation();
    }
    if (['browser_click', 'browser_pointer', 'browser_type'].includes(name)) {
      state.inputCalls.push({ name, args });
      if (state.inputError) throw new Error(state.inputError);
      if (state.incompleteReceipt)
        return { status: 'refused', refusal: { code: 'browser_input_incomplete' } };
      return { status: 'ok', route: 'trusted', delivery_mode: 'background' };
    }
    throw new Error(`Unexpected tool ${name}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    visionOnly: true,
    inspectBrowserWindow: async () => ({ status: 'protected' }),
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
  });
  backend.acceptBrowserState({}, 'approved-session', { pid: 42, windowId: 91 });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  return {
    state,
    cua,
    observation,
    snapshot: (args = {}) => backend.invoke(request('computer_snapshot', { ...ids, ...args })),
    act: (snapshot: unknown, args: Record<string, unknown>) =>
      backend.invoke(
        request(
          'computer_action',
          parseActionArguments('computer_action', { ...ids, snapshot_id: snapshot, ...args }),
        ),
      ),
  };
}

it('exposes only the image and tab metadata, even when text-only observation was requested', async () => {
  const h = await fixture();
  const result = await h.snapshot({ include_image: false });
  expect(result.outcome).toBe('verified');
  expect(result.images).toHaveLength(1);
  expect(result.data).toMatchObject({
    control_mode: 'vision',
    pixel_actions_available: true,
    screenshot_size: { width: 1600, height: 1200 },
  });
  for (const value of [
    'DOM-only',
    'Hidden semantic',
    'driver-ref',
    'visible_text',
    'elements',
    'visual_document',
    'a'.repeat(64),
  ])
    expect(JSON.stringify(result)).not.toContain(value);
  expect(
    h.cua.call.mock.calls
      .filter(([name, args]) => name === 'get_browser_state' && args.snapshot_format)
      .every(([, args]) => args.include_screenshot === true),
  ).toBe(true);
});

it.each([
  { action: 'click', x: 200, y: 100 },
  { action: 'scroll', x: 200, y: 100, direction: 'down', amount: 400 },
  { action: 'drag', x: 200, y: 100, to_x: 400, to_y: 200 },
])('maps original screenshot coordinates without semantic targeting: %o', async (args) => {
  const h = await fixture();
  const first = await h.snapshot();
  const result = await h.act(dataRecord(first.data).snapshot_id, args);
  expect(result.outcome).toBe('accepted_unverified');
  expect(result.images).toHaveLength(1);
  expect(h.state.inputCalls).toHaveLength(1);
  expect(h.state.inputCalls[0]!.args).toMatchObject({
    x: 100,
    y: 50,
    input_route: 'trusted',
    delivery_mode: 'background',
    visual_document: 'a'.repeat(64),
  });
  expect(h.state.inputCalls[0]!.args.ref).toBeUndefined();
  if (args.action === 'drag')
    expect(h.state.inputCalls[0]!.args).toMatchObject({ to_x: 200, to_y: 100 });
  expect(
    (await h.act(dataRecord(first.data).snapshot_id, { action: 'click', x: 1, y: 1 })).outcome,
  ).toBe('stale');
});

it('types once into the visually focused field without a DOM reference', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  const result = await h.act(dataRecord(first.data).snapshot_id, {
    action: 'type',
    text: 'Dinner plan',
  });
  expect(result.outcome).toBe('accepted_unverified');
  expect(h.state.inputCalls).toEqual([
    {
      name: 'browser_type',
      args: expect.objectContaining({ mode: 'focused', text: 'Dinner plan' }),
    },
  ]);
  expect(h.state.inputCalls[0]!.args.ref).toBeUndefined();
});

it.each(['protected', 'image', 'permission', 'scale', 'url', 'document'] as const)(
  'refuses before input if preflight changes %s',
  async (kind) => {
    const h = await fixture();
    const first = await h.snapshot();
    if (kind === 'document') h.state.document = 'b'.repeat(64);
    if (kind === 'protected') h.state.protected = true;
    if (kind === 'image') h.state.image = false;
    if (kind === 'permission') h.state.permission = false;
    if (kind === 'scale') h.state.scale = 1;
    if (kind === 'url') h.state.url = 'https://example.com/other';
    const result = await h.act(dataRecord(first.data).snapshot_id, {
      action: 'click',
      x: 200,
      y: 100,
    });
    expect(['refused', 'stale']).toContain(result.outcome);
    expect(h.state.inputCalls).toEqual([]);
  },
);

it('does not replay uncertain typing or retain its image capability', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  h.state.inputError = 'CUA refused: browser_input_incomplete';
  const args = { action: 'type', text: 'one write' };
  expect((await h.act(dataRecord(first.data).snapshot_id, args)).outcome).toBe(
    'accepted_unverified',
  );
  expect((await h.act(dataRecord(first.data).snapshot_id, args)).outcome).toBe('stale');
  expect(h.state.inputCalls).toHaveLength(1);
});

it('requires verified scale metadata matching the actual PNG dimensions', async () => {
  const h = await fixture();
  const raw = h.observation();
  expect(browserImageGeometry(raw)).toMatchObject({ width: 1600, scaleX: 0.5 });
  raw.value.screenshot.width = 800;
  expect(browserImageGeometry(raw)).toBeUndefined();
});

it.each([
  { action: 'click', x: 1600, y: 10 },
  { action: 'click', x: 10, y: 1200 },
  { action: 'type', text: 'text', modifiers: ['cmd'] },
  { action: 'key', value: 'enter' },
])('refuses unsupported or out-of-image input without dispatch: %o', async (args) => {
  const h = await fixture();
  const first = await h.snapshot();
  expect(['refused', 'stale']).toContain(
    (await h.act(dataRecord(first.data).snapshot_id, args)).outcome,
  );
  expect(h.state.inputCalls).toEqual([]);
});

it('expires an image before dispatch even when its page has not changed', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now + 30_001);
  expect(
    (
      await h.act(dataRecord(first.data).snapshot_id, {
        action: 'click',
        x: 10,
        y: 10,
      })
    ).outcome,
  ).toBe('stale');
  expect(h.state.inputCalls).toEqual([]);
});

it('rejects ambiguous visual browser targets at the gateway', () => {
  const base = { tab_id: 'tab', snapshot_id: 'snapshot', origin: 'https://example.com' };
  for (const args of [
    { action: 'click', x: 1 },
    { action: 'click', x: 1, y: 1, element_ref: 'hidden' },
    { action: 'drag', x: 1, y: 1 },
    { action: 'type', x: 1, y: 1, text: 'text' },
  ])
    expect(() => parseActionArguments('browser_action', { ...base, ...args })).toThrow();
  expect(
    parseActionArguments('browser_action', {
      ...base,
      action: 'scroll',
      x: 1,
      y: 1,
      direction: 'down',
    }),
  ).toMatchObject({ x: 1, y: 1 });
});

it('does not turn a structured uncertain receipt into a definite failure or replay', async () => {
  const h = await fixture();
  const first = await h.snapshot();
  h.state.incompleteReceipt = true;
  const args = { action: 'type', text: 'one write' };
  expect(await h.act(dataRecord(first.data).snapshot_id, args)).toMatchObject({
    outcome: 'accepted_unverified',
    data: { input_delivery_uncertain: true },
  });
  expect((await h.act(dataRecord(first.data).snapshot_id, args)).outcome).toBe('stale');
  expect(h.state.inputCalls).toHaveLength(1);
});

it('refuses an old driver screenshot that has no document authority', async () => {
  const h = await fixture();
  h.state.document = '';
  const result = await h.snapshot();
  expect(result.outcome).toBe('refused');
  expect(result.images).toBeUndefined();
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
});
