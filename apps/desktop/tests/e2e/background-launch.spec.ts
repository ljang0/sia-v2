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
    environment: { SIA_TEST_QUIET: '0' },
  });
  try {
    await harness.page.evaluate(() => window.sia.bootstrap());
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
    // A never-shown Electron window otherwise reports visible and keeps its
    // graphics timers running despite consuming no screen space.
    await expect.poll(() => harness.page.evaluate(() => document.hidden)).toBe(true);
    // Reopening in the background must not reveal an already-running instance either.
    await harness.application.evaluate(({ app }) => {
      app.emit('second-instance', {} as never, ['sia', '--background'], '', {});
    });
    expect(
      await harness.application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
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
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
