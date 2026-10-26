import { expect, it } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

const privateLink = 'https://meeting.example/j/123?pwd=fixture-private-value';

it.each(['element', 'context', 'ocr', 'hidden-target'] as const)(
  'keeps native credential-link evidence private while retaining safe routes: %s',
  async (source) => {
    const png = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(800, 16);
    png.writeUInt32BE(600, 20);
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Calendar', bundle_id: 'com.apple.iCal' }] };
      if (tool === 'list_windows')
        return {
          windows: [
            {
              pid: 42,
              window_id: 91,
              title: source === 'hidden-target' ? 'Agenda' : `Agenda ${privateLink}`,
            },
          ],
        };
      if (tool === 'get_window_state')
        return {
          value: {
            elements: [
              {
                role: 'AXLink',
                element_token: 'opaque-native-link',
                label: 'Join meeting',
                value: source === 'element' ? privateLink : 'Meeting details',
                description: source === 'element' ? privateLink : undefined,
                href: privateLink,
              },
            ],
          },
          images: [{ mimeType: 'image/png', dataBase64: png.toString('base64') }],
        };
      return { effect: 'confirmed' };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
      readWindowContext: async () => ({
        status: 'ready',
        bundleID: 'com.apple.iCal',
        title: 'Weekly agenda',
        text:
          source === 'context' ? `Meeting at noon. Join: ${privateLink}` : 'Meeting at noon.',
        partial: false,
      }),
      readImageText: async () => (source === 'ocr' ? privateLink : 'Meeting at noon.'),
    });
    const inventory = await backend.invoke(request('computer_list', {}));
    expect(JSON.stringify(inventory)).not.toContain('fixture-private-value');
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const observed = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true, read_text: true }),
    );
    expect(observed.outcome).toBe('verified');
    expect(JSON.stringify(observed)).not.toContain('fixture-private-value');
    const data = dataRecord(observed.data);
    if (source === 'hidden-target') {
      expect(observed.images).toHaveLength(1);
      expect(data.pixel_actions_available).toBe(true);
      return;
    }
    expect(observed.images).toBeUndefined();
    expect(data.pixel_actions_available).toBe(false);
    expect(data.visible_text).toContain('Meeting at noon');
    const clicked = await backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: data.snapshot_id,
        action: 'click',
        x: 10,
        y: 10,
      }),
    );
    expect(clicked.outcome).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    expect(data.elements).toEqual([
      expect.objectContaining({ element_ref: expect.any(String) }),
    ]);
  },
);

it('redacts access links in semantic browser text and controls without changing opaque refs', async () => {
  const url = 'https://calendar.example/week';
  const cua = fakeCua(async () => ({
    value: {
      target_id: 'target-1',
      tab_id: 'tab-1',
      url,
      title: `Weekly agenda ${privateLink}`,
      snapshot: { complete: true },
      outline: `Meeting at noon. Join: ${privateLink}`,
      refs: [{ ref: 'native-private-link', role: 'link', label: 'Join', value: privateLink }],
    },
    images: [{ mimeType: 'image/png', dataBase64: 'fixture-screenshot' }],
  }));
  const backend = new DesktopActionBackend({ cua });
  backend.acceptBrowserState({ target_id: 'target-1', tab_id: 'tab-1', url });
  const listed = await backend.invoke(request('browser_tabs', {}));
  expect(JSON.stringify(listed)).not.toContain('fixture-private-value');
  const observed = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
  expect(observed.outcome).toBe('verified');
  expect(JSON.stringify(observed)).not.toContain('fixture-private-value');
  expect(JSON.stringify(observed)).not.toContain('native-private-link');
  expect(observed.images).toBeUndefined();
  expect(dataRecord(observed.data).text).toContain('Meeting at noon');
});
