import { expect, it, vi } from 'vitest';
import { CuaService } from './cua-service.js';
import { browserSessionDriver } from './cua-browser-session.js';

// Real driver, no model, no permissions UI, no browser/window inspection or input.
const real =
  process.platform === 'darwin' && process.env.SIA_REAL_CUA_SESSION_PROBE === '1'
    ? it
    : it.skip;

real('declares the browser lifetime and keeps explicit revocation terminal', async () => {
  const cua = await import('@trycua/cua-driver');
  const native = cua.CuaDriver.createConfigured(
    cua.ConfiguredDriverOptions.new({
      claudeCodeCompatibility: false,
      authorization: cua.RuntimeAuthorizationOptions.new({
        allowedModes: [cua.SessionPermissionMode.Standard],
        compatibilityMode: cua.SessionPermissionMode.Standard,
        unrestrictedAcknowledged: false,
        maxSessionTtlSeconds: 28_800n,
        maxIdleTtlSeconds: 900n,
      }),
    }),
  );
  const driver = await browserSessionDriver(native);
  const label = 'sia-browser-lifecycle-probe';
  try {
    driver.prepareBrowserSession(label);
    const call = (name: string) => driver.callTool(name, JSON.stringify({ session: label }));
    // An ordinary read must lazily establish the configured lifetime too:
    // production browser preparation does not call start_session first.
    const started = await call('list_apps');
    expect(started.errorCode).toBeUndefined();
    const state = await call('get_session');
    expect(state.errorCode).toBeUndefined();
    const lifecycle = JSON.parse(state.structuredJson ?? state.rawJson) as {
      session: string;
      expires_in_seconds: number;
    };
    expect(lifecycle.session).toBe(label);
    expect(lifecycle.expires_in_seconds).toBeGreaterThan(890);
    expect(lifecycle.expires_in_seconds).toBeLessThanOrEqual(900);
    const ended = await call('end_session');
    expect(ended.errorCode).toBeUndefined();
    driver.prepareBrowserSession(label); // Repeating preparation must not revive it.
    const refused = await call('get_session');
    expect(refused.errorCode ?? refused.rawJson).toMatch(/session_ended|session_revoked/);
  } finally {
    await driver.shutdown();
    driver.uniffiDestroy();
  }
});

real(
  'renews ended inventory in the real runtime without ending another session',
  async () => {
    const { CuaDriver } = await import('@trycua/cua-driver');
    const native = CuaDriver.create({ embedded: true, claudeCodeCompatibility: false });
    const sessions: string[] = [];
    const shutdown = vi.fn(async () => {
      await native.shutdown();
    });
    const factory = vi.fn(() => ({
      callTool: async (name: string, args: string, options?: { signal: AbortSignal }) => {
        if (name === 'list_apps')
          sessions.push((JSON.parse(args) as { session: string }).session);
        return native.callTool(name, args, options);
      },
      shutdown,
      uniffiDestroy: () => {
        if ('uniffiDestroy' in native && typeof native.uniffiDestroy === 'function')
          native.uniffiDestroy();
      },
    }));
    const service = new CuaService(
      { authorize: async () => 'deny' },
      {
        driverFactory: factory,
        callTimeoutMs: 10000,
      },
    );
    const context = { kind: 'direct_user', operation: 'access_check' } as const;
    const apps = async (session?: string) => {
      const result = await service.call('list_apps', session ? { session } : {}, context);
      expect(result).toHaveProperty('apps');
    };
    try {
      await apps();
      await apps('sia-independent-read-probe');
      const ended = await native.callTool(
        'end_session',
        JSON.stringify({ session: sessions[0] }),
      );
      expect(ended.errorCode).toBeUndefined();
      await apps();
      await apps('sia-independent-read-probe');
      expect(factory).toHaveBeenCalledOnce();
      expect(shutdown).not.toHaveBeenCalled();
      expect(sessions).toHaveLength(5);
      expect(sessions[0]).toBe(sessions[2]);
      expect(sessions[0]).not.toBe(sessions[3]);
      expect(sessions[1]).toBe(sessions[4]);
    } finally {
      await service.shutdown();
    }
  },
  20000,
);
