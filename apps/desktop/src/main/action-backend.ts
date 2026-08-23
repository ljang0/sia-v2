import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type {
  ActionBackend,
  ActionExecutionResult,
  ValidatedActionInvocation,
} from '@sia/action-gateway';
import {
  isConnectionReconnectRequired,
  type CloudClient,
  type PreparedActionResult,
} from './cloud-client.js';
import {
  isCuaCallResult,
  type CuaAuthorizationContext,
  type CuaService,
} from './cua-service.js';

/** Narrow structural boundary used by the desktop host and by unit tests. */
export type CuaToolCaller = Pick<CuaService, 'call'>;

/** The backend never receives OAuth credentials; it only calls the authenticated control plane. */
export type CloudActionClient = Pick<CloudClient, 'prepareAction' | 'commitAction'> &
  Partial<Pick<CloudClient, 'configured' | 'stageConnectorFile'>>;

export interface ScheduleActionHost {
  create(
    threadId: string,
    input: {
      task: string;
      cadence: 'once' | 'hourly' | 'daily' | 'weekly';
      firstRunAt?: string;
      maxRuns?: number;
    },
  ): unknown;
  list(threadId: string): unknown;
  update(
    threadId: string,
    input: {
      scheduleId: string;
      task?: string;
      cadence?: 'once' | 'hourly' | 'daily' | 'weekly';
      nextRunAt?: string;
      enabled?: boolean;
      maxRuns?: number;
    },
  ): unknown;
  delete(threadId: string, scheduleId: string): unknown;
}

export interface DesktopActionBackendOptions {
  readonly cua: CuaToolCaller;
  readonly cloud?: CloudActionClient;
  /** Must match the trusted browser-attachment session owned by the controller. */
  readonly browserSessionId?: string;
  /** Optional host policy layered on top of the CUA attachment grant. */
  readonly isBrowserOriginAllowed?: (origin: string) => boolean;
  /** Lets the trusted host attach Chrome on demand; resolves an error detail when it cannot. */
  readonly ensureBrowserAttached?: () => Promise<string | undefined>;
  /** Resolves a stable model-visible app/account selector to a trusted cloud connection. */
  readonly resolveConnectionId?: (
    app: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack',
    selector: string,
    approvalId?: string,
  ) => string | undefined;
  /** Updates the trusted local connection view when the control plane rejects an expired grant. */
  readonly onConnectionReconnectRequired?: (
    app: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack',
    connectionId: string,
  ) => void;
  /** Main-process pid, injectable only so the host-self exclusion can be tested. */
  readonly hostPid?: number;
  /** Local Apple Messages integration; absent off macOS or in tests that do not use it. */
  readonly messages?: {
    search(query: string | undefined, limit: number): unknown[];
    readThread(chatId: string, limit: number): unknown[];
    send(recipient: string, text: string): Promise<void>;
  };
  /** Persists agent-authored schedules in the controller-owned desktop state. */
  readonly schedules?: ScheduleActionHost;
  /** Opens System Settings at the Full Disk Access pane so the one grant is a switch flip. */
  readonly openFullDiskAccessSettings?: () => Promise<void>;
}

interface NativeElementAddress {
  readonly token?: string;
  readonly index?: number;
  readonly label?: string;
  readonly role?: string;
}

interface ComputerAppBinding {
  readonly id: string;
  readonly pid: number;
  readonly identity: string;
  readonly name: string;
  readonly expiresAt: number;
}

interface ComputerWindowBinding {
  readonly id: string;
  readonly appId: string;
  readonly pid: number;
  readonly windowId: number;
  readonly title?: string;
  readonly expiresAt: number;
}

interface WindowSnapshotCapability {
  readonly id: string;
  readonly appId: string;
  readonly publicWindowId: string;
  readonly pid: number;
  readonly windowId: number;
  readonly nativeSnapshotId?: string;
  readonly elements: ReadonlyMap<string, NativeElementAddress>;
}

interface BrowserBinding {
  readonly targetId: string;
  readonly tabId: string;
  readonly session: string;
  origin?: string;
}

interface BrowserSnapshotCapability {
  readonly id: string;
  readonly targetId: string;
  readonly tabId: string;
  readonly session: string;
  readonly origin: string;
  readonly url: string;
  readonly elements: ReadonlyMap<
    string,
    { readonly nativeRef: string; readonly label?: string; readonly role?: string }
  >;
}

const CONNECTOR_TOOLS = {
  mail_search: 'mail.search',
  mail_read_thread: 'mail.read_thread',
  mail_create_draft: 'mail.create_draft',
  mail_send: 'mail.send',
  drive_search: 'drive.search',
  drive_read: 'drive.read',
  drive_upload: 'drive.upload',
  drive_share: 'drive.share',
  docs_create: 'docs.create',
  docs_read: 'docs.read',
  docs_append: 'docs.append',
  sheets_create: 'sheets.create',
  sheets_read: 'sheets.read',
  sheets_update: 'sheets.update',
  sheets_append: 'sheets.append',
  slides_create: 'slides.create',
  slides_read: 'slides.read',
  slides_append: 'slides.append',
  slack_search: 'slack.search',
  slack_find_users: 'slack.find_users',
  slack_open_dm: 'slack.open_dm',
  slack_read_thread: 'slack.read_thread',
  slack_post: 'slack.post',
} as const;

type ConnectorTool = keyof typeof CONNECTOR_TOOLS;

const MAX_PID = 2_147_483_647;
const MAX_WINDOW_ID = 4_294_967_295;
const MAX_CAPABILITIES = 128;
const MAX_BROWSER_UPLOAD_BYTES = 100_000_000;
const BROWSER_UPLOAD_RETENTION_MS = 10 * 60_000;
// A real model turn can spend several minutes reasoning between inventory and
// action. Keep the opaque app/window ids long enough for that turn to finish;
// every snapshot/action still revalidates the live process and exact window,
// and every mutation remains bound to the latest host-minted snapshot ref.
const COMPUTER_GRANT_TTL_MS = 10 * 60_000;
const SENSITIVE_COMPUTER_APP =
  /(?:^|[\s._-])(?:sia|1password|bitwarden|lastpass|dashlane|keeper|enpass|strongbox|keepass|secrets?|authenticator|keychain|password|terminal|iterm|warp|alacritty|system settings|system preferences|chrome|safari|firefox|arc)(?:$|[\s._-])|(?:ai\.sia\.desktop|com\.apple\.security|com\.google\.chrome)/i;
const SENSITIVE_BROWSER_HOST =
  /(?:^|\.)(?:accounts\.google\.com|login\.microsoftonline\.com|appleid\.apple\.com|id\.apple\.com|auth0\.com|okta\.com|1password\.com|bitwarden\.com|lastpass\.com|dashlane\.com|keepersecurity\.com)$/i;
const SENSITIVE_BROWSER_PATH =
  /(?:^|\/)(?:login|log-in|signin|sign-in|signup|sign-up|oauth|authorize|authorization|auth|mfa|2fa|webauthn|passkey|password|reset|reset-password|magic|magic-link|tokens?|access[-_]?tokens?|personal[-_]?access[-_]?tokens?|api[-_]?keys?|credentials?|secrets?|security)(?:\/|$)/i;
const SENSITIVE_BROWSER_QUERY_KEY =
  /(?:^|[^a-z0-9])(?:api[-_]?key|access[-_]?token|auth|authorization|code|credentials?|jwt|key|password|refresh[-_]?token|secret|session|signature|sig|token)(?:$|[^a-z0-9])/i;
const BROWSER_VAULT_NAME = /^sia-browser-(?:upload|download)-[A-Za-z0-9]{6,}$/;
const MAX_CONNECTOR_UPLOAD_BYTES = 5_000_000;
const SENSITIVE_UPLOAD_PATH =
  /(?:^|\/)(?:\.ssh|\.aws|\.gnupg|Library\/Keychains)(?:\/|$)|(?:^|\/)(?:id_rsa|id_ed25519|\.env)(?:\.|$)/i;
const CONNECTOR_UPLOAD_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.rtf': 'application/rtf',
  '.tsv': 'text/tab-separated-values',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

