import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  isSensitiveComputerApp,
  type ActionExecutionResult,
  type ValidatedActionInvocation,
} from '@sia/action-gateway';
import { MAC_BROWSER_BUNDLES } from '../mac/browser-window.js';
import { refused } from './action-results.js';
import { requiredString } from './arguments.js';
import { browserUrlLooksSensitive } from './browser-urls.js';
import type { ComputerAppBinding, ComputerWindowBinding } from './computer-grants.js';
import type { ActionBackendContext } from './context.js';
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
    this.ctx.computer.session(request);
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

    return {
      outcome: 'verified',
      summary: `Found ${apps.length} running application${apps.length === 1 ? '' : 's'} and ${windows.length} window${windows.length === 1 ? '' : 's'}.`,
      data: {
        apps,
        windows,
        ...(this.ctx.macBrowserAccess()
          ? {
              browser_route:
                'Use computer_snapshot and computer_action on an existing browser window. No Chrome attachment is needed. Prefer the active browser or the window matching this task. Sensitive or ambiguous windows require user input.',
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
    if (
      !this.ctx.options.openApplication ||
      (installed && !entry) ||
      this.#appBlocked(entry?.name, application)
    ) {
      return refused('Choose a permitted installed application from computer_list.');
    }
    if (!installed && requested !== 'notes')
      return refused('Application discovery is unavailable in this build.');
    const mac = this.ctx.macBrowserAccess();
    const background =
      request.arguments.delivery === 'background' ||
      (mac && request.arguments.delivery !== 'foreground');
    await this.ctx.options.openApplication(installed ? application : requested, { background });
    if (!mac) this.ctx.computer.reset();
    if (mac) await delay(350, undefined, { signal: request.context.signal });
    const inventory = mac ? await this.list(request) : undefined;
    return {
      outcome: 'verified',
      summary: `Requested opening ${entry?.name ?? 'Apple Notes'}. ${inventory ? 'Use the returned window ids to inspect the app; no extra computer_list is needed.' : 'Call computer_list for fresh window grants before continuing.'}`,
      data: {
        ...asRecord(inventory?.data),
        delivery_requested: background ? 'background' : 'foreground',
      },
      verification: {
        evidence:
          'The trusted desktop host submitted the installed application to LaunchServices; inspect its current windows next.',
      },
    };
  }

  async openUrl(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (!this.ctx.macBrowserAccess() || !this.ctx.options.openUrl)
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
      return refused(
        'Authentication, credential, internal, and non-web addresses cannot be opened by Sia. Open that page yourself, finish the login, then continue this task.',
      );
    const background = request.arguments.delivery !== 'foreground';
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
