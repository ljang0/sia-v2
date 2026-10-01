import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import { MAC_BROWSER_BUNDLES, type BrowserWindowState } from '../mac/browser-window.js';
import { actionImages, resultRefusal, screenshotDimensions, stale } from './action-results.js';
import { requiredString } from './arguments.js';
import { windowBackgroundInput, windowInputRecovery } from './background-input.js';
import { browserUrlLooksSensitive, samePageUrl } from './browser-urls.js';
import type {
  ComputerWindowBinding,
  NativeElementAddress,
  WindowSnapshotCapability,
} from './computer-grants.js';
import type { ComputerInventory } from './computer-inventory.js';
import type { ActionBackendContext } from './context.js';
import {
  asRecord,
  compact,
  findElementRecords,
  findString,
  firstString,
  isDefined,
  isHiddenWindowStructure,
  isProtectedElement,
  nonNegativeInteger,
  sanitizeElement,
  trustedDisplayText,
  trustedElementLabel,
  windowHasProtectedControls,
} from './driver-records.js';

/**
 * Captures a granted window's state and mints its snapshot capability. Browser windows are
 * checked against their live page identity before and after capture, so a navigation or a
 * protected page never leaks content or input targets.
 */
export class ComputerObservation {
  constructor(
    private readonly ctx: ActionBackendContext,
    private readonly inventory: ComputerInventory,
  ) {}

  async snapshot(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const appId = requiredString(request.arguments.app_id, 'app_id');
    const windowId = requiredString(request.arguments.window_id, 'window_id');
    const binding = this.ctx.computer.resolveWindow(appId, windowId);
    if (!binding || !(await this.inventory.windowStillValid(binding, request))) {
      return stale('The computer grant is missing, expired, or no longer matches this window.');
    }
    if (this.ctx.macBrowserAccess()) {
      const wait = request.arguments.wait_ms;
      if (typeof wait === 'number' && wait > 0)
        await delay(Math.min(3000, wait), undefined, { signal: request.context.signal });
      return this.captureSettledWindow(binding, request);
    }
    return this.captureWindow(binding, request);
  }

  async captureSettledWindow(
    binding: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    for (let attempt = 0; ; attempt++) {
      const result = await this.captureWindow(binding, request);
      const data = asRecord(result.data);
      if (attempt === 2 || (!data?.observation_pending && !data?.loading)) return result;
      await delay(500 * (attempt + 1), undefined, { signal: request.context.signal });
    }
  }

