import { describe, expect, it, vi } from 'vitest';

import { registerDesktopIpc } from './ipc.js';

// This snapshot keeps the public renderer boundary intentionally small.
describe('desktop IPC contract', () => {
  it('does not expose a generic shell, filesystem, HTTP, or arbitrary tool method', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../shared/bridge.ts', import.meta.url), 'utf8'),
    );
    for (const forbidden of ['shell.exec', 'filesystem.read', 'http.fetch', 'tool.invoke']) {
      expect(source).not.toContain(forbidden);
    }
  });
});

describe('desktop IPC dispatch', () => {
  function register(failure?: Error) {
    let handler!: (event: unknown, envelope: unknown) => Promise<unknown>;
    const mainFrame = {};
    const invokeForRenderer = vi.fn(async () => {
      if (failure) throw failure;
      return { ok: true };
    });
    registerDesktopIpc(
      {
        handle: (_channel: string, listener: typeof handler) => {
          handler = listener;
        },
        removeHandler: () => undefined,
      } as never,
      { isDestroyed: () => false, webContents: { mainFrame, send: () => undefined } } as never,
      { subscribe: () => () => undefined, invokeForRenderer } as never,
    );
    return {
      invoke: (envelope: unknown) => handler({ senderFrame: mainFrame }, envelope),
      invokeForRenderer,
    };
  }

  it('rejects inherited object members as method names', async () => {
    const ipc = register();
    for (const method of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
      await expect(ipc.invoke({ method })).rejects.toThrow('Unknown Sia IPC method.');
    expect(ipc.invokeForRenderer).not.toHaveBeenCalled();
  });

  it('redacts bearer tokens and JWTs from renderer-visible errors', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJlLXZhbHVlLWhlcmU';
    const ipc = register(
      new Error(`Request failed: Authorization: Bearer abcDEF123456789xyz; session ${jwt}`),
    );
    const error = await ipc.invoke({ method: 'bootstrap' }).catch((cause: Error) => cause);
    expect(String(error)).not.toContain('abcDEF123456789xyz');
    expect(String(error)).not.toContain(jwt);
    expect(String(error)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(String(error)).toContain('Request failed');
  });

  it('accepts only the listed theme and text size choices', async () => {
    const ipc = register();
    await ipc.invoke({ method: 'settings.setTheme', input: { theme: 'dark' } });
    await ipc.invoke({ method: 'settings.setTextSize', input: { textSize: 'larger' } });
    expect(ipc.invokeForRenderer).toHaveBeenCalledTimes(2);
    for (const envelope of [
      { method: 'settings.setTheme', input: { theme: 'sepia' } },
      { method: 'settings.setTheme', input: { theme: 'dark', extra: true } },
      { method: 'settings.setTheme', input: {} },
      { method: 'settings.setTextSize', input: { textSize: 1.5 } },
      { method: 'settings.setTextSize', input: { textSize: 'huge' } },
      { method: 'settings.setTextSize', input: { textSize: 'large', zoom: 2 } },
    ])
      await expect(ipc.invoke(envelope)).rejects.toThrow();
    expect(ipc.invokeForRenderer).toHaveBeenCalledTimes(2);
  });

  it('accepts pasted bytes only as a bounded byte array', async () => {
    const ipc = register();
    const threadId = '00000000-0000-4000-8000-000000000001';
    await ipc.invoke({
      method: 'attachments.paste',
      input: { threadId, mimeType: 'image/png', data: new Uint8Array([1]) },
    });
    expect(ipc.invokeForRenderer).toHaveBeenCalledTimes(1);
    for (const data of ['aGk=', [1, 2], new Uint8Array()])
      await expect(
        ipc.invoke({
          method: 'attachments.paste',
          input: { threadId, mimeType: 'image/png', data },
        }),
      ).rejects.toThrow();
    expect(ipc.invokeForRenderer).toHaveBeenCalledTimes(1);
  });
});
