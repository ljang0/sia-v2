import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import * as chromeDebug from './chrome-debug-setup.js';

describe('chromeRemoteDebuggingStatus', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  const setup = (state: unknown) => {
    const root = mkdtempSync(join(tmpdir(), 'sia-chrome-state-'));
    roots.push(root);
    writeFileSync(join(root, 'Local State'), JSON.stringify(state));
    return root;
  };

  it('only reads Chrome state; Sia exposes no way to change it', () => {
    expect(Object.keys(chromeDebug).sort()).toEqual(['chromeRemoteDebuggingStatus']);
  });

  it('reports the toggle without modifying Local State', async () => {
    const off = setup({ browser: { theme: 'dark' } });
    const before = readFileSync(join(off, 'Local State'), 'utf8');
    await expect(
      chromeDebug.chromeRemoteDebuggingStatus({ userDataDirectory: off, platform: 'darwin' }),
    ).resolves.toBe('off');
    expect(readFileSync(join(off, 'Local State'), 'utf8')).toBe(before);

    const on = setup({ devtools: { remote_debugging: { 'user-enabled': true } } });
    await expect(
      chromeDebug.chromeRemoteDebuggingStatus({ userDataDirectory: on, platform: 'darwin' }),
    ).resolves.toBe('enabled');
  });

  it('is unavailable off macOS or without Chrome state', async () => {
    await expect(chromeDebug.chromeRemoteDebuggingStatus({ platform: 'win32' })).resolves.toBe(
      'unavailable',
    );
    const root = mkdtempSync(join(tmpdir(), 'sia-chrome-state-'));
    roots.push(root);
    await expect(
      chromeDebug.chromeRemoteDebuggingStatus({ userDataDirectory: root, platform: 'darwin' }),
    ).resolves.toBe('unavailable');
  });
});
