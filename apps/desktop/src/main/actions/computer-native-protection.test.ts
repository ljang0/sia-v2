import { expect, it } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

it.each([
  { role: 'AXSecureTextField' },
  { role: 'AXTextField', subrole: 'AXSecureTextField' },
  { role: 'AXTextField', input_type: 'password' },
  { role: 'AXTextField', autocomplete: 'one-time-code' },
])(
  'withholds neighbouring content and grants on a native credential field: %j',
  async (marker) => {
    let protectedWindow = false;
    const inputs: string[] = [];
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Notes', bundle_id: 'com.apple.Notes' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Notes', title: 'Notes' }] };
      if (tool === 'get_window_state')
        return {
          value: {
            elements: protectedWindow
              ? [
                  {
                    ...marker,
                    element_token: 'secure',
                    value: 'protected fixture value',
                  },
                  {
                    role: 'AXTextField',
                    label: 'Account identifier',
                    element_token: 'identifier',
                    value: 'neighbouring fixture text',
                  },
                  { role: 'AXButton', label: 'Sign in', element_token: 'login' },
                ]
              : [{ role: 'AXButton', label: 'Search notes', element_token: 'search' }],
          },
          images: [{ mimeType: 'image/png', dataBase64: 'fixture pixels' }],
        };
      inputs.push(tool);
      return { success: true };
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
      readWindowContext: async () => {
        if (protectedWindow)
          throw new Error('Protected windows must not read neighbouring text.');
        return {
          status: 'ready',
          bundleID: 'com.apple.Notes',
          title: 'Notes',
          text: 'Ordinary notes.',
        };
      },
      readImageText: async () => {
        throw new Error('Protected window images must not be read.');
      },
    });
    const target = await grantedComputerTarget(backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const initial = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: false }),
    );
    expect(initial.outcome).toBe('verified');
    protectedWindow = true;
    const result = await backend.invoke(
      request('computer_snapshot', { ...ids, include_image: true }),
    );
    expect(result.outcome).toBe('refused');
    expect(dataRecord(result.data).blocker_code).toBe('protected_window');
    expect(result.images).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/fixture|identifier|login/);
    const action = await backend.invoke(
      request('computer_action', {
        ...ids,
        snapshot_id: dataRecord(initial.data).snapshot_id,
        action: 'key',
        value: 'Return',
      }),
    );
    expect(action.outcome).toBe('stale');
    expect(inputs).toEqual([]);
  },
);