/** Removes only old, private Sia transfer vaults left behind by an unclean exit. */
export async function sweepStaleBrowserVaults(
  root = tmpdir(),
  now = Date.now(),
): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !BROWSER_VAULT_NAME.test(entry.name)) continue;
    const candidate = join(root, entry.name);
    try {
      const metadata = await lstat(candidate);
      const currentUid = process.getuid?.();
      if (
        metadata.isSymbolicLink() ||
        !metadata.isDirectory() ||
        (currentUid !== undefined && metadata.uid !== currentUid) ||
        (metadata.mode & 0o077) !== 0 ||
        now - metadata.mtimeMs < BROWSER_UPLOAD_RETENTION_MS
      ) {
        continue;
      }
      await rm(candidate, { recursive: true, force: false });
    } catch {
      // Startup cleanup is best effort and never broadens beyond the validated child.
    }
  }
}

/**
 * Translates Sia's small canonical tool surface into CUA and cloud calls.
 *
 * CUA target ids, element tokens, and target-specific arguments stay in this
 * trusted main-process object. Models only receive Sia-minted snapshot and
 * element references, so a ref cannot be replayed against another window/tab.
 */
export class DesktopActionBackend implements ActionBackend {
  readonly #cua: CuaToolCaller;
  readonly #cloud: CloudActionClient | undefined;
  #browserSessionId: string;
  readonly #isBrowserOriginAllowed: ((origin: string) => boolean) | undefined;
  readonly #ensureBrowserAttached: (() => Promise<string | undefined>) | undefined;
  readonly #messages: DesktopActionBackendOptions['messages'];
  readonly #schedules: ScheduleActionHost | undefined;
  readonly #openFullDiskAccessSettings: (() => Promise<void>) | undefined;
  #fullDiskAccessSettingsOpened = false;
  #lastAttachDetail: string | undefined;
  readonly #resolveConnectionId:
    | ((
        app: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack',
        selector: string,
        approvalId?: string,
      ) => string | undefined)
    | undefined;
  readonly #onConnectionReconnectRequired:
    DesktopActionBackendOptions['onConnectionReconnectRequired'] | undefined;
  readonly #hostPid: number;
  readonly #computerApps = new Map<string, ComputerAppBinding>();
  readonly #computerWindows = new Map<string, ComputerWindowBinding>();
  readonly #windowSnapshots = new Map<string, WindowSnapshotCapability>();
  readonly #latestWindowSnapshot = new Map<string, string>();
  readonly #browserBindings = new Map<string, BrowserBinding>();
  readonly #browserSnapshots = new Map<string, BrowserSnapshotCapability>();
  readonly #latestBrowserSnapshot = new Map<string, string>();
  #browserAttached = false;
  readonly #browserUploadDirectories = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: DesktopActionBackendOptions) {
    this.#cua = options.cua;
    this.#cloud = options.cloud;
    this.#browserSessionId = options.browserSessionId ?? 'sia-browser';
    this.#isBrowserOriginAllowed = options.isBrowserOriginAllowed;
    this.#ensureBrowserAttached = options.ensureBrowserAttached;
    this.#messages = options.messages;
    this.#schedules = options.schedules;
    this.#openFullDiskAccessSettings = options.openFullDiskAccessSettings;
    this.#resolveConnectionId = options.resolveConnectionId;
    this.#onConnectionReconnectRequired = options.onConnectionReconnectRequired;
    this.#hostPid = options.hostPid ?? process.pid;
    void sweepStaleBrowserVaults();
  }

  /** Indexes a trusted browser_prepare/get_browser_state result without exposing target ids. */
  acceptBrowserState(value: unknown, sessionId?: string): void {
    if (sessionId && sessionId !== this.#browserSessionId) {
      this.resetBrowserCapabilities();
      this.#browserSessionId = sessionId;
    }
    this.#indexBrowserBindings(value);
    this.#browserAttached = true;
  }

  /** Called when the trusted host detaches the browser or its grant expires. */
  resetBrowserCapabilities(): void {
    this.#browserAttached = false;
    this.#browserBindings.clear();
    this.#browserSnapshots.clear();
    this.#latestBrowserSnapshot.clear();
    for (const [directory, timeout] of this.#browserUploadDirectories) {
      clearTimeout(timeout);
      void rm(directory, { recursive: true, force: true });
    }
    this.#browserUploadDirectories.clear();
  }

  /**
   * Resolves a model-supplied ref against host-owned snapshot capabilities for
   * the approval UI. Labels and roles come only from the trusted CUA snapshot;
   * model-supplied presentation strings are never used.
   */
  trustedApprovalTarget(
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): string | undefined {
    if (toolName === 'computer_action') {
      const snapshotId = stringValue(argumentsValue.snapshot_id);
      const windowId = stringValue(argumentsValue.window_id);
      const appId = stringValue(argumentsValue.app_id);
      const ref = stringValue(argumentsValue.element_ref);
      const action = stringValue(argumentsValue.action);
      const snapshot = snapshotId ? this.#windowSnapshots.get(snapshotId) : undefined;
      const window = windowId ? this.#computerWindows.get(windowId) : undefined;
      const app = appId ? this.#computerApps.get(appId) : undefined;
      const element = snapshot && ref ? snapshot.elements.get(ref) : undefined;
      if (
        !snapshot ||
        !window ||
        !app ||
        !appId ||
        !windowId ||
        !snapshotId ||
        !action ||
        (ref ? !element : !['type', 'key', 'scroll'].includes(action)) ||
        snapshot.appId !== appId ||
        snapshot.publicWindowId !== windowId ||
        window.appId !== appId ||
        this.#latestWindowSnapshot.get(windowId) !== snapshotId ||
        app.expiresAt <= Date.now() ||
        window.expiresAt <= Date.now()
      ) {
        return undefined;
      }
      const windowLabel = window.title ? `, window “${window.title}”` : '';
      return element && ref
        ? `${app.name}${windowLabel}: ${action} ${approvalElementLabel(element, ref)}`
        : `${app.name}${windowLabel}: ${action} the currently focused control`;
    }
    if (toolName === 'browser_action' || toolName === 'browser_upload') {
      const snapshotId = stringValue(argumentsValue.snapshot_id);
      const tabId = stringValue(argumentsValue.tab_id);
      const ref = stringValue(argumentsValue.element_ref);
      const snapshot = snapshotId ? this.#browserSnapshots.get(snapshotId) : undefined;
      const binding = tabId ? this.#browserBindings.get(tabId) : undefined;
      if (
        !snapshot ||
        !binding ||
        !tabId ||
        !snapshotId ||
        snapshot.tabId !== tabId ||
        snapshot.targetId !== binding.targetId ||
        this.#latestBrowserSnapshot.get(tabId) !== snapshotId ||
        declaredOrigin(argumentsValue.origin) !== snapshot.origin
      ) {
        return undefined;
      }
      const action =
        toolName === 'browser_upload'
          ? 'upload files through'
          : stringValue(argumentsValue.action) === 'click' && process.platform === 'darwin'
            ? 'click via an explicit page DOM event on'
            : stringValue(argumentsValue.action);
      const element = ref ? snapshot.elements.get(ref) : undefined;
      if (!action || !element || !ref) return undefined;
      return `${snapshot.origin}: ${action} ${approvalElementLabel(element, ref)}`;
    }
    return undefined;
  }

  async invoke(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    try {
      switch (request.name) {
        case 'computer_list':
          return await this.#computerList(request);
        case 'computer_snapshot':
          return await this.#computerSnapshot(request);
        case 'computer_action':
          return await this.#computerAction(request);
        case 'browser_tabs':
          await this.#attachOnDemand();
          return await this.#browserTabs(request);
        case 'browser_snapshot':
          await this.#attachOnDemand();
          return await this.#browserSnapshot(request);
        case 'browser_navigate':
          await this.#attachOnDemand();
          return await this.#browserNavigate(request);
        case 'browser_action':
          await this.#attachOnDemand();
          return await this.#browserAction(request);
        case 'browser_upload':
          await this.#attachOnDemand();
          return await this.#browserUpload(request);
        case 'mail_search':
        case 'mail_read_thread':
        case 'mail_create_draft':
        case 'mail_send':
        case 'drive_search':
        case 'drive_read':
        case 'drive_upload':
        case 'drive_share':
        case 'docs_create':
        case 'docs_read':
        case 'docs_append':
        case 'sheets_create':
        case 'sheets_read':
        case 'sheets_update':
        case 'sheets_append':
        case 'slides_create':
        case 'slides_read':
        case 'slides_append':
        case 'slack_search':
        case 'slack_find_users':
        case 'slack_open_dm':
        case 'slack_read_thread':
        case 'slack_post':
          return await this.#connectorAction(request, request.name);
        case 'messages_search':
        case 'messages_read_thread':
        case 'messages_send':
          return await this.#messagesAction(request);
        case 'schedule_create':
        case 'schedule_list':
        case 'schedule_update':
        case 'schedule_delete':
          return this.#scheduleAction(request);
      }
    } catch (error) {
      if (isConnectionReconnectRequired(error)) {
        return refused(
          'This connected app authorization expired. Reconnect it in Settings > Apps, then retry.',
        );
      }
      return classifyFailure(error);
    }
  }

  #scheduleAction(request: ValidatedActionInvocation): ActionExecutionResult {
    const schedules = this.#schedules;
    if (!schedules) return refused('Scheduled work is unavailable in this build.');
    if (request.name !== 'schedule_list' && !request.approvalId) {
      return refused('This schedule change is missing its exact action authorization.');
    }
    const args = request.arguments;
    switch (request.name) {
      case 'schedule_create': {
        const cadence = args.cadence as 'once' | 'hourly' | 'daily' | 'weekly';
        const schedule = schedules.create(request.context.threadId, {
          task: String(args.task),
          cadence,
          ...(typeof args.first_run_at === 'string' ? { firstRunAt: args.first_run_at } : {}),
          ...(typeof args.max_runs === 'number' ? { maxRuns: args.max_runs } : {}),
        });
        return {
          outcome: 'verified',
          summary: `Created the ${cadence} schedule.`,
          data: { schedule },
          verification: { evidence: 'Persisted in Sia desktop schedule state.' },
        };
      }
      case 'schedule_list': {
        const scheduleList = schedules.list(request.context.threadId);
        return {
          outcome: 'verified',
          summary: 'Listed scheduled work for this thread.',
          data: { schedules: scheduleList },
          verification: { evidence: 'Read from Sia desktop schedule state.' },
        };
      }
      case 'schedule_update': {
        const schedule = schedules.update(request.context.threadId, {
          scheduleId: String(args.schedule_id),
          ...(typeof args.task === 'string' ? { task: args.task } : {}),
          ...(typeof args.cadence === 'string'
            ? {
                cadence: args.cadence as 'once' | 'hourly' | 'daily' | 'weekly',
              }
            : {}),
          ...(typeof args.next_run_at === 'string' ? { nextRunAt: args.next_run_at } : {}),
          ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {}),
          ...(typeof args.max_runs === 'number' ? { maxRuns: args.max_runs } : {}),
        });
        return {
          outcome: 'verified',
          summary: 'Updated the schedule.',
          data: { schedule },
          verification: { evidence: 'Persisted in Sia desktop schedule state.' },
        };
      }
      case 'schedule_delete': {
        const scheduleId = String(args.schedule_id);
        schedules.delete(request.context.threadId, scheduleId);
        return {
          outcome: 'verified',
          summary: 'Deleted the schedule.',
          data: { schedule_id: scheduleId },
          verification: { evidence: 'Removed from Sia desktop schedule state.' },
        };
      }
      default:
        return refused('Unsupported schedule action.');
    }
  }

  async #messagesAction(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const messages = this.#messages;
    if (!messages) return refused('Apple Messages is unavailable on this Mac.');
    const args = request.arguments;
    if (request.name === 'messages_send') {
      // Same fail-closed contract as connector mutations: the exact send must have crossed
      // the host authorization boundary, whether authorization was automatic or interactive.
      if (!request.approvalId) {
        return refused('This message send is missing its exact action authorization.');
      }
      await messages.send(String(args.recipient), String(args.text));
      return {
        outcome: 'verified',
        summary: `Sent the iMessage to ${String(args.recipient)}.`,
        verification: {
          evidence: 'The signed-in Messages app accepted the send via Apple events.',
        },
      };
    }
    const limit = Math.min(
      Number(args.limit) || (request.name === 'messages_search' ? 20 : 30),
      100,
    );
    let rows: unknown[];
    try {
      rows =
        request.name === 'messages_search'
          ? messages.search(typeof args.query === 'string' ? args.query : undefined, limit)
          : messages.readThread(String(args.chat_id), limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Messages could not be read.';
      if (/Full Disk Access/i.test(message) && this.#openFullDiskAccessSettings) {
        // The grant itself is user-only by macOS design; the most automatic legal flow is
        // opening the exact settings pane so the person only flips the switch.
        if (!this.#fullDiskAccessSettingsOpened) {
          this.#fullDiskAccessSettingsOpened = true;
          void this.#openFullDiskAccessSettings().catch(() => undefined);
        }
        return refused(
          `${message} System Settings has been opened at the Full Disk Access pane — turn on Sia (or the app Sia was launched from during development), then ask again.`,
        );
      }
      return refused(message);
    }
    return {
      outcome: 'verified',
      summary: `Read ${rows.length} local message${rows.length === 1 ? '' : 's'} from the Messages transcript.`,
      data: { messages: rows },
      verification: { evidence: 'Read directly from the local Messages database.' },
    };
  }

  async #attachOnDemand(): Promise<void> {
    if (this.#browserAttached || !this.#ensureBrowserAttached) return;
    this.#lastAttachDetail = await this.#ensureBrowserAttached();
  }

  async #computerList(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    this.#resetComputerCapabilities();
    const [appsValue, windowsValue] = await Promise.all([
      this.#callCua(request, 'list_apps', {}),
      this.#callCua(request, 'list_windows', { on_screen_only: false }),
    ]);
    const expiresAt = Date.now() + COMPUTER_GRANT_TTL_MS;
    const appByPid = new Map<number, ComputerAppBinding>();
    const apps = findRecordArray(appsValue, 'apps').flatMap((record) => {
      const pid = positiveInteger(record.pid, MAX_PID);
      const name = firstString(record, ['name', 'app_name']);
      const bundleId = firstString(record, ['bundle_id', 'bundleId']);
      const identity = computerAppIdentity(name, bundleId);
      if (
        !pid ||
        pid === this.#hostPid ||
        !identity ||
        computerAppLooksSensitive(name, bundleId)
      )
        return [];
      const binding: ComputerAppBinding = {
        id: `app:${randomUUID()}`,
        pid,
        identity,
        name: name ?? bundleId!,
        expiresAt,
      };
      appByPid.set(pid, binding);
      this.#computerApps.set(binding.id, binding);
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
        if (!app || !windowId || computerAppLooksSensitive(nativeAppName)) return undefined;
        const title = trustedDisplayText(firstString(record, ['title']));
        const isOnScreen = firstBoolean(record, ['is_on_screen', 'on_screen']);
        const onCurrentSpace = firstBoolean(record, ['on_current_space']);
        if (!title && isOnScreen === false && onCurrentSpace !== true) return undefined;
        const binding: ComputerWindowBinding = {
          id: `window:${randomUUID()}`,
          appId: app.id,
          pid: app.pid,
          windowId,
          ...(title ? { title } : {}),
          expiresAt,
        };
        this.#computerWindows.set(binding.id, binding);
        return compact({
          app_id: binding.appId,
          window_id: binding.id,
          app_name: app.name,
          title: firstString(record, ['title']),
          bounds: sanitizeFrame(record.bounds),
          is_on_screen: isOnScreen,
          on_current_space: onCurrentSpace,
        });
      })
      .filter(isDefined);
    return {
      outcome: 'verified',
      summary: `Found ${apps.length} running application${apps.length === 1 ? '' : 's'} and ${windows.length} window${windows.length === 1 ? '' : 's'}.`,
      data: { apps, windows },
      verification: {
        evidence: 'Read directly from the current WindowServer and app inventory.',
      },
    };
  }

  async #computerSnapshot(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const appId = requiredString(request.arguments.app_id, 'app_id');
    const windowId = requiredString(request.arguments.window_id, 'window_id');
    const binding = this.#resolveComputerWindow(appId, windowId);
    if (!binding || !(await this.#computerWindowStillValid(binding, request))) {
      return stale('The computer grant is missing, expired, or no longer matches this window.');
    }
    return this.#captureWindow(binding, request);
  }

  async #captureWindow(
    binding: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    const raw = await this.#callCua(request, 'get_window_state', {
      pid: binding.pid,
      window_id: binding.windowId,
      session: request.context.sessionId,
      include_screenshot: true,
    });
    const refusalResult = resultRefusal(raw);
    if (refusalResult) return refusalResult;

    const snapshotId = randomUUID();
    const nativeSnapshotId = findString(raw, ['snapshot_id', 'snapshotId']);
    const elementMap = new Map<string, NativeElementAddress>();
    const elements = findElementRecords(raw, 'window')
      .map((record, position) => {
        if (isProtectedElement(record) || isHiddenWindowStructure(record)) return undefined;
        const token = firstString(record, ['element_token', 'elementToken']);
        const index = nonNegativeInteger(record.element_index ?? record.elementIndex);
        if (!token && (index === undefined || !nativeSnapshotId)) return undefined;
        const ref = `w:${snapshotId}:${position}`;
        const label = trustedElementLabel(record);
        const role = trustedDisplayText(firstString(record, ['role', 'type']));
        elementMap.set(ref, {
          ...(token ? { token } : {}),
          ...(index === undefined ? {} : { index }),
          ...(label ? { label } : {}),
          ...(role ? { role } : {}),
        });
        return sanitizeElement(record, ref);
      })
      .filter(isDefined);
    const capability: WindowSnapshotCapability = {
      id: snapshotId,
      appId: binding.appId,
      publicWindowId: binding.id,
      pid: binding.pid,
      windowId: binding.windowId,
      elements: elementMap,
      ...(nativeSnapshotId ? { nativeSnapshotId } : {}),
    };
    this.#rememberWindowSnapshot(capability);
    return {
      outcome: 'verified',
      summary: 'Captured a fresh state for the permitted window.',
      ...actionImages(raw),
      data: compact({
        snapshot_id: snapshotId,
        app_id: binding.appId,
        window_id: binding.id,
        elements,
      }),
      verification: {
        snapshotId,
        evidence: 'The snapshot is bound to a short-lived host-verified window grant.',
      },
    };
  }

  async #computerAction(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const appId = requiredString(args.app_id, 'app_id');
    const windowId = requiredString(args.window_id, 'window_id');
    const binding = this.#resolveComputerWindow(appId, windowId);
    if (!binding || !(await this.#computerWindowStillValid(binding, request))) {
      return stale('The computer grant is missing, expired, or no longer matches this window.');
    }
    const snapshotId = requiredString(args.snapshot_id, 'snapshot_id');
    const capability = this.#windowSnapshots.get(snapshotId);
    if (
      !capability ||
      capability.appId !== appId ||
      capability.publicWindowId !== windowId ||
      capability.pid !== binding.pid ||
      capability.windowId !== binding.windowId ||
      this.#latestWindowSnapshot.get(windowId) !== snapshotId
    ) {
      return stale('The window snapshot is missing, superseded, or belongs to another window.');
    }
    const address = this.#windowElementAddress(capability, args.element_ref);
    if (args.element_ref && !address)
      return stale('The element reference is not in this snapshot.');
    if (!address && !['type', 'key', 'scroll'].includes(String(args.action))) {
      return refused('This computer action requires an exact element reference.');
    }
    const base = compact({
      pid: binding.pid,
      window_id: binding.windowId,
      session: request.context.sessionId,
      delivery_mode: address ? 'background' : 'foreground',
      snapshot_id: capability.nativeSnapshotId,
      element_token: address?.token,
      element_index: address?.index,
    });

    let tool: string;
    let input: Record<string, unknown>;
    switch (args.action) {
      case 'click':
        tool = 'click';
        input = base;
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

    const raw = await this.#callCua(request, tool, input);
    const focusedFallback = !address;
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
    const after = await this.#captureWindow(binding, request);
    if (after.outcome !== 'verified') return after;
    const afterSnapshotId = after.verification?.snapshotId;
    return {
      outcome: native.outcome,
      summary:
        native.outcome === 'verified'
          ? `${native.summary} A fresh window snapshot was captured.`
          : `${native.summary} Inspect the fresh snapshot to confirm the postcondition.`,
      ...(after.images ? { images: after.images } : {}),
      data: { ...(asRecord(after.data) ?? {}), delivery: native.data },
      verification: compact({
        snapshotId: afterSnapshotId,
        evidence:
          native.outcome === 'verified'
            ? 'Cua Driver confirmed delivery and Sia captured fresh window state.'
            : 'Fresh window state is available, but the requested semantic effect was not proven.',
      }),
    };
  }

  async #browserTabs(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    if (!this.#browserAttached) {
      const detail =
        this.#lastAttachDetail ??
        'No browser attachment is active in the trusted desktop host.';
      return {
        outcome: 'verified',
        summary: `Found 0 granted browser tabs. ${detail} Chrome may still be running; report the attachment problem rather than concluding Chrome is closed.`,
        data: { tabs: [], attachment_problem: detail },
        verification: {
          evidence: 'No browser attachment is active in the trusted desktop host.',
        },
      };
    }
    const states: unknown[] = [];
    for (const binding of this.#browserBindings.values()) {
      try {
        const state = await this.#callCua(request, 'get_browser_state', {
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
      const state = await this.#callCua(request, 'get_browser_state', {
        session: this.#browserSessionId,
      });
      const refusalResult = resultRefusal(state);
      if (refusalResult) return refusalResult;
      states.push(state);
    }
    this.#browserBindings.clear();
    this.#browserSnapshots.clear();
    this.#latestBrowserSnapshot.clear();
    for (const state of states) this.#indexBrowserBindings(state);
    const records = states.flatMap(collectTabRecords);
    const tabs = records
      .filter((record) => !firstBoolean(record, ['private', 'incognito', 'is_private']))
      .map((record) => {
        const tabId = firstString(record, ['tab_id', 'tabId']);
        if (!tabId || !this.#browserBindings.has(tabId)) return undefined;
        const origin = originFromRecord(record);
        const url = safeHttpUrl(firstString(record, ['url']));
        if (
          !origin ||
          browserUrlLooksSensitive(url) ||
          (this.#isBrowserOriginAllowed && !this.#originAllowed(origin))
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

  async #browserSnapshot(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const tabId = requiredString(request.arguments.tab_id, 'tab_id');
    const binding = await this.#requireBrowserBinding(tabId, request);
    if (!binding) return refused('The tab is not part of the attached browser grant.');
    if (binding.origin && !this.#bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    return this.#captureBrowser(binding, request);
  }

  async #captureBrowser(
    binding: BrowserBinding,
    request: ValidatedActionInvocation,
  ): Promise<ActionExecutionResult> {
    const raw = await this.#callCua(request, 'get_browser_state', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      snapshot_format: 'semantic_v2',
      include_screenshot: true,
    });
    const refusalResult = resultRefusal(raw);
    if (refusalResult) return refusalResult;
    this.#indexBrowserBindings(raw);
    const location = findBrowserLocation(raw, binding.targetId, binding.tabId);
    const origin = location?.origin;
    if (origin) {
      binding.origin = origin;
      const indexedBinding = this.#browserBindings.get(binding.tabId);
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
      (this.#isBrowserOriginAllowed && !this.#originAllowed(origin))
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
    this.#rememberBrowserSnapshot(capability);
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

  async #browserNavigate(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const tabId = requiredString(args.tab_id, 'tab_id');
    const binding = await this.#revalidateBrowserBinding(tabId, request);
    if (!binding) return refused('The tab is not part of the attached browser grant.');
    const url = new URL(requiredString(args.url, 'url'));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return refused('Only HTTP and HTTPS browser navigation is allowed.');
    }
    if (browserUrlLooksSensitive(url.toString())) {
      return refused('Authentication and credential-management pages are not browser targets.');
    }
    if (!this.#originAllowed(url.origin)) {
      return refused(`Navigation to ${url.origin} is outside the current browser grant.`);
    }
    const raw = await this.#callCua(request, 'browser_navigate', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      url: url.toString(),
    });
    const native = actionResult(raw, `Navigation to ${url.origin} was accepted.`);
    if (terminalWithoutVerification(native)) return native;
    binding.origin = url.origin;
    return this.#browserActionWithVerification(binding, native, request);
  }

  async #browserAction(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const capability = await this.#browserCapability(args.tab_id, args.snapshot_id, request);
    if ('outcome' in capability) return capability;
    const binding = this.#browserBindings.get(capability.tabId);
    if (!binding) return stale('The browser binding expired.');
    if (!this.#bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    const originCheck = this.#checkDeclaredOrigin(binding, args.origin);
    if (originCheck) return originCheck;
    const nativeRef = this.#nativeBrowserRef(capability, args.element_ref);
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
    const raw = await this.#callCua(request, tool, input);
    const native = actionResult(
      raw,
      `Browser ${String(args.action)} was delivered in the background.`,
    );
    if (terminalWithoutVerification(native)) return native;
    return this.#browserActionWithVerification(binding, native, request);
  }

  async #browserUpload(request: ValidatedActionInvocation): Promise<ActionExecutionResult> {
    const args = request.arguments;
    const capability = await this.#browserCapability(args.tab_id, args.snapshot_id, request);
    if ('outcome' in capability) return capability;
    const binding = this.#browserBindings.get(capability.tabId);
    if (!binding) return stale('The browser binding expired.');
    if (!this.#bindingOriginAllowed(binding)) {
      return refused('The tab origin is outside the current browser grant.');
    }
    const originCheck = this.#checkDeclaredOrigin(binding, args.origin);
    if (originCheck) return originCheck;
    const ref = this.#nativeBrowserRef(capability, args.element_ref);
    if (!ref) return stale('The upload element reference is not in this snapshot.');
    const staged = await this.#stageBrowserUploadFiles(args.file_paths as string[]);
    let retained = false;
    try {
      const liveCapability = await this.#browserCapability(
        args.tab_id,
        args.snapshot_id,
        request,
      );
      if ('outcome' in liveCapability) return liveCapability;
      const raw = await this.#callCua(request, 'browser_set_input_files', {
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
      this.#retainBrowserUploadDirectory(staged.directory);
      retained = true;
      return this.#browserActionWithVerification(binding, native, request);
    } finally {
      if (!retained) await rm(staged.directory, { recursive: true, force: true });
    }
  }

  async #stageBrowserUploadFiles(
    paths: readonly string[],
  ): Promise<{ directory: string; files: string[] }> {
    const directory = await mkdtemp(join(tmpdir(), 'sia-browser-upload-'));
    await chmod(directory, 0o700);
    const files: string[] = [];
    try {
      for (const [index, path] of paths.entries()) {
        if (!isAbsolute(path) || pathLooksSensitive(path)) {
          throw new Error('Browser uploads require a non-sensitive absolute file path.');
        }
        const resolved = await realpath(path);
        if (resolved !== path || pathLooksSensitive(resolved)) {
          throw new Error('Browser uploads do not follow symbolic links or aliases.');
        }
        const source = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const sourceInfo = await source.stat();
          if (!sourceInfo.isFile() || sourceInfo.size > MAX_BROWSER_UPLOAD_BYTES) {
            throw new Error('Browser uploads require regular files no larger than 100 MB.');
          }
          const fileDirectory = join(directory, String(index));
          await mkdir(fileDirectory, { mode: 0o700 });
          const destination = join(fileDirectory, basename(resolved));
          const approvedBytes = Buffer.alloc(sourceInfo.size);
          const readResult = await source.read(approvedBytes, 0, approvedBytes.length, 0);
          if (readResult.bytesRead !== sourceInfo.size) {
            approvedBytes.fill(0);
            throw new Error('The approved upload changed while it was staged.');
          }
          await writeFile(destination, approvedBytes, { flag: 'wx', mode: 0o600 });
          approvedBytes.fill(0);
          files.push(destination);
        } finally {
          await source.close();
        }
      }
      return { directory, files };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  #retainBrowserUploadDirectory(directory: string): void {
    const timeout = setTimeout(() => {
      this.#browserUploadDirectories.delete(directory);
      void rm(directory, { recursive: true, force: true });
    }, BROWSER_UPLOAD_RETENTION_MS);
    timeout.unref();
    this.#browserUploadDirectories.set(directory, timeout);
  }

  async #connectorAction(
    request: ValidatedActionInvocation,
    name: ConnectorTool,
  ): Promise<ActionExecutionResult> {
    if (!this.#cloud || this.#cloud.configured === false) {
      return refused('Sia cloud services are not configured for connected-app tools.');
    }
    const accountSelector = requiredString(request.arguments.account_id, 'account_id');
    const connectorApp = connectorAppForTool(name);
    if (request.descriptor.annotations.requiresApproval && !request.approvalId) {
      return refused('This connector mutation is missing its exact action authorization.');
    }
    const connectionId = this.#resolveConnectionId?.(
      connectorApp,
      accountSelector,
      request.approvalId,
    );
    if (!connectionId) {
      return refused(connectorBrowserFallback(connectorApp));
    }
    const input =
      name === 'drive_upload'
        ? await this.#stageDriveUpload(request, connectionId)
        : withoutKey(request.arguments, 'account_id');
    if (request.context.signal?.aborted) return refused('Action cancelled before execution.');
    try {
      const prepared = await this.#cloud.prepareAction(
        {
          connectionId,
          tool: CONNECTOR_TOOLS[name],
          input,
        },
        request.context.signal,
      );
      if (prepared.status === 'executed') return connectorReadResult(name, prepared);
      if (!request.descriptor.annotations.requiresApproval) {
        return refused(
          'The connected app tried to turn a read-only request into a mutation without approval.',
        );
      }
      if (!isDeepStrictEqual(prepared.preview, input)) {
        return refused(
          'The connected app returned a preview that did not exactly match the approved action.',
        );
      }
      if (request.context.signal?.aborted) return refused('Action cancelled before commit.');
      const committed = await this.#cloud.commitAction(
        {
          actionId: prepared.actionId,
          digest: prepared.digest,
          input,
        },
        request.context.signal,
      );
      return {
        outcome: 'verified',
        summary:
          committed.status === 'already_completed'
            ? `${humanToolName(name)} was already completed; it was not repeated.`
            : `${humanToolName(name)} completed through the connected app.`,
        ...(committed.result === undefined ? {} : { data: committed.result }),
        verification: {
          evidence: `Cloud action ${committed.actionId} passed digest verification and idempotent commit.`,
        },
      };
    } catch (error) {
      if (isConnectionReconnectRequired(error)) {
        this.#onConnectionReconnectRequired?.(connectorApp, connectionId);
      }
      throw error;
    }
  }

  async #stageDriveUpload(
    request: ValidatedActionInvocation,
    connectionId: string,
  ): Promise<Record<string, unknown>> {
    if (!this.#cloud?.stageConnectorFile) {
      throw new Error('Sia cloud file staging is unavailable.');
    }
    const filePath = requiredString(request.arguments.file_path, 'file_path');
    if (!isAbsolute(filePath)) throw new Error('The approved upload path must be absolute.');
    const resolvedPath = await realpath(filePath);
    if (SENSITIVE_UPLOAD_PATH.test(resolvedPath)) {
      throw new Error('Security-sensitive files cannot be uploaded through connector tools.');
    }
    const source = await open(resolvedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    let fileInfo;
    try {
      fileInfo = await source.stat();
      const pathHandle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if (!sameFileIdentity(fileInfo, await pathHandle.stat())) {
          throw new Error('The approved Drive upload changed before it was opened.');
        }
      } finally {
        await pathHandle.close();
      }
      if (!fileInfo.isFile())
        throw new Error('The approved Drive upload must be a regular file.');
      if (fileInfo.size < 1 || fileInfo.size > MAX_CONNECTOR_UPLOAD_BYTES) {
        throw new Error(
          `Drive uploads must be between 1 byte and ${MAX_CONNECTOR_UPLOAD_BYTES} bytes.`,
        );
      }
    } catch (error) {
      await source.close();
      throw error;
    }
    const sourceName = basename(resolvedPath);
    const fileName =
      request.arguments.name === undefined
        ? sourceName
        : validateConnectorFileName(requiredString(request.arguments.name, 'name'));
    const mimeType = CONNECTOR_UPLOAD_MIME_BY_EXTENSION[extname(sourceName).toLowerCase()];
    if (!mimeType) {
      await source.close();
      throw new Error('That local file type is not supported for Drive upload.');
    }
    const remoteExtension = extname(fileName).toLowerCase();
    if (remoteExtension && CONNECTOR_UPLOAD_MIME_BY_EXTENSION[remoteExtension] !== mimeType) {
      await source.close();
      throw new Error('The requested Drive filename does not match the local file type.');
    }
    if (request.context.signal?.aborted) {
      await source.close();
      throw new Error('Drive upload was cancelled.');
    }
    const bytes = Buffer.alloc(fileInfo.size);
    let readResult;
    let finalFileInfo = fileInfo;
    try {
      readResult = await source.read(bytes, 0, bytes.length, 0);
      finalFileInfo = await source.stat();
    } finally {
      await source.close();
    }
    if (readResult.bytesRead !== fileInfo.size || !sameStableFile(fileInfo, finalFileInfo)) {
      bytes.fill(0);
      throw new Error('The selected file changed while it was being read.');
    }
    const md5 = createHash('md5').update(bytes).digest('hex');
    const sha256 = createHash('sha256').update(bytes).digest('base64url');
    try {
      const file = await this.#cloud.stageConnectorFile(
        {
          connectionId,
          fileName,
          mimeType,
          byteLength: bytes.byteLength,
          md5,
          sha256,
        },
        bytes,
        request.context.signal,
      );
      const parentId =
        request.arguments.parent_id === undefined
          ? undefined
          : requiredString(request.arguments.parent_id, 'parent_id');
      return { file, ...(parentId === undefined ? {} : { parent_id: parentId }) };
    } finally {
      bytes.fill(0);
    }
  }

  async #browserActionWithVerification(
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

  async #browserCapability(
    tabValue: unknown,
    snapshotValue: unknown,
    _request: ValidatedActionInvocation,
  ): Promise<BrowserSnapshotCapability | ActionExecutionResult> {
    const tabId = requiredString(tabValue, 'tab_id');
    const snapshotId = requiredString(snapshotValue, 'snapshot_id');
    const capability = this.#browserSnapshots.get(snapshotId);
    if (
      !capability ||
      capability.tabId !== tabId ||
      this.#latestBrowserSnapshot.get(tabId) !== snapshotId
    ) {
      return stale('The browser snapshot is missing, superseded, or belongs to another tab.');
    }
    const binding = this.#browserBindings.get(tabId);
    if (
      !binding ||
      binding.targetId !== capability.targetId ||
      binding.session !== capability.session ||
      binding.origin !== capability.origin ||
      browserUrlLooksSensitive(capability.url) ||
      !this.#originAllowed(capability.origin)
    ) {
      return stale('The browser attachment changed after this snapshot was captured.');
    }
    // A semantic_v2 read here would invalidate the exact native ref that the
    // user just approved. Cua Driver re-proves the tab binding, navigation,
    // frame identity, and node liveness atomically when the mutation uses it.
    return capability;
  }

  async #requireBrowserBinding(
    tabId: string,
    request: ValidatedActionInvocation,
  ): Promise<BrowserBinding | undefined> {
    const existing = this.#browserBindings.get(tabId);
    if (existing) return existing;
    const raw = await this.#callCua(request, 'get_browser_state', {
      session: this.#browserSessionId,
      tab_id: tabId,
    });
    this.#indexBrowserBindings(raw);
    return this.#browserBindings.get(tabId);
  }

  async #revalidateBrowserBinding(
    tabId: string,
    request: ValidatedActionInvocation,
  ): Promise<BrowserBinding | undefined> {
    const binding = await this.#requireBrowserBinding(tabId, request);
    if (!binding) return undefined;
    const raw = await this.#callCua(request, 'get_browser_state', {
      session: binding.session,
      target_id: binding.targetId,
      tab_id: binding.tabId,
      include_screenshot: false,
    });
    if (resultRefusal(raw)) return undefined;
    this.#indexBrowserBindings(raw);
    const live = this.#browserBindings.get(tabId);
    const location = findBrowserLocation(raw, binding.targetId, binding.tabId);
    if (
      !live ||
      live.targetId !== binding.targetId ||
      !location ||
      browserUrlLooksSensitive(location.url) ||
      !this.#originAllowed(location.origin)
    ) {
      return undefined;
    }
    live.origin = location.origin;
    return live;
  }

  #resolveComputerWindow(appId: string, windowId: string): ComputerWindowBinding | undefined {
    const app = this.#computerApps.get(appId);
    const window = this.#computerWindows.get(windowId);
    const now = Date.now();
    if (
      !app ||
      !window ||
      app.expiresAt <= now ||
      window.expiresAt <= now ||
      window.appId !== app.id ||
      window.pid !== app.pid
    ) {
      return undefined;
    }
    return window;
  }

  async #computerWindowStillValid(
    binding: ComputerWindowBinding,
    request: ValidatedActionInvocation,
  ): Promise<boolean> {
    const app = this.#computerApps.get(binding.appId);
    if (!app || app.expiresAt <= Date.now()) return false;
    const [appsValue, windowsValue] = await Promise.all([
      this.#callCua(request, 'list_apps', {}),
      this.#callCua(request, 'list_windows', { pid: binding.pid }),
    ]);
    const currentApp = findRecordArray(appsValue, 'apps').find(
      (record) => positiveInteger(record.pid, MAX_PID) === binding.pid,
    );
    const appName = currentApp && firstString(currentApp, ['name', 'app_name']);
    const bundleId = currentApp && firstString(currentApp, ['bundle_id', 'bundleId']);
    if (
      !currentApp ||
      computerAppLooksSensitive(appName, bundleId) ||
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
      !computerAppLooksSensitive(firstString(currentWindow, ['app_name', 'name'])),
    );
  }

  #resetComputerCapabilities(): void {
    this.#computerApps.clear();
    this.#computerWindows.clear();
    this.#windowSnapshots.clear();
    this.#latestWindowSnapshot.clear();
  }

  #callCua(
    request: ValidatedActionInvocation,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const context: CuaAuthorizationContext = {
      kind: 'turn',
      threadId: request.context.threadId,
      turnId: request.context.turnId,
    };
    return this.#cua.call(tool, args, context, request.context.signal);
  }

  #checkDeclaredOrigin(
    binding: BrowserBinding,
    value: unknown,
  ): ActionExecutionResult | undefined {
    if (typeof value !== 'string') return undefined;
    let declared: string;
    try {
      declared = new URL(value).origin;
    } catch {
      return refused('The declared browser origin is invalid.');
    }
    if (!this.#originAllowed(declared)) {
      return refused(`The origin ${declared} is outside the current browser grant.`);
    }
    if (binding.origin && binding.origin !== declared) {
      return stale('The tab navigated away from the origin associated with this action.');
    }
    return undefined;
  }

  #originAllowed(origin: string): boolean {
    return this.#isBrowserOriginAllowed?.(origin) ?? true;
  }

  #bindingOriginAllowed(binding: BrowserBinding): boolean {
    return this.#isBrowserOriginAllowed
      ? Boolean(binding.origin && this.#isBrowserOriginAllowed(binding.origin))
      : true;
  }

  #indexBrowserBindings(value: unknown): void {
    for (const record of collectTabRecords(value)) {
      if (firstBoolean(record, ['private', 'incognito', 'is_private'])) continue;
      const targetId = firstString(record, ['target_id', 'targetId']);
      const tabId = firstString(record, ['tab_id', 'tabId']);
      if (!targetId || !tabId) continue;
      const previous = this.#browserBindings.get(tabId);
      const origin =
        originFromRecord(record) ??
        (previous?.targetId === targetId ? previous.origin : undefined);
      const binding: BrowserBinding = {
        targetId,
        tabId,
        session: this.#browserSessionId,
        ...(origin ? { origin } : {}),
      };
      this.#browserBindings.set(tabId, binding);
    }
  }

  #rememberWindowSnapshot(capability: WindowSnapshotCapability): void {
    const key = capability.publicWindowId;
    const previous = this.#latestWindowSnapshot.get(key);
    if (previous) this.#windowSnapshots.delete(previous);
    this.#latestWindowSnapshot.set(key, capability.id);
    this.#windowSnapshots.set(capability.id, capability);
    trimMap(this.#windowSnapshots, MAX_CAPABILITIES);
  }

  #rememberBrowserSnapshot(capability: BrowserSnapshotCapability): void {
    const previous = this.#latestBrowserSnapshot.get(capability.tabId);
    if (previous) this.#browserSnapshots.delete(previous);
    this.#latestBrowserSnapshot.set(capability.tabId, capability.id);
    this.#browserSnapshots.set(capability.id, capability);
    trimMap(this.#browserSnapshots, MAX_CAPABILITIES);
  }

  #windowElementAddress(
    snapshot: WindowSnapshotCapability,
    value: unknown,
  ): NativeElementAddress | undefined {
    return typeof value === 'string' ? snapshot.elements.get(value) : undefined;
  }

  #nativeBrowserRef(snapshot: BrowserSnapshotCapability, value: unknown): string | undefined {
    return typeof value === 'string' ? snapshot.elements.get(value)?.nativeRef : undefined;
  }
}

