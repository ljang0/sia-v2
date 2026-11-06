import type { CuaDriverLike } from '@trycua/cua-driver';
import type { DriverResult } from './cua-results.js';

// The browser attachment is a host connection, not a single model turn. An
// implicit native session expires after five idle minutes even though the host
// allows fifteen. Declare that lifetime through the supported SDK API, without
// polling pages, reviving expired authority or switching permission mode.
export const BROWSER_SESSION_IDLE_SECONDS = 900n;
export const BROWSER_SESSION_SECONDS = 28_800n;

export function trustedBrowserLeaseEnded(result: DriverResult): boolean {
  if (['authorization_expired', 'authorization_revoked'].includes(result.errorCode ?? ''))
    return true;
  if (result.errorCode !== 'permission_denied') return false;
  // The pinned SDK reports trusted-context expiry through permission_denied.
  // Match only its exact refusal envelope, never arbitrary native/page text.
  try {
    const value = JSON.parse(result.structuredJson ?? result.rawJson) as {
      status?: unknown;
      refusal?: { code?: unknown; message?: unknown };
    } | null;
    return (
      value?.status === 'refused' &&
      value.refusal?.code === 'permission_denied' &&
      typeof value.refusal.message === 'string' &&
      [
        'Permission denied: authorization context expired',
        'Permission denied: authorization context idle timeout exceeded',
        'Permission denied: authorization context has been revoked',
      ].includes(value.refusal.message)
    );
  } catch {
    return false;
  }
}

export async function browserSessionDriver(native: CuaDriverLike) {
  const cua = await import('@trycua/cua-driver');
  let connection:
    { label: string; driver: ReturnType<typeof cua.createTrustedSession> } | undefined;
  return {
    prepareBrowserSession(label: string): void {
      if (connection?.label === label) return;
      connection?.driver.close();
      connection = {
        label,
        driver: cua.createTrustedSession(
          native,
          cua.TrustedSessionOptions.new({
            publicSession: label,
            mode: cua.SessionPermissionMode.Standard,
            ttlSeconds: BROWSER_SESSION_SECONDS,
            idleTtlSeconds: BROWSER_SESSION_IDLE_SECONDS,
          }),
        ),
      };
    },
    callTool: async (
      name: string,
      argumentsJson: string,
      options?: { signal: AbortSignal },
    ) => {
      const args = JSON.parse(argumentsJson) as { session?: unknown };
      const target =
        connection && connection.label === args.session ? connection.driver : native;
      const result = await target.callTool(name, argumentsJson, options);
      // Feed proved lease expiry into connection recovery. Do not reinterpret
      // ordinary permission failures, retry the call or mint a new lease.
      return target !== native && trustedBrowserLeaseEnded(result)
        ? { ...result, errorCode: 'session_ended' }
        : result;
    },
    async shutdown(): Promise<void> {
      connection?.driver.close();
      connection = undefined;
      await native.shutdown();
    },
    uniffiDestroy: () => {
      if ('uniffiDestroy' in native && typeof native.uniffiDestroy === 'function')
        native.uniffiDestroy();
    },
  };
}
