import type { ComputerPermissionsView as ComputerView } from '../shared/bridge.js';

const CUA_TOOLS = new Set([
  'list_apps',
  'list_windows',
  'get_window_state',
  'get_browser_state',
  'click',
  'type_text',
  'set_value',
  'press_key',
  'hotkey',
  'scroll',
  'browser_prepare',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_pointer',
  'browser_set_input_files',
  'end_session',
]);

interface AuthorizationRequest {
  adapterId: string;
  riskClass: string;
  permissionMode: string;
  publicSession: string;
  requestDigest: string;
  humanSummary: string;
  resourceJson: string;
  expiresUnixMs: bigint;
}

interface AuthorizationBroker {
  authorize(
    request: AuthorizationRequest,
    context: CuaAuthorizationContext,
  ): Promise<'allow' | 'deny' | 'cancel'>;
}

export type CuaAuthorizationContext =
  | { readonly kind: 'turn'; readonly threadId: string; readonly turnId: string }
  | {
      readonly kind: 'direct_user';
      readonly operation: 'browser_attach' | 'browser_navigate' | 'browser_detach';
    };

interface DriverResult {
  rawJson: string;
  structuredJson?: string;
  errorCode?: string;
  images?: Array<{ mimeType: string; dataBase64: string }>;
}

interface DriverLike {
  callTool(
    name: string,
    argumentsJson: string,
    options?: { signal: AbortSignal },
  ): Promise<DriverResult>;
  shutdown(): Promise<void>;
  uniffiDestroy?: () => void;
}

interface CuaServiceOptions {
  readonly callTimeoutMs?: number;
  readonly driverFactory?: () => DriverLike | Promise<DriverLike>;
}

const DEFAULT_CALL_TIMEOUT_MS = 60_000;

export interface CuaDriverImage {
  readonly mimeType: string;
  readonly dataBase64: string;
}

export interface CuaCallResult {
  readonly value: unknown;
  readonly images: readonly CuaDriverImage[];
}

export function isCuaCallResult(value: unknown): value is CuaCallResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'value') &&
    Array.isArray((value as Record<string, unknown>).images)
  );
}

export class CuaService {
  readonly #authorization: AuthorizationBroker;
  readonly #callTimeoutMs: number;
  readonly #driverFactory: (() => DriverLike | Promise<DriverLike>) | undefined;
  #driver: DriverLike | undefined;
  #callTail: Promise<void> = Promise.resolve();
  #authorizationContext: CuaAuthorizationContext | undefined;

  constructor(authorization: AuthorizationBroker, options: CuaServiceOptions = {}) {
    this.#authorization = authorization;
    const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    if (!Number.isFinite(callTimeoutMs) || callTimeoutMs <= 0) {
      throw new Error('CUA call timeout must be a positive number.');
    }
    this.#callTimeoutMs = callTimeoutMs;
    this.#driverFactory = options.driverFactory;
  }

  async permissions(): Promise<ComputerView> {
    if (process.platform !== 'darwin') {
      return {
        status: 'unavailable',
        accessibility: false,
        screenRecording: false,
        detail: 'The Sia alpha supports computer use on macOS only.',
      };
    }
    try {
      const cua = await import('@trycua/cua-driver');
      const status = cua.currentMacOsPermissionStatus();
      const accessibility = Boolean(status.accessibility);
      const screenRecording = Boolean(status.screenRecording);
      return {
        status: accessibility && screenRecording ? 'ready' : 'needs_permission',
        accessibility,
        screenRecording,
        ...(!accessibility || !screenRecording
          ? { detail: 'Accessibility and Screen Recording are both required.' }
          : {}),
      };
    } catch (error) {
      return {
        status: 'error',
        accessibility: false,
        screenRecording: false,
        detail: error instanceof Error ? error.message : 'CUA permissions could not be read.',
      };
    }
  }

  async requestPermissions(): Promise<ComputerView> {
    if (process.platform === 'darwin') {
      const cuaElectron = await import('@trycua/cua-driver/electron');
      const requested = cuaElectron.requestMacOSPermissions();
      if (!requested.screenRecording) await cuaElectron.openMacOSScreenRecordingSettings();
    }
    return this.permissions();
  }

