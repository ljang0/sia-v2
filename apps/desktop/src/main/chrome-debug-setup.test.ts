import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureChromeRemoteDebuggingEnabled } from './chrome-debug-setup.js';

describe('ensureChromeRemoteDebuggingEnabled', () => {
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

  it('writes the toggle while Chrome is closed and preserves other state', async () => {
    const root = setup({ browser: { theme: 'dark' }, devtools: { other: 1 } });
    await expect(
      ensureChromeRemoteDebuggingEnabled({
        userDataDirectory: root,
        isChromeRunning: async () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('enabled');
    const written = JSON.parse(readFileSync(join(root, 'Local State'), 'utf8'));
    expect(written.devtools.remote_debugging['user-enabled']).toBe(true);
    expect(written.devtools.other).toBe(1);
    expect(written.browser.theme).toBe('dark');
  });

  it('reports already-enabled without touching the file', async () => {
    const root = setup({ devtools: { remote_debugging: { 'user-enabled': true } } });
    const before = readFileSync(join(root, 'Local State'), 'utf8');
    await expect(
      ensureChromeRemoteDebuggingEnabled({
        userDataDirectory: root,
        isChromeRunning: async () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('already');
    expect(readFileSync(join(root, 'Local State'), 'utf8')).toBe(before);
  });

  it('never writes while Chrome is running', async () => {
    const root = setup({ devtools: {} });
    const before = readFileSync(join(root, 'Local State'), 'utf8');
    await expect(
      ensureChromeRemoteDebuggingEnabled({
        userDataDirectory: root,
        isChromeRunning: async () => true,
        platform: 'darwin',
      }),
    ).resolves.toBe('chrome_running');
    expect(readFileSync(join(root, 'Local State'), 'utf8')).toBe(before);
  });

  it('is unavailable off macOS or without a Chrome profile', async () => {
    await expect(ensureChromeRemoteDebuggingEnabled({ platform: 'win32' })).resolves.toBe(
      'unavailable',
    );
    const root = mkdtempSync(join(tmpdir(), 'sia-chrome-none-'));
    roots.push(root);
    await expect(
      ensureChromeRemoteDebuggingEnabled({
        userDataDirectory: root,
        isChromeRunning: async () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('unavailable');
  });
});
