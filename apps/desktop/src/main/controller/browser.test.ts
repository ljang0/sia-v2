import { describe, expect, it, vi } from 'vitest';
import { computer, createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('prioritizes the Chrome process that owns the remote-debugging port when attaching', async () => {
    const attachedPids: number[] = [];
    const computer = {
      permissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      requestPermissions: async () => ({
        status: 'ready' as const,
        accessibility: true,
        screenRecording: true,
      }),
      call: async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              { pid: 111, name: 'Google Chrome', bundle_id: 'com.google.Chrome', active: true },
              {
                pid: 222,
                name: 'Google Chrome',
                bundle_id: 'com.google.Chrome',
                active: false,
              },
            ],
          };
        }
        if (tool === 'list_windows') {
          const pid = Number(args.pid);
          return {
            windows: [
              {
                window_id: pid + 1,
                pid,
                title: `w${pid}`,
                is_on_screen: true,
                minimized: false,
                bounds: { width: 800, height: 600 },
                z_index: 1,
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attachedPids.push(Number(args.pid));
          // Only the port owner (222) accepts the cdp_port route.
          if (Number(args.pid) !== 222)
            throw new Error('CUA refused: browser_route_unavailable');
          return { targets: [{ target_id: 't', tab_id: 'tab', url: 'https://example.test/' }] };
        }
        if (tool === 'get_browser_state') {
          return { target_id: 't', tab_id: 'tab', url: 'https://example.test/' };
        }
        return {};
      },
      shutdown: async () => undefined,
    };
    const { controller } = await createHarness({
      computer: computer as never,
      runCommand: async () => 'p222\nf5\n',
    });
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    // Explicit trusted mode tries the port owner first and needs no window pick.
    await controller.ensureBrowserAttachedForActions();
    expect(controller.snapshot().browser.status).toBe('attached');
    expect(attachedPids[0]).toBe(222);
    await controller.shutdown();
  });

  it('grants only top-level attached tab origins, never nested link URLs', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome' }] };
        }
        if (tool === 'list_windows') return { windows: [{ pid: 42, window_id: 7 }] };
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [
              {
                tab_id: 'tab-1',
                url: 'https://mail.example.test/inbox',
                elements: [
                  { role: 'link', url: 'https://evil.example.test/capture' },
                  { role: 'iframe', origin: 'https://embedded.example.test' },
                ],
              },
            ],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.example.test'],
    });
    await controller.shutdown();
  });

  it('attaches the Chrome application instead of a helper process', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [
              {
                pid: 41,
                name: 'Google Chrome Helper (Renderer)',
                bundle_id: 'com.google.Chrome.helper',
              },
              { pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' },
            ],
          };
        }
        if (tool === 'list_windows') {
          expect(args).toEqual({ pid: 42 });
          return { windows: [{ pid: 42, window_id: 7 }] };
        }
        if (tool === 'browser_prepare') return { prepared: true };
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://example.test'],
    });
    await controller.shutdown();
  });

  it('does not target Chrome remote-debugging consent dialogs', async () => {
    const attemptedWindowIds: number[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              { pid: 42, window_id: 7, title: 'Allow remote debugging?' },
              { pid: 42, window_id: 8, title: 'Fixture page' },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          attemptedWindowIds.push(Number(args.window_id));
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-1',
            tabs: [{ tab_id: 'tab-1', url: 'https://example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});

    expect(attemptedWindowIds).toEqual([8]);
    await controller.shutdown();
  });

  it('explains Chrome-owned remote-debugging consent refusals', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_wrong_target_refused');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/chrome:\/\/inspect.*Allow remote debugging/i),
    });
    await controller.shutdown();
  });

  it('explains the one-time Chrome permission when reconnect waits for consent', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Fixture page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_reconnect_exhausted');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/Click Allow.*one-time Chrome security step/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_reconnect_exhausted');
    await controller.shutdown();
  });

  it('explains ambiguous duplicate Chrome windows without exposing driver codes', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return { windows: [{ pid: 42, window_id: 8, title: 'Duplicate page' }] };
        }
        if (tool === 'browser_prepare') {
          throw new Error('CUA refused: browser_binding_ambiguous');
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', {});

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/unique page.*close the duplicate.*retry/i),
    });
    expect(snapshot.browser.detail).not.toContain('browser_binding_ambiguous');
    await controller.shutdown();
  });

  it('offers an explicit picker for multiple Chrome windows and attaches the selection', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 8,
                title: 'Fixture one',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
              {
                pid: 42,
                window_id: 9,
                title: 'Fixture two',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          expect(args).toMatchObject({
            pid: 42,
            window_id: 9,
            session: expect.stringMatching(/^sia-browser-/),
          });
          return { prepared: true };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture-two.example.test/' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller, repository } = await createHarness({ computer: browserComputer });

    const choiceSnapshot = await controller.invoke('browser.attach', {});

    expect(choiceSnapshot.browser).toMatchObject({
      status: 'detached',
      detail: expect.stringMatching(/Choose the signed-in Chrome window/i),
      availableWindows: [
        { id: 8, label: 'Chrome window 1', detail: 'Fixture one' },
        { id: 9, label: 'Chrome window 2', detail: 'Fixture two' },
      ],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
    expect(
      repository.get<{ browser: { availableWindows?: unknown } }>('desktop', 'state')?.browser
        .availableWindows,
    ).toBeUndefined();

    const attachedSnapshot = await controller.invoke('browser.attach', { windowId: 9 });

    expect(attachedSnapshot.browser).toMatchObject({
      status: 'attached',
      profileLabel: 'Chrome window 2',
      grantedOrigins: ['https://fixture-two.example.test'],
    });
    expect(attachedSnapshot.browser.availableWindows).toBeUndefined();
    await controller.shutdown();
  });

  it('opens a user-entered site in an attached signed-in profile and grants its origin', async () => {
    let currentUrl = 'chrome://newtab/';
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Signed-in profile',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare' || tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: currentUrl }],
          };
        }
        if (tool === 'browser_navigate') {
          expect(args).toMatchObject({
            session: expect.stringMatching(/^sia-browser-/),
            target_id: 'target-2',
            tab_id: 'tab-2',
            url: 'https://mail.google.com/',
          });
          currentUrl = String(args.url);
          return { effect: 'confirmed' };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const attached = await controller.invoke('browser.attach', {});
    expect(attached.browser).toMatchObject({ status: 'attached', grantedOrigins: [] });

    const opened = await controller.invoke('browser.open', { url: 'mail.google.com' });
    expect(opened.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://mail.google.com'],
    });
    await controller.shutdown();
  });

  it('mints a fresh browser session after detach so reattach does not require restart', async () => {
    const preparedSessions: string[] = [];
    const endedSessions: string[] = [];
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string, args: Record<string, unknown>) => {
        if (tool === 'list_apps') {
          return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
        }
        if (tool === 'list_windows') {
          return {
            windows: [
              {
                pid: 42,
                window_id: 9,
                title: 'Local fixture',
                is_on_screen: true,
                bounds: { width: 1200, height: 800 },
              },
            ],
          };
        }
        if (tool === 'browser_prepare') {
          preparedSessions.push(String(args.session));
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'get_browser_state') {
          return {
            target_id: 'target-2',
            tabs: [{ tab_id: 'tab-2', url: 'https://fixture.example.test/' }],
          };
        }
        if (tool === 'end_session') {
          endedSessions.push(String(args.session));
          return { ended: true };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    await controller.invoke('browser.attach', {});
    await controller.invoke('browser.detach', undefined);
    const reattached = await controller.invoke('browser.attach', {});

    expect(reattached.browser).toMatchObject({
      status: 'attached',
      grantedOrigins: ['https://fixture.example.test'],
    });
    expect(preparedSessions).toHaveLength(2);
    expect(preparedSessions[0]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).toMatch(/^sia-browser-/);
    expect(preparedSessions[1]).not.toBe(preparedSessions[0]);
    expect(endedSessions).toEqual([preparedSessions[0]]);
    await controller.shutdown();
  });

  it('rejects a stale Chrome window choice and returns the current choices', async () => {
    const browserComputer = {
      ...computer,
      call: vi.fn(async (tool: string) => {
        if (tool === 'list_apps') {
          return {
            apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }],
          };
        }
        if (tool === 'list_windows') {
          return {
            windows: [{ pid: 42, window_id: 8, title: 'Current fixture' }],
          };
        }
        throw new Error(`Unexpected ${tool}`);
      }),
    };
    const { controller } = await createHarness({ computer: browserComputer });

    const snapshot = await controller.invoke('browser.attach', { windowId: 999 });

    expect(snapshot.browser).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/changed or closed/i),
      availableWindows: [{ id: 8, label: 'Chrome window 1', detail: 'Current fixture' }],
    });
    expect(browserComputer.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(
      false,
    );
    await controller.shutdown();
  });
});