function connectorReadResult(
  name: ConnectorTool,
  prepared: Extract<PreparedActionResult, { status: 'executed' }>,
): ActionExecutionResult {
  return {
    outcome: 'verified',
    summary: `${humanToolName(name)} completed through the connected app.`,
    data: prepared.result,
    verification: {
      evidence: `Cloud execution ${prepared.executionId} completed through the selected connection.`,
    },
  };
}

function actionResult(
  value: unknown,
  summary: string,
  options: { allowForeground?: boolean } = {},
): ActionExecutionResult {
  const refusalResult = resultRefusal(value);
  if (refusalResult) return refusalResult;
  const effect = findString(value, ['effect']);
  const deliveryMode = findNestedString(value, 'delivery', ['mode']);
  const escalationTarget = findString(value, ['target'], (record) => 'reason' in record);
  if (
    (deliveryMode === 'foreground' && !options.allowForeground) ||
    escalationTarget === 'foreground'
  ) {
    return {
      outcome: 'needs_foreground',
      summary:
        'The background route could not prove delivery; foreground takeover was not attempted.',
      reason: 'Explicit foreground approval is required before retrying.',
    };
  }
  const data = compact({
    effect,
    route: findString(value, ['route']),
    delivery_mode: deliveryMode,
  });
  if (effect === 'confirmed') {
    return {
      outcome: 'verified',
      summary,
      data,
      verification: { evidence: 'Cua Driver reported a confirmed effect.' },
    };
  }
  return {
    outcome: 'accepted_unverified',
    summary,
    data,
    reason:
      effect === 'suspected_noop'
        ? 'The background action may have had no effect.'
        : 'The driver could not prove the requested semantic postcondition.',
  };
}

