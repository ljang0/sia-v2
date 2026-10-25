import { expect, it, vi } from 'vitest';
import { parseActionArguments } from '@sia/action-gateway';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, request } from './test-support.js';

function pagedBrowser() {
  const state = { url: 'https://campus.example/courses', complete: false };
  const call = vi.fn(async (tool: string, args: Record<string, unknown>) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, title: 'Coursework' }] };
    if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
    if (args.pid)
      return {
        target_id: 'native-target',
        tabs: [{ tab_id: 'native-tab', url: state.url, active: true }],
      };
    const next = args.continuation === 'driver-private-next';
    return {
      target_id: 'native-target',
      tab_id: 'native-tab',
      page: { url: state.url, title: 'Coursework' },
      snapshot: {
        complete: next || state.complete,
        continuation: next || state.complete ? null : 'driver-private-next',
      },
      outline: next ? 'Second course: Project due Sunday' : 'First course: Reading due Friday',
      refs: [{ ref: next ? 'p2:1' : 'p1:1', role: 'link', name: 'Assignments' }],
    };
  });
  const backend = new DesktopActionBackend({
    cua: { call },
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => ({
      status: 'ready',
      url: state.url,
      bundleID: 'com.google.Chrome',
    }),
  });
  async function target() {
    const result = await backend.invoke(request('computer_list', {}));
    const window = (
      dataRecord(result.data).windows as { app_id: string; window_id: string }[]
    )[0]!;
    return { app_id: window.app_id, window_id: window.window_id };
  }
  const snapshot = (ids: Record<string, unknown>, args: Record<string, unknown> = {}) =>
    backend.invoke(request('computer_snapshot', { ...ids, ...args }));
  return { state, call, backend, target, snapshot };
}

it('reads every semantic segment through the normal Mac tools without exposing driver continuations', async () => {
  const h = pagedBrowser();
  const ids = await h.target();
  const first = await h.snapshot(ids, { include_image: false });
  const a = dataRecord(first.data);
  expect(a.page_complete).toBe(false);
  expect(a.visible_text).toContain('First course');
  expect(a.read_more_from).toBe(a.snapshot_id);
  expect(JSON.stringify(first)).not.toContain('driver-private-next');
  const args = parseActionArguments('computer_snapshot', {
    ...ids,
    continue_from: a.read_more_from,
    include_image: false,
  });
  const second = await h.backend.invoke(request('computer_snapshot', args));
  expect(dataRecord(second.data)).toMatchObject({
    page_complete: true,
    visible_text: 'Second course: Project due Sunday',
  });
  expect(dataRecord(second.data)).not.toHaveProperty('read_more_from');
  expect(
    h.call.mock.calls
      .filter(([name, args]) => name === 'get_browser_state' && !args.pid)
      .map(([, args]) => ({ continuation: args.continuation, image: args.include_screenshot })),
  ).toEqual([
    { continuation: undefined, image: false },
    { continuation: 'driver-private-next', image: false },
  ]);
  const reads = h.call.mock.calls.length;
  expect((await h.snapshot(ids, { continue_from: a.read_more_from })).outcome).toBe('stale');
  expect(h.call.mock.calls.slice(reads).some(([name]) => name === 'get_browser_state')).toBe(
    false,
  );
});

it('does not accept guessed or completed read continuations', async () => {
  const h = pagedBrowser();
  h.state.complete = true;
  const ids = await h.target();
  const first = dataRecord((await h.snapshot(ids)).data);
  const reads = h.call.mock.calls.length;
  for (const continuation of ['driver-private-next', first.snapshot_id]) {
    expect((await h.snapshot(ids, { continue_from: continuation })).outcome).toBe('stale');
  }
  expect(h.call.mock.calls.slice(reads).some(([name]) => name === 'get_browser_state')).toBe(
    false,
  );
});

it('does not expose authentication content reached while continuing a page', async () => {
  const h = pagedBrowser();
  const ids = await h.target();
  const first = dataRecord((await h.snapshot(ids)).data);
  h.state.url = 'https://login.campus.example/saml';
  const result = await h.snapshot(ids, { continue_from: first.read_more_from });
  expect(result.data).toMatchObject({ observed_authentication: true });
  expect(result.data).not.toHaveProperty('visible_text');
  expect(result.data).not.toHaveProperty('read_more_from');
  expect(result.data).not.toHaveProperty('snapshot_id');
});

it('does not silently treat a native window as a paged browser', async () => {
  const backend = new DesktopActionBackend({ cua: { call: vi.fn() } });
  const result = await backend.invoke(
    request('computer_snapshot', {
      app_id: 'app',
      window_id: 'window',
      continue_from: 'older-page',
    }),
  );
  expect(result.outcome).toBe('refused');
  expect(result.summary).toContain('native window has no browser page continuation');
});