  async call(
    tool: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!CUA_TOOLS.has(tool)) throw new Error(`CUA tool ${tool} is not exposed by Sia.`);
    const previous = this.#callTail;
    const next = Promise.withResolvers<void>();
    this.#callTail = next.promise;
    await previous;
    this.#authorizationContext = context;
    const operation = new AbortController();
    const timeoutError = new Error(
      `CUA tool ${tool} timed out after ${this.#callTimeoutMs} ms.`,
    );
    let driver: DriverLike | undefined;
    const abortFromCaller = (): void => {
      operation.abort(signal?.reason ?? new Error('CUA action cancelled.'));
    };
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      operation.abort(timeoutError);
    }, this.#callTimeoutMs);
    timer.unref();
    try {
      driver = await waitForAbort(this.#getDriver(), operation.signal);
      const result = await waitForAbort(
        Promise.resolve().then(
          async () =>
            await driver!.callTool(tool, JSON.stringify(args), {
              signal: operation.signal,
            }),
        ),
        operation.signal,
      );
      if (result.errorCode) throw new Error(`CUA refused: ${result.errorCode}`);
      const json = result.structuredJson ?? result.rawJson;
      try {
        const parsed = JSON.parse(json) as unknown;
        return withDriverImages(parsed, result.images);
      } catch {
        return withDriverImages({ text: json }, result.images);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
      if (operation.signal.aborted && driver) this.#retireDriver(driver);
      this.#authorizationContext = undefined;
      next.resolve();
    }
  }

  async shutdown(): Promise<void> {
    const driver = this.#driver;
    this.#driver = undefined;
    if (!driver) return;
    await driver.shutdown();
    driver.uniffiDestroy?.();
  }

  async #getDriver(): Promise<DriverLike> {
    if (this.#driver) return this.#driver;
    if (this.#driverFactory) {
      this.#driver = await this.#driverFactory();
      return this.#driver;
    }
    const cua = await import('@trycua/cua-driver');
    const authorization = cua.RuntimeAuthorizationOptions.new({
      allowedModes: [cua.SessionPermissionMode.Standard, cua.SessionPermissionMode.Bounded],
      compatibilityMode: cua.SessionPermissionMode.Standard,
      unrestrictedAcknowledged: false,
      maxSessionTtlSeconds: 28_800n,
      maxIdleTtlSeconds: 900n,
    });
    const options = cua.ConfiguredDriverOptions.new({
      claudeCodeCompatibility: false,
      authorization,
    });
    const host = {
      authorize: async (request: AuthorizationRequest) => {
        let decision: 'allow' | 'deny' | 'cancel' = 'cancel';
        try {
          const context = this.#authorizationContext;
          decision =
            context?.kind === 'direct_user'
              ? 'allow'
              : context
                ? await this.#authorization.authorize(request, context)
                : 'cancel';
        } catch (error) {
          // Never let an application-side approval failure cross the native FFI callback.
          // The driver must fail closed with a normal cancellation that the UI can explain.
          console.error(
            `[sia:cua-authorization] ${error instanceof Error ? error.message : 'Approval callback failed.'}`,
          );
        }
        const action =
          decision === 'allow'
            ? cua.DriverAuthorizationAction.Allow
            : decision === 'deny'
              ? cua.DriverAuthorizationAction.Deny
              : cua.DriverAuthorizationAction.Cancel;
        return cua.DriverAuthorizationDecision.new({
          action,
          requestDigest: request.requestDigest,
        });
      },
    };
    this.#driver = cua.CuaDriver.createConfiguredWithAuthorizationHost(
      options,
      host,
    ) as DriverLike;
    return this.#driver;
  }

  #retireDriver(driver: DriverLike): void {
    if (this.#driver !== driver) return;
    this.#driver = undefined;
    void Promise.resolve()
      .then(async () => await driver.shutdown())
      .catch(() => undefined)
      .then(() => {
        try {
          driver.uniffiDestroy?.();
        } catch {
          // The timed-out driver is already detached; cleanup must stay best effort.
        }
      });
  }
}

async function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new Error('CUA action cancelled.');
  return await new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      cleanup();
      reject(signal.reason ?? new Error('CUA action cancelled.'));
    };
    const cleanup = (): void => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function withDriverImages(value: unknown, images: DriverResult['images']): unknown {
  const safeImages = images?.filter(
    (image) =>
      /^image\/[a-z0-9.+-]+$/i.test(image.mimeType) &&
      image.dataBase64.length > 0 &&
      image.dataBase64.length <= 40_000_000,
  );
  if (!safeImages?.length) return value;
  return { value, images: safeImages.slice(0, 4) } satisfies CuaCallResult;
}