function actionImages(value: unknown): Pick<ActionExecutionResult, 'images'> {
  const images = isCuaCallResult(value) ? [...value.images] : [];
  return images.length ? { images: images.slice(0, 4) } : {};
}

function resultRefusal(value: unknown): ActionExecutionResult | undefined {
  const record = asRecord(value);
  const refusal = findString(value, ['refusal', 'error_code', 'errorCode']);
  const code = findString(value, ['code']);
  const effect = findString(value, ['effect']);
  if (!refusal && effect !== 'refused' && !looksLikeErrorCode(code)) return undefined;
  const reason =
    refusal ??
    code ??
    findString(record, ['message', 'status']) ??
    'The driver refused the action.';
  return classifyFailure(new Error(reason));
}

function classifyFailure(error: unknown): ActionExecutionResult {
  const message = safeErrorMessage(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('stale') ||
    normalized.includes('superseded') ||
    (normalized.includes('snapshot') && normalized.includes('expired')) ||
    (normalized.includes('ref') && normalized.includes('invalid'))
  ) {
    return stale(message);
  }
  if (
    normalized.includes('foreground') ||
    normalized.includes('frontmost') ||
    (normalized.includes('background') && normalized.includes('unavailable'))
  ) {
    return {
      outcome: 'needs_foreground',
      summary: 'The action needs the foreground and was not attempted there.',
      reason: message,
    };
  }
  return refused(message);
}

