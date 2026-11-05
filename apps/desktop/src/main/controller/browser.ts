import { randomUUID } from 'node:crypto';
import type {
  BridgeRequestMap,
  BrowserWindowView,
  DesktopSnapshot,
} from '../../shared/bridge.js';
import {
  browserAttachmentError,
  chromeDebugPortOwnerPid,
  chromeProcessStartedAt,
  collectHttpOrigins,
  directBrowserUrl,
  findBrowserTarget,
  findChromeCandidates,
  preferredChromeWindows,
} from '../mac/chrome-discovery.js';
import type { ControllerContext } from './context.js';
import { resultRefusal } from '../actions/action-results.js';
import type { PersistedState } from './persisted-state.js';

type BrowserSelection = NonNullable<PersistedState['browserSelection']>;

/** The parts of the controller context BrowserSession uses. */
type BrowserSessionContext = Pick<
  ControllerContext,
  | 'browserCapabilitySink'
  | 'commit'
  | 'computerAccess'
  | 'deps'
  | 'requireSignedInReleaseAccount'
  | 'requireThread'
  | 'resultSnapshot'
  | 'state'
  | 'turns'
>;

/**
 * Signed-in Chrome for browser actions: attaching, opening pages, the origins actions may use,
 * and continuing a turn once the browser is connected.
 */
export class BrowserSession {
  target: { targetId: string; tabId: string } | undefined;
  sessionId: string | undefined;
  private readonly continuations = new Set<string>();
  private autoAttach: Promise<void> | undefined;
  private reconnectRequired = false;

  constructor(private readonly ctx: BrowserSessionContext) {}

  /** Restore the person's exact choice while the visible app is still starting. */
  async restoreOnOpen(isForeground: () => Promise<boolean>): Promise<void> {
    if (
      this.ctx.computerAccess.accessMode() !== 'mac' ||
      this.ctx.computerAccess.trust() !== 'auto' ||
      this.ctx.state.browser.status === 'attached' ||
      this.ctx.state.browser.status === 'attaching' ||
      this.ctx.turns.running.size ||
      this.ctx.turns.queued.length
    )
      return;
    const selection = this.ctx.state.browserSelection;
    if (!selection || !(await this.preferredWindowForActions()) || !(await isForeground()))
      return;
    try {
      this.ctx.requireSignedInReleaseAccount();
      await this.attachBrowser(
        { windowId: selection.windowId },
        { restore: { selection, isForeground } },
      );
    } catch {
      // Keep the app usable if the browser closed or startup focus changed.
      // attachBrowser retains its visible error and never starts a task here.
    }
  }

  /** A live, previously chosen target, not permission to read or act on it. */
  async preferredWindowForActions(): Promise<{ pid: number; windowId: number } | undefined> {
    const selection = this.ctx.state.browserSelection;
    if (!selection || this.ctx.state.browser.status === 'attaching') return undefined;
    const startedAt = await chromeProcessStartedAt(this.ctx.deps.runCommand, selection.pid);
    if (this.ctx.state.browserSelection !== selection || !startedAt) return undefined;
    if (startedAt !== selection.processStartedAt) {
      delete this.ctx.state.browserSelection;
      this.ctx.commit();
      return undefined;
    }
    return { pid: selection.pid, windowId: selection.windowId };
  }

  /** Any HTTP(S) origin is allowed while trusted; otherwise only origins granted at attach. */
  isBrowserOriginAllowed(origin: string): boolean {
    if (this.ctx.state.browser.grantedOrigins.includes(origin)) return true;
    return (
      this.ctx.computerAccess.trust() === 'auto' && /^https?:$/.test(new URL(origin).protocol)
    );
  }

  /**
   * In trusted mode the model does not need the person to pick a Chrome window first: the
   * frontmost visible window is attached on demand the first time a browser tool runs.
   */
  private async chromeDebugOwnerPid(): Promise<number | undefined> {
    return chromeDebugPortOwnerPid(this.ctx.deps.runCommand);
  }

