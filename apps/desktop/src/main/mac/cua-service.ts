import { randomUUID } from 'node:crypto';
import { CuaPermissions } from './cua-permissions.js';
import type { CorePermission, CuaPermissionOptions } from './cua-permissions.js';
import {
  decodeDriverResult,
  readForegroundInventory,
  withDriverImages,
} from './cua-results.js';
import type { DriverResult } from './cua-results.js';
import type { ComputerPermissionsView as ComputerView } from '../../shared/bridge.js';
import {
  browserSessionDriver,
  BROWSER_SESSION_IDLE_SECONDS,
  BROWSER_SESSION_SECONDS,
} from './cua-browser-session.js';

const CUA_TOOLS = new Set([
  'list_apps',
  'list_windows',
  'get_window_state',
  'launch_app',
  'double_click',
  'invoke_menu',
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
  | {
      readonly kind: 'turn';
      readonly threadId: string;
      readonly turnId: string;
      /** Host-owned execution attempt; explicit Continue receives fresh authority. */
      readonly executionId?: string | undefined;
      readonly backgroundOnly?: boolean;
      /** Host-bound browser target; never supplied by model arguments. */
      readonly backgroundTargetPid?: number;
    }
  | {
      readonly kind: 'direct_user';
      readonly operation:
        'browser_attach' | 'browser_navigate' | 'browser_detach' | 'access_check';
    };

interface DriverLike {
  prepareBrowserSession?: (label: string) => void;
  callTool(
    name: string,
    argumentsJson: string,
    options?: { signal: AbortSignal },
  ): Promise<DriverResult>;
  shutdown(): Promise<void>;
  uniffiDestroy?: () => void;
}

interface CuaServiceOptions extends CuaPermissionOptions {
  /** Production reads macOS's live frontmost PID, including utility apps. */
  readonly readForegroundPid?: () => Promise<number | undefined>;
  readonly callTimeoutMs?: number;
  /** Test seam; receives the same authorization callback as the native driver. */
  readonly driverFactory?: (
    authorize: (request: AuthorizationRequest) => Promise<'allow' | 'deny' | 'cancel'>,
  ) => DriverLike | Promise<DriverLike>;
}

const DEFAULT_CALL_TIMEOUT_MS = 60_000;
// The pinned native type_text preflight permits 100 seconds of paced input.
// Include time for exact-window focus and result delivery; the ordinary call
// deadline otherwise interrupts a valid document write after it has started.
const DEFAULT_TYPING_TIMEOUT_MS = 120_000;
const WINDOW_INPUT_TOOLS = new Set([
  'click',
  'double_click',
  'drag',
  'type_text',
  'set_value',
  'press_key',
  'hotkey',
  'scroll',
]);
const BROWSER_INPUT_TOOLS = new Set([
  'browser_prepare',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_pointer',
]);

interface DriverLane {
  driver: DriverLike | undefined;
  generation: number;
  tail: Promise<void>;
  inventorySession: string;
  context: CuaAuthorizationContext | undefined;
  progress: { started: number; completed: number } | undefined;
  clock: { pause(): void; resume(): void } | undefined;
  signal: AbortSignal | undefined;
}

function driverLane(): DriverLane {
  return {
    driver: undefined,
    generation: 0,
    tail: Promise.resolve(),
    inventorySession: `sia-inventory-${randomUUID()}`,
    context: undefined,
    progress: undefined,
    clock: undefined,
    signal: undefined,
  };
}

export class CuaService {
  readonly #readForegroundPid: (() => Promise<number | undefined>) | undefined;
  readonly #authorization: AuthorizationBroker;
  readonly #callTimeoutMs: number;
  readonly #typingTimeoutMs: number;
  readonly #driverFactory: CuaServiceOptions['driverFactory'];
  // Each native runtime has its own authorization host. Serialize within a lane,
  // while a stalled browser transport cannot hold up an unrelated desktop action.
  readonly #browser = driverLane();
  readonly #desktop = driverLane();
  readonly #permissions: CuaPermissions;
  readonly #pausedBackgroundTurns = new Set<string>();

  constructor(authorization: AuthorizationBroker, options: CuaServiceOptions = {}) {
    this.#authorization = authorization;
    this.#readForegroundPid = options.readForegroundPid;
    const callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    if (!Number.isFinite(callTimeoutMs) || callTimeoutMs <= 0) {
      throw new Error('CUA call timeout must be a positive number.');
    }
    this.#callTimeoutMs = callTimeoutMs;
    this.#typingTimeoutMs = options.callTimeoutMs ?? DEFAULT_TYPING_TIMEOUT_MS;
    this.#driverFactory = options.driverFactory;
    this.#permissions = new CuaPermissions(
      (tool, args, signal) =>
        this.call(tool, args, { kind: 'direct_user', operation: 'access_check' }, signal),
      options,
    );
  }

  permissions(): Promise<ComputerView> {
    return this.#permissions.permissions();
  }

  requestPermissions(permission?: CorePermission): Promise<ComputerView> {
    return this.#permissions.requestPermissions(permission);
  }

  async call(
    tool: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!CUA_TOOLS.has(tool)) throw new Error(`CUA tool ${tool} is not exposed by Sia.`);
    signal?.throwIfAborted();
    // Copy/Cut changes the system pasteboard even when key delivery stays in
    // another window. Do not overwrite the person's clipboard to move files.
    if (
      context.kind === 'turn' &&
      context.backgroundOnly &&
      tool === 'hotkey' &&
      Array.isArray(args.keys)
    ) {
      const keys = args.keys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.toLowerCase());
      if (
        keys.some((key) => ['cmd', 'command', 'super', 'meta', 'win'].includes(key)) &&
        keys.some((key) => key === 'c' || key === 'x')
      )
        throw new Error(
          'Background Copy and Cut would change your clipboard. Use a supported drag or another clipboard-free action.',
        );
    }
    // Native menus have no delivery ceiling, and an app may activate itself
    // after a background launch. Neither can guarantee background-only delivery.
    // Refuse before driver initialization, queueing or input, not after delivery.
    if (
      ['invoke_menu', 'launch_app'].includes(tool) &&
      context.kind === 'turn' &&
      context.backgroundOnly
    )
      throw new Error('CUA refused: background_unavailable');
    const protectDesktop =
      context.kind === 'turn' &&
      context.backgroundOnly &&
      (WINDOW_INPUT_TOOLS.has(tool) || BROWSER_INPUT_TOOLS.has(tool));
    if (
      protectDesktop &&
      (args.delivery_mode === 'foreground' ||
        (WINDOW_INPUT_TOOLS.has(tool) &&
          tool !== 'set_value' &&
          args.delivery_mode !== 'background'))
    )
      throw new Error('CUA refused: background_unavailable');
    const lane =
      tool === 'get_browser_state' ||
      tool.startsWith('browser_') ||
      (tool === 'end_session' &&
        typeof args.session === 'string' &&
        args.session.startsWith('sia-browser-'))
        ? this.#browser
        : this.#desktop;
    const previous = lane.tail;
    const next = Promise.withResolvers<void>();
    lane.tail = next.promise;
    let ownsQueue = false;
    const operation = new AbortController();
    const callTimeoutMs = tool === 'type_text' ? this.#typingTimeoutMs : this.#callTimeoutMs;
    const timeoutError = new Error(`CUA tool ${tool} timed out after ${callTimeoutMs} ms.`);
    let driver: DriverLike | undefined;
    const abortFromCaller = (): void => {
      operation.abort(signal?.reason ?? new Error('CUA action cancelled.'));
    };
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    // Time spent waiting on the person to approve an action is not driver time.
    let remainingMs = callTimeoutMs;
    let startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startTimer = (): void => {
      startedAt = Date.now();
      timer = setTimeout(() => operation.abort(timeoutError), Math.max(0, remainingMs));
      timer.unref();
    };
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
      if (
        protectDesktop &&
        context.kind === 'turn' &&
        this.#pausedBackgroundTurns.has(
          JSON.stringify([context.threadId, context.turnId, context.executionId]),
        )
      )
        throw new Error('CUA refused: background_input_paused');
      // Queue time belongs to the preceding call; only this call's execution uses its budget.
      startTimer();
      lane.context = context;
      lane.signal = operation.signal;
      lane.progress = { started: 0, completed: 0 };
      lane.clock = clock;
      driver = await waitForAbort(this.#getDriver(lane), operation.signal);
      let foregroundBefore: number | undefined;
      let backgroundTargetPid: number | undefined;
      const result = await waitForAbort(
        Promise.resolve().then(async () => {
          operation.signal.throwIfAborted();
          if (
            tool === 'browser_prepare' &&
            context.kind === 'direct_user' &&
            context.operation === 'browser_attach' &&
            typeof args.session === 'string' &&
            args.session.startsWith('sia-browser-')
          )
            driver!.prepareBrowserSession?.(args.session);
          // The driver's compact default omits structured controls and route metadata.
          // Both are required for protected-field checks and exact background grants.
          const input =
            tool === 'get_window_state'
              ? { ...args, tree_format: 'elements', verbose: true }
              : args;
          if (protectDesktop) {
            const targetPid =
              context.kind === 'turn' && BROWSER_INPUT_TOOLS.has(tool)
                ? (context.backgroundTargetPid ?? args.pid)
                : args.pid;
            const foreground = await this.#foregroundPid(lane, driver!, operation.signal, true);
            operation.signal.throwIfAborted();
            if (
              foreground === undefined ||
              typeof targetPid !== 'number' ||
              !Number.isInteger(targetPid) ||
              targetPid <= 0
            )
              throw new Error('CUA refused: background_focus_unavailable');
            if (foreground === targetPid) throw new Error('CUA refused: foreground_app_in_use');
            foregroundBefore = foreground;
            backgroundTargetPid = targetPid;
          }
          if (['list_apps', 'list_windows'].includes(tool) && args.session === undefined)
            return this.#readInventory(lane, driver!, tool, input, operation.signal);
          const serialized = JSON.stringify(input);
          const reply = await driver!.callTool(tool, serialized, { signal: operation.signal });
          // A loading page can time out while the driver attests its origin,
          // before the host is asked to authorize observation. Refresh that
          // exact read once, under the same grant and overall timeout. Never
          // replay navigation/input or retry a host authorization decision.
          if (
            tool === 'get_browser_state' &&
            reply.errorCode === 'authorization_host_failed' &&
            /CDP [A-Za-z.]+ timed out/.test(reply.structuredJson ?? reply.rawJson) &&
            lane.progress?.started === 0
          ) {
            operation.signal.throwIfAborted();
            console.warn('[sia:cua-browser] observation_transport_retry attempt=1');
            return driver!.callTool(tool, serialized, { signal: operation.signal });
          }
          return reply;
        }),
        operation.signal,
      );
      const decoded = decodeDriverResult(tool, args, result, lane.progress);
      const nativeToolError = decoded.nativeToolError;
      let parsed = decoded.value;
      if (protectDesktop) {
        const foreground = await this.#foregroundPid(lane, driver, operation.signal);
        operation.signal.throwIfAborted();
        // Page.navigate addresses an exact CDP tab and sends no desktop input.
        // A successful, matching receipt remains valid when the person switches
        // between other apps. BrowserActions still verifies the resulting page.
        // Keep the conservative guard for native/trusted input, missing receipts,
        // driver errors, unknown focus and the browser itself becoming active.
        const acknowledgedNavigation =
          tool === 'browser_navigate' &&
          !nativeToolError &&
          typeof parsed === 'object' &&
          parsed !== null &&
          !Array.isArray(parsed) &&
          'status' in parsed &&
          parsed.status === 'ok' &&
          'target_id' in parsed &&
          parsed.target_id === args.target_id &&
          'tab_id' in parsed &&
          parsed.tab_id === args.tab_id &&
          'url' in parsed &&
          parsed.url === args.url &&
          'refs_invalidated' in parsed &&
          parsed.refs_invalidated === true &&
          Object.keys(parsed).every((key) =>
            ['status', 'target_id', 'tab_id', 'url', 'refs_invalidated'].includes(key),
          );
        const unrelatedAppSwitch =
          acknowledgedNavigation &&
          foreground !== undefined &&
          foreground !== backgroundTargetPid;
        if (
          foreground === undefined ||
          (foreground !== foregroundBefore && !unrelatedAppSwitch)
        ) {
          if (context.kind === 'turn') {
            const key = JSON.stringify([context.threadId, context.turnId, context.executionId]);
            // Install this before releasing the native queue. Tool-signal cleanup
            // or driver renewal must not lift a restriction on the same turn.
            this.#pausedBackgroundTurns.add(key);
          }
          const native =
            typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
              ? parsed
              : { native_result: parsed };
          parsed = {
            ...native,
            background_other_app_changed:
              !nativeToolError &&
              foreground !== undefined &&
              foreground !== backgroundTargetPid,
            ...(foreground === undefined
              ? { background_focus_unverified: true }
              : { background_focus_changed: true }),
          };
          // Preserve the desktop interruption even when the native input also
          // failed. Its delivery is unknown; it must not be retried as unsent.
          if (nativeToolError) return parsed;
        }
      }
      if (nativeToolError)
        throw new Error(`CUA tool ${tool} failed without a structured result.`);
      return withDriverImages(parsed, result.images);
    } finally {
      clock.pause();
      signal?.removeEventListener('abort', abortFromCaller);
      if (ownsQueue) {
        if (operation.signal.aborted) {
          const cancelledDriver = lane.driver;
          if (cancelledDriver) this.#retireDriver(lane, cancelledDriver);
          else lane.generation++;
        }
        lane.context = undefined;
        lane.signal = undefined;
        lane.progress = undefined;
        if (lane.clock === clock) lane.clock = undefined;
        next.resolve();
      } else {
        void previous.then(() => next.resolve());
      }
    }
  }

  async shutdown(): Promise<void> {
    const results = await Promise.allSettled(
      [this.#browser, this.#desktop].map(async (lane) => {
        lane.generation++;
        const driver = lane.driver;
        lane.driver = undefined;
        if (!driver) return;
        try {
          await driver.shutdown();
        } finally {
          driver.uniffiDestroy?.();
        }
      }),
    );
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length) throw new AggregateError(errors, 'CUA driver shutdown failed.');
  }

  async #readInventory(
    lane: DriverLane,
    driver: DriverLike,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<DriverResult> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        const result = await driver.callTool(
          tool,
          JSON.stringify({ ...args, session: lane.inventorySession }),
          { signal },
        );
        let ended = result.errorCode === 'session_ended';
        try {
          const value: unknown = JSON.parse(result.structuredJson ?? result.rawJson);
          ended ||=
            !!value &&
            typeof value === 'object' &&
            'error_code' in value &&
            value.error_code === 'session_ended';
        } catch {
          /* Leave malformed responses to the ordinary result parser. */
        }
        if (ended) throw new Error('CUA refused: session_ended');
        return result;
      } catch (error) {
        if (
          attempt ||
          signal.aborted ||
          !(error instanceof Error) ||
          !/^(?:CUA refused: )?session_ended$/.test(error.message)
        )
          throw error;
        // Only host-owned, read-only inventory is renewed. Browser/window sessions
        // and input are never retried, and the shared runtime stays alive.
        lane.inventorySession = `sia-inventory-${randomUUID()}`;
      }
    }
  }

  async #foregroundPid(
    lane: DriverLane,
    driver: DriverLike,
    signal: AbortSignal,
    refreshUnavailable = false,
  ): Promise<number | undefined> {
    try {
      if (this.#readForegroundPid) {
        const pid = await waitForAbort(this.#readForegroundPid(), signal);
        return typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && pid <= 2147483647
          ? pid
          : undefined;
      }
      let focus = readForegroundInventory(
        await waitForAbort(this.#readInventory(lane, driver, 'list_apps', {}, signal), signal),
      );
      // A transient empty inventory before input is safe to observe once more.
      // Never retry input, reuse old focus, or erase uncertainty AFTER delivery.
      if (focus.status === 'empty' && refreshUnavailable) {
        signal.throwIfAborted();
        focus = readForegroundInventory(
          await waitForAbort(
            this.#readInventory(lane, driver, 'list_apps', {}, signal),
            signal,
          ),
        );
      }
      return focus.status === 'ready' ? focus.pid : undefined;
    } catch {
      return undefined;
    }
  }

  async #getDriver(lane: DriverLane): Promise<DriverLike> {
    if (lane.driver) return lane.driver;
    const generation = lane.generation;
    const authorize = (request: AuthorizationRequest) =>
      this.#authorize(lane, generation, request);
    const driver = await (this.#driverFactory?.(authorize) ?? this.#createDriver(authorize));
    if (generation !== lane.generation) {
      this.#disposeDriver(driver);
      throw new Error('CUA driver initialization was cancelled.');
    }
    lane.driver = driver;
    return driver;
  }

  async #createDriver(
    authorize: (request: AuthorizationRequest) => Promise<'allow' | 'deny' | 'cancel'>,
  ): Promise<DriverLike> {
    const cua = await import('@trycua/cua-driver');
    const authorization = cua.RuntimeAuthorizationOptions.new({
      allowedModes: [cua.SessionPermissionMode.Standard, cua.SessionPermissionMode.Bounded],
      compatibilityMode: cua.SessionPermissionMode.Standard,
      unrestrictedAcknowledged: false,
      maxSessionTtlSeconds: BROWSER_SESSION_SECONDS,
      maxIdleTtlSeconds: BROWSER_SESSION_IDLE_SECONDS,
    });
    const options = cua.ConfiguredDriverOptions.new({
      claudeCodeCompatibility: false,
      authorization,
    });
    const host = {
      authorize: async (request: AuthorizationRequest) => {
        const decision = await authorize(request);
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
    return browserSessionDriver(
      cua.CuaDriver.createConfiguredWithAuthorizationHost(options, host),
    );
  }

  async #authorize(
    lane: DriverLane,
    generation: number,
    request: AuthorizationRequest,
  ): Promise<'allow' | 'deny' | 'cancel'> {
    // A retired FFI runtime can finish late. It must never inherit the next
    // call's context, especially a direct-user connection setup's authority.
    if (generation !== lane.generation || !lane.context || lane.signal?.aborted)
      return 'cancel';
    const clock = lane.clock;
    const progress = lane.progress;
    if (progress) progress.started++;
    clock?.pause();
    try {
      const context = lane.context;
      const decision =
        context?.kind === 'direct_user'
          ? 'allow'
          : context
            ? await this.#authorization.authorize(request, context)
            : 'cancel';
      return generation === lane.generation &&
        lane.progress === progress &&
        !lane.signal?.aborted
        ? decision
        : 'cancel';
    } catch (error) {
      // Never let an application-side approval failure cross the native FFI callback.
      // The driver must fail closed with a normal cancellation that the UI can explain.
      console.error(
        `[sia:cua-authorization] ${error instanceof Error ? error.message : 'Approval callback failed.'}`,
      );
      return 'cancel';
    } finally {
      if (progress) progress.completed++;
      clock?.resume();
    }
  }

  #retireDriver(lane: DriverLane, driver: DriverLike): void {
    if (lane.driver !== driver) return;
    lane.driver = undefined;
    lane.generation++;
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