function terminalWithoutVerification(result: ActionExecutionResult): boolean {
  return (
    result.outcome === 'refused' ||
    result.outcome === 'stale' ||
    result.outcome === 'needs_foreground'
  );
}

function refused(reason: string): ActionExecutionResult {
  return { outcome: 'refused', summary: reason, reason };
}

function stale(reason: string): ActionExecutionResult {
  return { outcome: 'stale', summary: reason, reason };
}

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'The action backend failed safely.';
  const message = error.message.trim();
  return message.length > 400
    ? `${message.slice(0, 397)}...`
    : message || 'The action backend failed safely.';
}

function looksLikeErrorCode(value: string | undefined): boolean {
  return Boolean(
    value && /(?:error|refus|denied|invalid|stale|expired|not_found|unavailable)/i.test(value),
  );
}

function positiveInteger(value: unknown, maximum: number): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} is required.`);
  return value;
}

function requiredEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${label} must be one of ${values.join(', ')}.`);
  }
  return value as T;
}

function withoutKey(
  value: Readonly<Record<string, unknown>>,
  omitted: string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== omitted));
}

function computerAppIdentity(
  name: string | undefined,
  bundleId: string | undefined,
): string | undefined {
  const bundle = bundleId?.trim().toLowerCase();
  if (bundle) return `bundle:${bundle}`;
  const label = name?.trim().toLowerCase();
  return label ? `name:${label}` : undefined;
}

