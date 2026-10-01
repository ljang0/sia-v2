import { parseActionArguments } from '@sia/action-gateway';
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
