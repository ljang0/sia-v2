import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import {
  actionImages,
  actionResult,
  refused,
  resultRefusal,
  stale,
  terminalWithoutVerification,
} from './action-results.js';
import { requiredEnum, requiredString } from './arguments.js';
import type { BrowserBinding, BrowserSnapshotCapability } from './browser-grants.js';
import { stageBrowserUploadFiles } from './browser-uploads.js';
import {
  browserRouteWasReplaced,
  browserUrlLooksSensitive,
  findBrowserLocation,
  modelVisibleBrowserUrl,
  originFromRecord,
  safeHttpUrl,
} from './browser-urls.js';
import type { ComputerInventory } from './computer-inventory.js';
import type { ActionBackendContext } from './context.js';
import {
  asRecord,
  collectTabRecords,
  compact,
  findElementRecords,
  findString,
  firstBoolean,
  firstString,
  isDefined,
  isProtectedElement,
  sanitizeElement,
  trustedDisplayText,
  trustedElementLabel,
} from './driver-records.js';

/**
 * Tabs, snapshots, navigation, input and uploads in the attached Chrome session. Every
 * mutation is bound to the tab's latest snapshot and its granted origin, then re-observed.
 */
export class BrowserActions {
  #lastAttachDetail: string | undefined;

  constructor(
    private readonly ctx: ActionBackendContext,
    private readonly inventory: ComputerInventory,
  ) {}

  async attachOnDemand(): Promise<void> {
    if (
      this.ctx.macBrowserAccess() ||
      this.ctx.browser.attached ||
      !this.ctx.options.ensureBrowserAttached
    )
      return;
    this.#lastAttachDetail = await this.ctx.options.ensureBrowserAttached();
  }

  async tabs(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (this.ctx.macBrowserAccess()) {
      const inventory = await this.inventory.list(request);
      return {
        ...inventory,
        summary:
          'Use my Mac is active: continue this task with the native browser windows below, using computer_snapshot and computer_action. Do not switch to an attached Chrome route or ask for Chrome attachment.',
        data: {
          ...asRecord(inventory.data),
          tabs: [],
          route: 'computer',
          next_step:
            'Use the existing browser window for this task. If the needed website is not open, use computer_open_url to open it in the default browser, then list and inspect its window.',
        },
      };
    }
    if (!this.ctx.browser.attached) {
      const detail =
        this.#lastAttachDetail ??
        'No browser attachment is active in the trusted desktop host.';
      return {
        outcome: 'refused',
        summary: `Browser access needs setup. ${detail} Chrome may still be running; report the attachment problem rather than concluding Chrome is closed.`,
        data: {
          tabs: [],
          attachment_problem: detail,
          recovery: {
            action: 'attach_browser',
            settings: 'Computer → Authenticated Chrome',
            instruction:
              'Use Connect Chrome & continue below this response. Choose the window with the required website open. Sia will continue this conversation after attachment; do not ask the user to repeat their task.',
          },
        },
        verification: {
          evidence: 'No browser attachment is active in the trusted desktop host.',
        },
      };
    }
    const states: unknown[] = [];
    for (const binding of this.ctx.browser.bindings.values()) {
      try {
        const state = await this.ctx.callCua(request, 'get_browser_state', {
          session: binding.session,
          target_id: binding.targetId,
          tab_id: binding.tabId,
        });
        const refusalResult = resultRefusal(state);
        if (refusalResult) return refusalResult;
        states.push(state);
      } catch (error) {
        // Chrome may replace or close one tab route while the granted window and
        // session remain valid. Drop only the driver's explicit stale-route
        // failures; authorization and all unrelated failures still fail closed.
        if (!browserRouteWasReplaced(error)) throw error;
      }
    }
    if (!states.length) {
      const state = await this.ctx.callCua(request, 'get_browser_state', {
        session: this.ctx.browser.sessionId,
      });
      const refusalResult = resultRefusal(state);
      if (refusalResult) return refusalResult;
      states.push(state);
    }
    this.ctx.browser.bindings.clear();
    this.ctx.browser.snapshots.clear();
    this.ctx.browser.latestSnapshot.clear();
    for (const state of states) this.ctx.browser.indexBindings(state);
    const records = states.flatMap(collectTabRecords);
    const tabs = records
      .filter((record) => !firstBoolean(record, ['private', 'incognito', 'is_private']))
      .map((record) => {
        const tabId = firstString(record, ['tab_id', 'tabId']);
        if (!tabId || !this.ctx.browser.bindings.has(tabId)) return undefined;
        const origin = originFromRecord(record);
        const url = safeHttpUrl(firstString(record, ['url']));
        if (
          !origin ||
          browserUrlLooksSensitive(url) ||
          (this.ctx.browser.hasOriginPolicy && !this.ctx.browser.originAllowed(origin))
        ) {
          return undefined;
        }
        return compact({
          tab_id: tabId,
          title: firstString(record, ['title', 'name']),
          url: modelVisibleBrowserUrl(url),
          active: firstBoolean(record, ['active', 'selected']),
        });
      })
      .filter(isDefined);
    return {
      outcome: 'verified',
      summary: `Found ${tabs.length} granted browser tab${tabs.length === 1 ? '' : 's'}.`,
      data: { tabs },
      verification: {
        evidence: 'Tab ids were minted by Cua Driver for the attached browser session.',
      },
    };
  }