function computerAppLooksSensitive(...values: Array<string | undefined>): boolean {
  return values.some((value) => value !== undefined && SENSITIVE_COMPUTER_APP.test(value));
}

function pathLooksSensitive(value: string): boolean {
  return SENSITIVE_UPLOAD_PATH.test(value.normalize('NFC'));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function trustedDisplayText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, 160) : undefined;
}

function trustedElementLabel(record: Record<string, unknown>): string | undefined {
  const label = trustedDisplayText(
    firstString(record, ['label', 'name', 'aria_label', 'ariaLabel']),
  );
  if (!label) return undefined;
  const value = trustedDisplayText(firstString(record, ['value', 'text']));
  const role = firstString(record, ['role', 'type']);
  if (value === label || (/^AX(?:TextArea|TextField)$/.test(role ?? '') && label.length > 80)) {
    return undefined;
  }
  return label;
}

function declaredOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function approvalElementLabel(
  element: { readonly label?: string; readonly role?: string },
  ref: string,
): string {
  const genericLabel =
    element.role === 'AXTextArea'
      ? 'text area'
      : element.role === 'AXTextField'
        ? 'text field'
        : 'unlabeled element';
  const label = element.label ? `“${element.label}”` : genericLabel;
  const detail = [element.role, `exact snapshot ref ${ref}`].filter(Boolean).join(', ');
  return `${label} (${detail})`;
}

function sameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint },
): boolean {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino);
}

function sameStableFile(
  left: {
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    mtimeMs: number;
    ctimeMs: number;
  },
  right: {
    dev: number | bigint;
    ino: number | bigint;
    size: number | bigint;
    mtimeMs: number;
    ctimeMs: number;
  },
): boolean {
  return (
    sameFileIdentity(left, right) &&
    String(left.size) === String(right.size) &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

function browserUrlLooksSensitive(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      Boolean(url.username || url.password) ||
      SENSITIVE_BROWSER_HOST.test(url.hostname) ||
      SENSITIVE_BROWSER_PATH.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) => SENSITIVE_BROWSER_QUERY_KEY.test(key)) ||
      SENSITIVE_BROWSER_QUERY_KEY.test(url.hash.slice(1))
    );
  } catch {
    return true;
  }
}

/** Model-visible browser locations reveal only the origin; private URLs stay host-only. */
function modelVisibleBrowserUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function validateConnectorFileName(value: string): string {
  if (
    value.length > 255 ||
    value !== value.trim() ||
    value === '.' ||
    value === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('The requested Drive filename is invalid.');
  }
  return value;
}

function humanToolName(name: ConnectorTool): string {
  return name.replaceAll('_', ' ');
}

function connectorAppForTool(
  name: ConnectorTool,
): 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack' {
  if (name.startsWith('mail_')) return 'gmail';
  if (name.startsWith('drive_')) return 'drive';
  if (name.startsWith('docs_')) return 'docs';
  if (name.startsWith('sheets_')) return 'sheets';
  if (name.startsWith('slides_')) return 'slides';
  return 'slack';
}

