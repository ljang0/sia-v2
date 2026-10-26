import { expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

it('finishes the whole window observation before another read can supersede its native tokens', async () => {
  const readingText = Promise.withResolvers<void>();
  const releaseText = Promise.withResolvers<void>();
  let captures = 0;
  let contexts = 0;
  const cua = fakeCua(async (tool) => {
    if (tool === 'list_apps')
      return { apps: [{ pid: 42, name: 'TextEdit', bundle_id: 'com.apple.TextEdit' }] };
    if (tool === 'list_windows')
      return { windows: [{ pid: 42, window_id: 91, app_name: 'TextEdit', title: 'Note' }] };
    if (tool === 'get_window_state') {
      captures++;
      return {
        elements: [
          { role: 'AXButton', label: 'A control', element_token: `native-${captures}` },
        ],
      };
    }
    throw new Error(`Unexpected tool ${tool}`);
  });
  const backend = new DesktopActionBackend({
    cua,
    macBrowserAccess: () => true,
    macBackgroundControl: () => true,
    readWindowContext: async () => {
      if (++contexts === 1) {
        readingText.resolve();
        await releaseText.promise;
      }
      return {
        status: 'ready',
        bundleID: 'com.apple.TextEdit',
        title: 'Note',
        text: 'Example text',
      };
    },
  });
  const target = await grantedComputerTarget(backend);
  const capture = () =>
    backend.invoke(
      request('computer_snapshot', {
        app_id: target.appId,
        window_id: target.windowId,
        include_image: false,
      }),
    );
  const first = capture();
  await readingText.promise;
  const second = capture();
  // Give a wrongly concurrent capture enough time to reach the fake driver.
  await vi.waitFor(() => expect(contexts).toBeGreaterThanOrEqual(1));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const beforeRelease = captures;
  releaseText.resolve();
  const results = await Promise.all([first, second]);
  expect(beforeRelease).toBe(1);
  expect(captures).toBe(2);
  expect(results.map((result) => result.outcome)).toEqual(['verified', 'verified']);
  const stale = await backend.invoke(
    request('computer_action', {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: dataRecord(results[0]!.data).snapshot_id,
      element_ref: (dataRecord(results[0]!.data).elements as Record<string, unknown>[])[0]!
        .element_ref,
      action: 'click',
    }),
  );
  expect(stale.outcome).toBe('stale');
  expect(cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
});
