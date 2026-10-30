import { randomUUID } from 'node:crypto';
import { actionExecutionId } from './action-execution.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import {
  actionResult,
  classifyFailure,
  inputWasRefused,
  refused,
  resultRefusal,
  stale,
  terminalWithoutVerification,
} from './action-results.js';
import { BrowserActions } from './browser-actions.js';
import { browserUrlLooksSensitive, safeHttpUrl, samePageUrl } from './browser-urls.js';
import { ComputerInventory } from './computer-inventory.js';
import type { ComputerWindowBinding } from './computer-grants.js';
import { ActionBackendContext } from './context.js';
import {
  asRecord,
  collectTabRecords,
  firstBoolean,
  firstString,
  redactOptionalText,
} from './driver-records.js';

const CHROMIUM = new Set([
  'bundle:com.google.chrome',
  'bundle:com.microsoft.edgemac',
  'bundle:com.brave.browser',
]);
const START_PAGES = new Set([
  'about:blank',
  'chrome://newtab',
  'chrome://newtab/',
  'chrome://new-tab-page',
  'chrome://new-tab-page/',
  'chrome://whats-new',
  'chrome://whats-new/',
  'edge://newtab',
  'edge://newtab/',
  'brave://newtab',
  'brave://newtab/',
]);

interface Tab {
  id: string;
  nativeId: string;
  targetId: string;
  window: ComputerWindowBinding;
  session: string;
  url: string;
  title?: string;
  active: boolean;
  navigationOnly: boolean;
}

/** Chromium's browser adapter observes tabs without selecting them or relying on off-Space AX. */
export class MacBrowserControl {
  readonly #clients = new Map<
    string,
    { context: ActionBackendContext; actions: BrowserActions; session: string }
  >();
  readonly #tabs = new Map<string, Tab>();
  readonly #snapshots = new Map<string, Tab>();
  readonly #preparationAttempted = new Set<string>();
  #turn = '';
  #connection: { pid: number; windowId: number; session: string } | undefined;
  #generation = 0;

  constructor(
    private readonly ctx: ActionBackendContext,
    private readonly inventory: ComputerInventory,
  ) {}

  /** Only the trusted connection picker may supply this exact-window grant. */
  connect(connection: { pid: number; windowId: number; session: string }): void {
    this.disconnect();
    this.#connection = connection;
  }

  disconnect(): void {
    this.#generation++;
    this.#connection = undefined;
    for (const [id, tab] of this.#snapshots) {
      this.ctx.computer.snapshots.delete(id);
      this.ctx.computer.latestSnapshot.delete(tab.window.id);
    }
    for (const client of this.#clients.values()) client.context.browser.reset();
    this.#clients.clear();
    this.#tabs.clear();
    this.#snapshots.clear();
    this.#preparationAttempted.clear();
  }

  #client(window: ComputerWindowBinding) {
    // The host's exact browser connection outlives an individual task. Public window,
    // tab and input refs still rotate each turn; only the driver's profile grant is reused.
    const key = `${window.pid}:${window.windowId}`;
    const existing = this.#clients.get(key);
    if (existing) return existing;
    const connection = this.#connection;
    const session =
      connection?.pid === window.pid && connection.windowId === window.windowId
        ? connection.session
        : `sia-mac-browser-${randomUUID()}`;
    const context = new ActionBackendContext({
      ...this.ctx.options,
      macBrowserAccess: () => false,
      isBrowserOriginAllowed: () => true,
      browserSessionId: session,
      cua: {
        call: (tool, args, authorization, signal) => {
          return this.ctx.options.cua.call(
            tool,
            args,
            authorization.kind === 'turn'
              ? { ...authorization, backgroundTargetPid: window.pid }
              : authorization,
            signal,
          );
        },
      },
    });
    const client = {
      context,
      actions: new BrowserActions(context, new ComputerInventory(context)),
      session,
    };
    this.#clients.set(key, client);
    if (this.#clients.size > 128) {
      const oldest = this.#clients.keys().next().value!;
      this.#clients.get(oldest)?.context.browser.reset();
      this.#clients.delete(oldest);
    }
    return client;
  }

