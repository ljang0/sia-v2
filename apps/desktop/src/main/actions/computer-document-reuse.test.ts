import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import type { WindowContextState } from '../mac/browser-window.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, request } from './test-support.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it.each(['exact', 'other-path', 'protected', 'unavailable', 'wrong-app', 'non-file'])(
  'reuses an existing document only with exact live path and app identity: %s',
  async (variant) => {
    const workspace = await realpath(await mkdtemp(join(tmpdir(), 'sia-document-reuse-')));
    roots.push(workspace);
    const document = join(workspace, 'calendar.pdf');
    await writeFile(document, 'disposable test PDF');
    const context: WindowContextState =
      variant === 'protected' || variant === 'unavailable'
        ? { status: variant }
        : {
            status: 'ready',
            bundleID: variant === 'wrong-app' ? 'com.apple.TextEdit' : 'com.apple.Preview',
            title: 'calendar.pdf',
            text: '',
            documentURL:
              variant === 'other-path'
                ? pathToFileURL(join(workspace, 'other', 'calendar.pdf')).href
                : variant === 'non-file'
                  ? 'https://example.org/calendar.pdf'
                  : pathToFileURL(document).href,
          };
    const readWindowContext = vi.fn(async () => context);
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Preview', bundle_id: 'com.apple.Preview' }] };
      if (tool === 'list_windows')
        return {
          windows: [{ pid: 42, window_id: 91, app_name: 'Preview', title: 'calendar.pdf' }],
        };
      if (tool === 'launch_app') return { self_activation_suppressed: true };
      throw new Error(`Unexpected ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      readWindowContext,
      macBrowserAccess: () => true,
      macBackgroundControl: () => true,
      installedApplications: async () => [{ id: 'com.apple.Preview', name: 'Preview' }],
    });
    const action = request('computer_open_app', {
      application: 'com.apple.Preview',
      workspace_path: 'calendar.pdf',
    });
    const result = await backend.invoke({
      ...action,
      context: { ...action.context, workspace, backgroundOnly: true },
    });
    expect(result.outcome, JSON.stringify(result)).toBe('verified');
    expect(readWindowContext).toHaveBeenCalledExactlyOnceWith(42, 91);
    const launches = cua.call.mock.calls.filter(([tool]) => tool === 'launch_app');
    expect(launches).toHaveLength(variant === 'exact' ? 0 : 1);
    if (variant === 'exact')
      expect(dataRecord(result.data).reused_window_id).toMatch(/^window:/);
    else expect(launches[0]?.[1]).toMatchObject({ urls: [document] });
    expect(dataRecord(result.data)).not.toHaveProperty('documentURL');
  },
);
