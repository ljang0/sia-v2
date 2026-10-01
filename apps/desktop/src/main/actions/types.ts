import type { ActionExecutionResult, ValidatedActionInvocation } from '@sia/action-gateway';
import type { ScheduleCadence } from '../../shared/schedule-cadence.js';
import type { BrowserWindowState, WindowContextState } from '../mac/browser-window.js';
import type { CloudClient } from '../cloud-client.js';
import type { CuaService } from '../mac/cua-service.js';

/** Narrow structural boundary used by the desktop host and by unit tests. */
export type CuaToolCaller = Pick<CuaService, 'call'>;

/** The backend never receives OAuth credentials; it only calls the authenticated control plane. */
export type CloudActionClient = Pick<CloudClient, 'prepareAction' | 'commitAction'> &
  Partial<Pick<CloudClient, 'configured' | 'stageConnectorFile'>>;

/** The connected apps a connector tool can address. */
export type ConnectorApp = 'gmail' | 'drive' | 'docs' | 'sheets' | 'slides' | 'slack';

export interface ScheduleActionHost {
  create(
    threadId: string,
    input: {
      task: string;
      cadence: ScheduleCadence;
      days?: number[];
      everyHours?: number;
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
      cadence?: ScheduleCadence;
      days?: number[];
      everyHours?: number;
      nextRunAt?: string;
      enabled?: boolean;
      maxRuns?: number;
    },
  ): unknown;
  delete(threadId: string, scheduleId: string): unknown;
}

export interface DesktopActionBackendOptions {
  readonly assistantAction?: (
    request: ValidatedActionInvocation,
  ) => Promise<ActionExecutionResult>;
  readonly macAutomation?: (
    args: unknown,
    signal?: AbortSignal,
  ) => Promise<ActionExecutionResult>;
  readonly macBrowserAccess?: () => boolean;
  readonly macBackgroundControl?: () => boolean;
  readonly inspectBrowserWindow?: (
    pid: number,
    windowId: number,
  ) => Promise<BrowserWindowState>;
  readonly readImageText?: (dataBase64: string) => Promise<string | undefined>;
  readonly readWindowContext?: (pid: number, windowId: number) => Promise<WindowContextState>;
  readonly cua: CuaToolCaller;
  readonly cloud?: CloudActionClient;
  /** Opens one explicitly supported non-sensitive macOS application. */
  readonly openApplication?: (
    application: string,
    options: { background: boolean },
  ) => Promise<void>;
  /** Opens one validated public web location in the person's default browser. */
  readonly openUrl?: (url: string, options: { background: boolean }) => Promise<void>;
  readonly installedApplications?: () => Promise<readonly { id: string; name: string }[]>;
  /** Must match the trusted browser-attachment session owned by the controller. */
  readonly browserSessionId?: string;
  /** Optional host policy layered on top of the CUA attachment grant. */
  readonly isBrowserOriginAllowed?: (origin: string) => boolean;
  /** Lets the trusted host attach Chrome on demand; resolves an error detail when it cannot. */
  readonly ensureBrowserAttached?: () => Promise<string | undefined>;
  /** Resolves a stable model-visible app/account selector to a trusted cloud connection. */
  readonly resolveConnectionId?: (
    app: ConnectorApp,
    selector: string,
    approvalId?: string,
  ) => string | undefined;
  /** Updates the trusted local connection view when the control plane rejects an expired grant. */
  readonly onConnectionReconnectRequired?: (app: ConnectorApp, connectionId: string) => void;
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
