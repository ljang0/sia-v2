import type { ComputerPermissionsView as ComputerView } from '../../shared/bridge.js';

const CUA_TOOLS = new Set([
  'list_apps',
  'list_windows',
  'get_window_state',
  'get_browser_state',
  'click',
  'drag',
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
      readonly operation:
        'browser_attach' | 'browser_navigate' | 'browser_detach' | 'access_check';
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

export type CorePermission = 'accessibility' | 'screenRecording';
export interface CorePermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
}

interface CuaServiceOptions {
  readonly fakePermissions?: boolean;
  readonly platform?: NodeJS.Platform;
  /** Test seam for this process's own TCC view; production reads the Cua driver. */
  readonly readPermissions?: () => Promise<CorePermissionStatus>;
  /**
   * Reads the same grants from a brand-new process. macOS applies some grants (notably Screen
   * Recording) to a running app only after it reopens, so a fresh "yes" next to a stale "no"
   * means one relaunch finishes setup. Undefined when the check could not run.
   */
  readonly freshPermissions?: () => Promise<CorePermissionStatus | undefined>;
  readonly callTimeoutMs?: number;
  /** Process id that owns Sia's windows; the driver refuses to inspect its own process. */
  readonly hostPid?: number;
  /** Confirms granted access by reading another app's window through the driver. */
  readonly verifyAccess?: boolean;
  /** Test seam; receives the same authorization callback the native driver would use. */
  readonly driverFactory?: (
    authorize: (request: AuthorizationRequest) => Promise<'allow' | 'deny' | 'cancel'>,
  ) => DriverLike | Promise<DriverLike>;
}

const DEFAULT_CALL_TIMEOUT_MS = 60_000;

interface CuaDriverImage {
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
  readonly #fakePermissions: boolean;
  readonly #callTimeoutMs: number;
  readonly #driverFactory: CuaServiceOptions['driverFactory'];
  readonly #platform: NodeJS.Platform;
  readonly #readPermissions: () => Promise<CorePermissionStatus>;
  readonly #freshPermissions: CuaServiceOptions['freshPermissions'];
  #driver: DriverLike | undefined;
  #driverGeneration = 0;
  #permissionRequest: Promise<ComputerView> | undefined;
  #verification:
    | { result: 'confirmed' | 'unconfirmed' }
    | { result: 'failed'; checkedAt: number }
    | undefined;
  #verifying: Promise<'confirmed' | 'unconfirmed' | 'failed'> | undefined;
  readonly #hostPid: number;
  readonly #verifyAccessEnabled: boolean;
  #accessibilityPrompted = false;
  #callTail: Promise<void> = Promise.resolve();
  #authorizationContext: CuaAuthorizationContext | undefined;
  /** The running call's timeout, paused while an approval waits on the person. */
  #callClock: { pause(): void; resume(): void } | undefined;

  constructor(authorization: AuthorizationBroker, options: CuaServiceOptions = {}) {
    this.#authorization = authorization;
    this.#fakePermissions = options.fakePermissions ?? false;
    const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    if (!Number.isFinite(callTimeoutMs) || callTimeoutMs <= 0) {
      throw new Error('CUA call timeout must be a positive number.');
    }
    this.#callTimeoutMs = callTimeoutMs;
    this.#driverFactory = options.driverFactory;
    this.#platform = options.platform ?? process.platform;
    this.#readPermissions =
      options.readPermissions ??
      (async () => {
        const cua = await import('@trycua/cua-driver');
        const status = cua.currentMacOsPermissionStatus();
        return {
          accessibility: Boolean(status.accessibility),
          screenRecording: Boolean(status.screenRecording),
        };
      });
    this.#freshPermissions = options.freshPermissions;
    this.#hostPid = options.hostPid ?? process.pid;
    this.#verifyAccessEnabled = options.verifyAccess ?? false;
  }

  async permissions(): Promise<ComputerView> {
    if (this.#fakePermissions)
      return {
        status: 'ready',
        accessibility: true,
        screenRecording: true,
        detail: 'Simulated permissions for development.',
      };
    if (this.#platform !== 'darwin') {
      return {
        status: 'unavailable',
        accessibility: false,
        screenRecording: false,
        detail: 'Sia supports computer use on macOS only.',
      };
    }
    try {
      const { accessibility, screenRecording } = await this.#readPermissions();
      const fresh =
        accessibility && screenRecording
          ? undefined
          : await this.#freshPermissions?.().catch(() => undefined);
      const relaunchFor = fresh
        ? (['accessibility', 'screenRecording'] as const).filter(
            (name) => fresh[name] && !{ accessibility, screenRecording }[name],
          )
        : [];
      if (accessibility && screenRecording) {
        if (!this.#verifyAccessEnabled)
          return { status: 'ready', accessibility, screenRecording };
        // The grants decide what Sia may attempt; the check only tells setup whether it works.
        const verified = await this.#verifyAccess();
        return {
          status: 'ready',
          accessibility,
          screenRecording,
          verified,
          ...(verified === 'failed'
            ? {
                detail:
                  'macOS lists Sia as allowed, but Sia could not read the screen yet. Reopen Sia; if that does not help, turn Accessibility and Screen Recording off and on again for Sia.',
              }
            : {}),
        };
      }
      return {
        status: 'needs_permission',
        accessibility,
        screenRecording,
        ...(relaunchFor.length ? { relaunchFor: [...relaunchFor] } : {}),
        ...(!accessibility || !screenRecording
          ? {
              detail: relaunchFor.length
                ? 'Reopen Sia to finish turning on Mac access.'
                : 'Accessibility and Screen Recording are both required.',
            }
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

  /**
   * Asks macOS for one missing grant: the named one, or Accessibility then Screen Recording.
   * A grant that only waits for a relaunch is not requested again.
   */
  requestPermissions(permission?: CorePermission): Promise<ComputerView> {
    // Setup and the inspector can request access together. Keep one OS prompt
    // sequence in flight; subsequent clicks share its result and can retry later.
    this.#permissionRequest ??= this.#requestPermissions(permission).finally(() => {
      this.#permissionRequest = undefined;
    });
    return this.#permissionRequest;
  }

  async #requestPermissions(permission?: CorePermission): Promise<ComputerView> {
    // An explicit request re-checks a failed functional check right away.
    if (this.#verification?.result === 'failed') this.#verification = undefined;
    const current = await this.permissions();
    if (current.status === 'ready' || current.status === 'unavailable') return current;
    const missing = (name: CorePermission) =>
      !current[name] && !current.relaunchFor?.includes(name);
    const target = permission ?? (['accessibility', 'screenRecording'] as const).find(missing);
    if (this.#platform === 'darwin' && target && missing(target)) {
      const { systemPreferences, shell, desktopCapturer } = await import('electron');
      // Request one permission at a time. Opening Screen Recording while the
      // Accessibility prompt is still pending hides the first step on macOS.
      if (target === 'accessibility') {
        // The macOS prompt already offers Open System Settings. Opening Settings as well
        // put two windows in front of the person at once; only open it once the prompt
        // has been dismissed before (macOS shows it once per app).
        const prompted = this.#accessibilityPrompted;
        this.#accessibilityPrompted = true;
        systemPreferences.isTrustedAccessibilityClient(true);
        if (prompted)
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
          );
      } else {
        // Register the responsible, signed Electron app with TCC. This explicit
        // setup request retains no image and sends nothing to the agent.
        await desktopCapturer
          .getSources({
            types: ['screen'],
            thumbnailSize: { width: 1, height: 1 },
            fetchWindowIcons: false,
          })
          .catch(() => undefined);
        const after = await this.permissions();
        if (!after.screenRecording && !after.relaunchFor?.includes('screenRecording'))
          await shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
          );
      }
    }
    return this.permissions();
  }

  /**
   * Reads one window of another app through the driver Sia's tools use, then discards it.
   * macOS can list a grant that the running process cannot use yet; this is what turns
   * "allowed" into "works". Nothing is stored or sent anywhere.
   */
  #verifyAccess(): Promise<'confirmed' | 'unconfirmed' | 'failed'> {
    const cached = this.#verification;
    if (cached?.result === 'confirmed' || cached?.result === 'unconfirmed')
      return Promise.resolve(cached.result);
    if (cached?.result === 'failed' && Date.now() - cached.checkedAt < 15_000)
      return Promise.resolve('failed');
    this.#verifying ??= this.#runAccessCheck()
      .then((result) => {
        this.#verification =
          result === 'failed' ? { result, checkedAt: Date.now() } : { result };
        return result;
      })
      .finally(() => {
        this.#verifying = undefined;
      });
    return this.#verifying;
  }

  async #runAccessCheck(): Promise<'confirmed' | 'unconfirmed' | 'failed'> {
    const context: CuaAuthorizationContext = { kind: 'direct_user', operation: 'access_check' };
    const signal = AbortSignal.timeout(10_000);
    try {
      const windows = findWindows(
        await this.call('list_windows', { on_screen_only: true }, context, signal),
      ).filter(({ pid }) => pid !== this.#hostPid);
      // Finder is always running and holds no secure fields; prefer it when visible.
      const target =
        windows.find(({ appName }) => appName === 'Finder') ?? windows.find(() => true);
      if (!target) return 'unconfirmed';
      const state = await this.call(
        'get_window_state',
        { pid: target.pid, window_id: target.windowId, include_screenshot: true },
        context,
        signal,
      );
      const images = isCuaCallResult(state) ? state.images.length : 0;
      const refused =
        typeof state === 'object' &&
        state !== null &&
        ((isCuaCallResult(state) &&
          typeof state.value === 'object' &&
          state.value !== null &&
          'status' in state.value &&
          state.value.status === 'refused') ||
          ('status' in state && state.status === 'refused'));
      return !refused && images > 0 ? 'confirmed' : 'failed';
    } catch {
      return 'failed';
    }
  }

  async call(
    tool: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!CUA_TOOLS.has(tool)) throw new Error(`CUA tool ${tool} is not exposed by Sia.`);
    signal?.throwIfAborted();
    const previous = this.#callTail;
    const next = Promise.withResolvers<void>();
    this.#callTail = next.promise;
    let ownsQueue = false;
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
    // Time spent waiting on the person to approve an action is not driver time.
    let remainingMs = this.#callTimeoutMs;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = (): void => {
      startedAt = Date.now();
      timer = setTimeout(() => operation.abort(timeoutError), Math.max(0, remainingMs));
      timer.unref();
    };
    startTimer();
    const clock = {
      pause: (): void => {
        if (!timer) return;
        clearTimeout(timer);
        timer = undefined;
        remainingMs -= Date.now() - startedAt;
      },
      resume: (): void => {
        if (!timer && !operation.signal.aborted) startTimer();
      },
    };
    try {
      // Waiting for another call must be cancellable too. A cancelled waiter
      // retains its place until that call ends, so subsequent calls cannot race it.
      await waitForAbort(previous, operation.signal);
      ownsQueue = true;
      this.#authorizationContext = context;
      this.#callClock = clock;
      driver = await waitForAbort(this.#getDriver(), operation.signal);
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await waitForAbort(
            Promise.resolve().then(async () => {
              operation.signal.throwIfAborted();
              return await driver!.callTool(tool, JSON.stringify(args), {
                signal: operation.signal,
              });
            }),
            operation.signal,
          );
          if (result.errorCode) throw new Error(`CUA refused: ${result.errorCode}`);
          const json = result.structuredJson ?? result.rawJson;
          let parsed: unknown;
          try {
            parsed = JSON.parse(json) as unknown;
          } catch {
            parsed = { text: json };
          }
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'error_code' in parsed &&
            parsed.error_code === 'session_ended'
          )
            throw new Error('CUA refused: session_ended');
          return withDriverImages(parsed, result.images);
        } catch (error) {
          // The SDK's implicit inspection session expires while Sia stays open.
          // Renew only unscoped, read-only inventory. Never replay input or revive
          // an explicitly ended named/browser session under a new authority.
          if (
            attempt !== 0 ||
            !['list_apps', 'list_windows'].includes(tool) ||
            args.session !== undefined ||
            operation.signal.aborted ||
            !(error instanceof Error) ||
            !/^(?:CUA refused: )?session_ended$/.test(error.message)
          )
            throw error;
          this.#retireDriver(driver);
          driver = await waitForAbort(this.#getDriver(), operation.signal);
        }
      }
    } finally {
      clock.pause();
      signal?.removeEventListener('abort', abortFromCaller);
      if (ownsQueue) {
        if (operation.signal.aborted) {
          const cancelledDriver = this.#driver;
          if (cancelledDriver) this.#retireDriver(cancelledDriver);
          else this.#driverGeneration++;
        }
        this.#authorizationContext = undefined;
        if (this.#callClock === clock) this.#callClock = undefined;
        next.resolve();
      } else {
        void previous.then(() => next.resolve());
      }
    }
  }

  async shutdown(): Promise<void> {
    this.#driverGeneration++;
    const driver = this.#driver;
    this.#driver = undefined;
    if (!driver) return;
    await driver.shutdown();
    driver.uniffiDestroy?.();
  }

  async #getDriver(): Promise<DriverLike> {
    if (this.#driver) return this.#driver;
    const generation = this.#driverGeneration;
    const driver = await (this.#driverFactory?.((request) => this.#authorize(request)) ??
      this.#createDriver());
    if (generation !== this.#driverGeneration) {
      this.#disposeDriver(driver);
      throw new Error('CUA driver initialization was cancelled.');
    }
    this.#driver = driver;
    return driver;
  }

  async #createDriver(): Promise<DriverLike> {
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
        const decision = await this.#authorize(request);
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
    return cua.CuaDriver.createConfiguredWithAuthorizationHost(options, host) as DriverLike;
  }

  async #authorize(request: AuthorizationRequest): Promise<'allow' | 'deny' | 'cancel'> {
    const clock = this.#callClock;
    clock?.pause();
    try {
      const context = this.#authorizationContext;
      return context?.kind === 'direct_user'
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
      return 'cancel';
    } finally {
      clock?.resume();
    }
  }

  #retireDriver(driver: DriverLike): void {
    if (this.#driver !== driver) return;
    this.#driver = undefined;
    this.#driverGeneration++;
    this.#disposeDriver(driver);
  }

  #disposeDriver(driver: DriverLike): void {
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
  if (signal.aborted) {
    // The operation may already be in flight. Drain its eventual rejection even
    // when cancellation wins before this waiter attaches its normal handlers.
    void operation.catch(() => undefined);
    throw signal.reason ?? new Error('CUA action cancelled.');
  }
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

function findWindows(value: unknown): { pid: number; windowId: number; appName: string }[] {
  const root = isCuaCallResult(value) ? value.value : value;
  const windows =
    typeof root === 'object' && root !== null && 'windows' in root ? root.windows : undefined;
  if (!Array.isArray(windows)) return [];
  return windows.flatMap((window: unknown) => {
    if (typeof window !== 'object' || window === null) return [];
    const record = window as Record<string, unknown>;
    const pid = record.pid;
    const windowId = record.window_id ?? record.windowId;
    if (typeof pid !== 'number' || typeof windowId !== 'number') return [];
    return [
      { pid, windowId, appName: typeof record.app_name === 'string' ? record.app_name : '' },
    ];
  });
}
