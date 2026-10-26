import { expect, it, vi } from 'vitest';
import type { BrowserWindowState } from '../mac/browser-window.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

const tab = (label: string, token: string, selected = false) => ({
  role: 'AXRadioButton',
  label,
  element_token: token,
  selected,
  actions: ['AXPress', 'Name:close tab\nTarget:0x123\nSelector:_closeButtonClicked:'],
});

async function fixture() {
  let state: BrowserWindowState = {
    status: 'navigation',
    surface: 'safari-tab-overview',
    bundleID: 'com.apple.Safari',
  };
  let tabsState: BrowserWindowState = {
    status: 'navigation',
    surface: 'safari-tabs',
    bundleID: 'com.apple.Safari',
  };
  const inspect = vi.fn(async (_pid: number, _windowId: number, tabsOnly = false) =>
    tabsOnly ? tabsState : state,
  );
  let destination: BrowserWindowState = {
    status: 'ready',
    url: 'https://canvas.example.edu/',
    bundleID: 'com.apple.Safari',
  };
  const readContext = vi.fn();
  const readImage = vi.fn();
  const cua = fakeCua(async (tool, args) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Old page' }] };
    if (tool === 'get_window_state')
      return state.status === 'navigation' || args.max_depth === 2
        ? {
            images: [{ mimeType: 'image/png', dataBase64: 'private preview pixels' }],
            elements: [
              tab('CMU Canvas', 'canvas'),
              tab('login.example.edu', 'login'),
              { role: 'AXRadioButton', label: 'Fake tab', element_token: 'fake' },
              { role: 'AXTextField', value: 'private field value', element_token: 'field' },
              { role: 'AXStaticText', value: 'private preview text' },
            ],
          }
        : { elements: [{ role: 'AXLink', label: 'Courses', element_token: 'courses' }] };
    if (tool === 'click' || tool === 'press_key') {
      state = destination;
      return { success: true };
    }
    throw new Error(`Unexpected tool: ${tool}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: inspect,
    readWindowContext: readContext,
    readImageText: readImage,
  });
  const target = await grantedComputerTarget(backend);
  const capture = async (extra = {}) => {
    const result = await backend.invoke(
      request('computer_snapshot', {
        app_id: target.appId,
        window_id: target.windowId,
        include_image: true,
        read_text: true,
        ...extra,
      }),
    );
    return { result, data: dataRecord(result.data) };
  };
  return {
    backend,
    cua,
    inspect,
    readContext,
    readImage,
    target,
    capture,
    setState: (s: BrowserWindowState) => {
      state = s;
    },
    setDestination: (s: BrowserWindowState) => {
      destination = s;
    },
    setTabsState: (s: BrowserWindowState) => {
      tabsState = s;
    },
  };
}

it('exposes only native tab labels, without previews, webpage identity, OCR or screenshot authority', async () => {
  const h = await fixture();
  const { result, data } = await h.capture();
  expect(result.outcome).toBe('verified');
  expect(data.browser_surface).toBe('safari-tab-overview');
  expect(data.elements).toEqual([
    expect.objectContaining({ label: 'CMU Canvas', role: 'AXRadioButton' }),
    expect.objectContaining({ label: 'login.example.edu', role: 'AXRadioButton' }),
  ]);
  expect(data.pixel_actions_available).toBe(false);
  expect(data.source_url).toBeUndefined();
  expect(data.visible_text).toBeUndefined();
  expect(result.images).toBeUndefined();
  expect(JSON.stringify(result)).not.toMatch(/private|Fake tab|old page/i);
  expect(h.readContext).not.toHaveBeenCalled();
  expect(h.readImage).not.toHaveBeenCalled();
  expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toEqual([
    [
      'get_window_state',
      expect.objectContaining({ include_screenshot: false }),
      expect.anything(),
      undefined,
    ],
  ]);
});

it('selects the exact native tab once and returns a fresh resulting page', async () => {
  const h = await fixture();
  const { data } = await h.capture();
  const result = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      action: 'click',
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
    }),
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(dataRecord(result.data).source_url).toBe('https://canvas.example.edu/');
  const clicks = h.cua.call.mock.calls.filter(([tool]) => tool === 'click');
  expect(clicks).toHaveLength(1);
  expect(clicks[0]![1]).toMatchObject({ element_token: 'canvas', delivery_mode: 'background' });
});

it.each([
  { action: 'type', text: 'do not type' },
  { action: 'set', text: 'do not set' },
  { action: 'click', x: 10, y: 10 },
  { action: 'click', button: 'right' },
  { action: 'click', count: 2 },
  { action: 'key', value: 'l', modifiers: ['cmd'] },
  { action: 'key', value: 'Return' },
  { action: 'scroll', direction: 'down' },
])('rejects non-selection input from Tab Overview: %j', async (action) => {
  const h = await fixture();
  const { data } = await h.capture();
  const result = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
      ...action,
    }),
  );
  expect(result.outcome).toBe('refused');
  expect(
    h.cua.call.mock.calls.every(([tool]) =>
      ['list_apps', 'list_windows', 'get_window_state'].includes(tool),
    ),
  ).toBe(true);
});

it('rejects an old navigation grant after the browser returns to a page', async () => {
  const h = await fixture();
  const { data } = await h.capture();
  h.setState({
    status: 'ready',
    url: 'https://canvas.example.edu/',
    bundleID: 'com.apple.Safari',
  });
  const result = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      action: 'click',
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
    }),
  );
  expect(result.outcome).toBe('stale');
  expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
});

it('allows Escape and observes the restored page without screenshot authority from the overview', async () => {
  const h = await fixture();
  const { data } = await h.capture();
  const result = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      action: 'key',
      value: 'Escape',
    }),
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(dataRecord(result.data).source_url).toBe('https://canvas.example.edu/');
  expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'press_key')).toEqual([
    [
      'press_key',
      expect.objectContaining({ key: 'escape', delivery_mode: 'background' }),
      expect.anything(),
      undefined,
    ],
  ]);
});

it('selects a login tab without exposing or authorizing its protected destination', async () => {
  const h = await fixture();
  const { data } = await h.capture();
  h.setDestination({ status: 'protected', reason: 'page' });
  const readsBefore = h.cua.call.mock.calls.filter(
    ([tool]) => tool === 'get_window_state',
  ).length;
  const result = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      action: 'click',
      element_ref: (data.elements as Record<string, unknown>[])[1]!.element_ref,
    }),
  );
  expect(result.outcome).toBe('accepted_unverified');
  expect(dataRecord(result.data)).toMatchObject({
    observation_pending: true,
    observation_outcome: 'refused',
  });
  expect(dataRecord(result.data).elements).toBeUndefined();
  expect(result.images).toBeUndefined();
  expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
    readsBefore,
  );
  expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
});

it('does not assign Tab Overview to an expected course URL', async () => {
  const h = await fixture();
  const { result } = await h.capture({ expected_url: 'https://canvas.example.edu/' });
  expect(result.outcome).toBe('stale');
  expect(result.images).toBeUndefined();
});

it('requires the verified Safari bundle and a stable navigation surface', async () => {
  const h = await fixture();
  h.setState({
    status: 'navigation',
    surface: 'safari-tab-overview',
    bundleID: 'com.google.Chrome',
  });
  expect((await h.capture()).result.outcome).toBe('refused');
  h.inspect
    .mockResolvedValueOnce({
      status: 'navigation',
      surface: 'safari-tab-overview',
      bundleID: 'com.apple.Safari',
    })
    .mockResolvedValueOnce({ status: 'protected', reason: 'page' });
  const { result } = await h.capture();
  expect(result.outcome).toBe('stale');
  expect(dataRecord(result.data).elements).toBeUndefined();
  expect(result.images).toBeUndefined();
});

it('can select an existing safe tab while the current page is protected, without reading that page', async () => {
  const h = await fixture();
  h.setState({ status: 'protected', reason: 'page' });
  const { result, data } = await h.capture({ tabs_only: true });
  expect(result.outcome).toBe('verified');
  expect(data.browser_surface).toBe('safari-tabs');
  expect(h.inspect).toHaveBeenCalledWith(42, 91, true);
  expect(JSON.stringify(result)).not.toMatch(/private|preview pixels|field value/);
  expect(h.readContext).not.toHaveBeenCalled();
  expect(h.readImage).not.toHaveBeenCalled();
  const captures = h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state');
  expect(captures).toHaveLength(1);
  expect(captures[0]![1]).toMatchObject({ include_screenshot: false, max_depth: 2 });
  const selected = await h.backend.invoke(
    request('computer_action', {
      app_id: h.target.appId,
      window_id: h.target.windowId,
      snapshot_id: data.snapshot_id,
      action: 'click',
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
    }),
  );
  expect(dataRecord(selected.data).source_url).toBe('https://canvas.example.edu/');
  expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
});

it.each([
  { action: 'key', value: 'Escape' },
  { action: 'key', value: 't', modifiers: ['cmd'] },
  { action: 'type', text: 'do not enter a form' },
])(
  'never sends keyboard input into the selected page from a tab-only grant: %j',
  async (action) => {
    const h = await fixture();
    h.setState({ status: 'protected', reason: 'page' });
    const { data } = await h.capture({ tabs_only: true });
    const result = await h.backend.invoke(
      request('computer_action', {
        app_id: h.target.appId,
        window_id: h.target.windowId,
        snapshot_id: data.snapshot_id,
        ...action,
      }),
    );
    expect(result.outcome).toBe('refused');
    expect(
      h.cua.call.mock.calls.every(([tool]) =>
        ['list_apps', 'list_windows', 'get_window_state'].includes(tool),
      ),
    ).toBe(true);
  },
);

it('fails closed when the separate native tab-bar check is unavailable', async () => {
  const h = await fixture();
  h.setState({ status: 'protected', reason: 'page' });
  h.setTabsState({ status: 'unavailable' });
  const { result } = await h.capture({ tabs_only: true });
  expect(result.outcome).toBe('refused');
  expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
});

it('does not route a tab-only request into a Chromium webpage read', async () => {
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'Chrome', bundle_id: 'com.google.Chrome' }] };
    if (tool === 'list_windows')
      return {
        windows: [{ pid: 42, window_id: 91, app_name: 'Chrome', title: 'Existing browser' }],
      };
    throw new Error(`Unexpected tool ${tool}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    inspectBrowserWindow: async () => ({ status: 'protected' }),
  });
  const target = await grantedComputerTarget(backend);
  const result = await backend.invoke(
    request('computer_snapshot', {
      app_id: target.appId,
      window_id: target.windowId,
      tabs_only: true,
    }),
  );
  expect(result.outcome).toBe('refused');
  expect(
    cua.call.mock.calls.every(([tool]) => ['list_apps', 'list_windows'].includes(tool)),
  ).toBe(true);
});
