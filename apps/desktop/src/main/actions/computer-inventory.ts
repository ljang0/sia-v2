import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSensitiveComputerApp,
  type ActionExecutionResult,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { MAC_BROWSER_BUNDLES, type BrowserWindowState } from '../mac/browser-window.js';
import { refused, resultRefusal } from './action-results.js';
import { requiredString } from './arguments.js';
import { browserUrlLooksSensitive } from './browser-urls.js';
import type { ComputerAppBinding, ComputerWindowBinding } from './computer-grants.js';
import type { ActionBackendContext } from './context.js';
import { workspaceOpenTarget } from './workspace-open-target.js';
import {
  asRecord,
  compact,
  computerAppIdentity,
  findRecordArray,
  firstBoolean,
  firstString,
  isDefined,
  nonNegativeInteger,
  positiveInteger,
  sanitizeFrame,
  trustedDisplayText,
} from './driver-records.js';

export const MAX_PID = 2_147_483_647;
export const MAX_WINDOW_ID = 4_294_967_295;
// A real model turn can spend several minutes reasoning between inventory and
// action. Keep the opaque app/window ids long enough for that turn to finish;
// every snapshot/action still revalidates the live process and exact window,
// and every mutation remains bound to the latest host-minted snapshot ref.
const COMPUTER_GRANT_TTL_MS = 10 * 60_000;

/** Lists, opens and revalidates the apps and windows a turn may control. */
export class ComputerInventory {
  constructor(private readonly ctx: ActionBackendContext) {}

