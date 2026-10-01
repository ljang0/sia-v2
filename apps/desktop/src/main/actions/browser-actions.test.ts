import { parseActionArguments } from '@sia/action-gateway';
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { sweepStaleBrowserVaults } from './browser-uploads.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, request } from './test-support.js';

// These fixtures advance app state with explicit mock observations. Real settle
// sleeps add load and timing failures without exercising an application's timing.
vi.mock('node:timers/promises', async (original) => ({
  ...(await original<typeof import('node:timers/promises')>()),
  setTimeout: vi.fn(
    async (_ms?: number, value?: unknown, options?: { signal?: AbortSignal }) => {
      options?.signal?.throwIfAborted();
      return value;
    },
  ),
}));

describe('DesktopActionBackend browser boundary', () => {
  it('opens the Full Disk Access pane once when local Messages reads are blocked', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const openFullDiskAccessSettings = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua,
      openFullDiskAccessSettings,
      messages: {
        search: () => {
          throw new Error(
            'Reading Messages needs Full Disk Access for Sia: System Settings → Privacy & Security → Full Disk Access, add Sia, then retry.',
          );
        },
        readThread: () => [],
        send: async () => undefined,
      },
    });
    const first = await backend.invoke(request('messages_search', {}));
    expect(first.outcome).toBe('refused');
    expect(first.reason).toContain('System Settings has been opened');
    await backend.invoke(request('messages_search', {}));
    expect(openFullDiskAccessSettings).toHaveBeenCalledOnce();
  });

  it('refuses a message send that skipped the host authorization boundary', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const send = vi.fn(async () => undefined);
    const backend = new DesktopActionBackend({
      cua,
      messages: { search: () => [], readThread: () => [], send },
    });
    const { approvalId: _approvalId, ...unapproved } = request('messages_send', {
      recipient: '+15551234567',
      text: 'hi',
    });
    const result = await backend.invoke(unapproved);
    expect(result.outcome).toBe('refused');
    expect(result.reason).toContain('action authorization');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports a connection blocker after the host revokes the attachment', async () => {
    const cua = fakeCua(async (tool) => {
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      },
      'sia-browser-revoked-session',
    );

    backend.resetBrowserCapabilities();
    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result).toMatchObject({ outcome: 'refused', data: { tabs: [] } });
    expect(result.summary).toContain('Browser access needs setup.');
    expect(result.summary).toContain('rather than concluding Chrome is closed');
    expect(cua.call).not.toHaveBeenCalled();
  });

  it('uses the current host-minted browser attachment session', async () => {
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url: 'https://fixture.example.test/',
      },
      'sia-browser-fresh-session',
    );

    await backend.invoke(request('browser_tabs', {}));

    expect(cua.call.mock.calls[0]?.[1]).toMatchObject({
      session: 'sia-browser-fresh-session',
      target_id: 'target-1',
      tab_id: 'tab-1',
    });
  });

  it('revokes stale tab bindings when the trusted attachment session rotates', async () => {
    const cua = fakeCua(async (tool, args) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      expect(args).toMatchObject({
        session: 'sia-browser-current',
        target_id: 'target-current',
        tab_id: 'tab-current',
      });
      return {
        target_id: 'target-current',
        tab_id: 'tab-current',
        url: 'https://current.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        target_id: 'target-expired',
        tab_id: 'tab-expired',
        url: 'https://expired.example.test/',
      },
      'sia-browser-expired',
    );
    backend.acceptBrowserState(
      {
        target_id: 'target-current',
        tab_id: 'tab-current',
        url: 'https://current.example.test/',
      },
      'sia-browser-current',
    );

    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result.outcome).toBe('verified');
    expect(cua.call).toHaveBeenCalledTimes(1);
    const tabs = dataRecord(result.data).tabs as Array<Record<string, unknown>>;
    expect(tabs).toEqual([
      expect.objectContaining({ tab_id: 'tab-current', url: 'https://current.example.test' }),
    ]);
  });

  it('drops a replaced Chrome route while retaining another live route in the grant', async () => {
    const cua = fakeCua(async (tool, args) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      if (args.tab_id === 'tab-replaced') {
        throw new Error('CUA refused: browser_route_unavailable');
      }
      return {
        target_id: 'target-live',
        tab_id: 'tab-live',
        url: 'https://live.example.test/',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState(
      {
        tabs: [
          {
            target_id: 'target-replaced',
            tab_id: 'tab-replaced',
            url: 'https://replaced.example.test/',
          },
          {
            target_id: 'target-live',
            tab_id: 'tab-live',
            url: 'https://live.example.test/',
          },
        ],
      },
      'sia-browser-current',
    );

    const result = await backend.invoke(request('browser_tabs', {}));

    expect(result.outcome).toBe('verified');
    expect(cua.call).toHaveBeenCalledTimes(2);
    expect(dataRecord(result.data).tabs).toEqual([
      expect.objectContaining({ tab_id: 'tab-live', url: 'https://live.example.test' }),
    ]);
  });

  it('redacts model-visible URLs and denies credential-management locations', async () => {
    let url = 'https://mail.example.test/inbox?view=all#message-42';
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        target_id: 'target-1',
        tab_id: 'tab-1',
        url,
        title: 'Inbox',
      };
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({ target_id: 'target-1', tab_id: 'tab-1', url });

    const listed = await backend.invoke(request('browser_tabs', {}));
    const tabs = dataRecord(listed.data).tabs as Array<Record<string, unknown>>;
    expect(cua.call.mock.calls[0]?.slice(0, 2)).toEqual([
      'get_browser_state',
      { session: 'sia-browser', target_id: 'target-1', tab_id: 'tab-1' },
    ]);
    expect(tabs[0]?.url).toBe('https://mail.example.test');
    expect(JSON.stringify(listed)).not.toContain('view=all');
    expect(JSON.stringify(listed)).not.toContain('message-42');

    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    expect(dataRecord(snapshot.data).url).toBe('https://mail.example.test');
    expect(JSON.stringify(snapshot)).not.toContain('view=all');
    expect(JSON.stringify(snapshot)).not.toContain('message-42');

    url = 'https://mail.example.test/settings/api-keys';
    expect(
      await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' })),
    ).toMatchObject({ outcome: 'refused' });

    url = 'https://mail.example.test/inbox?access_token=private-token';
    const secretQuery = await backend.invoke(request('browser_tabs', {}));
    expect(dataRecord(secretQuery.data).tabs).toEqual([]);
    expect(JSON.stringify(secretQuery)).not.toContain('private-token');
  });

  it('keeps target ids and native refs private while using exact tab capabilities', async () => {
    let stateCount = 0;
    const cua = fakeCua(async (tool, args) => {
      if (tool === 'get_browser_state') {
        stateCount += 1;
        return {
          value: {
            page: { url: 'https://mail.example.test/inbox', title: 'Inbox' },
            outline: '- button "Compose"',
            refs: [
              {
                ref: `p${stateCount}:1`,
                role: 'button',
                name: 'Compose',
                states: { disabled: false },
                actions: ['click'],
              },
              {
                ref: `p${stateCount}:2`,
                role: 'password',
                value: 'secret',
                actions: ['type'],
              },
            ],
            request_debug: args,
          },
          images: [{ mimeType: 'image/png', dataBase64: `browser-pixels-${stateCount}` }],
        };
      }
      if (tool === 'browser_click') {
        return {
          effect: 'confirmed',
          route: 'trusted_input',
          delivery: { mode: 'background' },
        };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      isBrowserOriginAllowed: (origin) => origin === 'https://mail.example.test',
    });
    backend.acceptBrowserState({ target_id: 'target-secret', tab_id: 'tab-1' });

    const snapshotResult = await backend.invoke(
      request('browser_snapshot', { tab_id: 'tab-1' }),
    );
    const snapshotData = dataRecord(snapshotResult.data);
    const elements = snapshotData.elements as Array<Record<string, unknown>>;
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ label: 'Compose', disabled: false });
    expect(snapshotData.text).toBe('- button "Compose"');
    expect(JSON.stringify(snapshotResult)).not.toContain('target-secret');
    expect(JSON.stringify(snapshotResult)).not.toContain('p1:1');
    expect(JSON.stringify(snapshotResult)).not.toContain('secret');
    expect(
      backend.trustedApprovalTarget('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
        origin: 'https://mail.example.test',
      }),
    ).toMatch(
      process.platform === 'darwin'
        ? /^https:\/\/mail\.example\.test: click via an explicit page DOM event on “Compose” \(button, exact snapshot ref b:/
        : /^https:\/\/mail\.example\.test: click “Compose” \(button, exact snapshot ref b:/,
    );

    const result = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: elements[0]?.element_ref,
        origin: 'https://mail.example.test',
      }),
    );

    expect(result.outcome).toBe('verified');
    expect(result.images).toEqual([{ mimeType: 'image/png', dataBase64: 'browser-pixels-2' }]);
    const resultData = dataRecord(result.data);
    expect(resultData.snapshot_id).toBe(result.verification?.snapshotId);
    expect(resultData).not.toHaveProperty('snapshot');
    const call = cua.call.mock.calls.find(([tool]) => tool === 'browser_click');
    expect(call?.[1]).toEqual({
      session: 'sia-browser',
      target_id: 'target-secret',
      tab_id: 'tab-1',
      ref: 'p1:1',
      input_route: process.platform === 'darwin' ? 'dom_event' : 'trusted',
    });
    expect(JSON.stringify(result)).not.toContain('target-secret');
    expect(JSON.stringify(result)).not.toContain('p1:1');
  });

  it('accepts a targeted semantic snapshot without repeated route ids only on the granted origin', async () => {
    let url = 'http://127.0.0.1:8765/local-browser-acceptance.html';
    const cua = fakeCua(async (tool) => {
      if (tool !== 'get_browser_state') throw new Error(`Unexpected ${tool}`);
      return {
        page: {
          url,
          title: 'Sia local browser acceptance fixture',
          elements: [{ ref: 'fixture:text', role: 'textbox', label: 'Acceptance text' }],
        },
      };
    });
    const backend = new DesktopActionBackend({
      cua,
      isBrowserOriginAllowed: (origin) => origin === 'http://127.0.0.1:8765',
    });
    backend.acceptBrowserState({
      target_id: 'target-fixture',
      tab_id: 'tab-fixture',
      url,
    });

    const snapshot = await backend.invoke(
      request('browser_snapshot', { tab_id: 'tab-fixture' }),
    );
    expect(snapshot.outcome).toBe('verified');
    expect(dataRecord(snapshot.data)).toMatchObject({
      origin: 'http://127.0.0.1:8765',
      url: 'http://127.0.0.1:8765',
    });

    url = 'https://other.example.test/redirected';
    expect(
      await backend.invoke(request('browser_snapshot', { tab_id: 'tab-fixture' })),
    ).toMatchObject({ outcome: 'refused' });
  });

  it('rejects authentication tabs and preserves the driver stale-ref refusal on redirect', async () => {
    let url = 'https://mail.example.test/inbox';
    const cua = fakeCua(async (tool) => {
      if (tool === 'get_browser_state') {
        return {
          target_id: 'target-1',
          tab_id: 'tab-1',
          url,
          elements: [{ ref: 'p1:compose', role: 'button', label: 'Compose' }],
        };
      }
      if (tool === 'browser_click') {
        return url === 'https://mail.example.test/inbox'
          ? { effect: 'confirmed' }
          : { refusal: 'browser_ref_stale' };
      }
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url,
    });
    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    const snapshotData = dataRecord(snapshot.data);
    const element = (snapshotData.elements as Array<Record<string, unknown>>)[0]!;

    url = 'https://evil.example.test/redirected';
    const redirected = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'click',
        element_ref: element.element_ref,
      }),
    );
    expect(redirected.outcome).toBe('stale');
    expect(cua.call.mock.calls.some(([tool]) => tool === 'browser_click')).toBe(true);

    const authBackend = new DesktopActionBackend({ cua });
    url = 'https://accounts.google.com/signin';
    authBackend.acceptBrowserState({ target_id: 'target-1', tab_id: 'tab-1', url });
    const auth = await authBackend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    expect(auth.outcome).toBe('refused');
  });

  it('fails closed on an origin mismatch and never falls back to global keys', async () => {
    const cua = fakeCua(async (tool) =>
      tool === 'get_browser_state'
        ? {
            target_id: 'target-1',
            tab_id: 'tab-1',
            url: 'https://one.example/path',
          }
        : { effect: 'confirmed' },
    );
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url: 'https://one.example/path',
    });
    const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
    const snapshotData = dataRecord(snapshot.data);

    const mismatch = await backend.invoke(
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'scroll',
        direction: 'down',
        origin: 'https://two.example',
      }),
    );
    expect(mismatch.outcome).toBe('stale');

    expect(() =>
      request('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'key',
        value: 'Enter',
      }),
    ).not.toThrow();
    expect(() =>
      parseActionArguments('browser_action', {
        tab_id: 'tab-1',
        snapshot_id: snapshotData.snapshot_id,
        action: 'key',
        value: 'Enter',
        origin: 'https://one.example',
      }),
    ).toThrow();
    expect(cua.call.mock.calls.some(([tool]) => tool === 'press_key')).toBe(false);
  });

  it('isolates uploads in a private temporary vault', async () => {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'sia-browser-files-')));
    const upload = join(directory, 'report.txt');
    const sensitive = join(directory, '.env');
    const uploadLink = join(directory, 'harmless.txt');
    await Promise.all([writeFile(upload, 'approved report'), writeFile(sensitive, 'secret')]);
    await symlink(sensitive, uploadLink);
    const cua = fakeCua(async (tool) => {
      if (tool === 'get_browser_state') {
        return {
          target_id: 'target-1',
          tab_id: 'tab-1',
          url: 'https://files.example.test/report',
          elements: [{ ref: 'p1:upload', role: 'file input', label: 'Upload' }],
        };
      }
      if (tool === 'browser_set_input_files') return { effect: 'confirmed' };
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({ cua });
    backend.acceptBrowserState({
      target_id: 'target-1',
      tab_id: 'tab-1',
      url: 'https://files.example.test/report',
    });

    try {
      const snapshot = await backend.invoke(request('browser_snapshot', { tab_id: 'tab-1' }));
      const snapshotData = dataRecord(snapshot.data);
      const elements = snapshotData.elements as Array<Record<string, unknown>>;
      const uploadElement = elements.find(({ label }) => label === 'Upload')!;
      const uploadBypass = await backend.invoke(
        request('browser_upload', {
          tab_id: 'tab-1',
          snapshot_id: snapshotData.snapshot_id,
          element_ref: uploadElement.element_ref,
          file_paths: [uploadLink],
          origin: 'https://files.example.test',
        }),
      );
      expect(uploadBypass.outcome).toBe('refused');
      for (const secret of [
        join(directory, '.codex', 'auth.json'),
        join(directory, 'Google', 'Chrome', 'Default', 'Login Data'),
      ]) {
        await mkdir(dirname(secret), { recursive: true });
        await writeFile(secret, 'secret');
        const refused = await backend.invoke(
          request('browser_upload', {
            tab_id: 'tab-1',
            snapshot_id: snapshotData.snapshot_id,
            element_ref: uploadElement.element_ref,
            file_paths: [secret],
            origin: 'https://files.example.test',
          }),
        );
        expect(refused.outcome, secret).toBe('refused');
      }
      expect(cua.call.mock.calls.some(([tool]) => tool === 'browser_set_input_files')).toBe(
        false,
      );

      const uploaded = await backend.invoke(
        request('browser_upload', {
          tab_id: 'tab-1',
          snapshot_id: snapshotData.snapshot_id,
          element_ref: uploadElement.element_ref,
          file_paths: [upload],
          origin: 'https://files.example.test',
        }),
      );
      expect(uploaded.outcome, JSON.stringify(uploaded)).toBe('verified');
      const uploadNative = cua.call.mock.calls.find(
        ([tool]) => tool === 'browser_set_input_files',
      );
      const stagedUpload = String((uploadNative?.[1].files as string[] | undefined)?.[0]);
      expect(basename(stagedUpload)).toBe('report.txt');
      expect((await stat(dirname(stagedUpload))).mode & 0o777).toBe(0o700);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('sweeps only stale private Sia vaults after an unclean exit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-vault-sweep-test-'));
    const stale = join(root, 'sia-browser-download-ABCDEF');
    const fresh = join(root, 'sia-browser-upload-GHIJKL');
    const insecure = join(root, 'sia-browser-upload-MNOPQR');
    const symlinkTarget = join(root, 'unrelated-target');
    const symlinkVault = join(root, 'sia-browser-download-STUVWX');
    const now = Date.now();
    try {
      await Promise.all([
        mkdir(stale, { mode: 0o700 }),
        mkdir(fresh, { mode: 0o700 }),
        mkdir(insecure, { mode: 0o755 }),
        mkdir(symlinkTarget, { mode: 0o700 }),
      ]);
      await writeFile(join(stale, 'private.bin'), 'private');
      const old = new Date(now - 11 * 60_000);
      await Promise.all([utimes(stale, old, old), utimes(insecure, old, old)]);
      await chmod(insecure, 0o755);
      await symlink(symlinkTarget, symlinkVault);

      await sweepStaleBrowserVaults(root, now);

      await expect(stat(stale)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(fresh)).resolves.toBeDefined();
      await expect(stat(insecure)).resolves.toBeDefined();
      await expect(stat(symlinkVault)).resolves.toBeDefined();
      await expect(stat(symlinkTarget)).resolves.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