function connectorBrowserFallback(
  app: 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack',
): string {
  const destinations = {
    gmail: ['Gmail', 'https://mail.google.com'],
    drive: ['Google Drive', 'https://drive.google.com'],
    docs: ['Google Docs', 'https://docs.google.com'],
    sheets: ['Google Sheets', 'https://sheets.google.com'],
    slides: ['Google Slides', 'https://slides.google.com'],
    slack: ['Slack', 'https://app.slack.com'],
  } as const;
  const [label, url] = destinations[app];
  return `${label} is not connected. Continue now in signed-in Chrome at ${url} with browser or computer use, handing control to the user if sign-in is required. For reliable API and background access, the user can connect it later in Settings > Apps; after connection use account_id "${app}".`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (isCuaCallResult(value)) return asRecord(value.value);
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) if (typeof record[key] === 'string') return record[key];
  return undefined;
}

function firstBoolean(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) if (typeof record[key] === 'boolean') return record[key];
  return undefined;
}

function findString(
  value: unknown,
  keys: readonly string[],
  recordPredicate?: (record: Record<string, unknown>) => boolean,
  depth = 0,
): string | undefined {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, recordPredicate, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (!recordPredicate || recordPredicate(record)) {
    const own = firstString(record, keys);
    if (own) return own;
  }
  for (const nested of Object.values(record)) {
    const found = findString(nested, keys, recordPredicate, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findNestedString(
  value: unknown,
  containerKey: string,
  keys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedString(item, containerKey, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const container = asRecord(record[containerKey]);
  const own = container ? firstString(container, keys) : undefined;
  if (own) return own;
  for (const nested of Object.values(record)) {
    const found = findNestedString(nested, containerKey, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findRecordArray(value: unknown, key: string, depth = 0): Record<string, unknown>[] {
  if (depth > 6) return [];
  const record = asRecord(value);
  if (record) {
    const direct = record[key];
    if (Array.isArray(direct)) return direct.map(asRecord).filter(isDefined);
    for (const nested of Object.values(record)) {
      const found = findRecordArray(nested, key, depth + 1);
      if (found.length) return found;
    }
  } else if (Array.isArray(value)) {
    for (const nested of value) {
      const found = findRecordArray(nested, key, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function findElementRecords(
  value: unknown,
  kind: 'window' | 'browser',
): Record<string, unknown>[] {
  const candidates = [
    ...(kind === 'browser' ? findRecordArray(value, 'refs') : []),
    ...findRecordArray(value, 'elements'),
    ...findRecordArray(value, 'nodes'),
  ];
  return candidates.filter((record) =>
    kind === 'window'
      ? firstString(record, ['element_token', 'elementToken']) !== undefined ||
        nonNegativeInteger(record.element_index ?? record.elementIndex) !== undefined
      : firstString(record, ['ref', 'element_ref', 'elementRef']) !== undefined,
  );
}

function collectTabRecords(value: unknown): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  const visit = (current: unknown, inheritedTarget?: string, depth = 0): void => {
    if (depth > 7) return;
    if (Array.isArray(current)) {
      for (const item of current) visit(item, inheritedTarget, depth + 1);
      return;
    }
    const record = asRecord(current);
    if (!record || seen.has(record)) return;
    seen.add(record);
    const targetId = firstString(record, ['target_id', 'targetId']) ?? inheritedTarget;
    const tabId = firstString(record, ['tab_id', 'tabId']);
    if (tabId && targetId) output.push({ ...record, target_id: targetId });
    for (const [key, nested] of Object.entries(record)) {
      if (
        depth < 2 ||
        [
          'tabs',
          'targets',
          'pages',
          'data',
          'structuredContent',
          'structured_content',
          'browser',
        ].includes(key)
      ) {
        visit(nested, targetId, depth + 1);
      }
    }
  };
  visit(value);
  return output;
}

function sanitizeElement(
  record: Record<string, unknown>,
  ref: string,
): Record<string, unknown> {
  const states = asRecord(record.states);
  return compact({
    element_ref: ref,
    role: firstString(record, ['role', 'type']),
    label: trustedElementLabel(record),
    value: firstString(record, ['value', 'text']),
    description: firstString(record, ['description']),
    frame: sanitizeFrame(record.frame ?? record.bounds),
    disabled: firstBoolean(record, ['disabled']) ?? firstBoolean(states ?? {}, ['disabled']),
    selected: firstBoolean(record, ['selected']) ?? firstBoolean(states ?? {}, ['selected']),
  });
}

function sanitizeFrame(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const output: Record<string, number> = {};
  for (const [from, to] of [
    ['x', 'x'],
    ['y', 'y'],
    ['w', 'width'],
    ['h', 'height'],
    ['width', 'width'],
    ['height', 'height'],
  ] as const) {
    const number = record[from];
    if (typeof number === 'number' && Number.isFinite(number)) output[to] = number;
  }
  return Object.keys(output).length ? output : undefined;
}

function isHiddenWindowStructure(record: Record<string, unknown>): boolean {
  const role = firstString(record, ['role', 'type']);
  if (!/^(?:AXMenu(?:Bar|BarItem|Item)?|AXRuler(?:Marker)?)$/.test(role ?? '')) return false;
  const frame = sanitizeFrame(record.frame ?? record.bounds);
  return !frame || frame.width === 0 || frame.height === 0;
}

function isProtectedElement(record: Record<string, unknown>): boolean {
  const identity = [
    firstString(record, ['role', 'type', 'input_type', 'inputType']),
    firstString(record, ['autocomplete']),
  ]
    .filter(isDefined)
    .join(' ');
  return /(?:password|secure|credential|one-time-code|current-password|new-password)/i.test(
    identity,
  );
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function browserRouteWasReplaced(error: unknown): boolean {
  return (
    error instanceof Error &&
    /\b(?:browser_route_unavailable|browser_binding_stale|browser_tab_not_found|browser_ref_stale)\b/.test(
      error.message,
    )
  );
}

function originFromRecord(record: Record<string, unknown>): string | undefined {
  const url = safeHttpUrl(firstString(record, ['url']));
  const urlOrigin = url ? new URL(url).origin : undefined;
  const explicit = firstString(record, ['origin']);
  if (explicit) {
    try {
      const explicitOrigin = new URL(explicit).origin;
      return urlOrigin && urlOrigin !== explicitOrigin ? undefined : explicitOrigin;
    } catch {
      return undefined;
    }
  }
  return urlOrigin;
}

function findBrowserLocation(
  value: unknown,
  targetId: string,
  tabId: string,
): { readonly origin: string; readonly url: string } | undefined {
  const record = collectTabRecords(value).find(
    (candidate) =>
      firstString(candidate, ['target_id', 'targetId']) === targetId &&
      firstString(candidate, ['tab_id', 'tabId']) === tabId,
  );
  if (record) {
    const url = safeHttpUrl(firstString(record, ['url']));
    const origin = originFromRecord(record);
    if (url && origin) return { url, origin };
  }
  // A targeted semantic_v2 response can omit the already-bound target/tab ids
  // while still returning the exact page URL. The caller compares this origin
  // with the previously granted binding before minting any snapshot refs.
  const targetedUrl = safeHttpUrl(findString(value, ['url']));
  return targetedUrl ? { url: targetedUrl, origin: new URL(targetedUrl).origin } : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function trimMap<K, V>(map: Map<K, V>, maximum: number): void {
  while (map.size > maximum) {
    const key = map.keys().next().value as K | undefined;
    if (key === undefined) return;
    map.delete(key);
  }
}
