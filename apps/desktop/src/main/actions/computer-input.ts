import { setTimeout as delay } from 'node:timers/promises';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import {
  actionResult,
  refused,
  resultRefusal,
  screenshotDimensions,
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
    if (this.observation.isNativeBrowser(binding)) {
      const current = await this.observation.nativeBrowserState(binding);
      if (current.status !== 'ready' || current.url !== capability.browserUrl)
        return stale(
          'The browser page changed or needs login. Capture a fresh browser window state before continuing; do not replay the previous action.',
        );
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
      ['click', 'drag'].includes(String(args.action));
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
      if (windowHasProtectedControls(current))
        return refused('Pixel actions are blocked on windows containing protected controls.');
      if (backgroundDelivery) {
        const unavailable = backgroundRouteRefusal(
          windowBackgroundInput(current, binding),
          'window_pointer',
          request,
        );
        if (unavailable) return unavailable;
      }
      const currentSize = screenshotDimensions(current);
      if (
        !currentSize ||
        currentSize.width !== size.width ||
        currentSize.height !== size.height
      )
        return stale('The window geometry changed. Capture a fresh screenshot before acting.');
    }
    if (!address && !pixel && !['type', 'key', 'scroll'].includes(String(args.action))) {
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
      // An unaddressed action must not carry an element snapshot: the driver
      // otherwise refuses it with element_index_required. Sia's grant is checked above.
      snapshot_id: address ? capability.nativeSnapshotId : undefined,
      element_token: address?.token,
      element_index: address?.index,
    });

    let tool: string;
    let input: Record<string, unknown>;
    switch (args.action) {
      case 'click':
        tool = 'click';
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
        if (args.button !== undefined) input.button = args.button;
        if (args.count !== undefined) input.count = args.count;
        break;
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
        input = { ...base, text };
        break;
      }
      case 'set': {
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return refused('computer_action set requires text.');
        tool = 'set_value';
        input = { ...base, value: text };
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
    const raw = await this.ctx.callCua(request, tool, input);
    const focusedFallback = base.delivery_mode === 'foreground';
    const native = actionResult(
      raw,
      focusedFallback
        ? `Delivered ${String(args.action)} to the focused control in the exact window.`
        : `Delivered ${String(args.action)} in the background.`,
      { allowForeground: focusedFallback },
    );
    if (
      native.outcome === 'refused' ||
      native.outcome === 'stale' ||
      native.outcome === 'needs_foreground'
    ) {
      return native;
    }
    let after: ActionExecutionResult;
    try {
      // Notch waits before observing the result. A successful post is not proof
      // that the application has processed the input yet. Never replay input here.
      if (this.ctx.macBrowserAccess()) {
        await delay(350, undefined, { signal: request.context.signal });
        const current = await this.ctx.callCua(request, 'list_windows', { pid: binding.pid });
        const created = new Set(
          findRecordArray(current, 'windows')
            .filter((window) => positiveInteger(window.pid, MAX_PID) === binding.pid)
            .map((window) => positiveInteger(window.window_id ?? window.id, MAX_WINDOW_ID))
            .filter((id): id is number => id !== undefined && !knownWindows.has(id)),
        );
        if (created.size) {
          const inventory = await this.inventory.list(request);
          const newWindows = (
            (asRecord(inventory.data)?.windows ?? []) as Record<string, unknown>[]
          ).filter((window) => {
            const grant = this.ctx.computer.windows.get(String(window.window_id));
            return grant?.appId === binding.appId && created.has(grant.windowId);
          });
          if (newWindows.length)
            return {
              outcome: 'accepted_unverified',
              summary: `${native.summary} New windows appeared. Inspect a new_window before continuing; the previous snapshot belongs to the original window. Do not repeat the action that opened it.`,
              data: {
                observation_pending: true,
                new_windows: newWindows,
                previous_window_id: binding.id,
              },
            };
        }
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
    if (after.outcome !== 'verified') {
      if (!this.ctx.macBrowserAccess()) return after;
      return {
        outcome: 'accepted_unverified',
        summary: `${native.summary} The resulting page could not yet be observed. Do not repeat the action. Capture fresh state to check its result.`,
        data: {
          observation_pending: true,
          observation_outcome: after.outcome,
          observation_detail: after.summary,
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
        delivery: native.data,
        next_step:
          'Inspect this fresh state to verify the requested result. Do not repeat a write to test delivery.',
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
}
