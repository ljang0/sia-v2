import { setTimeout as delay } from 'node:timers/promises';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import {
  actionResult,
  classifyFailure,
  inputWasRefused,
  refused,
  resultRefusal,
  screenshotDimensions,
  safeErrorMessage,
  stale,
} from './action-results.js';
import { requiredEnum, requiredString } from './arguments.js';
import {
  backgroundRouteRefusal,
  windowBackgroundInput,
  type BackgroundInputRoute,
} from './background-input.js';
import { MAX_PID, MAX_WINDOW_ID, type ComputerInventory } from './computer-inventory.js';
import type { ComputerObservation } from './computer-observation.js';
import type { ActionBackendContext } from './context.js';
import {
  asRecord,
  compact,
  findElementRecords,
  findRecordArray,
  positiveInteger,
  windowHasProtectedControls,
} from './driver-records.js';

/**
 * Delivers one click, drag, type, set, scroll or key action to a granted window, bound to its
 * latest snapshot, then observes the result. Input is never replayed automatically.
 */
export class ComputerInput {
  constructor(
    private readonly ctx: ActionBackendContext,
    private readonly inventory: ComputerInventory,
    private readonly observation: ComputerObservation,
  ) {}

  async act(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const appId = requiredString(args.app_id, 'app_id');
    const windowId = requiredString(args.window_id, 'window_id');
    const binding = this.ctx.computer.resolveWindow(appId, windowId);
    if (!binding || !(await this.inventory.windowStillValid(binding, request))) {
      return stale('The computer grant is missing, expired, or no longer matches this window.');
    }
    const snapshotId = requiredString(args.snapshot_id, 'snapshot_id');
    const capability = this.ctx.computer.snapshots.get(snapshotId);
    if (
      !capability ||
      capability.appId !== appId ||
      capability.publicWindowId !== windowId ||
      capability.pid !== binding.pid ||
      capability.windowId !== binding.windowId ||
      this.ctx.computer.latestSnapshot.get(windowId) !== snapshotId
    ) {
      return stale('The window snapshot is missing, superseded, or belongs to another window.');
    }
    let verifiedBrowserBundleId: string | undefined;
    if (this.inventory.isNativeBrowser(binding)) {
      if (args.action === 'menu')
        return refused(
          'Use visible browser page controls or a permitted navigation shortcut. Native menus are available only for ordinary non-browser apps.',
        );
      const current = await this.inventory.nativeBrowserState(
        binding,
        capability.browserSurface === 'safari-tabs',
      );
      const navigationOnly = capability.browserSurface !== undefined;
      if (
        navigationOnly
          ? current.status !== 'navigation' || current.surface !== capability.browserSurface
          : current.status !== 'ready' || current.url !== capability.browserUrl
      )
        return stale(
          'The browser surface changed or could not be verified. Capture a fresh browser window state before continuing; do not replay the previous action. This alone does not establish sign-out.',
        );
      if (
        navigationOnly &&
        !(
          (args.action === 'click' &&
            typeof args.element_ref === 'string' &&
            capability.elements.has(args.element_ref) &&
            args.x === undefined &&
            args.y === undefined &&
            (args.count === undefined || args.count === 1) &&
            (args.button === undefined || args.button === 'left')) ||
          (args.action === 'key' &&
            capability.browserSurface === 'safari-tab-overview' &&
            /^(?:escape|esc)$/i.test(String(args.value)) &&
            (!Array.isArray(args.modifiers) || args.modifiers.length === 0))
        )
      )
        return refused(
          'Native tab navigation permits only selecting an observed tab; Tab Overview also allows Escape.',
        );
      verifiedBrowserBundleId =
        current.status === 'ready' || current.status === 'navigation'
          ? current.bundleID
          : undefined;
      if (
        typeof args.text === 'string' &&
        /(?:javascript|data|file|chrome|safari|about|devtools|view-source|vbscript)\s*:/i.test(
          args.text,
        )
      )
        return refused(
          'Browser typing cannot open local files, internal pages, or execute scripts. Use an ordinary HTTP(S) website.',
        );
      if (args.action === 'key') {
        const key = String(args.value).toLowerCase();
        const modifiers = Array.isArray(args.modifiers) ? args.modifiers : [];
        const navigation =
          modifiers.length === 1 &&
          modifiers[0] === 'cmd' &&
          ['l', 'r', 'a', 'f', 't', 'w', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(
            key,
          );
        const tabSwitch =
          key === 'tab' &&
          modifiers.includes('ctrl') &&
          modifiers.every((modifier) => modifier === 'ctrl' || modifier === 'shift');
        const plain =
          modifiers.length === 0 &&
          [
            'enter',
            'return',
            'tab',
            'escape',
            'esc',
            'up',
            'down',
            'left',
            'right',
            'space',
            'backspace',
            'delete',
            'pageup',
            'pagedown',
            'home',
            'end',
          ].includes(key);
        if (!navigation && !tabSwitch && !plain)
          return refused(
            'This browser shortcut is unavailable. Use visible page controls or an ordinary navigation shortcut.',
          );
      }
    }
    let address = this.ctx.computer.elementAddress(capability, args.element_ref);
    if (args.element_ref && !address)
      return stale('The element reference is not in this snapshot.');
    const macKeyboard =
      this.ctx.macBrowserAccess() && ['type', 'key'].includes(String(args.action));
    // AXWindow is not an editable control. Focusing it before each keystroke loses
    // the actual field focus in apps such as Calculator. Use the exact-window route.
    if (macKeyboard && address?.role === 'AXWindow') address = undefined;
    if (!address && capability.protectedControls)
      return refused(
        'Focused and pixel actions are blocked on a window containing protected controls.',
      );
    const pixel =
      typeof args.x === 'number' &&
      typeof args.y === 'number' &&
      ['click', 'drag', 'type'].includes(String(args.action));
    const backgroundDelivery = this.ctx.macBrowserAccess() && args.delivery !== 'foreground';
    const inputRoute: BackgroundInputRoute = ['type', 'key'].includes(String(args.action))
      ? 'pid_keyboard'
      : pixel || args.action === 'scroll'
        ? 'window_pointer'
        : 'accessibility';
    if (backgroundDelivery) {
      const unavailable = backgroundRouteRefusal(
        capability.backgroundInput,
        inputRoute,
        request,
      );
      if (unavailable) return unavailable;
    }
    if (pixel) {
      const size = capability.pixels;
      const points =
        args.action === 'drag'
          ? [
              [args.x, args.y],
              [args.to_x, args.to_y],
            ]
          : [[args.x, args.y]];
      if (
        !size ||
        Date.now() - capability.capturedAt > 30_000 ||
        points.some(
          ([x, y]) =>
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < 0 ||
            y < 0 ||
            x >= size.width ||
            y >= size.height,
        )
      )
        return stale(
          'Pixel coordinates require a fresh, unprotected window screenshot and points inside that image.',
        );
      const current = await this.ctx.callCua(request, 'get_window_state', {
        pid: binding.pid,
        window_id: binding.windowId,
        session: this.ctx.computer.session(request),
        include_screenshot: true,
      });
      const denied = resultRefusal(current);
      if (denied) return denied;
      if (windowHasProtectedControls(current, { browserBundleId: verifiedBrowserBundleId }))
        return refused('Pixel actions are blocked on windows containing protected controls.');
      if (backgroundDelivery) {
        const availability = windowBackgroundInput(current, binding);
        const routes: BackgroundInputRoute[] =
          args.action === 'type' ? ['window_pointer', 'pid_keyboard'] : ['window_pointer'];
        for (const route of routes) {
          const unavailable = backgroundRouteRefusal(availability, route, request);
          if (unavailable) return unavailable;
        }
      }
      const currentSize = screenshotDimensions(current);
      if (
        !currentSize ||
        currentSize.width !== size.width ||
        currentSize.height !== size.height
      )
        return stale('The window geometry changed. Capture a fresh screenshot before acting.');
    }
    if (
      !address &&
      !pixel &&
      !['type', 'key', 'scroll', 'menu'].includes(String(args.action))
    ) {
      return refused('This computer action requires an exact element reference.');
    }
    const base = compact({
      pid: binding.pid,
      window_id: binding.windowId,
      session: this.ctx.computer.session(request),
      delivery_mode: this.ctx.macBrowserAccess()
        ? args.delivery === 'foreground'
          ? 'foreground'
          : 'background'
        : !address
          ? 'foreground'
          : 'background',
      // Native tokens already bind the exact snapshot and row. Legacy index/snapshot
      // arguments are rejected by the current driver; never manufacture a token.
      element_token: address?.token,
    });

    let tool: string;
    let input: Record<string, unknown>;
    switch (args.action) {
      case 'click':
        tool = !pixel && args.count === 2 ? 'double_click' : 'click';
        input = pixel
          ? {
              pid: binding.pid,
              window_id: binding.windowId,
              session: this.ctx.computer.session(request),
              delivery_mode: base.delivery_mode,
              x: args.x,
              y: args.y,
            }
          : base;
        if (tool === 'click') {
          if (args.button !== undefined) input.button = args.button;
          if (args.count !== undefined) input.count = args.count;
        }
        break;
      case 'menu': {
        const path = args.menu_path;
        if (
          !this.ctx.macBrowserAccess() ||
          !Array.isArray(path) ||
          path.length < 1 ||
          path.length > 16 ||
          path.some(
            (part) =>
              typeof part !== 'string' ||
              !part.trim() ||
              part.length > 200 ||
              /password|keychain|credential|\b(?:api|access)\s*key|\btoken\b|\bsign.?in\b|\blog.?in\b|authenticat|passkey|verification|private window|incognito|developer tools|web inspector|terminal|console|\bscript\b/i.test(
                part,
              ),
          )
        )
          return refused('Choose an ordinary exact native menu path for this app window.');
        tool = 'invoke_menu';
        input = {
          pid: binding.pid,
          window_id: binding.windowId,
          session: this.ctx.computer.session(request),
          path,
        };
        break;
      }
      case 'drag':
        if (!pixel) return refused('Drag requires screenshot coordinates.');
        tool = 'drag';
        input = {
          pid: binding.pid,
          window_id: binding.windowId,
          session: this.ctx.computer.session(request),
          delivery_mode: base.delivery_mode,
          from_x: args.x,
          from_y: args.y,
          to_x: args.to_x,
          to_y: args.to_y,
        };
        break;
      case 'type': {
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return refused('computer_action type requires text.');
        tool = 'type_text';
        // Keep focus and insertion in the same driver operation. A separate
        // foreground click restores the previous app before typing begins.
        input = { ...base, text, ...(pixel ? { x: args.x, y: args.y } : {}) };
        break;
      }
      case 'set': {
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return refused('computer_action set requires text.');
        tool = 'set_value';
        // set_value is an exact AX operation and has no delivery_mode argument.
        input = compact({
          pid: base.pid,
          window_id: base.window_id,
          session: base.session,
          element_token: base.element_token,
          value: text,
        });
        break;
      }
      case 'scroll':
        tool = 'scroll';
        input = {
          ...base,
          direction: requiredEnum(args.direction, ['up', 'down', 'left', 'right'], 'direction'),
          amount: typeof args.amount === 'number' ? args.amount : 3,
          by: 'line',
        };
        break;
      case 'key': {
        const key = typeof args.value === 'string' ? args.value : undefined;
        if (!key) return refused('computer_action key requires value.');
        const normalizedKey = key.toLowerCase() === 'enter' ? 'return' : key.toLowerCase();
        const modifiers = Array.isArray(args.modifiers)
          ? args.modifiers.filter((value): value is string => typeof value === 'string')
          : [];
        tool = modifiers.length ? 'hotkey' : 'press_key';
        input = modifiers.length
          ? { ...base, keys: [...modifiers, normalizedKey] }
          : { ...base, key: normalizedKey };
        break;
      }
      default:
        return refused('Unsupported computer action.');
    }

    const knownWindows = new Set(
      [...this.ctx.computer.windows.values()]
        .filter((window) => window.appId === binding.appId)
        .map((window) => window.windowId),
    );
    let raw: unknown;
    try {
      raw = await this.ctx.callCua(request, tool, input);
    } catch (error) {
      const message = safeErrorMessage(error);
      // These explicit driver validation/authorization refusals prove no input was posted.
      // A generic timeout or broken transport does not: the app may already have committed.
      if (inputWasRefused(error)) return classifyFailure(error);
      this.ctx.computer.snapshots.delete(snapshotId);
      this.ctx.computer.latestSnapshot.delete(binding.id);
      return {
        outcome: 'accepted_unverified',
        summary:
          'The input may have been delivered, but its acknowledgement could not be verified. Observe the exact window and inspect the intended result before continuing; do not replay the action.',
        reason: message,
        data: {
          app_id: binding.appId,
          window_id: binding.id,
          input_delivery_uncertain: true,
          previous_snapshot_id: snapshotId,
          next_step:
            'Capture fresh state and reconcile the saved item, receipt, or other semantic result. The previous input target has been revoked. An absent immediate acknowledgement does not prove the write failed.',
        },
      };
    }
    const focusedFallback = base.delivery_mode === 'foreground';
    const native = actionResult(
      raw,
      focusedFallback
        ? `Delivered ${String(args.action)} to the focused control in the exact window.`
        : `Delivered ${String(args.action)} in the background.`,
      { allowForeground: focusedFallback },
    );
    const nativeData = asRecord(native.data);
    if (
      native.outcome === 'needs_foreground' &&
      (nativeData?.delivery_mode === 'foreground' ||
        nativeData?.background_interrupted === true)
    ) {
      this.ctx.computer.snapshots.delete(snapshotId);
      this.ctx.computer.latestSnapshot.delete(binding.id);
      return {
        ...native,
        data: {
          ...nativeData,
          app_id: binding.appId,
          window_id: binding.id,
          driver_operation: tool,
          requested_delivery: base.delivery_mode,
          input_delivery_uncertain: true,
          previous_snapshot_id: snapshotId,
        },
      };
    }
    if (
      native.outcome === 'refused' ||
      native.outcome === 'stale' ||
      native.outcome === 'needs_foreground'
    ) {
      // A dialog, sheet or panel that opened after the last inventory takes key focus, so
      // input aimed at the window behind it cannot be delivered. Point at the new window.
      if (this.ctx.macBrowserAccess()) {
        const opened = await this.newWindows(binding, knownWindows, request).catch(() => []);
        if (opened.length)
          return {
            outcome: 'stale',
            summary:
              'A dialog or sheet is now in front of this window, so input went nowhere. Inspect a new_window and act there; do not repeat the action on this window.',
            data: { new_windows: opened, previous_window_id: binding.id },
          };
      }
      return native;
    }
    let after: ActionExecutionResult;
    let openedWindows: Record<string, unknown>[] = [];
    try {
      // Notch waits before observing the result. A successful post is not proof
      // that the application has processed the input yet. Never replay input here.
      if (this.ctx.macBrowserAccess()) {
        await delay(350, undefined, { signal: request.context.signal });
        openedWindows = await this.newWindows(binding, knownWindows, request);
      }
      after = this.ctx.macBrowserAccess()
        ? await this.observation.captureSettledWindow(binding, request)
        : await this.observation.captureWindow(binding, request);
    } catch (error) {
      if (!this.ctx.macBrowserAccess()) throw error;
      // Input already returned successfully. An observation error must not invite a replay.
      after = {
        outcome: 'accepted_unverified',
        summary: 'The post-action observation was interrupted or unavailable.',
      };
    }
    // WindowServer lists native Save/Open panels separately, while their usable
    // AXSheet controls belong to the original AXWindow. Inspect that exact parent
    // before sending the model to an auxiliary window the driver cannot resolve.
    // This never changes a driver's refusal or reuses a pre-action capability.
    const attachedSheet =
      after.outcome === 'verified' &&
      findElementRecords(after.data, 'window').some((row) => row.role === 'AXSheet');
    if (openedWindows.length && !attachedSheet)
      return {
        outcome: 'accepted_unverified',
        summary: `${native.summary} New windows appeared. Inspect a new_window before continuing; the previous snapshot belongs to the original window. Do not repeat the action that opened it.`,
        data: {
          observation_pending: true,
          new_windows: openedWindows,
          previous_window_id: binding.id,
        },
      };
    if (after.outcome !== 'verified') {
      if (!this.ctx.macBrowserAccess()) return after;
      const protectedDestination = asRecord(after.data)?.blocker_code === 'protected_window';
      return {
        outcome: 'accepted_unverified',
        summary: `${native.summary} The resulting page could not yet be observed. Do not repeat the action. Capture fresh state to check its result.`,
        data: {
          observation_pending: true,
          observation_outcome: after.outcome,
          observation_detail: after.summary,
          ...(protectedDestination
            ? {
                // This is the observation's refusal, not evidence that input was unsent.
                observation_blocker_code: 'protected_window',
                next_step:
                  verifiedBrowserBundleId?.toLowerCase() === 'com.apple.safari'
                    ? 'Do not replay the input or interact with the protected page. A separate computer_snapshot with tabs_only:true can inspect only native tab selection controls. Select an ordinary existing tab under that new grant, then capture fresh normal state before any typing. A refused tabs-only read remains a refusal.'
                    : 'Do not replay the input or interact with the protected window. Use another independently authorized source when available; otherwise report this exact observation gap.',
              }
            : {}),
        },
      };
    }
    const afterSnapshotId = after.verification?.snapshotId;
    return {
      outcome: 'accepted_unverified',
      summary:
        native.outcome === 'verified'
          ? `${native.summary} A fresh window snapshot was captured.`
          : `${native.summary} Inspect the fresh snapshot to confirm the postcondition.`,
      ...(after.images ? { images: after.images } : {}),
      data: {
        ...(asRecord(after.data) ?? {}),
        ...(openedWindows.length
          ? { new_windows: openedWindows, previous_window_id: binding.id }
          : {}),
        delivery: native.data,
        next_step: attachedSheet
          ? 'The attached sheet is exposed in this fresh parent-window snapshot. Use only its current element refs and available driver routes; auxiliary panel windows may be observation-only. Do not reuse old refs or repeat the action that opened the sheet.'
          : 'Inspect this fresh state to verify the requested result. Do not repeat a write to test delivery.',
        recovery_observation_limit: 2,
      },
      verification: compact({
        snapshotId: afterSnapshotId,
        evidence:
          native.outcome === 'verified'
            ? 'Delivery was confirmed; the requested semantic result still needs inspection in the fresh state.'
            : 'Fresh window state is available, but the requested semantic effect was not proven.',
      }),
    };
  }

  /** Granted windows of the same app that were not known before this action. */
  private async newWindows(
    binding: { pid: number; appId: string },
    knownWindows: Set<number>,
    request: ValidatedActionInvocation,
  ): Promise<Record<string, unknown>[]> {
    const current = await this.ctx.callCua(request, 'list_windows', { pid: binding.pid });
    const created = new Set(
      findRecordArray(current, 'windows')
        .filter((window) => positiveInteger(window.pid, MAX_PID) === binding.pid)
        .map((window) => positiveInteger(window.window_id ?? window.id, MAX_WINDOW_ID))
        .filter((id): id is number => id !== undefined && !knownWindows.has(id)),
    );
    if (!created.size) return [];
    const inventory = await this.inventory.list(request);
    return ((asRecord(inventory.data)?.windows ?? []) as Record<string, unknown>[]).filter(
      (window) => {
        const grant = this.ctx.computer.windows.get(String(window.window_id));
        return grant?.appId === binding.appId && created.has(grant.windowId);
      },
    );
  }
}
