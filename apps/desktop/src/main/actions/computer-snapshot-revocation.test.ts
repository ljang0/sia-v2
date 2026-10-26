import { expect, it } from 'vitest';
import type { BrowserWindowState } from '../mac/browser-window.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

async function fixture() {
  let protectedRead = false;
  let nativeProtected = false;
  let authControls = false;
  let url = 'https://public.example/guide';
  const inputs: string[] = [];
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
    if (tool === 'list_windows')
      return {
        windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Public page' }],
      };
    if (tool === 'get_window_state')
      return {
        elements: [
          protectedRead
            ? { role: 'AXButton', label: 'Sign in', element_token: 'auth' }
            : { role: 'AXStaticText', label: 'Public article', element_token: 'article' },
        ],
      };
    inputs.push(tool);
    return { success: true };
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () =>
      nativeProtected
        ? { status: 'protected', reason: 'page' }
        : ({
            status: 'ready',
            bundleID: 'com.apple.Safari',
            url,
            authenticationControlsPresent: authControls,
          } as BrowserWindowState),
  });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  const capture = (extra = {}) =>
    backend.invoke(request('computer_snapshot', { ...ids, include_image: false, ...extra }));
  const act = (snapshot: unknown) =>
    backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: snapshot,
        action: 'key',
        value: 'Return',
      }),
    );
  return {
    capture,
    act,
    inputs,
    setRawProtected: (value: boolean) => {
      protectedRead = value;
    },
    setNativeProtected: (value: boolean) => {
      nativeProtected = value;
    },
    setUrl: (value: string) => {
      url = value;
    },
    setAuthControls: (value: boolean) => {
      authControls = value;
    },
  };
}

it('revokes an older normal input grant when a later same-URL observation finds protected controls', async () => {
  const h = await fixture();
  const initial = await h.capture();
  expect(initial.outcome).toBe('verified');
  const snapshot = dataRecord(initial.data).snapshot_id;
  h.setRawProtected(true);
  expect((await h.capture()).outcome).toBe('refused');
  const action = await h.act(snapshot);
  expect(action.outcome).toBe('stale');
  expect(h.inputs).toEqual([]);
});

it('does not revive an old grant when a previously protected window becomes ordinary again', async () => {
  const h = await fixture();
  const initial = dataRecord((await h.capture()).data);
  h.setNativeProtected(true);
  expect((await h.capture()).outcome).toBe('refused');
  h.setNativeProtected(false);
  expect((await h.act(initial.snapshot_id)).outcome).toBe('stale');
  expect(h.inputs).toEqual([]);
  const fresh = await h.capture();
  expect(fresh.outcome).toBe('verified');
  expect((await h.act(dataRecord(fresh.data).snapshot_id)).outcome).toBe('accepted_unverified');
  expect(h.inputs).toEqual(['press_key']);
});

it('revokes older input authority when a requested source fails its expected-URL check', async () => {
  const h = await fixture();
  const initial = dataRecord((await h.capture()).data);
  expect((await h.capture({ expected_url: 'https://other.example/guide' })).outcome).toBe(
    'stale',
  );
  expect((await h.act(initial.snapshot_id)).outcome).toBe('stale');
  expect(h.inputs).toEqual([]);
});

it('sends no input if fresh signed native metadata finds authentication controls at the same URL', async () => {
  const h = await fixture();
  const initial = dataRecord((await h.capture()).data);
  h.setAuthControls(true);
  expect((await h.act(initial.snapshot_id)).outcome).toBe('refused');
  expect(h.inputs).toEqual([]);
});

it('does not revive input authority after preflight observes a different document', async () => {
  const h = await fixture();
  const initial = dataRecord((await h.capture()).data);
  h.setUrl('https://other.example/article');
  expect((await h.act(initial.snapshot_id)).outcome).toBe('stale');
  h.setUrl('https://public.example/guide');
  expect((await h.act(initial.snapshot_id)).outcome).toBe('stale');
  expect(h.inputs).toEqual([]);
});
