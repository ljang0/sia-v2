import type { BrowserWindowState } from '../browser-window.js';
import type { ActionToolName } from '@sia/action-gateway';
import { describe, expect, it, vi } from 'vitest';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { dataRecord, fakeCua, grantedComputerTarget, request } from './test-support.js';

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

describe('Use my Mac browser routing', () => {
  function browserHarness() {
    let enabled = true;
    let url = 'https://example.com/';
    const openUrl = vi.fn(async (value: string) => {
      url = value;
    });
    const inspect = vi.fn(async (): Promise<BrowserWindowState> => ({
      status: 'ready' as const,
      url,
      bundleID: 'com.apple.Safari',
    }));
    const cua = fakeCua(async (tool) => {
      if (tool === 'list_apps')
        return {
          apps: [
            { pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari', active: true },
            { pid: 43, name: '1Password', bundle_id: 'com.1password.1password' },
          ],
        };
      if (tool === 'list_windows')
        return {
          windows: [{ pid: 42, window_id: 91, app_name: 'Safari', title: 'Example Domain' }],
        };
      if (tool === 'get_window_state')
        return {
          snapshot_id: 'native-browser-snapshot',
          elements: [
            { element_index: 1, element_token: 'link', role: 'AXLink', label: 'Learn more' },
          ],
        };
      if (tool === 'click') return { success: true };
      throw new Error(`Unexpected tool ${tool}`);
    });
    const backend = new DesktopActionBackend({
      cua,
      macBrowserAccess: () => enabled,
      macBackgroundControl: () => true,
      inspectBrowserWindow: inspect,
      openUrl,
    });
    return {
      backend,
      cua,
      inspect,
      openUrl,
      disable: () => {
        enabled = false;
      },
      navigate: (value: string) => {
        url = value;
      },
    };
  }
  async function capture(h: ReturnType<typeof browserHarness>) {
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    const data = dataRecord(result.data);
    return {
      app_id: target.appId,
      window_id: target.windowId,
      snapshot_id: data.snapshot_id,
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
    };
  }

  it.each([
    ['Root Key Signing Key (DNSSEC)', false],
    ['Key Signing Ceremonies', false],
    ['Blogging information', false],
    ['Sign in', true],
    ['Sign-in', true],
    ['Signin', true],
    ['SIGN_IN', true],
    ['Signing in to your account', true],
    ['Log in', true],
    ['Log-in', true],
    ['Login', true],
    ['Log_in', true],
    ['Logging in to your account', true],
  ])(
    'distinguishes public signing text from authentication: %s',
    async (label, protectedPage) => {
      const h = browserHarness();
      h.navigate('https://www.iana.org/domains/reserved');
      const implementation = h.cua.call.getMockImplementation() as (
        tool: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;
      h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
        tool === 'get_window_state'
          ? {
              snapshot_id: 'iana-fixture',
              elements: [{ element_index: 1, element_token: 'link', role: 'AXLink', label }],
            }
          : implementation(tool, args),
      );
      const target = await grantedComputerTarget(h.backend);
      const result = await h.backend.invoke(
        request('computer_snapshot', {
          app_id: target.appId,
          window_id: target.windowId,
          expected_url: 'https://www.iana.org/domains/reserved',
        }),
      );
      expect(result.outcome).toBe(protectedPage ? 'refused' : 'verified');
      if (protectedPage) {
        expect(dataRecord(result.data).blocker_code).toBe('protected_window');
        expect(dataRecord(result.data).elements).toBeUndefined();
        expect(dataRecord(result.data).snapshot_id).toBeUndefined();
        expect(result.images).toBeUndefined();
      } else {
        expect(dataRecord(result.data).source_url).toBe(
          'https://www.iana.org/domains/reserved',
        );
        expect(dataRecord(result.data).elements).toEqual([
          expect.objectContaining({ label, element_ref: expect.any(String) }),
        ]);
      }
    },
  );

  it('gives a later turn a fresh computer session and revokes the previous window refs', async () => {
    const h = browserHarness();
    const previous = await capture(h);
    const oldSession = h.cua.call.mock.calls.find(([tool]) => tool === 'get_window_state')![1]
      .session;
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) => {
      if (args.session === oldSession) throw new Error('CUA refused: session_ended');
      return implementation(tool, args);
    });
    const next = (name: ActionToolName, args: Record<string, unknown>) => {
      const value = request(name, args);
      return { ...value, context: { ...value.context, turnId: 'turn-2' } };
    };
    h.cua.call.mockClear();
    expect((await h.backend.invoke(next('computer_snapshot', previous))).outcome).toBe('stale');
    expect(h.cua.call).not.toHaveBeenCalled();
    const inventory = dataRecord((await h.backend.invoke(next('computer_list', {}))).data);
    const window = (inventory.windows as Record<string, unknown>[])[0]!;
    const ids = { app_id: window.app_id, window_id: window.window_id };
    expect(ids.window_id).not.toBe(previous.window_id);
    const snapshot = await h.backend.invoke(next('computer_snapshot', ids));
    expect(snapshot.outcome).toBe('verified');
    const data = dataRecord(snapshot.data);
    const newSession = h.cua.call.mock.calls.find(([tool]) => tool === 'get_window_state')![1]
      .session;
    expect(newSession).toEqual(expect.any(String));
    expect(newSession).not.toBe(oldSession);
    const cancelled = request('computer_list', {});
    const callCount = h.cua.call.mock.calls.length;
    expect(
      (
        await h.backend.invoke({
          ...cancelled,
          context: { ...cancelled.context, signal: AbortSignal.abort() },
        })
      ).outcome,
    ).toBe('refused');
    expect(h.cua.call).toHaveBeenCalledTimes(callCount);
    expect(
      (await h.backend.invoke(next('computer_action', { ...previous, action: 'click' })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
    const fresh = {
      ...ids,
      snapshot_id: data.snapshot_id,
      element_ref: (data.elements as Record<string, unknown>[])[0]!.element_ref,
      action: 'click',
    };
    expect((await h.backend.invoke(next('computer_action', fresh))).outcome).toBe(
      'accepted_unverified',
    );
    const clicks = h.cua.call.mock.calls.filter(([tool]) => tool === 'click');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]![1].session).toBe(newSession);
  });

  it('binds browser facts to the expected course and role query without exposing query secrets', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    const ids = { app_id: target.appId, window_id: target.windowId };
    const expected = 'https://canvas.cmu.edu/api/v1/courses/22/users?role=teacher&per_page=100';
    h.navigate('https://canvas.cmu.edu/api/v1/courses/11/users?role=teacher&per_page=100');
    expect(
      (await h.backend.invoke(request('computer_snapshot', { ...ids, expected_url: expected })))
        .outcome,
    ).toBe('stale');
    h.navigate('https://canvas.cmu.edu/api/v1/courses/22/users?role=ta&per_page=100');
    expect(
      (await h.backend.invoke(request('computer_snapshot', { ...ids, expected_url: expected })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
    h.navigate('https://canvas.cmu.edu/api/v1/courses/22/users?per_page=100&role=teacher#top');
    const matched = await h.backend.invoke(
      request('computer_snapshot', { ...ids, expected_url: expected }),
    );
    expect(matched.outcome).toBe('verified');
    expect(dataRecord(matched.data).source_url).toBe(
      'https://canvas.cmu.edu/api/v1/courses/22/users',
    );
    expect(JSON.stringify(matched)).not.toContain('per_page');
    expect(JSON.stringify(matched)).not.toContain('#top');
  });

  it('discovers Safari without Chrome attachment and returns the native route to the same task', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('browser_tabs', {}));
    expect(result.outcome).toBe('verified');
    expect(dataRecord(result.data).route).toBe('computer');
    expect(JSON.stringify(result)).toContain('Safari');
    expect(JSON.stringify(result)).not.toContain('1Password');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'browser_prepare')).toBe(false);
    const args = await capture(h);
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(true);
  });

  it('preserves live window ids through refresh and activation but revokes a closed window', async () => {
    const h = browserHarness();
    const args = await capture(h);
    const again = await grantedComputerTarget(h.backend);
    expect(again.appId).toBe(args.app_id);
    expect(again.windowId).toBe(args.window_id);
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'list_windows' ? { windows: [] } : implementation(tool, args),
    );
    await h.backend.invoke(request('computer_list', {}));
    expect(
      (
        await h.backend.invoke(
          request('computer_snapshot', { app_id: again.appId, window_id: again.windowId }),
        )
      ).outcome,
    ).toBe('stale');
  });

  it('distinguishes an ambiguous window from a protected page', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const unavailable = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(unavailable.data)).toMatchObject({
      blocker_code: 'window_unavailable',
      blocker_detail: 'ambiguous',
      window_id: target.windowId,
    });
    expect(unavailable.summary).toContain('not evidence of a login');
    expect(dataRecord(unavailable.data)).toMatchObject({
      driver_observation_attempted: true,
      driver_screenshot_available: false,
      driver_element_count: 1,
    });
    expect(unavailable.images).toBeUndefined();
    expect(dataRecord(unavailable.data).elements).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    h.cua.call.mockClear();
    h.inspect.mockResolvedValue({ status: 'protected' });
    const protectedPage = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(protectedPage.data).blocker_code).toBe('protected_window');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
  });

  it('recovers a missing helper window through one exact CUA observation before allowing a background click', async () => {
    const h = browserHarness();
    h.inspect.mockResolvedValueOnce({ status: 'unavailable', reason: 'ambiguous' });
    const args = await capture(h);
    const captures = h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state');
    expect(captures).toHaveLength(1);
    expect(captures[0]?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      include_screenshot: true,
    });
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('accepted_unverified');
    expect(h.cua.call.mock.calls.find(([tool]) => tool === 'click')?.[1]).toMatchObject({
      pid: 42,
      window_id: 91,
      delivery_mode: 'background',
      element_token: 'link',
    });
  });

  it('stops a driver refusal without replaying observation or issuing input', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) => {
      if (tool === 'get_window_state') throw new Error('CUA refused: window_not_found');
      return implementation(tool, args);
    });
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).not.toBe('verified');
    expect(result.images).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('keeps expected-page validation after driver recovery and never publishes mismatched content', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValueOnce({ status: 'unavailable', reason: 'ambiguous' });
    const result = await h.backend.invoke(
      request('computer_snapshot', {
        app_id: target.appId,
        window_id: target.windowId,
        expected_url: 'https://example.com/another-page',
      }),
    );
    expect(result.outcome).toBe('stale');
    expect(result.images).toBeUndefined();
    expect(dataRecord(result.data).snapshot_id).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      1,
    );
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('drops recovered driver content when it contains protected controls', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    h.inspect.mockResolvedValue({ status: 'unavailable', reason: 'ambiguous' });
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'get_window_state'
        ? {
            snapshot_id: 'private',
            elements: [
              { role: 'AXSecureTextField', label: 'Password', value: 'must-not-leak' },
            ],
          }
        : implementation(tool, args),
    );
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(result.images).toBeUndefined();
  });

  it('keeps the native browser route when Chrome also has an attached tab', async () => {
    const h = browserHarness();
    h.backend.acceptBrowserState({
      target_id: 'attached-target',
      tab_id: 'attached-tab',
      url: 'https://mail.google.com/',
    });
    const result = await h.backend.invoke(request('browser_tabs', {}));
    expect(result.outcome).toBe('verified');
    expect(dataRecord(result.data).route).toBe('computer');
    expect(JSON.stringify(result)).toContain('Safari');
    expect(JSON.stringify(result)).not.toContain('mail.google.com');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_browser_state')).toBe(false);
  });

  it('opens an ordinary website itself and directs the same task to inspect it', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(result.summary).toContain('Use the returned window ids');
    expect(dataRecord(result.data).windows).toHaveLength(1);
    expect(h.openUrl).toHaveBeenCalledWith('https://canvas.cmu.edu/', { background: true });
    expect(dataRecord(result.data).delivery_requested).toBe('background');
    expect(
      h.backend.trustedApprovalTarget('computer_open_url', {
        url: 'https://canvas.cmu.edu/',
      }),
    ).toBe('Open https://canvas.cmu.edu in the default browser');
  });

  it('only requests browser activation for explicit foreground navigation', async () => {
    const h = browserHarness();
    await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/', delivery: 'foreground' }),
    );
    expect(h.openUrl).toHaveBeenCalledExactlyOnceWith('https://canvas.cmu.edu/', {
      background: false,
    });
  });

  it('recovers a navigation race by observing again without replaying the click', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/course');
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).browser_origin).toBe('https://example.com');
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      3,
    );
  });

  it('preserves delivered action status when the destination becomes protected', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/login');
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).observation_pending).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toHaveLength(1);
    expect(result.images).toBeUndefined();
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('refuses connected tools even when invoked indirectly in Mac mode', async () => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('browser_snapshot', { tab_id: 'old-tab' }));
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('selected Mac control route');
    expect(h.cua.call).not.toHaveBeenCalled();
  });

  it('keeps delivery status when post-action capture throws', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.cua.call.mockImplementation(async (tool: string) => {
      if (tool === 'click') return { success: true };
      if (tool === 'get_window_state') throw new Error('capture timed out');
      if (tool === 'list_apps')
        return { apps: [{ pid: 42, name: 'Safari', bundle_id: 'com.apple.Safari' }] };
      if (tool === 'list_windows')
        return { windows: [{ pid: 42, window_id: 91, app_name: 'Safari' }] };
      throw new Error(`Unexpected ${tool}`);
    });
    const result = await h.backend.invoke(
      request('computer_action', { ...args, action: 'click' }),
    );
    expect(result.outcome).toBe('accepted_unverified');
    expect(dataRecord(result.data).observation_pending).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toHaveLength(1);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'click')).toHaveLength(1);
  });

  it('bounds loading observations and excludes them from recovery targets', async () => {
    const h = browserHarness();
    const target = await grantedComputerTarget(h.backend);
    const implementation = h.cua.call.getMockImplementation() as (
      tool: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    h.cua.call.mockImplementation(async (tool: string, args: Record<string, unknown>) =>
      tool === 'get_window_state'
        ? {
            snapshot_id: 'loading',
            elements: [
              {
                element_index: 1,
                element_token: 'spinner',
                role: 'AXProgressIndicator',
                label: 'Loading',
              },
            ],
          }
        : implementation(tool, args),
    );
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(dataRecord(result.data).loading).toBe(true);
    expect(dataRecord(result.data).previously_observed_windows).toEqual([]);
    expect(h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state')).toHaveLength(
      3,
    );
  });

  it.each([
    'https://accounts.google.com/',
    'https://example.com/login',
    'file:///etc/passwd',
    'chrome://settings',
    'javascript:alert(1)',
  ])('does not open protected or internal website %s', async (url) => {
    const h = browserHarness();
    const result = await h.backend.invoke(request('computer_open_url', { url }));
    expect(result.outcome).toBe('refused');
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it('does not open a website outside Use my Mac mode', async () => {
    const h = browserHarness();
    h.disable();
    const result = await h.backend.invoke(
      request('computer_open_url', { url: 'https://canvas.cmu.edu/' }),
    );
    expect(result.outcome).toBe('refused');
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it.each([
    'https://accounts.google.com/',
    'https://example.com/login',
    'file:///etc/passwd',
    'chrome://settings',
    'javascript:alert(1)',
  ])('blocks protected and internal page %s before returning a snapshot', async (url) => {
    const h = browserHarness();
    h.navigate(url);
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'get_window_state')).toBe(false);
    expect(result.images).toBeUndefined();
  });

  it.each(['protected', 'unavailable'] as const)(
    'does not publish private or unverified browser state (%s)',
    async (status) => {
      const h = browserHarness();
      h.inspect.mockResolvedValue({ status });
      const target = await grantedComputerTarget(h.backend);
      const result = await h.backend.invoke(
        request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
      );
      expect(result.outcome).toBe('refused');
      expect(result.images).toBeUndefined();
      expect(dataRecord(result.data).snapshot_id).toBeUndefined();
      expect(dataRecord(result.data).elements).toBeUndefined();
      expect(
        h.cua.call.mock.calls.filter(([tool]) => tool === 'get_window_state'),
      ).toHaveLength(status === 'unavailable' ? 1 : 0);
    },
  );

  it('invalidates a captured browser action after a tab switch and does not replay a click', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.navigate('https://example.com/another-page');
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('stale');
    expect(h.cua.call.mock.calls.some(([tool]) => tool === 'click')).toBe(false);
  });

  it('revokes native browser grants as soon as the mode is disabled', async () => {
    const h = browserHarness();
    const args = await capture(h);
    h.disable();
    expect(
      (await h.backend.invoke(request('computer_action', { ...args, action: 'click' })))
        .outcome,
    ).toBe('stale');
    const listed = await h.backend.invoke(request('computer_list', {}));
    expect(dataRecord(listed.data).apps).toEqual([]);
  });

  it('blocks browser script injection and developer shortcuts', async () => {
    const h = browserHarness();
    const args = await capture(h);
    for (const action of [
      { action: 'type', text: 'javascript:alert(1)' },
      { action: 'key', value: 'i', modifiers: ['cmd', 'option'] },
    ]) {
      expect(
        (await h.backend.invoke(request('computer_action', { ...args, ...action }))).outcome,
      ).toBe('refused');
    }
  });

  it('drops page content if the browser changes during capture', async () => {
    const h = browserHarness();
    h.inspect.mockResolvedValueOnce({
      status: 'ready',
      url: 'https://example.com/',
      bundleID: 'com.apple.Safari',
    });
    h.navigate('https://example.com/login');
    const target = await grantedComputerTarget(h.backend);
    const result = await h.backend.invoke(
      request('computer_snapshot', { app_id: target.appId, window_id: target.windowId }),
    );
    expect(result.outcome).toBe('refused');
    expect(dataRecord(result.data).blocker_code).toBe('protected_window');
    expect(dataRecord(result.data).elements).toBeUndefined();
    expect(result.images).toBeUndefined();
  });
});
