import { expect, it, vi } from 'vitest';
import type { BrowserWindowState } from '../mac/browser-window.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

async function fixture(
  change: Record<string, unknown> = {},
  proof: Record<string, unknown> = {},
) {
  let blank = false;
  let revoked = false;
  const sent: string[] = [];
  const notice = {
    role: 'AXStaticText',
    label: 'Organization account login required',
    element_token: 'notice',
    actions: ['AXShowMenu', 'AXScrollToVisible'],
    ...change,
  };
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
    if (tool === 'list_windows')
      return {
        windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Public guide' }],
      };
    if (tool === 'get_window_state')
      return {
        elements: blank
          ? [{ role: 'AXTextField', label: 'smart search field', element_token: 'address' }]
          : [
              notice,
              {
                role: 'AXTextField',
                ...(proof.omitSearchSubrole ? {} : { subrole: 'AXSearchField' }),
                label: 'Search this site',
                value: 'search value must not escape',
                element_token: 'search',
              },
              ...(proof.rawUsernameField
                ? [{ role: 'AXTextField', label: 'Username', element_token: 'username' }]
                : []),
            ],
        ...(args.include_screenshot
          ? {
              images: [
                {
                  mimeType: 'image/png',
                  dataBase64: 'pixels must not escape the restricted read',
                },
              ],
            }
          : {}),
        background_input: {
          exact_window: { status: 'matched', pid: 42, window_id: 91 },
          routes: ['accessibility', 'window_pointer', 'pid_keyboard'].map((route) => ({
            route,
            status: 'available',
          })),
        },
      };
    sent.push(tool);
    if (tool === 'hotkey' && JSON.stringify(args.keys) === JSON.stringify(['cmd', 't']))
      blank = true;
    return { success: true };
  });
  const readContext = vi.fn(async () => {
    if (proof.revokeDuringTextRead) revoked = true;
    return {
      status: 'ready' as const,
      bundleID: 'com.apple.Safari',
      title: 'Public guide',
      text: 'Public library opening hours:09:00-17:00.',
      partial: false,
    };
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () =>
      ({
        status: 'ready',
        bundleID: 'com.apple.Safari',
        url: blank ? 'about:blank' : 'https://university.example/public-guide',
        pageHasNonSearchEditableControls: false,
        authenticationControlsPresent: revoked,
        ...proof,
      }) as BrowserWindowState,
    readWindowContext: readContext,
  });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  const capture = (extra = {}) =>
    backend.invoke(request('computer_snapshot', { ...ids, include_image: true, ...extra }));
  return {
    backend,
    ids,
    capture,
    sent,
    readContext,
    revoke: () => {
      revoked = true;
    },
  };
}

it('reads only public text and withholds page controls and images for a signed passive-notice proof', async () => {
  const h = await fixture();
  const result = await h.capture();
  const data = dataRecord(result.data);
  expect(result.outcome).toBe('verified');
  expect(data.visible_text).toContain('09:00-17:00');
  expect(data.read_only_access_notice).toBe(true);
  expect(data.elements).toEqual([]);
  expect(data.pixel_actions_available).toBe(false);
  expect(result.images).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('pixels must not escape');
  expect(JSON.stringify(result)).not.toContain('search value must not escape');
  const scroll = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: data.snapshot_id,
      action: 'scroll',
      direction: 'down',
    }),
  );
  expect(scroll.outcome).toBe('accepted_unverified');
  expect(h.sent).toEqual(['scroll']);
  const next = dataRecord(scroll.data);
  const tab = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: next.snapshot_id,
      action: 'key',
      value: 't',
      modifiers: ['cmd'],
    }),
  );
  expect(tab.outcome).toBe('accepted_unverified');
  expect(h.sent).toEqual(['scroll', 'hotkey']);
  expect(dataRecord(tab.data).read_only_access_notice).toBeUndefined();
});

