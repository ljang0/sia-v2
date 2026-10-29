import { expect, it } from 'vitest';
import type { BrowserWindowState } from '../mac/browser-window.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

async function fixture(pdf = true) {
  let state: BrowserWindowState = {
    status: 'ready',
    bundleID: 'com.apple.Safari',
    url: 'https://university.example/calendar.pdf',
    ...(pdf ? { documentKind: 'native-pdf' as const } : {}),
  };
  const sent: string[] = [];
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Calendar' }] };
    if (tool === 'get_window_state')
      return {
        elements: [
          { role: 'AXTextField', label: 'smart search field', element_token: 'address' },
          { role: 'AXLink', label: 'Help', element_token: 'help' },
        ],
        background_input: {
          exact_window: { status: 'matched', pid: 42, window_id: 91 },
          routes: ['accessibility', 'window_pointer', 'pid_keyboard'].map((route) => ({
            route,
            status: 'available',
          })),
        },
      };
    sent.push(tool);
    if (tool === 'hotkey' && JSON.stringify(args.keys) === JSON.stringify(['cmd', 't'])) {
      state = { status: 'ready', bundleID: 'com.apple.Safari', url: 'about:blank' };
    } else if (pdf && (tool === 'hotkey' || args.element_token === 'address')) {
      // The real native PDF loses independent URL identity once its address bar
      // is editing. Prevent this input rather than replaying or trusting its value.
      state = { status: 'unavailable', reason: 'page' };
    }
    return { success: true };
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => state,
  });
  const target = await grantedComputerTarget(backend);
  const ids = { app_id: target.appId, window_id: target.windowId };
  const capture = async () =>
    dataRecord(
      (await backend.invoke(request('computer_snapshot', { ...ids, include_image: false })))
        .data,
    );
  return { backend, ids, capture, sent };
}

it.each([
  { action: 'key', value: 'l', modifiers: ['cmd'] },
  { action: 'click' },
  { action: 'set', text: 'https://university.example/help' },
  { action: 'type', text: 'https://university.example/help' },
])('keeps a readable native PDF intact before address editing: %j', async (action) => {
  const h = await fixture();
  const observed = await h.capture();
  expect(observed.browser_document_kind).toBe('native-pdf');
  const field = (observed.elements as Record<string, unknown>[]).find(
    (e) => e.label === 'smart search field',
  )!;
  const refused = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: observed.snapshot_id,
      ...action,
      ...(action.action === 'key' ? {} : { element_ref: field.element_ref }),
    }),
  );
  expect(refused.outcome).toBe('refused');
  expect(dataRecord(refused.data).blocker_code).toBe('pdf_navigation_requires_new_tab');
  expect(h.sent).toEqual([]);
  const opened = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: observed.snapshot_id,
      action: 'key',
      value: 't',
      modifiers: ['cmd'],
    }),
  );
  expect(opened.outcome).toBe('accepted_unverified');
  expect(h.sent).toEqual(['hotkey']);
  expect(dataRecord(opened.data).snapshot_id).toEqual(expect.any(String));
  expect(dataRecord(opened.data).browser_document_kind).toBeUndefined();
});

it('retains ordinary page address navigation', async () => {
  const h = await fixture(false);
  const observed = await h.capture();
  const result = await h.backend.invoke(
    request('computer_action', {
      ...h.ids,
      snapshot_id: observed.snapshot_id,
      action: 'key',
      value: 'l',
      modifiers: ['cmd'],
    }),
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(h.sent).toEqual(['hotkey']);
});

it.each(['read-next-page', 'follow-link'])(
  'retains supported PDF reading actions: %s',
  async (kind) => {
    const h = await fixture();
    const observed = await h.capture();
    const link = (observed.elements as Record<string, unknown>[]).find(
      (e) => e.label === 'Help',
    )!;
    const action =
      kind === 'read-next-page'
        ? { action: 'key', value: 'PageDown' }
        : { action: 'click', element_ref: link.element_ref };
    const result = await h.backend.invoke(
      request('computer_action', { ...h.ids, snapshot_id: observed.snapshot_id, ...action }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(h.sent).toEqual([kind === 'read-next-page' ? 'press_key' : 'click']);
  },
);
