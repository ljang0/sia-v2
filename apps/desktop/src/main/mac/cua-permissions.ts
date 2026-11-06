import type { ComputerPermissionsView as ComputerView } from '../../shared/bridge.js';
import { isCuaCallResult } from './cua-results.js';

type AccessVerification = 'confirmed' | 'unconfirmed' | 'failed' | 'needs_capture_consent';

export type CorePermission = 'accessibility' | 'screenRecording';
export interface CorePermissionStatus {
  accessibility: boolean;
  screenRecording: boolean;
}

export interface CuaPermissionOptions {
  readonly fakePermissions?: boolean;
  readonly platform?: NodeJS.Platform;
  /** Test seam for this process's TCC view; production reads the driver. */
  readonly readPermissions?: () => Promise<CorePermissionStatus>;
  /** A fresh process can observe grants that need an app relaunch to take effect. */
  readonly freshPermissions?: () => Promise<CorePermissionStatus | undefined>;
  /** Exclude Sia's own windows from the functional access check. */
  readonly hostPid?: number;
  readonly verifyAccess?: boolean;
}

/** OS permission setup; task execution cannot request grants through this collaborator. */
export class CuaPermissions {
  readonly #fakePermissions: boolean;
  readonly #platform: NodeJS.Platform;
  readonly #readPermissions: () => Promise<CorePermissionStatus>;
  readonly #freshPermissions: CuaPermissionOptions['freshPermissions'];
  #permissionRequest: Promise<ComputerView> | undefined;
  #verification:
    | { result: 'confirmed' | 'unconfirmed' }
    | { result: 'failed' | 'needs_capture_consent'; checkedAt: number }
    | undefined;
  #verifying: Promise<AccessVerification> | undefined;
  readonly #hostPid: number;
  readonly #verifyAccessEnabled: boolean;

  constructor(
    private readonly callAccess: (
      tool: 'list_windows' | 'get_window_state',
      args: Record<string, unknown>,
      signal: AbortSignal,
    ) => Promise<unknown>,
    options: CuaPermissionOptions,
  ) {
    this.#fakePermissions = options.fakePermissions ?? false;
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
        if (verified === 'needs_capture_consent')
          return {
            status: 'needs_permission',
            accessibility,
            screenRecording,
            captureConsentRequired: true,
            verified: 'failed',
            detail:
              'Finish See your screen in Settings → Computer. macOS needs one more approval for Sia to capture app windows directly.',
          };
        return {
          status: 'ready',
          accessibility,
          screenRecording,
          verified,
          ...(verified === 'failed'
            ? {
                detail:
                  'Mac access is allowed, but Sia could not verify screen access with the available window. Try your task; if it cannot continue, Sia will explain the specific issue. Your permissions have not been reset.',
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
    if (
      this.#verification?.result === 'failed' ||
      this.#verification?.result === 'needs_capture_consent'
    )
      this.#verification = undefined;
    const current = await this.permissions();
    if (current.status === 'ready' || current.status === 'unavailable') return current;
    const missing = (name: CorePermission) =>
      (!current[name] ||
        (name === 'screenRecording' && current.captureConsentRequired === true)) &&
      !current.relaunchFor?.includes(name);
    const target = permission ?? (['accessibility', 'screenRecording'] as const).find(missing);
    if (this.#platform === 'darwin' && target && missing(target)) {
      const { systemPreferences, shell, desktopCapturer } = await import('electron');
      // Request one permission at a time. Opening Screen Recording while the
      // Accessibility prompt is still pending hides the first step on macOS.
      if (target === 'accessibility') {
        // macOS shows its prompt only the first time an app asks; an app already listed (but
        // off) gets no prompt at all. Always open the Accessibility pane too, so there is
        // something to act on either way.
        systemPreferences.isTrustedAccessibilityClient(true);
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
        this.#verification = undefined;
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
  #verifyAccess(): Promise<AccessVerification> {
    const cached = this.#verification;
    if (cached?.result === 'confirmed' || cached?.result === 'unconfirmed')
      return Promise.resolve(cached.result);
    if (
      cached &&
      'checkedAt' in cached &&
      Date.now() - cached.checkedAt < (cached.result === 'failed' ? 15_000 : 2_000)
    )
      return Promise.resolve(cached.result);
    this.#verifying ??= this.#runAccessCheck()
      .then((result) => {
        this.#verification =
          result === 'failed' || result === 'needs_capture_consent'
            ? { result, checkedAt: Date.now() }
            : { result };
        return result;
      })
      .finally(() => {
        this.#verifying = undefined;
      });
    return this.#verifying;
  }

  async #runAccessCheck(): Promise<AccessVerification> {
    const signal = AbortSignal.timeout(10_000);
    try {
      const windows = findWindows(
        await this.callAccess('list_windows', { on_screen_only: true }, signal),
      ).filter(({ pid }) => pid !== this.#hostPid);
      // Finder is always running and holds no secure fields; prefer it when visible.
      const target =
        windows.find(({ appName }) => appName === 'Finder') ?? windows.find(() => true);
      if (!target) return 'unconfirmed';
      const state = await this.callAccess(
        'get_window_state',
        { pid: target.pid, window_id: target.windowId, include_screenshot: true },
        signal,
      );
      const value = isCuaCallResult(state) ? state.value : state;
      if (typeof value === 'object' && value !== null && 'screenshot_error' in value) {
        const error = value.screenshot_error;
        if (
          typeof error === 'object' &&
          error !== null &&
          'reason' in error &&
          typeof error.reason === 'string' &&
          error.reason.startsWith('direct_capture_consent_required:')
        )
          return 'needs_capture_consent';
      }
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