  #appBlocked(name: string | undefined, bundleId?: string): boolean {
    if (bundleId && MAC_BROWSER_BUNDLES.has(bundleId.toLowerCase()))
      return !this.ctx.macBrowserAccess() || !this.ctx.options.inspectBrowserWindow;
    return isSensitiveComputerApp(name, bundleId);
  }

  async list(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    // Preserve exact window identities across inventory refreshes within this turn.
    // Later turns discover fresh targets under a new, host-owned CUA session.
    const mac = this.ctx.macBrowserAccess();
    const sessionId = this.ctx.computer.session(request);
    if (!mac) this.ctx.computer.reset();
    const previousApps = [...this.ctx.computer.apps.values()];
    const previousWindows = [...this.ctx.computer.windows.values()];
    const liveApps = new Set<string>();
    const liveWindows = new Set<string>();
    const [appsValue, windowsValue] = await Promise.all([
      this.ctx.callCua(request, 'list_apps', {}),
      this.ctx.callCua(request, 'list_windows', { on_screen_only: false }),
    ]);
    const expiresAt = Date.now() + COMPUTER_GRANT_TTL_MS;
    const appByPid = new Map<number, ComputerAppBinding>();
    const apps = findRecordArray(appsValue, 'apps').flatMap((record) => {
      const pid = positiveInteger(record.pid, MAX_PID);
      const name = firstString(record, ['name', 'app_name']);
      const bundleId = firstString(record, ['bundle_id', 'bundleId']);
      const identity = computerAppIdentity(name, bundleId);
      if (!pid || pid === this.ctx.hostPid || !identity || this.#appBlocked(name, bundleId))
        return [];
      const previous = previousApps.find(
        (app) => app.pid === pid && app.identity === identity && app.expiresAt > Date.now(),
      );
      const binding: ComputerAppBinding = {
        id: previous?.id ?? `app:${randomUUID()}`,
        pid,
        identity,
        name: name ?? bundleId!,
        expiresAt,
      };
      appByPid.set(pid, binding);
      this.ctx.computer.apps.set(binding.id, binding);
      liveApps.add(binding.id);
      return [
        compact({
          app_id: binding.id,
          name,
          bundle_id: bundleId,
          active: firstBoolean(record, ['active', 'is_active']),
        }),
      ];
    });
    const windows = findRecordArray(windowsValue, 'windows')
      .map((record) => {
        const pid = positiveInteger(record.pid, MAX_PID);
        const windowId = positiveInteger(record.window_id ?? record.id, MAX_WINDOW_ID);
        const app = pid ? appByPid.get(pid) : undefined;
        const nativeAppName = firstString(record, ['app_name', 'name']);
        if (
          !app ||
          !windowId ||
          this.#appBlocked(nativeAppName, appByPid.get(pid!)?.identity.replace(/^bundle:/, ''))
        )
          return undefined;
        const previous = previousWindows.find(
          (window) =>
            window.appId === app.id &&
            window.windowId === windowId &&
            window.expiresAt > Date.now(),
        );
        const title = trustedDisplayText(firstString(record, ['title'])) ?? previous?.title;
        const isOnScreen = firstBoolean(record, ['is_on_screen', 'on_screen']);
        const onCurrentSpace = firstBoolean(record, ['on_current_space']);
        if (!title && isOnScreen === false && onCurrentSpace !== true) return undefined;
        const binding: ComputerWindowBinding = {
          id: previous?.id ?? `window:${randomUUID()}`,
          appId: app.id,
          pid: app.pid,
          windowId,
          ...(title ? { title } : {}),
          expiresAt,
        };
        this.ctx.computer.windows.set(binding.id, binding);
        liveWindows.add(binding.id);
        return compact({
          app_id: binding.appId,
          window_id: binding.id,
          app_name: app.name,
          title: mac ? title : firstString(record, ['title']),
          ...(mac ? { z_order: nonNegativeInteger(record.z_index) } : {}),
          bounds: sanitizeFrame(record.bounds),
          is_on_screen: isOnScreen,
          on_current_space: onCurrentSpace,
        });
      })
      .filter(isDefined);
    for (const id of this.ctx.computer.apps.keys())
      if (!liveApps.has(id)) this.ctx.computer.apps.delete(id);
    for (const id of this.ctx.computer.windows.keys())
      if (!liveWindows.has(id)) {
        this.ctx.computer.windows.delete(id);
        const snapshot = this.ctx.computer.latestSnapshot.get(id);
        if (snapshot) this.ctx.computer.snapshots.delete(snapshot);
        this.ctx.computer.latestSnapshot.delete(id);
        this.ctx.computer.inspectedBrowsers.delete(id);
      }
    // WindowServer enumerates back-to-front on some builds. Give the model the
    // frontmost candidates first, retaining every permitted window for discovery.
    if (mac)
      windows.sort(
        (a, b) =>
          Number(b.on_current_space === true) - Number(a.on_current_space === true) ||
          Number(b.is_on_screen === true) - Number(a.is_on_screen === true) ||
          Number(a.z_order ?? Infinity) - Number(b.z_order ?? Infinity),
      );

    // Inspect only page identity, never page content, cookies or profile files.
    // This lets the agent select an existing app/session before opening a site
    // in a different default browser/profile. Full observations still revalidate.
    const inspectedBrowsers = this.ctx.computer.inspectedBrowsers;
    const browserWindows = mac
      ? windows.filter((window) => {
          const binding = this.ctx.computer.windows.get(String(window.window_id));
          return binding && this.isNativeBrowser(binding);
        })
      : [];
    // Repeated inventories must eventually discover windows beyond the first
    // eight. Do not cache page identities: each returned identity is read live.
    if (browserWindows.every((window) => inspectedBrowsers.has(String(window.window_id))))
      inspectedBrowsers.clear();
    const inspected = browserWindows
      .filter((window) => !inspectedBrowsers.has(String(window.window_id)))
      .slice(0, 8);
    for (let offset = 0; offset < inspected.length; offset += 4) {
      request.context.signal?.throwIfAborted();
      await Promise.all(
        inspected.slice(offset, offset + 4).map(async (window) => {
          const binding = this.ctx.computer.windows.get(String(window.window_id));
          if (!binding) return;
          let state: BrowserWindowState;
          try {
            state = await this.nativeBrowserState(binding);
          } catch {
            state = { status: 'unavailable' };
          }
          if (request.context.signal?.aborted || this.ctx.computer.sessionId !== sessionId)
            return;
          Object.assign(window, { browser_state: state.status });
          inspectedBrowsers.add(binding.id);
          if (state.status === 'ready' && state.url !== 'about:blank') {
            const page = new URL(state.url);
            Object.assign(window, {
              browser_origin: page.origin,
              source_url: page.origin + page.pathname,
            });
          }
        }),
      );
    }
    request.context.signal?.throwIfAborted();
    const remaining = browserWindows.filter(
      (window) => !inspectedBrowsers.has(String(window.window_id)),
    ).length;
    const unidentified = browserWindows.filter(
      (window) => asRecord(window)?.browser_state !== 'ready',
    ).length;

    return {
      outcome: 'verified',
      summary: `Found ${apps.length} running application${apps.length === 1 ? '' : 's'} and ${windows.length} window${windows.length === 1 ? '' : 's'}.`,
      data: {
        apps,
        windows,
        ...(this.ctx.macBrowserAccess()
          ? {
              browser_route:
                'Existing Mac browser sessions are reused in place; no account connection or login copying is needed. Select the task window using its observed page identity and saved account hints, then verify the live account with computer_snapshot. Inspect visible tabs and account-switcher controls in that window before opening a site in another default profile. Page metadata does not prove sign-in. Protected or unavailable windows do not establish that other accounts are blocked.',
              browser_metadata_partial: unidentified > 0,
              browser_windows_uninspected: remaining,
              browser_windows_unidentified: unidentified,
              ...(remaining > 0
                ? {
                    next_step:
                      'Some browser windows have not been identified yet. Repeat computer_list to inspect the next batch, or use computer_snapshot on a specific task window. Missing metadata is not evidence of sign-out.',
                  }
                : unidentified > 0
                  ? {
                      next_step:
                        'Some browser windows could not be identified in this response. Inspect an available candidate with computer_snapshot, respecting protected-window refusals. Missing or unavailable observations do not establish sign-out or the absence of a signed-in account.',
                    }
                  : {}),
            }
          : {}),
        installed_apps: ((await this.ctx.options.installedApplications?.()) ?? [])
          .filter((app) => !this.#appBlocked(app.name, app.id))
          .map(({ id, name }) => ({ application: id, name })),
      },
      verification: {
        evidence: 'Read directly from the current WindowServer and app inventory.',
      },
    };
  }

  async openApp(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const requested = requiredString(request.arguments.application, 'application');
    const application = requested === 'notes' ? 'com.apple.Notes' : requested;
    const installed = await this.ctx.options.installedApplications?.();
    const entry = installed?.find((app) => app.id === application);
    if ((installed && !entry) || this.#appBlocked(entry?.name, application)) {
      return refused('Choose a permitted installed application from computer_list.');
    }
    if (!installed && requested !== 'notes')
      return refused('Application discovery is unavailable in this build.');
    const mac = this.ctx.macBrowserAccess();
    const background =
      request.arguments.delivery === 'background' ||
      (mac && request.arguments.delivery !== 'foreground');
    let document: string | undefined;
    if (typeof request.arguments.workspace_path === 'string') {
      if (!mac || !background)
        return refused('Working-folder documents use the background Mac route.');
      document = await workspaceOpenTarget(
        request.context.workspace,
        request.arguments.workspace_path,
        application,
      );
    }
    if (mac && background) {
      const existingInventory = request.context.backgroundOnly
        ? await this.list(request)
        : undefined;
      if (document && this.ctx.options.readWindowContext) {
        const inventory = existingInventory ?? (await this.list(request));
        const candidates = [...this.ctx.computer.windows.values()]
          .filter(
            (window) =>
              this.ctx.computer.apps.get(window.appId)?.identity ===
                `bundle:${application.toLowerCase()}` && window.title === basename(document),
          )
          .slice(0, 4);
        for (const window of candidates) {
          request.context.signal?.throwIfAborted();
          const context = await this.ctx.options
            .readWindowContext(window.pid, window.windowId)
            .catch(() => undefined);
          if (
            context?.status !== 'ready' ||
            context.bundleID.toLowerCase() !== application.toLowerCase()
          )
            continue;
          let exact = false;
          try {
            exact = !!context.documentURL && fileURLToPath(context.documentURL) === document;
          } catch {
            // A title or malformed/non-file URL never proves document identity.
          }
          if (!exact || !(await this.windowStillValid(window, request))) continue;
          return {
            outcome: 'verified',
            summary:
              'The exact working-folder document is already open. Reused its window without launching or activating the app; inspect fresh state before acting.',
            data: {
              ...asRecord(inventory.data),
              delivery_requested: 'background',
              opened_workspace_path: document,
              reused_window_id: window.id,
            },
            verification: {
              evidence:
                'Matched the live exact-window local document URL to the authorized path.',
            },
          };
        }
      }
      if (request.context.backgroundOnly) {
        const existing = [...this.ctx.computer.windows.values()].some(
          (window) =>
            this.ctx.computer.apps.get(window.appId)?.identity ===
            `bundle:${application.toLowerCase()}`,
        );
        if (!document && existing)
          return {
            outcome: 'verified',
            summary:
              'The app already has an open window. Reused its inventory without launching or activating it; inspect the exact task window next.',
            data: {
              ...asRecord(existingInventory?.data),
              delivery_requested: 'background',
              reused_running_app: true,
            },
            verification: {
              evidence: 'Read the existing process and windows without opening the app.',
            },
          };
        return {
          outcome: 'needs_foreground',
          summary:
            'Opening an app or document can take focus, so strict background mode did not launch it.',
          data: {
            blocker_code: 'background_launch_blocked',
            delivery_requested: 'background',
            ...asRecord(existingInventory?.data),
            next_step:
              'Use an already-open task window with supported background controls. Do not open another app to evade this restriction. If the exact document is not available, report that gap; the person may open it when convenient.',
          },
        };
      }
      const launched = await this.ctx.callCua(request, 'launch_app', {
        bundle_id: application,
        session: this.ctx.computer.session(request),
        ...(document ? { urls: [document] } : {}),
      });
      const refusal = resultRefusal(launched);
      if (refusal) return refusal;
      if (asRecord(launched)?.self_activation_suppressed === false)
        return {
          outcome: 'needs_foreground',
          summary:
            'The app opened, but the driver could not keep it behind your current app. No further input was sent.',
          data: { blocker_code: 'app_focus_not_restored', delivery_requested: 'background' },
        };
    } else {
      if (!this.ctx.options.openApplication) return refused('App opening is unavailable.');
      await this.ctx.options.openApplication(installed ? application : requested, {
        background,
      });
    }
    if (!mac) this.ctx.computer.reset();
    if (mac) await delay(350, undefined, { signal: request.context.signal });
    const inventory = mac ? await this.list(request) : undefined;
    return {
      outcome: 'verified',
      summary: `Requested opening ${entry?.name ?? 'Apple Notes'}. ${inventory ? 'Use the returned window ids to inspect the app; no extra computer_list is needed.' : 'Call computer_list for fresh window grants before continuing.'}`,
      data: {
        ...asRecord(inventory?.data),
        delivery_requested: background ? 'background' : 'foreground',
        ...(document ? { opened_workspace_path: document } : {}),
      },
      verification: {
        evidence:
          mac && background
            ? 'The bundled native driver requested background app opening; inspect the exact document or window next.'
            : 'The trusted desktop host submitted the installed application to LaunchServices; inspect its current windows next.',
      },
    };
  }

  async openUrl(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (!this.ctx.macBrowserAccess())
      return refused('Choose Use my Mac before opening a website through the default browser.');
    const value = requiredString(request.arguments.url, 'url');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return refused('Use a valid HTTP or HTTPS website address.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      browserUrlLooksSensitive(url.toString())
    )
      return {
        outcome: 'refused',
        summary:
          'This address is outside website-navigation policy. No page was opened or inspected; this refusal does not establish that the account needs sign-in.',
        data: {
          blocker_code: 'url_policy_blocked',
          observed_authentication: false,
          next_step:
            'Use an ordinary observed website link or an already-authorized browser window. Do not attempt authentication or infer account status from a blocked address.',
        },
      };
    const background = request.arguments.delivery !== 'foreground';
    if (request.context.backgroundOnly)
      return {
        outcome: 'needs_foreground',
        summary:
          'Strict background mode did not ask macOS to open a website because that can activate the default browser or change the window you are using.',
        data: {
          blocker_code: 'background_launch_blocked',
          delivery_requested: 'background',
          next_step:
            'Discover the existing signed-in browser with computer_list. Navigate only through its fresh, supported background window controls. Do not assume the system default browser has the right account. If no safe route exists, report the blocked step without opening or activating an app.',
        },
      };
    if (!this.ctx.options.openUrl) return refused('Website opening is unavailable.');
    await this.ctx.options.openUrl(url.toString(), { background });
    await delay(350, undefined, { signal: request.context.signal });
    const inventory = await this.list(request);
    return {
      outcome: 'accepted_unverified',
      summary:
        'Requested opening the website in the default browser. Use the returned window ids with computer_snapshot and expected_url to inspect the resulting page; no extra computer_list is needed. Do not ask the person to repeat the task.',
      data: {
        ...(asRecord(inventory.data) ?? {}),
        delivery_requested: background ? 'background' : 'foreground',
        next_step:
          'Call computer_snapshot on the matching browser window. If it is still loading, wait and observe again. If an actual authentication screen is observed, ask the person to finish signing in and continue this same request.',
      },
      verification: {
        evidence: 'The trusted desktop host submitted the validated web URL to macOS.',
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

  async windowStillValid(
    binding: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<boolean> {
    const app = this.ctx.computer.apps.get(binding.appId);
    if (!app || app.expiresAt <= Date.now()) return false;
    const [appsValue, windowsValue] = await Promise.all([
      this.ctx.callCua(request, 'list_apps', {}),
      this.ctx.callCua(request, 'list_windows', { pid: binding.pid }),
    ]);
    const currentApp = findRecordArray(appsValue, 'apps').find(
      (record) => positiveInteger(record.pid, MAX_PID) === binding.pid,
    );
    const appName = currentApp && firstString(currentApp, ['name', 'app_name']);
    const bundleId = currentApp && firstString(currentApp, ['bundle_id', 'bundleId']);
    if (
      !currentApp ||
      this.#appBlocked(appName, bundleId) ||
      computerAppIdentity(appName, bundleId) !== app.identity
    ) {
      return false;
    }
    const currentWindow = findRecordArray(windowsValue, 'windows').find(
      (record) =>
        positiveInteger(record.pid, MAX_PID) === binding.pid &&
        positiveInteger(record.window_id ?? record.id, MAX_WINDOW_ID) === binding.windowId,
    );
    return Boolean(
      currentWindow &&
      !this.#appBlocked(firstString(currentWindow, ['app_name', 'name']), bundleId),
    );
  }
}