it.each([
  { action: 'type', text: 'do not type' },
  { action: 'set', text: 'do not set' },
  { action: 'click', x: 1, y: 1 },
  { action: 'key', value: 'Return' },
  { action: 'key', value: 'Escape' },
])('never turns a passive access-notice read into page input: %j', async (action) => {
  const h = await fixture();
  const result = await h.capture();
  const data = dataRecord(result.data);
  const denied = await h.backend.invoke(
    request('computer_action', { ...h.ids, snapshot_id: data.snapshot_id, ...action }),
  );
  expect(denied.outcome).toBe('refused');
  expect(h.sent).toEqual([]);
});

it.each([
  { pageHasNonSearchEditableControls: true },
  { authenticationControlsPresent: true },
  { pageHasNonSearchEditableControls: undefined },
  { authenticationControlsPresent: undefined },
])('fails closed without the complete signed native proof: %j', async (proof) => {
  const h = await fixture({}, proof);
  const result = await h.capture();
  expect(result.outcome).toBe('refused');
  expect(result.images).toBeUndefined();
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
  expect(h.readContext).not.toHaveBeenCalled();
});

it.each([
  { role: 'AXButton', actions: ['AXPress'] },
  { role: 'AXTextField' },
  { role: 'AXSecureTextField' },
  { input_type: 'password' },
  { label: 'Login required' },
  { actions: ['AXPress'] },
  { label: 'Organization account login required; password: omitted' },
])('retains hard protection for authentication surfaces: %j', async (change) => {
  const h = await fixture(change);
  const result = await h.capture();
  expect(result.outcome).toBe('refused');
  expect(result.images).toBeUndefined();
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
  expect(h.readContext).not.toHaveBeenCalled();
});

it('discards the read when authentication controls appear during capture', async () => {
  const h = await fixture({}, { revokeDuringTextRead: true });
  const result = await h.capture();
  expect(result.outcome).toBe('stale');
  expect(result.images).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('09:00-17:00');
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
});

it('keeps expected-page binding before reading a passive notice', async () => {
  const h = await fixture();
  const result = await h.capture({ expected_url: 'https://other.example/private' });
  expect(result.outcome).toBe('stale');
  expect(h.readContext).not.toHaveBeenCalled();
});

it('rejects contradictory raw form fields even if native proof says none', async () => {
  const h = await fixture({}, { rawUsernameField: true });
  const result = await h.capture();
  expect(result.outcome).toBe('refused');
  expect(h.readContext).not.toHaveBeenCalled();
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
  expect(result.images).toBeUndefined();
});

it('uses nonempty static notice metadata when a driver supplies an empty label', async () => {
  const h = await fixture({ label: '', title: 'Organization account login required' });
  const result = await h.capture();
  expect(result.outcome).toBe('verified');
  expect(dataRecord(result.data).read_only_access_notice).toBe(true);
  expect(result.images).toBeUndefined();
});

it('retains restricted reading when Cua omits a native search subrole', async () => {
  const h = await fixture({}, { omitSearchSubrole: true });
  const result = await h.capture();
  expect(result.outcome).toBe('verified');
  expect(dataRecord(result.data).read_only_access_notice).toBe(true);
  expect(dataRecord(result.data).elements).toEqual([]);
  expect(result.images).toBeUndefined();
});

it('revokes even read-only input when authentication controls appear after the snapshot', async () => {
  const h = await fixture();
  const observed = dataRecord((await h.capture()).data);
  h.revoke();
  const denied = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: observed.snapshot_id,
      action: 'key',
      value: 't',
      modifiers: ['cmd'],
    }),
  );
  expect(denied.outcome).toBe('stale');
  expect(h.sent).toEqual([]);
});

it.each([
  'about:blank',
  'https://accounts.google.com/signin',
  'https://university.example/login',
])('never uses notice handling to open a protected or non-document source: %s', async (url) => {
  const h = await fixture({}, { url });
  const result = await h.capture();
  expect(result.outcome).toBe('refused');
  expect(h.readContext).not.toHaveBeenCalled();
  expect(dataRecord(result.data).snapshot_id).toBeUndefined();
  expect(result.images).toBeUndefined();
});