  async captureWindow(
    binding: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    const browser = this.isNativeBrowser(binding);
    let browserState = browser ? await this.nativeBrowserState(binding) : undefined;
    // A missing helper AX window is not a driver refusal. Let CUA resolve and
    // initialize the exact window once, then revalidate browser metadata before
    // releasing any captured content or minting an input capability.
    if (browserState?.status === 'protected')
      return this.#browserObservationRefused(binding, browserState);
    if (
      browserState?.status === 'ready' &&
      request.arguments.expected_url &&
      !samePageUrl(browserState.url, String(request.arguments.expected_url))
    )
      return stale(
        'The observed browser page does not match expected_url. No page content was read. Wait for navigation or inspect the intended window; do not assign this page to the requested course or account item.',
      );
    const capture = (includeScreenshot: boolean) =>
      this.ctx.callCua(request, 'get_window_state', {
        pid: binding.pid,
        window_id: binding.windowId,
        session: this.ctx.computer.session(request),
        include_screenshot: includeScreenshot,
      });
    let includeImage =
      request.arguments.read_text === true ||
      request.arguments.include_image === true ||
      (request.arguments.include_image !== false &&
        (!this.ctx.macBackgroundControl() || browser)) ||
      ['type', 'set'].includes(String(request.arguments.action)) ||
      typeof request.arguments.x === 'number';
    let raw: unknown;
    try {
      raw = await capture(includeImage);
      if (/\bpx_capture_unavailable\b/.test(resultRefusal(raw)?.summary ?? ''))
        raw = await capture(false);
    } catch (error) {
      if (!(error instanceof Error) || !/\bpx_capture_unavailable\b/.test(error.message))
        throw error;
      // A missing image does not make an otherwise usable AX window inaccessible.
      // This retry only observes; no input is replayed and pixel actions stay unavailable.
      raw = await capture(false);
    }
    let refusalResult = resultRefusal(raw);
    if (refusalResult) return refusalResult;
    if (browserState?.status === 'unavailable') {
      if (windowHasProtectedControls(raw))
        return this.#browserObservationRefused(binding, { status: 'protected' });
      browserState = await this.nativeBrowserState(binding);
      if (browserState.status !== 'ready') {
        const refusal = this.#browserObservationRefused(binding, browserState);
        return {
          ...refusal,
          summary:
            browserState.status === 'protected'
              ? refusal.summary
              : 'Tried CUA observation of this exact window, but its browser page identity could not be verified afterward. No captured content or input targets were returned. This is not evidence of a login screen.',
          data: {
            ...asRecord(refusal.data),
            driver_observation_attempted: true,
            driver_screenshot_available: Boolean(screenshotDimensions(raw)),
            driver_element_count: findElementRecords(raw, 'window').length,
          },
        };
      }
    }
    const browserUrl = browserState?.status === 'ready' ? browserState.url : undefined;
    if (
      request.arguments.expected_url &&
      (!browserUrl || !samePageUrl(browserUrl, String(request.arguments.expected_url)))
    )
      return stale(
        'The observed browser page does not match expected_url. No page content was returned. Wait for navigation or inspect the intended window; do not assign this page to the requested course or account item.',
      );

    // AX can temporarily return no controls even while a window is usable.
    // Capture pixels once instead of turning an empty AX response into an app failure.
    // Honor an explicit text-only request and never escalate a protected/refused read.
    if (
      !includeImage &&
      request.arguments.include_image === undefined &&
      this.ctx.macBackgroundControl() &&
      !windowHasProtectedControls(raw) &&
      findElementRecords(raw, 'window').length === 0
    ) {
      try {
        const visual = await capture(true);
        if (!/\bpx_capture_unavailable\b/.test(resultRefusal(visual)?.summary ?? '')) {
          raw = visual;
          includeImage = true;
        }
      } catch (error) {
        if (!(error instanceof Error) || !/\bpx_capture_unavailable\b/.test(error.message))
          throw error;
      }
      refusalResult = resultRefusal(raw);
      if (refusalResult) return refusalResult;
    }

    const context =
      this.ctx.macBrowserAccess() && !windowHasProtectedControls(raw)
        ? await this.ctx.options.readWindowContext?.(binding.pid, binding.windowId)
        : undefined;
    const readableContext =
      context?.status === 'ready' &&
      `bundle:${context.bundleID.toLowerCase()}` ===
        this.ctx.computer.apps.get(binding.appId)?.identity
        ? context
        : undefined;
    if (context?.status === 'protected')
      return {
        outcome: 'refused',
        summary: 'Protected controls appeared in this window. No content was returned.',
        data: {
          app_id: binding.appId,
          window_id: binding.id,
          blocker_code: 'protected_window',
        },
      };
    const image = actionImages(raw)?.images?.[0];
    const imageText =
      this.ctx.macBrowserAccess() &&
      request.arguments.read_text === true &&
      image &&
      !windowHasProtectedControls(raw)
        ? await this.ctx.options.readImageText?.(image.dataBase64)
        : undefined;
    if (browser) {
      const after = await this.nativeBrowserState(binding);
      if (windowHasProtectedControls(raw) || after.status !== 'ready')
        return this.#browserObservationRefused(
          binding,
          windowHasProtectedControls(raw) ? { status: 'protected' } : after,
        );
      if (after.url !== browserUrl)
        return {
          outcome: 'accepted_unverified',
          summary:
            'The browser navigated during observation. Wait and capture its new state before continuing; no page content was returned.',
          data: { observation_pending: true },
        };
    }
    const title =
      readableContext?.title ||
      (browserState?.status === 'ready' ? browserState.title : undefined) ||
      binding.title;
    if (title) this.ctx.computer.windows.set(binding.id, { ...binding, title });
    const snapshotId = randomUUID();
    const nativeSnapshotId = findString(raw, ['snapshot_id', 'snapshotId']);
    const elementMap = new Map<string, NativeElementAddress>();
    const elements = findElementRecords(raw, 'window')
      .map((record, position) => {
        if (isProtectedElement(record) || isHiddenWindowStructure(record)) return undefined;
        // The application menu bar is outside this window's input grant. Exposing
        // those refs invites element_outside_target_window failures; use shortcuts.
        if (
          this.ctx.macBrowserAccess() &&
          /^AXMenuBar(?:Item)?$/.test(firstString(record, ['role', 'type']) ?? '')
        )
          return undefined;
        const token = firstString(record, ['element_token', 'elementToken']);
        const index = nonNegativeInteger(record.element_index ?? record.elementIndex);
        if (!token && (index === undefined || !nativeSnapshotId))
          return this.ctx.macBrowserAccess() ? sanitizeElement(record) : undefined;
        const ref = `w:${snapshotId}:${position}`;
        const label = trustedElementLabel(record);
        const role = trustedDisplayText(firstString(record, ['role', 'type']));
        elementMap.set(ref, {
          ...(token ? { token } : {}),
          ...(index === undefined ? {} : { index }),
          ...(label ? { label } : {}),
          ...(role ? { role } : {}),
        });
        const element = sanitizeElement(record, ref);
        if (this.ctx.macBrowserAccess()) delete element.frame;
        return element;
      })
      .filter(isDefined);
    const pixels =
      !includeImage || windowHasProtectedControls(raw) ? undefined : screenshotDimensions(raw);
    const backgroundInput = windowBackgroundInput(raw, binding);
    const observationOnly =
      backgroundInput?.routes.every((route) => route.status === 'refused') ?? false;
    const backgroundPixels =
      !backgroundInput ||
      backgroundInput.routes.some(
        (route) => route.route === 'window_pointer' && route.status === 'available',
      );
    const capability: WindowSnapshotCapability = {
      ...(backgroundInput ? { backgroundInput } : {}),
      ...(browserUrl ? { browserUrl } : {}),
      capturedAt: Date.now(),
      protectedControls: windowHasProtectedControls(raw),
      ...(pixels ? { pixels } : {}),
      id: snapshotId,
      appId: binding.appId,
      publicWindowId: binding.id,
      pid: binding.pid,
      windowId: binding.windowId,
      elements: elementMap,
      ...(nativeSnapshotId ? { nativeSnapshotId } : {}),
    };
    this.ctx.computer.rememberSnapshot(capability);
    return {
      outcome: 'verified',
      summary: 'Captured a fresh state for the permitted window.',
      ...(!includeImage || windowHasProtectedControls(raw) ? {} : actionImages(raw)),
      data: compact({
        snapshot_id: snapshotId,
        app_id: binding.appId,
        window_id: binding.id,
        app_name: this.ctx.computer.apps.get(binding.appId)?.name,
        title,
        browser_origin:
          browserUrl && browserUrl !== 'about:blank' ? new URL(browserUrl).origin : undefined,
        source_url:
          browserUrl && browserUrl !== 'about:blank'
            ? new URL(browserUrl).origin + new URL(browserUrl).pathname
            : undefined,
        visible_text: readableContext?.text || undefined,
        image_text: imageText,
        ...(request.arguments.read_text === true
          ? {
              image_text_status: imageText ? 'read' : 'unavailable',
              image_text_note:
                'OCR of this exact screenshot; cross-check with the image. It only covers visible pixels, not other pages or offscreen content.',
            }
          : {}),
        elements,
        background_input: backgroundInput,
        observation_only: backgroundInput ? observationOnly : undefined,
        ...(observationOnly ? { next_step: windowInputRecovery(request) } : {}),
        ...(elements.length === 0
          ? {
              accessibility_empty: true,
              next_step: observationOnly
                ? windowInputRecovery(request)
                : pixels && backgroundPixels
                  ? 'Accessibility returned no controls. Inspect this screenshot and use its fresh pixel targets if the needed controls are visible; do not infer the app is unavailable.'
                  : pixels
                    ? 'The image can be inspected, but background pixel input is unavailable. Check background_input for a supported route. ' +
                      windowInputRecovery(request)
                    : 'Accessibility returned no controls. Request include_image:true for visual inspection before concluding the app is unavailable.',
            }
          : {}),
        ...(this.ctx.macBrowserAccess() &&
        findElementRecords(raw, 'window').some(
          (record) =>
            !isHiddenWindowStructure(record) &&
            (firstString(record, ['role', 'type']) === 'AXProgressIndicator' ||
              /^loading(?:[.\s…]|$)/i.test(trustedElementLabel(record) ?? '')),
        )
          ? { loading: true, observation_pending: true }
          : {}),
        pixel_actions_available:
          Boolean(pixels) && (!this.ctx.macBrowserAccess() || backgroundPixels),
        screenshot_size: pixels,
      }),
      verification: {
        snapshotId,
        evidence: 'The snapshot is bound to a short-lived host-verified window grant.',
      },
    };
  }

  isNativeBrowser(binding: ComputerWindowBinding): boolean {
    return MAC_BROWSER_BUNDLES.has(
      this.ctx.computer.apps.get(binding.appId)?.identity.replace(/^bundle:/, '') ?? '',
    );
  }

  async nativeBrowserState(binding: ComputerWindowBinding): Promise<BrowserWindowState> {
    if (!this.ctx.macBrowserAccess() || !this.ctx.options.inspectBrowserWindow)
      return { status: 'unavailable' };
    const state = await this.ctx.options.inspectBrowserWindow(binding.pid, binding.windowId);
    if (state.status !== 'ready') return state;
    if (
      `bundle:${state.bundleID.toLowerCase()}` !==
      this.ctx.computer.apps.get(binding.appId)?.identity
    )
      return { status: 'unavailable', reason: 'window' };
    if (state.url === 'about:blank') return state;
    try {
      if (
        !['http:', 'https:'].includes(new URL(state.url).protocol) ||
        browserUrlLooksSensitive(state.url)
      )
        return { status: 'protected', reason: 'page' };
      return state;
    } catch {
      return { status: 'unavailable', reason: 'page' };
    }
  }

  #browserObservationRefused(
    binding: ComputerWindowBinding,
    state: BrowserWindowState,
  ): ActionExecutionResult {
    const protectedPage = state.status === 'protected';
    return {
      outcome: 'refused',
      summary: protectedPage
        ? 'This specific browser window contains a protected page or security control. It was not read. This does not establish that another window or the requested account needs login.'
        : 'This specific browser window could not be identified or observed. This is not evidence of a login screen. Continue in the task window already observed, or bring the browser forward and inspect this window again.',
      data: {
        app_id: binding.appId,
        window_id: binding.id,
        blocker_code: protectedPage ? 'protected_window' : 'window_unavailable',
        ...(state.status !== 'ready' && state.reason ? { blocker_detail: state.reason } : {}),
      },
    };
  }
}