describe('connect Chrome and continue', () => {
  async function recoveryHarness(options: { fail?: boolean; pause?: Promise<void> } = {}) {
    const nativeCall = vi.fn(async (tool: string, _args: Record<string, unknown>) => {
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Google Chrome', bundle_id: 'com.google.Chrome' }] };
      if (tool === 'list_windows')
        return {
          windows: [
            { pid: 42, window_id: 7, title: 'Canvas' },
            { pid: 42, window_id: 8, title: 'Other window' },
          ],
        };
      if (tool === 'browser_prepare') {
        if (options.pause) await options.pause;
        if (options.fail) throw new Error('CUA refused: browser_reconnect_exhausted');
        return { prepared: true };
      }
      if (tool === 'get_browser_state')
        return {
          target_id: 'target-1',
          tabs: [{ tab_id: 'tab-1', url: 'https://canvas.example.test/' }],
        };
      return {};
    });
    const { controller } = await createHarness({
      computer: { ...computer, call: nativeCall },
      runCommand: async () => '',
    });
    const created = await controller.invoke('agents.save', {
      name: 'Study',
      instructions: '',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const threadId = created.snapshot.activeThreadId!;
    await controller.invoke('threads.send', { threadId, text: 'Find my Canvas finals' });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find((t) => t.id === threadId)?.status).toBe('idle'),
    );
    const userMessageId = controller
      .snapshot()
      .timeline.findLast((item) => item.threadId === threadId && item.kind === 'user')!.id;
    return { controller, nativeCall, threadId, userMessageId };
  }
  it('offers window choice first, then continues exactly once in the pinned conversation and preserves drafts', async () => {
    const h = await recoveryHarness();
    const { controller, threadId, userMessageId } = h;
    await controller.invoke('computer.setTrust', { trust: 'ask' });
    try {
      const choice = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
      });
      expect(choice.browser.availableWindows).toHaveLength(2);
      expect(choice.timeline.filter((item) => item.kind === 'user')).toHaveLength(1);
      expect(h.nativeCall.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
      await controller.invoke('threads.draft', { threadId, text: 'Keep my unsent draft' });
      const next = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      expect(next.browser.status).toBe('attached');
      expect(next.computer.trust).toBe('ask');
      expect(next.threads.find((t) => t.id === threadId)?.draft).toBe('Keep my unsent draft');
      const users = next.timeline.filter((item) => item.kind === 'user');
      expect(users).toHaveLength(2);
      expect(users[1]?.text).toContain('Continue my previous request');
      expect(users[1]?.threadId).toBe(threadId);
      await expect(
        controller.invoke('browser.connectAndContinue', {
          threadId,
          userMessageId,
          windowId: 7,
        }),
      ).rejects.toThrow('request changed');
    } finally {
      await controller.shutdown();
    }
  });
  it('keeps the original task on connection failure without starting a model turn', async () => {
    const { controller, threadId, userMessageId } = await recoveryHarness({ fail: true });
    try {
      const result = await controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      expect(result.browser.status).toBe('error');
      expect(result.browser.detail).toContain('permission');
      expect(result.timeline.filter((item) => item.kind === 'user')).toHaveLength(1);
    } finally {
      await controller.shutdown();
    }
  });
  it('rejects duplicate connections and a stale request after async attachment', async () => {
    let finish!: () => void;
    const pause = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const h = await recoveryHarness({ pause });
    const { controller, threadId, userMessageId } = h;
    try {
      const pending = controller.invoke('browser.connectAndContinue', {
        threadId,
        userMessageId,
        windowId: 7,
      });
      await vi.waitFor(() =>
        expect(h.nativeCall.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(true),
      );
      await expect(
        controller.invoke('browser.connectAndContinue', {
          threadId,
          userMessageId,
          windowId: 7,
        }),
      ).rejects.toThrow('already in progress');
      await controller.invoke('threads.send', { threadId, text: 'A different request' });
      finish();
      await expect(pending).rejects.toThrow('request changed');
      expect(
        controller.snapshot().timeline.filter((item) => item.kind === 'user'),
      ).toHaveLength(2);
    } finally {
      finish();
      await controller.shutdown();
    }
  });
});