  async snapshot(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const tabId = requiredString(request.arguments.tab_id, 'tab_id');
    const binding = await this.#requireBinding(tabId, request);
    if (!binding) return refused('The tab is not part of the attached browser grant.');
    if (binding.origin && !this.ctx.browser.bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    return this.#captureBrowser(binding, request);
  }

  async #captureBrowser(
    binding: BrowserBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    const raw = await this.ctx.callCua(request, 'get_browser_state', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      snapshot_format: 'semantic_v2',
      include_screenshot: true,
    });
    const refusalResult = resultRefusal(raw);
    if (refusalResult) return refusalResult;
    this.ctx.browser.indexBindings(raw);
    const location = findBrowserLocation(raw, binding.targetId, binding.tabId);
    const origin = location?.origin;
    if (origin) {
      binding.origin = origin;
      const indexedBinding = this.ctx.browser.bindings.get(binding.tabId);
      if (
        indexedBinding?.targetId === binding.targetId &&
        indexedBinding.session === binding.session
      ) {
        indexedBinding.origin = origin;
      }
    }
    const liveUrl = location?.url;
    if (
      !origin ||
      !liveUrl ||
      (binding.origin !== undefined && binding.origin !== origin) ||
      browserUrlLooksSensitive(liveUrl) ||
      (this.ctx.browser.hasOriginPolicy && !this.ctx.browser.originAllowed(origin))
    ) {
      return refused('The tab origin is outside the current browser grant.');
    }
    const snapshotId = randomUUID();
    const elementMap = new Map<string, { nativeRef: string; label?: string; role?: string }>();
    const elements = findElementRecords(raw, 'browser')
      .map((record, position) => {
        if (isProtectedElement(record)) return undefined;
        const nativeRef = firstString(record, ['ref', 'element_ref', 'elementRef']);
        if (!nativeRef) return undefined;
        const ref = `b:${snapshotId}:${position}`;
        const label = trustedElementLabel(record);
        const role = trustedDisplayText(firstString(record, ['role', 'type']));
        elementMap.set(ref, {
          nativeRef,
          ...(label ? { label } : {}),
          ...(role ? { role } : {}),
        });
        return sanitizeElement(record, ref);
      })
      .filter(isDefined);
    const capability: BrowserSnapshotCapability = {
      id: snapshotId,
      targetId: binding.targetId,
      tabId: binding.tabId,
      session: binding.session,
      origin,
      url: liveUrl,
      elements: elementMap,
    };
    this.ctx.browser.rememberSnapshot(capability);
    return {
      outcome: 'verified',
      summary: 'Captured fresh state for the granted browser tab.',
      ...actionImages(raw),
      data: compact({
        snapshot_id: snapshotId,
        tab_id: binding.tabId,
        origin,
        title: findString(raw, ['title']),
        url: modelVisibleBrowserUrl(liveUrl),
        elements,
        text: findString(raw, ['outline', 'text', 'page_text']),
      }),
      verification: {
        snapshotId,
        evidence: 'The snapshot and its refs are bound to the exact attached tab.',
      },
    };
  }

  async navigate(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const tabId = requiredString(args.tab_id, 'tab_id');
    const binding = await this.#revalidateBinding(tabId, request);
    if (!binding) return refused('The tab is not part of the attached browser grant.');
    const url = new URL(requiredString(args.url, 'url'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return refused('Only HTTP and HTTPS browser navigation is allowed.');
    }
    if (browserUrlLooksSensitive(url.toString())) {
      return refused('Authentication and credential-management pages are not browser targets.');
    }
    if (!this.ctx.browser.originAllowed(url.origin)) {
      return refused(`Navigation to ${url.origin} is outside the current browser grant.`);
    }
    const raw = await this.ctx.callCua(request, 'browser_navigate', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      url: url.toString(),
    });
    const native = actionResult(raw, `Navigation to ${url.origin} was accepted.`);
    if (terminalWithoutVerification(native)) return native;
    binding.origin = url.origin;
    return this.#withVerification(binding, native, request);
  }

  async act(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const capability = await this.ctx.browser.capability(args.tab_id, args.snapshot_id);
    if ('outcome' in capability) return capability;
    const binding = this.ctx.browser.bindings.get(capability.tabId);
    if (!binding) return stale('The browser binding expired.');
    if (!this.ctx.browser.bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    const originCheck = this.ctx.browser.checkDeclaredOrigin(binding, args.origin);
    if (originCheck) return originCheck;
    const nativeRef = this.ctx.browser.nativeRef(capability, args.element_ref);
    if (args.element_ref && !nativeRef)
      return stale('The element reference is not in this snapshot.');

    let tool: string;
    let input: Record<string, unknown>;
    const base = {
      session: capability.session,
      target_id: capability.targetId,
      tab_id: capability.tabId,
    };
    switch (args.action) {
      case 'click':
        if (!nativeRef)
          return refused(
            `browser_action ${String(args.action)} requires an exact element reference.`,
          );
        tool = 'browser_click';
        input = {
          ...base,
          ref: nativeRef,
          input_route: process.platform === 'darwin' ? 'dom_event' : 'trusted',
        };
        break;
      case 'type': {
        if (!nativeRef)
          return refused('browser_action type requires an exact element reference.');
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return refused('browser_action type requires text.');
        tool = 'browser_type';
        input = { ...base, ref: nativeRef, text, mode: 'insert_text', replace: false };
        break;
      }
      case 'scroll': {
        const direction = requiredEnum(
          args.direction,
          ['up', 'down', 'left', 'right'],
          'direction',
        );
        const amount = typeof args.amount === 'number' ? args.amount : 480;
        tool = 'browser_pointer';
        input = compact({
          ...base,
          action: 'scroll',
          input_route: 'trusted',
          ref: nativeRef,
          delta_x: direction === 'left' ? -amount : direction === 'right' ? amount : 0,
          delta_y: direction === 'up' ? -amount : direction === 'down' ? amount : 0,
        });
        break;
      }
      default:
        return refused('Unsupported browser action.');
    }
    const raw = await this.ctx.callCua(request, tool, input);
    const native = actionResult(
      raw,
      `Browser ${String(args.action)} was delivered in the background.`,
    );
    if (terminalWithoutVerification(native)) return native;
    return this.#withVerification(binding, native, request);
  }

  async upload(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const capability = await this.ctx.browser.capability(args.tab_id, args.snapshot_id);
    if ('outcome' in capability) return capability;
    const binding = this.ctx.browser.bindings.get(capability.tabId);
    if (!binding) return stale('The browser binding expired.');
    if (!this.ctx.browser.bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    const originCheck = this.ctx.browser.checkDeclaredOrigin(binding, args.origin);
    if (originCheck) return originCheck;
    const ref = this.ctx.browser.nativeRef(capability, args.element_ref);
    if (!ref) return stale('The upload element reference is not in this snapshot.');
    const staged = await stageBrowserUploadFiles(args.file_paths as string[]);
    let retained = false;
    try {
      const liveCapability = await this.ctx.browser.capability(args.tab_id, args.snapshot_id);
      if ('outcome' in liveCapability) return liveCapability;
      const raw = await this.ctx.callCua(request, 'browser_set_input_files', {
        session: liveCapability.session,
        target_id: liveCapability.targetId,
        tab_id: liveCapability.tabId,
        ref,
        files: staged.files,
      });
      const native = actionResult(
        raw,
        'The approved files were assigned to the exact file input.',
      );
      if (terminalWithoutVerification(native)) return native;
      this.ctx.browser.uploads.retain(staged.directory);
      retained = true;
      return this.#withVerification(binding, native, request);
    } finally {
      if (!retained) await rm(staged.directory, { recursive: true, force: true });
    }
  }

  async #withVerification(
    binding: BrowserBinding,
    native: ActionExecutionResult,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    const after = await this.#captureBrowser(binding, request);
    if (after.outcome !== 'verified') return after;
    return {
      outcome: native.outcome,
      summary:
        native.outcome === 'verified'
          ? `${native.summary} Fresh tab state was captured.`
          : `${native.summary} Inspect the fresh tab snapshot to confirm the postcondition.`,
      ...(after.images ? { images: after.images } : {}),
      data: { ...(asRecord(after.data) ?? {}), delivery: native.data },
      verification: compact({
        snapshotId: after.verification?.snapshotId,
        evidence:
          native.outcome === 'verified'
            ? 'Cua Driver confirmed delivery and Sia captured fresh tab state.'
            : 'Fresh tab state is available, but the requested semantic effect was not proven.',
      }),
    };
  }

  async #requireBinding(
    tabId: string,
    request: ValidatedActionInvocation,
  ): Promise<BrowserBinding | undefined> {
    const existing = this.ctx.browser.bindings.get(tabId);
    if (existing) return existing;
    const raw = await this.ctx.callCua(request, 'get_browser_state', {
      session: this.ctx.browser.sessionId,
      tab_id: tabId,
    });
    this.ctx.browser.indexBindings(raw);
    return this.ctx.browser.bindings.get(tabId);
  }

  async #revalidateBinding(
    tabId: string,
    request: ValidatedActionInvocation,
  ): Promise<BrowserBinding | undefined> {
    const binding = await this.#requireBinding(tabId, request);
    if (!binding) return undefined;
    const raw = await this.ctx.callCua(request, 'get_browser_state', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      include_screenshot: false,
    });
    if (resultRefusal(raw)) return undefined;
    this.ctx.browser.indexBindings(raw);
    const live = this.ctx.browser.bindings.get(tabId);
    const location = findBrowserLocation(raw, binding.targetId, binding.tabId);
    if (
      !live ||
      live.targetId !== binding.targetId ||
      !location ||
      browserUrlLooksSensitive(location.url) ||
      !this.ctx.browser.originAllowed(location.origin)
    ) {
      return undefined;
    }
    live.origin = location.origin;
    return live;
  }
}
