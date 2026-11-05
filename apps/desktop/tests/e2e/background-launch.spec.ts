import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchIsolatedSia } from '../support/electron-harness.js';

test('a background launch serves the typed bridge without showing its window', async () => {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-background-launch-'));
  await mkdir(join(testRoot, 'user-data'));
  await writeFile(
    join(testRoot, 'user-data', 'window-state.json'),
    JSON.stringify({ bounds: { x: 20, y: 40, width: 1100, height: 800 }, maximized: true }),
  );
  const harness = await launchIsolatedSia({
    testRoot,
    arguments: ['--background'],
    preserveNativeVisibility: true,
    environment: { SIA_TEST_QUIET: '0' },
  });
  try {
    await harness.page.evaluate(() => window.sia.bootstrap());
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
    await expect
      .poll(() => harness.page.evaluate(() => document.visibilityState))
      .toBe('hidden');
    // Reopening in the background must not reveal an already-running instance either.
    await harness.application.evaluate(({ app }) => {
      app.emit('second-instance', {} as never, ['sia', '--background'], '', {});
    });
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
    await expect
      .poll(() => harness.page.evaluate(() => document.visibilityState))
      .toBe('hidden');
    // An explicit normal open still restores the app rather than leaving it inaccessible.
    await harness.application.evaluate(({ app }) => {
      app.emit('second-instance', {} as never, ['sia'], '', {});
    });
    await expect
      .poll(() =>
        harness.application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().some((window) => window.isVisible()),
        ),
      )
      .toBe(true);
    await expect
      .poll(() => harness.page.evaluate(() => document.visibilityState))
      .toBe('visible');
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.getBackgroundThrottling(),
      ),
    ).toBe(false);
    await harness.page.evaluate(() => {
      const state = window as typeof window & { testFrames: number };
      state.testFrames = 0;
      const count = () => {
        state.testFrames++;
        requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
    });
    await expect
      .poll(() =>
        harness.page.evaluate(
          () => (window as typeof window & { testFrames: number }).testFrames,
        ),
      )
      .toBeGreaterThan(1);
    const coverId = await harness.application.evaluate(({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows()[0]!;
      const cover = new BrowserWindow({ ...main.getBounds(), show: true });
      return cover.id;
    });
    const beforeCover = await harness.page.evaluate(
      () => (window as typeof window & { testFrames: number }).testFrames,
    );
    await expect
      .poll(() =>
        harness.page.evaluate(
          () => (window as typeof window & { testFrames: number }).testFrames,
        ),
      )
      .toBeGreaterThan(beforeCover + 2);
    await harness.application.evaluate(({ BrowserWindow }, id) => {
      BrowserWindow.fromId(id)!.destroy();
    }, coverId);
    // Closing to the background must stop painting again, without stopping the bridge.
    await harness.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.hide();
    });
    await expect
      .poll(() =>
        harness.application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.webContents.getBackgroundThrottling(),
        ),
      )
      .toBe(true);
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.isVisible(),
      ),
    ).toBe(false);
    await harness.page.evaluate(() => window.sia.bootstrap());
    // Electron's visibilityState can lag when throttling changes. Check frames,
    // the behavior needed here, rather than treating that flag as a paint receipt.
    await harness.application.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    const frames = await harness.page.evaluate(
      () => (window as typeof window & { testFrames: number }).testFrames,
    );
    await harness.application.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    expect(
      await harness.page.evaluate(
        () => (window as typeof window & { testFrames: number }).testFrames,
      ),
    ).toBe(frames);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