  supports(window: ComputerWindowBinding | undefined): window is ComputerWindowBinding {
    return Boolean(
      window &&
      this.ctx.macBrowserAccess() &&
      this.ctx.macBackgroundControl() &&
      CHROMIUM.has(this.ctx.computer.apps.get(window.appId)?.identity ?? ''),
    );
  }

  #begin(request: ValidatedActionInvocation): void {
    const key = JSON.stringify([
      request.context.sessionId,
      request.context.threadId,
      request.context.turnId,
      actionExecutionId(request.context),
    ]);
    if (key === this.#turn) return;
    this.#turn = key;
    for (const client of this.#clients.values()) client.context.browser.reset();
    this.#tabs.clear();
    this.#snapshots.clear();
    this.#preparationAttempted.clear();
  }

  async #read(
    window: ComputerWindowBinding,
    request: ValidatedActionInvocation,
    prepare: boolean,
    refresh = false,
  ): Promise<ActionExecutionResult | Tab[]> {
    this.#begin(request);
    if (refresh) {
      // Explicit discovery replaces the window binding so newly opened/closed tabs
      // are reflected. Old choices and input refs cannot survive that replacement.
      this.#revoke(window);
      this.#client(window).context.browser.reset();
      for (const [id, tab] of this.#tabs)
        if (tab.window.id === window.id) this.#tabs.delete(id);
    }
    // Keep each exact window's native authority separate, even inside one Chrome process.
    let session = this.#client(window).session;
    // Bind mode mints new opaque driver ids on each call. Rebinding while presenting a
    // tab choice would revoke the very ids the person/model is choosing. Keep the
    // turn's exact window binding; every content read still revalidates the pinned tab.
    const bound = [...this.#tabs.values()].filter(
      (tab) => tab.window.id === window.id && tab.session === session,
    );
    if (bound.length) return bound;
    let args = { pid: window.pid, window_id: window.windowId, session };
    let raw: unknown;
    let failure: ActionExecutionResult | undefined;
    const inspect = async () => {
      try {
        raw = await this.#client(window).context.callCua(request, 'get_browser_state', args);
        failure = resultRefusal(raw);
      } catch (error) {
        failure = classifyFailure(error);
      }
    };
    const generation = this.#generation;
    await inspect();
    if (generation !== this.#generation) return stale('The browser connection changed.');
    if (
      (prepare || this.#connection?.session === session) &&
      /\bsession_ended\b/.test(`${failure?.reason ?? ''} ${failure?.summary ?? ''}`)
    ) {
      // Only an acting website-open request may request fresh authority after expiry.
      // The ended session is discarded, never revived, and no input is replayed.
      this.#expire(window, session);
      if (generation !== this.#generation)
        return stale('Reconnect the chosen Chrome window in Settings → Connections.');
      session = this.#client(window).session;
      args = { pid: window.pid, window_id: window.windowId, session };
      await inspect();
    }
    if (
      failure &&
      prepare &&
      !this.#preparationAttempted.has(window.id) &&
      /\bbrowser_(?:consent_required|requires_setup)\b/.test(
        `${failure.summary} ${failure.reason ?? ''}`,
      )
    ) {
      this.#preparationAttempted.add(window.id);
      const prepared = await this.#client(window).context.callCua(request, 'browser_prepare', {
        ...args,
        strategy: { kind: 'existing_profile' },
        delivery_mode: 'background',
      });
      const outcome = actionResult(prepared, 'Prepared background browser access.');
      if (terminalWithoutVerification(outcome)) return outcome;
      raw = await this.#client(window).context.callCua(request, 'get_browser_state', args);
      failure = resultRefusal(raw);
    }
    if (generation !== this.#generation) return stale('The browser connection changed.');
    if (failure)
      return {
        ...failure,
        summary:
          'The dedicated background browser route is not ready. This does not establish that the website needs sign-in.',
        data: {
          app_id: window.appId,
          window_id: window.id,
          blocker_code: 'background_browser_unavailable',
          next_step: this.#preparationAttempted.has(window.id)
            ? 'Background setup was already attempted for this window. Do not repeat setup. If Chrome shows its own permission prompt, the person must review it; Sia must not approve it. This is browser access, not website sign-out. Never fall back to native off-Space input or foreground control.'
            : 'Use computer_open_url with prepare_only:true, this exact app_id and window_id, and the ordinary website needed for the task. That acting tool can restore browser access and list existing tabs without navigating. Never fall back to native off-Space browser input or foreground control.',
        },
      };
    const current: Tab[] = [];
    const indexed = new Set<string>();
    const records = collectTabRecords(raw);
    for (const record of records) {
      if (firstBoolean(record, ['private', 'incognito', 'is_private'])) continue;
      const targetId = firstString(record, ['target_id', 'targetId']);
      const nativeId = firstString(record, ['tab_id', 'tabId']);
      const url = firstString(record, ['url']);
      if (!targetId || !nativeId || !url) continue;
      const key = JSON.stringify([targetId, nativeId]);
      if (indexed.has(key)) continue;
      indexed.add(key);
      const navigationOnly = START_PAGES.has(url.toLowerCase());
      if (!navigationOnly && (!safeHttpUrl(url) || browserUrlLooksSensitive(url))) continue;
      const previous = [...this.#tabs.values()].find(
        (t) =>
          t.window.id === window.id &&
          t.nativeId === nativeId &&
          t.targetId === targetId &&
          t.session === session,
      );
      const title = navigationOnly
        ? 'Browser start page'
        : firstString(record, ['title', 'name']);
      const tab: Tab = {
        id: previous?.id ?? `mac-tab:${randomUUID()}`,
        nativeId,
        targetId,
        window,
        session,
        url,
        active: firstBoolean(record, ['active', 'selected']) === true,
        navigationOnly,
        ...(title ? { title } : {}),
      };
      this.#tabs.set(tab.id, tab);
      current.push(tab);
    }
    // Never retain closed tabs as authority. Multiple windows can share this turn.
    for (const [id, tab] of this.#tabs)
      if (tab.window.id === window.id && !current.some((t) => t.id === id))
        this.#tabs.delete(id);
    for (const tab of current)
      this.#client(window).context.browser.bindings.set(tab.nativeId, {
        targetId: tab.targetId,
        tabId: tab.nativeId,
        session: tab.session,
        ...(!tab.navigationOnly ? { origin: new URL(tab.url).origin } : {}),
      });
    return current;
  }

  #choose(tabs: Tab[], request: ValidatedActionInvocation): Tab | undefined {
    if (request.arguments.tab_id) return tabs.find((t) => t.id === request.arguments.tab_id);
    const expected =
      typeof request.arguments.expected_url === 'string'
        ? request.arguments.expected_url
        : undefined;
    if (expected) {
      const matches = tabs.filter((t) => samePageUrl(t.url, expected));
      return matches.length === 1 ? matches[0] : undefined;
    }
    return tabs.length === 1 ? tabs[0] : tabs.find((t) => t.active);
  }

  #selection(window: ComputerWindowBinding, tabs: Tab[]): ActionExecutionResult {
    return {
      outcome: 'accepted_unverified',
      summary: 'Choose the exact permitted tab for this task before reading or navigating.',
      data: {
        app_id: window.appId,
        window_id: window.id,
        browser_route: 'cua_browser',
        tabs: tabs.map((t) => ({
          tab_id: t.id,
          title: redactOptionalText(t.title),
          active: t.active,
          ...(t.navigationOnly
            ? { navigation_only: true }
            : { source_url: new URL(t.url).origin + new URL(t.url).pathname }),
        })),
        next_step: tabs.length
          ? 'Use its tab_id with computer_snapshot or computer_open_url. Tab metadata does not prove account identity.'
          : 'No ordinary website or safe browser start tab was available. Authentication, private and sensitive internal pages were not read; do not infer account absence.',
      },
    };
  }