  async ensureBrowserAttachedForActions(): Promise<string | undefined> {
    if (this.ctx.computerAccess.accessMode() === 'mac')
      return 'Use my Mac is enabled. Use the computer tools to observe screenshots and act in the chosen window. If Chrome needs a connection, use its connection recovery control.';
    if (this.reconnectRequired) return this.ctx.state.browser.detail;
    if (this.ctx.computerAccess.trust() !== 'auto')
      return 'No Chrome window is connected. Sia shows a Connect Chrome & continue control below this response. Ask the user to choose their window there; they do not need to repeat the request.';
    if (this.ctx.state.browser.status === 'attached' && this.sessionId) return undefined;
    if (!this.autoAttach) {
      this.autoAttach = this.attachBrowser({}, { auto: true })
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          this.autoAttach = undefined;
        });
    }
    await this.autoAttach;
    return this.ctx.state.browser.status === 'attached'
      ? undefined
      : this.ctx.state.browser.detail;
  }

  browserSessionEnded(sessionId: string): void {
    if (this.sessionId !== sessionId) return;
    this.ctx.browserCapabilitySink?.resetBrowserCapabilities();
    this.target = undefined;
    this.sessionId = undefined;
    this.reconnectRequired = true;
    this.ctx.state.browser = {
      status: 'error',
      grantedOrigins: [],
      detail:
        'Chrome connection expired. Choose your window again in Settings → Connections to reconnect.',
    };
    this.ctx.commit();
  }

  async connectBrowserAndContinue(
    input: BridgeRequestMap['browser.connectAndContinue'],
  ): Promise<DesktopSnapshot> {
    const validate = () => {
      this.ctx.requireSignedInReleaseAccount();
      const thread = this.ctx.requireThread(input.threadId);
      const lastUser = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === thread.id && item.kind === 'user' && item.status !== 'pending',
      );
      if (thread.archivedAt || !lastUser || lastUser.id !== input.userMessageId)
        throw new Error(
          'This request changed. Return to the current conversation before continuing.',
        );
      if (
        this.ctx.turns.running.has(thread.id) ||
        this.ctx.turns.queued.some((turn) => turn.threadId === thread.id)
      )
        throw new Error(
          'Wait for the current response to finish before connecting and continuing.',
        );
      return lastUser;
    };
    const userMessage = validate();
    if (this.continuations.size)
      throw new Error('Chrome connection is already in progress for this request.');
    this.continuations.add(input.threadId);
    try {
      if (
        this.ctx.state.browser.status !== 'attached' ||
        !this.sessionId ||
        !this.ctx.state.browser.grantedOrigins.length ||
        this.ctx.state.timeline.some(
          (item) =>
            item.threadId === input.threadId &&
            item.turnId === userMessage.turnId &&
            item.browserRecovery,
        ) ||
        input.windowId !== undefined
      ) {
        await this.attachBrowser(
          input.windowId === undefined ? {} : { windowId: input.windowId },
        );
      }
      validate(); // Window selection may outlive a thread change, sign-out, or cancellation.
      if (this.ctx.state.browser.status !== 'attached') return this.ctx.resultSnapshot();
      if (!this.ctx.state.browser.grantedOrigins.length)
        throw new Error(
          'Chrome is connected. Open the website for this task in that window, then connect again to grant it.',
        );
      const thread = this.ctx.requireThread(input.threadId);
      const draft = thread.draft;
      this.ctx.turns.sendTurn({
        threadId: input.threadId,
        text:
          this.ctx.computerAccess.accessMode() === 'mac'
            ? 'Chrome is connected now. Continue my previous request using the current Mac computer route and the chosen window. Check what has already completed before taking further actions; do not replay completed input.'
            : 'Chrome is connected now. Continue my previous request using the browser tools. Check what has already completed before taking further actions.',
      });
      if (draft !== undefined) {
        thread.draft = draft;
        this.ctx.commit();
      }
      return this.ctx.resultSnapshot();
    } finally {
      this.continuations.delete(input.threadId);
    }
  }

  async attachBrowser(
    input: BridgeRequestMap['browser.attach'],
    options: {
      auto?: boolean;
      restore?: { selection: BrowserSelection; isForeground(): Promise<boolean> };
    } = {},
  ): Promise<DesktopSnapshot> {
    if (this.ctx.state.browser.status === 'attaching')
      throw new Error('Chrome connection is already in progress.');
    if (input.windowId !== undefined && !options.restore)
      delete this.ctx.state.browserSelection;
    this.target = undefined;
    this.sessionId = undefined;
    this.ctx.browserCapabilitySink?.resetBrowserCapabilities();
    let availableWindows = this.ctx.state.browser.availableWindows ?? [];
    this.ctx.state.browser = {
      status: 'attaching',
      grantedOrigins: [],
      ...(availableWindows.length ? { availableWindows } : {}),
    };
    this.ctx.commit();
    try {
      const directContext = { kind: 'direct_user', operation: 'browser_attach' } as const;
      const apps = await this.ctx.deps.computer.call('list_apps', {}, directContext);
      const candidates = findChromeCandidates(apps);
      if (!candidates.length) throw new Error('Open Chrome, then try attaching again.');
      // Prefer an existing endpoint's process when several Chrome instances coexist.
      // The driver still proves the exact process/window and owns endpoint discovery.
      const debugOwnerPid = await this.chromeDebugOwnerPid();
      const orderedCandidates = [...candidates].sort((left, right) => {
        const leftOwns = left.pid === debugOwnerPid ? 0 : 1;
        const rightOwns = right.pid === debugOwnerPid ? 0 : 1;
        return leftOwns - rightOwns;
      });
      const windowPairs: { pid: number; window: BrowserWindowView }[] = [];
      for (const candidate of orderedCandidates.slice(0, 3)) {
        const windows = await this.ctx.deps.computer.call(
          'list_windows',
          { pid: candidate.pid },
          directContext,
        );
        for (const window of preferredChromeWindows(windows)) {
          windowPairs.push({ pid: candidate.pid, window });
        }
      }
      windowPairs.forEach((pair, index) => {
        pair.window = { ...pair.window, label: `Chrome window ${index + 1}` };
      });
      availableWindows = windowPairs.map(({ window }) => window);
      if (!windowPairs.length) {
        throw new Error(
          'No visible Chrome window was found. Bring a Chrome window onto this Space (not minimized), then try again.',
        );
      }
      const explicitPair =
        input.windowId === undefined
          ? windowPairs.length === 1
            ? windowPairs[0]
            : undefined
          : windowPairs.find(
              ({ pid, window }) =>
                window.id === input.windowId &&
                (!options.restore || pid === options.restore.selection.pid),
            );
      // In trusted auto mode any candidate will do; a window the driver cannot
      // disambiguate is skipped in favour of the next one.
      const pairsToTry = explicitPair
        ? [explicitPair]
        : options.auto
          ? windowPairs.slice(0, 3)
          : [];
      if (!pairsToTry.length) {
        this.ctx.state.browser = {
          status: input.windowId === undefined ? 'detached' : 'error',
          grantedOrigins: [],
          availableWindows,
          detail:
            input.windowId === undefined
              ? 'Choose the signed-in Chrome window you want Sia to use.'
              : 'That Chrome window changed or closed. Choose one of the current windows.',
        };
        this.ctx.commit();
        return this.ctx.resultSnapshot();
      }
      let lastFailure: unknown;
      let attachedWindow: BrowserWindowView | undefined;
      for (const { pid: chromePid, window: candidate } of pairsToTry) {
        let restoringSession: string | undefined;
        try {
          if (options.restore) {
            const { selection, isForeground } = options.restore;
            if (
              this.ctx.state.browserSelection !== selection ||
              (await chromeProcessStartedAt(this.ctx.deps.runCommand, chromePid)) !==
                selection.processStartedAt ||
              !(await isForeground())
            )
              throw new Error(
                'Chrome restoration paused because the window or active app changed.',
              );
          }
          // CUA sessions are terminal after end_session. Minting a new opaque id for
          // every attachment lets a user detach and reattach without restarting Sia,
          // while resetBrowserCapabilities still revokes every prior model-visible ref.
          const browserSessionId = `sia-browser-${randomUUID()}`;
          if (options.restore) restoringSession = browserSessionId;
          let prepared: unknown;
          try {
            prepared = await this.ctx.deps.computer.call(
              'browser_prepare',
              {
                pid: chromePid,
                window_id: candidate.id,
                session: browserSessionId,
                strategy: { kind: 'existing_profile' },
                // The connection UI explains that Chrome may appear during setup.
                // Startup restoration is limited to the saved exact choice while Sia
                // is foreground and its composer is still behind startup readiness.
                // On-demand automatic task attachment never gains that permission.
                delivery_mode: options.auto ? 'background' : 'foreground',
              },
              directContext,
            );
          } finally {
            // Only direct setup may activate Chrome. Automatic/model attachment must never
            // change focus; explicit setup returns to Sia before any continuation can run.
            if (!options.auto)
              await this.ctx.deps.returnToAppAfterBrowserSetup?.(
                options.restore ? chromePid : undefined,
              );
          }
          const prepareFailure = resultRefusal(prepared);
          if (prepareFailure) throw new Error(prepareFailure.reason ?? prepareFailure.summary);
          const state = await this.ctx.deps.computer.call(
            'get_browser_state',
            {
              session: browserSessionId,
              pid: chromePid,
              window_id: candidate.id,
            },
            directContext,
          );
          const stateFailure = resultRefusal(state);
          if (stateFailure) throw new Error(stateFailure.reason ?? stateFailure.summary);
          if (options.restore) {
            this.ctx.requireSignedInReleaseAccount();
            if (this.ctx.state.browserSelection !== options.restore.selection)
              throw new Error('The saved Chrome selection changed during restoration.');
          }
          // browser_prepare can include transitional target ids while Chrome enables
          // and reconnects its existing-profile route. Only the follow-up live state
          // is safe to mint into model-visible browser capabilities.
          this.ctx.browserCapabilitySink?.acceptBrowserState(state, browserSessionId, {
            pid: chromePid,
            windowId: candidate.id,
          });
          this.target = findBrowserTarget([state, prepared]);
          this.sessionId = browserSessionId;
          if (!options.auto) {
            const processStartedAt = await chromeProcessStartedAt(
              this.ctx.deps.runCommand,
              chromePid,
            );
            if (processStartedAt)
              this.ctx.state.browserSelection = {
                pid: chromePid,
                windowId: candidate.id,
                processStartedAt,
              };
            else delete this.ctx.state.browserSelection;
          }
          const grantedOrigins = collectHttpOrigins([prepared, state]);
          this.ctx.state.browser = {
            status: 'attached',
            browser: 'Chrome',
            profileLabel: candidate.label,
            grantedOrigins,
            ...(grantedOrigins.length === 0
              ? { detail: 'Attached, but no HTTP or HTTPS tab is currently granted.' }
              : {}),
          };
          this.ctx.deps.trajectory?.record({
            type: 'browser_attached',
            threadId: this.ctx.state.activeThreadId ?? 'app',
            window: candidate.label,
            automatic: Boolean(options.auto || options.restore),
            grantedOrigins,
          });
          attachedWindow = candidate;
          this.reconnectRequired = false;
          break;
        } catch (candidateError) {
          if (restoringSession)
            await this.ctx.deps.computer
              .call(
                'end_session',
                { session: restoringSession },
                {
                  kind: 'direct_user',
                  operation: 'browser_detach',
                },
              )
              .catch(() => undefined);
          lastFailure = candidateError;
        }
      }
      if (!attachedWindow)
        throw lastFailure ?? new Error('No Chrome window could be attached.');
    } catch (error) {
      this.target = undefined;
      this.sessionId = undefined;
      const detail = browserAttachmentError(error);
      this.ctx.state.browser = {
        status: 'error',
        grantedOrigins: [],
        ...(availableWindows.length ? { availableWindows } : {}),
        detail,
      };
    }
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async openBrowserUrl(urlValue: string): Promise<DesktopSnapshot> {
    if (this.ctx.state.browser.status !== 'attached' || !this.target || !this.sessionId) {
      throw new Error('Attach a Chrome window before opening a site.');
    }
    const url = directBrowserUrl(urlValue);
    const context = { kind: 'direct_user', operation: 'browser_navigate' } as const;
    const target = this.target;
    const browserSessionId = this.sessionId;
    await this.ctx.deps.computer.call(
      'browser_navigate',
      {
        session: browserSessionId,
        target_id: target.targetId,
        tab_id: target.tabId,
        url: url.toString(),
      },
      context,
    );
    const state = await this.ctx.deps.computer.call(
      'get_browser_state',
      {
        session: browserSessionId,
        target_id: target.targetId,
        tab_id: target.tabId,
      },
      context,
    );
    this.ctx.browserCapabilitySink?.acceptBrowserState(state, browserSessionId);
    this.target = findBrowserTarget(state) ?? target;
    const grantedOrigins = collectHttpOrigins(state);
    if (!grantedOrigins.length) {
      throw new Error('Chrome opened the site, but did not return a usable web tab.');
    }
    this.ctx.state.browser = {
      status: 'attached',
      browser: this.ctx.state.browser.browser ?? 'Chrome',
      ...(this.ctx.state.browser.profileLabel
        ? { profileLabel: this.ctx.state.browser.profileLabel }
        : {}),
      grantedOrigins,
    };
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  async detachBrowser(): Promise<DesktopSnapshot> {
    delete this.ctx.state.browserSelection;
    try {
      if (this.sessionId) {
        await this.ctx.deps.computer.call(
          'end_session',
          { session: this.sessionId },
          { kind: 'direct_user', operation: 'browser_detach' },
        );
      }
    } catch {
      // A missing or already-ended CUA session is safely detached locally.
    }
    this.ctx.browserCapabilitySink?.resetBrowserCapabilities();
    this.target = undefined;
    this.sessionId = undefined;
    this.reconnectRequired = false;
    this.ctx.state.browser = { status: 'detached', grantedOrigins: [] };
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }
}
