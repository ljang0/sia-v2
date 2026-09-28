import { afterEach, describe, expect, it, vi } from 'vitest';

import { CuaService } from './cua-service.js';

const permissionUi = vi.hoisted(() => ({
  accessibility: vi.fn(),
  openExternal: vi.fn(async () => {}),
  getSources: vi.fn(async () => []),
}));
vi.mock('electron', () => ({
  desktopCapturer: { getSources: permissionUi.getSources },
  systemPreferences: { isTrustedAccessibilityClient: permissionUi.accessibility },
  shell: { openExternal: permissionUi.openExternal },
}));

const directContext = {
  kind: 'direct_user' as const,
  operation: 'browser_attach' as const,
};

function authorization() {
  return {
    authorize: async () => 'allow' as const,
  };
}

function successfulDriver(value: unknown) {
  return {
    callTool: vi.fn(
      async (_name: string, _args: string, _options?: { signal: AbortSignal }) => ({
        rawJson: JSON.stringify(value),
      }),
    ),
    shutdown: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each(['ready', 'unavailable'] as const)(
  'does not request permissions again when computer access is %s',
  async (status) => {
    const service = new CuaService(authorization());
    const current = {
      status,
      accessibility: status === 'ready',
      screenRecording: status === 'ready',
    };
    const permissions = vi.spyOn(service, 'permissions').mockResolvedValue(current);
    expect(await service.requestPermissions()).toBe(current);
    expect(permissions).toHaveBeenCalledTimes(1);
  },
);

it.runIf(process.platform === 'darwin')(
  'registers the signed Electron app during an explicit missing-screen permission request',
  async () => {
    const service = new CuaService(authorization());
    vi.spyOn(service, 'permissions').mockResolvedValue({
      status: 'needs_permission',
      accessibility: true,
      screenRecording: false,
    });
    await service.requestPermissions();
    expect(permissionUi.getSources).toHaveBeenCalledExactlyOnceWith({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    expect(permissionUi.openExternal).toHaveBeenCalledExactlyOnceWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  },
);

it.runIf(process.platform === 'darwin').each([true, false])(
  'requests Accessibility alone before Screen Recording (screen allowed: %s)',
  async (screenRecording) => {
    const service = new CuaService(authorization());
    vi.spyOn(service, 'permissions').mockResolvedValue({
      status: 'needs_permission',
      accessibility: false,
      screenRecording,
    });
    await service.requestPermissions();
    expect(permissionUi.getSources).not.toHaveBeenCalled();
    expect(permissionUi.accessibility).toHaveBeenCalledExactlyOnceWith(true);
    expect(permissionUi.openExternal).toHaveBeenCalledExactlyOnceWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    );
  },
);

it.runIf(process.platform === 'darwin')(
  'shares overlapping permission requests and permits a later retry after failure',
  async () => {
    const service = new CuaService(authorization());
    vi.spyOn(service, 'permissions').mockResolvedValue({
      status: 'needs_permission',
      accessibility: true,
      screenRecording: false,
    });
    permissionUi.openExternal
      .mockRejectedValueOnce(new Error('Permission service unavailable'))
      .mockResolvedValue(undefined);
    const first = service.requestPermissions();
    expect(service.requestPermissions()).toBe(first);
    await expect(first).rejects.toThrow('Permission service unavailable');
    const retry = service.requestPermissions();
    expect(service.requestPermissions()).toBe(retry);
    await expect(retry).resolves.toMatchObject({ screenRecording: false });
    expect(permissionUi.openExternal).toHaveBeenCalledTimes(2);
    expect(permissionUi.getSources).toHaveBeenCalledTimes(2);
  },
);

it('keeps simulated permission setup away from the native permission API', async () => {
  const service = new CuaService(authorization(), { fakePermissions: true });
  expect(await service.permissions()).toMatchObject({
    status: 'ready',
    accessibility: true,
    screenRecording: true,
  });
  expect(await service.requestPermissions()).toMatchObject({
    status: 'ready',
    detail: 'Simulated permissions for development.',
  });
});

describe('CuaService call boundaries', () => {
  it.each(['errorCode', 'structured', 'thrown'] as const)(
    'renews an expired implicit inventory session once: %s',
    async (shape) => {
      const expired = successfulDriver({ error_code: 'session_ended' });
      if (shape === 'errorCode')
        expired.callTool.mockResolvedValue({ rawJson: '{}', errorCode: 'session_ended' } as {
          rawJson: string;
        });
      if (shape === 'thrown')
        expired.callTool.mockRejectedValue(new Error('CUA refused: session_ended'));
      const healthy = successfulDriver({ apps: [{ pid: 42, name: 'Calculator' }] });
      const factory = vi.fn().mockReturnValueOnce(expired).mockReturnValueOnce(healthy);
      const service = new CuaService(authorization(), { driverFactory: factory });
      expect(await service.call('list_apps', {}, directContext)).toEqual({
        apps: [{ pid: 42, name: 'Calculator' }],
      });
      expect(expired.callTool).toHaveBeenCalledOnce();
      expect(healthy.callTool).toHaveBeenCalledOnce();
      expect(expired.shutdown).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { tool: 'click', args: {}, code: 'session_ended' },
    { tool: 'list_apps', args: { session: 'explicitly-ended' }, code: 'session_ended' },
    { tool: 'list_apps', args: {}, code: 'permission_denied' },
  ])('does not renew authority or replay $tool after $code', async ({ tool, args, code }) => {
    const driver = successfulDriver({});
    driver.callTool.mockRejectedValue(new Error(`CUA refused: ${code}`));
    const factory = vi.fn(() => driver);
    const service = new CuaService(authorization(), { driverFactory: factory });
    await expect(service.call(tool, args, directContext)).rejects.toThrow(code);
    expect(driver.callTool).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
    expect(driver.shutdown).not.toHaveBeenCalled();
  });

  it('bounds recovery when a replacement inventory session is also ended', async () => {
    const factory = vi.fn(() => successfulDriver({ error_code: 'session_ended' }));
    const service = new CuaService(authorization(), { driverFactory: factory });
    await expect(service.call('list_windows', {}, directContext)).rejects.toThrow(
      'session_ended',
    );
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('cancels a queued call promptly without letting a later call overtake the active one', async () => {
    vi.useFakeTimers();
    const first = Promise.withResolvers<{ rawJson: string }>();
    const driver = successfulDriver({ done: true });
    driver.callTool.mockImplementationOnce(() => first.promise);
    const service = new CuaService(authorization(), { driverFactory: () => driver });
    const active = service.call('list_apps', {}, directContext);
    await vi.advanceTimersByTimeAsync(0);
    const abort = new AbortController();
    const queued = service.call('click', {}, directContext, abort.signal);
    let cancelled = false;
    const handled = queued.catch(() => {
      cancelled = true;
    });
    const last = service.call('list_windows', {}, directContext);
    abort.abort(new Error('Cancelled while queued.'));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelled).toBe(true);
    expect(driver.callTool).toHaveBeenCalledTimes(1);
    first.resolve({ rawJson: '{}' });
    await Promise.all([active, handled, last]);
    expect(driver.callTool.mock.calls.map(([name]) => name)).toEqual([
      'list_apps',
      'list_windows',
    ]);
  });

  it('disposes a late driver initialization instead of replacing the recovered driver', async () => {
    vi.useFakeTimers();
    const initializing = Promise.withResolvers<ReturnType<typeof successfulDriver>>();
    const old = successfulDriver({ old: true });
    const fresh = successfulDriver({ fresh: true });
    const factory = vi
      .fn()
      .mockReturnValueOnce(initializing.promise)
      .mockReturnValueOnce(fresh);
    const service = new CuaService(authorization(), {
      callTimeoutMs: 25,
      driverFactory: factory,
    });
    const starting = service.call('list_apps', {}, directContext);
    const failure = expect(starting).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(25);
    await failure;
    expect(await service.call('list_apps', {}, directContext)).toEqual({ fresh: true });
    initializing.resolve(old);
    await vi.advanceTimersByTimeAsync(0);
    expect(await service.call('list_windows', {}, directContext)).toEqual({ fresh: true });
    expect(old.callTool).not.toHaveBeenCalled();
    expect(old.shutdown).toHaveBeenCalledOnce();
  });

  it('also retires initialization that times out while replacing an expired session', async () => {
    vi.useFakeTimers();
    const late = Promise.withResolvers<ReturnType<typeof successfulDriver>>();
    const expired = successfulDriver({ error_code: 'session_ended' });
    const stale = successfulDriver({ stale: true });
    const healthy = successfulDriver({ healthy: true });
    const factory = vi
      .fn()
      .mockReturnValueOnce(expired)
      .mockReturnValueOnce(late.promise)
      .mockReturnValueOnce(healthy);
    const service = new CuaService(authorization(), {
      callTimeoutMs: 25,
      driverFactory: factory,
    });
    const pending = service.call('list_apps', {}, directContext);
    const failure = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(25);
    await failure;
    late.resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(stale.shutdown).toHaveBeenCalledOnce();
    expect(await service.call('list_apps', {}, directContext)).toEqual({ healthy: true });
  });
  it('forwards the exact-value primitive used by background form replacement', async () => {
    const driver = successfulDriver({ effect: 'confirmed' });
    const service = new CuaService(authorization(), {
      driverFactory: () => driver,
    });

    await expect(
      service.call(
        'set_value',
        { element_token: 'field-1', value: 'Exact replacement' },
        directContext,
      ),
    ).resolves.toEqual({ effect: 'confirmed' });
    expect(driver.callTool).toHaveBeenCalledWith(
      'set_value',
      JSON.stringify({ element_token: 'field-1', value: 'Exact replacement' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('aborts and retires a hung driver so the serialized queue can continue', async () => {
    vi.useFakeTimers();
    let hungSignal: AbortSignal | undefined;
    const hungDriver = {
      callTool: vi.fn(
        async (_name: string, _argumentsJson: string, options?: { signal: AbortSignal }) => {
          hungSignal = options?.signal;
          return await new Promise<never>(() => undefined);
        },
      ),
      shutdown: vi.fn(async () => undefined),
    };
    const replacementDriver = successfulDriver({ recovered: true });
    const driverFactory = vi
      .fn()
      .mockReturnValueOnce(hungDriver)
      .mockReturnValueOnce(replacementDriver);
    const service = new CuaService(authorization(), {
      callTimeoutMs: 25,
      driverFactory,
    });

    const hungCall = service.call(
      'browser_navigate',
      { url: 'https://example.com' },
      directContext,
    );
    const timeoutExpectation = expect(hungCall).rejects.toThrow(
      'CUA tool browser_navigate timed out after 25 ms.',
    );
    await vi.advanceTimersByTimeAsync(25);

    await timeoutExpectation;
    expect(hungSignal?.aborted).toBe(true);
    await expect(service.call('get_browser_state', {}, directContext)).resolves.toEqual({
      recovered: true,
    });
    expect(driverFactory).toHaveBeenCalledTimes(2);
  });

  it('always propagates a caller abort signal to the native driver', async () => {
    let nativeSignal: AbortSignal | undefined;
    const driver = {
      callTool: vi.fn(
        async (_name: string, _argumentsJson: string, options?: { signal: AbortSignal }) => {
          nativeSignal = options?.signal;
          return await new Promise<never>(() => undefined);
        },
      ),
      shutdown: vi.fn(async () => undefined),
    };
    const service = new CuaService(authorization(), {
      driverFactory: () => driver,
    });
    const abort = new AbortController();
    const call = service.call(
      'browser_click',
      { selector: '#save' },
      directContext,
      abort.signal,
    );
    await vi.waitFor(() => expect(nativeSignal).toBeDefined());
    const abortExpectation = expect(call).rejects.toThrow('Turn cancelled.');

    abort.abort(new Error('Turn cancelled.'));

    await abortExpectation;
    expect(nativeSignal?.aborted).toBe(true);
  });
});