  #wrap(
    window: ComputerWindowBinding,
    tab: Tab,
    result: ActionExecutionResult,
  ): ActionExecutionResult {
    if (result.reason === 'session_ended') this.#expire(window, tab.session);
    if (this.#clients.get(`${window.pid}:${window.windowId}`)?.session !== tab.session)
      return stale('The browser connection changed. Observe the chosen window again.');
    const data = asRecord(result.data);
    const snapshotId = typeof data?.snapshot_id === 'string' ? data.snapshot_id : undefined;
    const capability = snapshotId
      ? this.#client(window).context.browser.snapshots.get(snapshotId)
      : undefined;
    if (capability) {
      tab.url = capability.url;
      tab.navigationOnly = false;
      this.#snapshots.set(capability.id, tab);
      if (this.#snapshots.size > 128)
        this.#snapshots.delete(this.#snapshots.keys().next().value!);
      this.ctx.computer.rememberSnapshot({
        id: capability.id,
        capturedAt: Date.now(),
        appId: window.appId,
        publicWindowId: window.id,
        pid: window.pid,
        windowId: window.windowId,
        browserUrl: capability.url,
        protectedControls: false,
        elements: new Map(
          [...capability.elements].map(([ref, e]) => [
            ref,
            {
              token: e.nativeRef,
              ...(e.role ? { role: e.role } : {}),
              ...(e.label ? { label: e.label } : {}),
            },
          ]),
        ),
      });
    }
    return {
      ...result,
      data: {
        ...data,
        app_id: window.appId,
        window_id: window.id,
        tab_id: tab.id,
        app_name: this.ctx.computer.apps.get(window.appId)?.name,
        browser_route: 'cua_browser',
        ...(capability
          ? { source_url: new URL(capability.url).origin + new URL(capability.url).pathname }
          : {}),
        ...(typeof data?.text === 'string' ? { visible_text: data.text } : {}),
        pixel_actions_available: false,
      },
    };
  }

  async snapshot(
    window: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    // Revoke host input even when tab selection, validation or capture fails.
    // BrowserActions resolves any page continuation before revoking its own refs.
    this.ctx.computer.invalidateSnapshot(window.id);
    const wait = request.arguments.wait_ms;
    if (typeof wait === 'number' && wait > 0)
      await delay(Math.min(3000, wait), undefined, { signal: request.context.signal });
    if (!(await this.inventory.windowStillValid(window, request)))
      return stale('The browser window changed.');
    const tabs = await this.#read(window, request, false, request.arguments.tabs_only === true);
    if (!Array.isArray(tabs)) return tabs;
    if (request.arguments.tabs_only === true) return this.#selection(window, tabs);
    const tab = this.#choose(tabs, request);
    if (!tab || tab.navigationOnly) return this.#selection(window, tabs);
    let result: ActionExecutionResult;
    try {
      result = await this.#client(window).actions.snapshot({
        ...request,
        name: 'browser_snapshot',
        arguments: {
          tab_id: tab.nativeId,
          ...(request.arguments.read_links === true ? { read_links: true } : {}),
          ...(request.arguments.continue_from
            ? { continue_from: request.arguments.continue_from }
            : {}),
          ...(request.arguments.include_image !== undefined
            ? { include_image: request.arguments.include_image }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof Error && /\bsession_ended\b/.test(error.message))
        this.#expire(window, tab.session);
      return classifyFailure(error);
    }
    const id = asRecord(result.data)?.snapshot_id;
    const captured =
      typeof id === 'string'
        ? this.#client(window).context.browser.snapshots.get(id)
        : undefined;
    if (
      typeof request.arguments.expected_url === 'string' &&
      captured &&
      !samePageUrl(captured.url, request.arguments.expected_url)
    ) {
      this.#client(window).context.browser.snapshots.delete(captured.id);
      return stale(
        'The browser navigated during observation; no page content was returned for the expected URL.',
      );
    }
    if (asRecord(result.data)?.observed_authentication === true) this.#revoke(window);
    return this.#wrap(window, tab, result);
  }

  async openUrl(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const value = String(request.arguments.url ?? '');
    const url = safeHttpUrl(value);
    if (!url || browserUrlLooksSensitive(url))
      return {
        outcome: 'refused',
        summary:
          'Only ordinary HTTP(S) destinations are permitted. No page was opened or inspected; this does not establish a sign-in requirement.',
        data: { blocker_code: 'url_policy_blocked', observed_authentication: false },
      };
    let window = this.ctx.computer.resolveWindow(
      String(request.arguments.app_id ?? ''),
      String(request.arguments.window_id ?? ''),
    );
    if (!window && (request.arguments.app_id || request.arguments.window_id))
      return stale('Select the current exact browser app and window.');
    if (!window) {
      if (!this.ctx.computer.windows.size) await this.inventory.list(request);
      const candidates = [...this.ctx.computer.windows.values()].filter((w) =>
        this.supports(w),
      );
      if (candidates.length === 1) window = candidates[0];
    }
    if (!this.supports(window))
      return {
        outcome: 'needs_foreground',
        summary:
          'No single supported background browser window was selected. No app was opened.',
        data: {
          blocker_code: 'background_browser_target_required',
          next_step:
            'Use computer_list and pass an exact existing Chromium app_id and window_id. Safari retains its native window controls. Do not use an OS opener or assume a default profile.',
        },
      };
    if (!(await this.inventory.windowStillValid(window, request)))
      return stale('The browser window changed.');
    const tabs = await this.#read(
      window,
      request,
      true,
      request.arguments.prepare_only === true,
    );
    if (!Array.isArray(tabs)) return tabs;
    if (request.arguments.prepare_only === true) {
      this.#revoke(window);
      return this.#selection(window, tabs);
    }
    const reusable = tabs.filter((t) => t.navigationOnly || samePageUrl(t.url, url));
    const tab = request.arguments.tab_id
      ? this.#choose(tabs, request)
      : reusable.length === 1
        ? reusable[0]
        : undefined;
    if (!tab) return this.#selection(window, tabs);
    if (samePageUrl(tab.url, url))
      return this.snapshot(window, {
        ...request,
        name: 'computer_snapshot',
        arguments: {
          app_id: window.appId,
          window_id: window.id,
          tab_id: tab.id,
          expected_url: url,
        },
      });
    this.#revoke(window);
    let raw: unknown;
    try {
      raw = await this.#client(window).context.callCua(request, 'browser_navigate', {
        session: tab.session,
        target_id: tab.targetId,
        tab_id: tab.nativeId,
        url,
      });
    } catch (error) {
      return this.#deliveryFailure(window, error, tab.session);
    }
    if (this.#clients.get(`${window.pid}:${window.windowId}`)?.session !== tab.session)
      return stale('The browser connection changed during navigation. Do not replay it.');
    const outcome = actionResult(raw, 'Background browser navigation was accepted.');
    if (terminalWithoutVerification(outcome)) return outcome;
    this.#client(window).context.browser.bindings.set(tab.nativeId, {
      targetId: tab.targetId,
      tabId: tab.nativeId,
      session: tab.session,
      origin: new URL(url).origin,
    });
    let observed: ActionExecutionResult;
    try {
      observed = await this.#client(window).actions.snapshot({
        ...request,
        name: 'browser_snapshot',
        arguments: { tab_id: tab.nativeId },
      });
    } catch {
      return this.#unobservedNavigation(window, undefined, tab.id);
    }
    if (observed.outcome !== 'verified')
      return this.#unobservedNavigation(window, observed, tab.id);
    const snapshotId = asRecord(observed.data)?.snapshot_id;
    const captured =
      typeof snapshotId === 'string'
        ? this.#client(window).context.browser.snapshots.get(snapshotId)
        : undefined;
    if (!captured || !samePageUrl(captured.url, url)) {
      if (captured) {
        this.#client(window).context.browser.snapshots.delete(captured.id);
        this.#client(window).context.browser.latestSnapshot.delete(captured.tabId);
      }
      return {
        ...this.#unobservedNavigation(window, undefined, tab.id),
        summary:
          'Navigation was accepted, but the observed page is not the requested destination yet. No mismatched page content was returned. Observe this exact tab again and verify any redirect; do not navigate again blindly.',
      };
    }
    return this.#wrap(window, tab, observed);
  }

  #unobservedNavigation(
    window: ComputerWindowBinding,
    observed?: ActionExecutionResult,
    tabId?: string,
  ): ActionExecutionResult {
    const authentication = asRecord(observed?.data)?.observed_authentication === true;
    return {
      outcome: 'accepted_unverified',
      summary: authentication
        ? 'Browser navigation reached a protected sign-in page. The person must complete sign-in; no form controls or screenshots were returned. The requested account task remains incomplete.'
        : 'Browser navigation was accepted, but the resulting page could not be observed. Check the exact tab before continuing; do not claim the destination loaded or replay navigation blindly.',
      data: {
        app_id: window.appId,
        window_id: window.id,
        ...(tabId ? { tab_id: tabId } : {}),
        input_delivery_uncertain: true,
        next_step: authentication
          ? 'The person completes sign-in in this browser; leave the protected page untouched.'
          : 'Use computer_snapshot with these app/window/tab ids and wait_ms:500. Verify the live page and any redirect before continuing; do not repeat navigation blindly.',
        ...(authentication
          ? { observed_authentication: true, blocker_code: 'authentication_surface' }
          : {}),
      },
    };
  }

  async act(
    window: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    this.#begin(request);
    if (!(await this.inventory.windowStillValid(window, request)))
      return stale('The browser window changed.');
    const id = String(request.arguments.snapshot_id ?? '');
    const tab = this.#snapshots.get(id);
    if (
      !tab ||
      tab.window.id !== window.id ||
      this.ctx.computer.latestSnapshot.get(window.id) !== id
    )
      return stale(
        'The browser snapshot is missing, superseded, or belongs to another window.',
      );
    if (request.arguments.delivery === 'foreground')
      return refused('This browser route stays in the background.');
    const action = String(request.arguments.action);
    if (
      !['click', 'type', 'set', 'scroll'].includes(action) ||
      request.arguments.count === 2 ||
      (request.arguments.button && request.arguments.button !== 'left')
    )
      return refused(
        'Use an observed browser control for this step. This background browser route supports element clicks, text entry and scrolling; it does not send native keys or pointer input.',
      );
    const args = {
      tab_id: tab.nativeId,
      snapshot_id: id,
      action: action === 'set' ? 'type' : action,
      ...(request.arguments.element_ref ? { element_ref: request.arguments.element_ref } : {}),
      ...(typeof request.arguments.text === 'string' ? { text: request.arguments.text } : {}),
      ...(action === 'set' ? { replace: true } : {}),
      ...(request.arguments.direction ? { direction: request.arguments.direction } : {}),
      ...(typeof request.arguments.amount === 'number'
        ? { amount: request.arguments.amount }
        : {}),
    };
    let result: ActionExecutionResult;
    try {
      result = await this.#client(window).actions.act({
        ...request,
        name: 'browser_action',
        arguments: args,
      });
    } catch (error) {
      result = this.#deliveryFailure(window, error, tab.session);
    }
    // Every browser mutation consumes the previous target, even when delivery is uncertain.
    this.#snapshots.delete(id);
    this.#client(window).context.browser.snapshots.delete(id);
    this.ctx.computer.snapshots.delete(id);
    if (this.ctx.computer.latestSnapshot.get(window.id) === id)
      this.ctx.computer.latestSnapshot.delete(window.id);
    return this.#wrap(window, tab, result);
  }

  #revoke(window: ComputerWindowBinding): void {
    for (const [id, tab] of this.#snapshots)
      if (tab.window.id === window.id) {
        this.#snapshots.delete(id);
        this.#client(window).context.browser.snapshots.delete(id);
        this.ctx.computer.snapshots.delete(id);
      }
    this.ctx.computer.latestSnapshot.delete(window.id);
  }

  #deliveryFailure(
    window: ComputerWindowBinding,
    error: unknown,
    session: string,
  ): ActionExecutionResult {
    if (error instanceof Error && /\bsession_ended\b/.test(error.message))
      this.#expire(window, session);
    if (inputWasRefused(error)) return classifyFailure(error);
    return {
      outcome: 'accepted_unverified',
      summary:
        'The browser may have received the action, but its acknowledgement was lost. Inspect the exact tab and semantic result before continuing; do not replay the action.',
      data: { app_id: window.appId, window_id: window.id, input_delivery_uncertain: true },
    };
  }

  #expire(window: ComputerWindowBinding, session: string): void {
    const key = `${window.pid}:${window.windowId}`;
    if (this.#clients.get(key)?.session !== session) return;
    if (this.#connection?.session === session) {
      this.disconnect();
      this.ctx.options.onBrowserSessionEnded?.(session);
      return;
    }
    this.#revoke(window);
    this.#clients.get(key)?.context.browser.reset();
    this.#clients.delete(key);
    for (const [id, tab] of this.#tabs) if (tab.window.id === window.id) this.#tabs.delete(id);
    this.#preparationAttempted.delete(window.id);
  }
}
