import type { LocalConnectorService } from '../connectors/local-connectors.js';
/**
 * Host capabilities the desktop controller is constructed with, and the in-memory records its
 * collaborators share.
 */

import type { ProviderAttachment } from '@sia/protocol';
import type {
  AttachmentView,
  BackgroundTerminalView,
  BridgeRequestMap,
  ComputerPermissionsView,
  ConnectionView,
  TerminalResultView,
  WorkspaceDiffView,
  WorkspaceSnapshotView,
} from '../../shared/bridge.js';
import type { AutomationApp, AutomationPermissions } from '../../shared/mac-permissions.js';
import type { CloudClient } from '../cloud/cloud-client.js';
import type { CuaAuthorizationContext } from '../mac/cua-service.js';
import type { CloudIdentityStatus } from '../cloud/identity.js';
import type { RecordRepository } from '../storage/persistence.js';
import type { probeProviders } from '../providers/provider-probe.js';
import type { TrajectoryRecorder } from '../research/trajectory-recorder.js';
import type { VoiceOperations } from '../voice/voice-service.js';

export interface ComputerAutomation {
  permissions(): Promise<ComputerPermissionsView>;
  requestPermissions(
    permission?: 'accessibility' | 'screenRecording',
  ): Promise<ComputerPermissionsView>;
  call(
    tool: string,
    args: Record<string, unknown>,
    context: CuaAuthorizationContext,
    signal?: AbortSignal,
  ): Promise<unknown>;
  shutdown(): Promise<void>;
}

export interface BrowserCapabilitySink {
  acceptBrowserState(value: unknown, sessionId?: string): void;
  resetBrowserCapabilities(): void;
  trustedApprovalTarget(
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): string | undefined;
}

export interface ControllerOptions {
  notchHelperPath?: string;
  repository: RecordRepository;
  cloud: CloudClient;
  computer: ComputerAutomation;
  identity: {
    initialize(): Promise<CloudIdentityStatus>;
    read?(): Promise<string | undefined>;
    refreshSession?(): Promise<CloudIdentityStatus>;
    status(): CloudIdentityStatus;
    startEmailSignIn(email: string): Promise<CloudIdentityStatus>;
    completeEmailSignIn(code: string): Promise<CloudIdentityStatus>;
    completePasswordSignIn?(password: string): Promise<CloudIdentityStatus>;
    completeMfaSignIn?(code: string): Promise<CloudIdentityStatus>;
    beginMfaEnrollment?(): Promise<{ secretCode: string }>;
    completeMfaEnrollment?(code: string): Promise<CloudIdentityStatus>;
    signOut(): Promise<CloudIdentityStatus>;
  };
  fakeServices: boolean;
  fakeTurnDelayMs?: number;
  openExternal(url: string): Promise<void>;
  /** Signs in to Outlook, Notion, and GitHub from this Mac; absent where unsupported. */
  localConnectors?: LocalConnectorService;
  openMessages?(): Promise<void>;
  openMessagesPermissions?(): Promise<void>;
  requestMicrophonePermission?(): Promise<void>;
  restartApp?(): void;
  installCodex?(onProgress: (message: string) => void): Promise<void>;
  /**
   * The person's own model API key. The key is write-only from here on: it is validated,
   * checked against the endpoint, and stored encrypted; only the model and host come back.
   */
  /** Lab harnesses from a verified testing manifest; absent in every ordinary build. */
  labHarnesses?: readonly {
    id: string;
    name: string;
    disclosure: string;
    models: readonly { id: string; label: string }[];
  }[];
  byok?: {
    summary(): { model: string; host: string } | undefined;
    save(input: { baseUrl?: string; model: string; apiKey: string }): Promise<void>;
    clear(): void;
  };
  /** Always-on local trajectory log; absent in unit tests that do not care about it. */
  trajectory?: TrajectoryRecorder;
  /** Runs a read-only shell command (lsof); injectable for tests. */
  runCommand?: (file: string, args: readonly string[]) => Promise<string>;
  /** Provider discovery boundary; production uses the real CLI probe. */
  providerProbe?: typeof probeProviders;
  captureMacContext?: () => Promise<string>;
  /** Capability status readers; absent in unit tests that do not use them. */
  capabilitySetup?: {
    automationPermissions?(request?: AutomationApp): Promise<AutomationPermissions>;
    messagesStatus(): 'ready' | 'needs_full_disk_access' | 'unavailable';
    chromeDebugStatus(): Promise<'enabled' | 'off' | 'unavailable'>;
  };
  /** Reveals a directory in Finder; used for the trajectory log. */
  revealDirectory?(path: string): Promise<void>;
  /** Keeps the Mac awake while Use my Mac tasks run; absent in tests that do not care. */
  keepAwake?: { hold(id: string): void; release(id: string): void };
  chooseDirectory(): Promise<string | null>;
  /** Visible app-managed root used when a new agent does not choose a custom folder. */
  defaultWorkspaceRoot?: string;
  createDirectory?(path: string): Promise<void>;
  chooseFiles?(): Promise<string[]>;
  /** Private folder where pasted screenshots, files and long text are saved as attachments. */
  pastedAttachmentRoot?: string;
  openPath?(path: string): Promise<void>;
  composeFeedback?(subject: string, body: string): Promise<void>;
  /** Registers or removes Sia as a macOS login item. */
  setOpenAtLogin?(enabled: boolean): void;
  appVersion?: string;
  updateManifestUrl?: string;
  updateManifestPublicKey?: string;
  exportJson(value: unknown): Promise<string | null>;
  notify?(notice: { threadId: string; title: string; body: string }): void;
  workspaceOperations?: {
    hasRunningTerminals?(): boolean;
    readDiff(workspace: string): Promise<WorkspaceDiffView>;
    stage(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
    restore(workspace: string, paths: readonly string[]): Promise<WorkspaceDiffView>;
    listSnapshots?(workspace: string): Promise<WorkspaceSnapshotView[]>;
    createSnapshot?(workspace: string): Promise<WorkspaceSnapshotView[]>;
    restoreSnapshot?(workspace: string, snapshotId: string): Promise<WorkspaceDiffView>;
    deleteSnapshot?(workspace: string, snapshotId: string): Promise<WorkspaceSnapshotView[]>;
    runTerminal(workspace: string, command: string): Promise<TerminalResultView>;
    startBackgroundTerminal?(
      workspace: string,
      command: string,
    ): Promise<BackgroundTerminalView>;
    listBackgroundTerminals?(workspace: string): Promise<BackgroundTerminalView[]>;
    writeBackgroundTerminal?(
      workspace: string,
      id: string,
      input: string,
    ): Promise<BackgroundTerminalView>;
    stopBackgroundTerminal?(workspace: string, id: string): Promise<BackgroundTerminalView>;
    dispose?(): void;
    createWorktree(
      sourceWorkspace: string,
      threadId: string,
    ): Promise<{ path: string; branch?: string }>;
    removeWorktree?(workspace: string): Promise<void>;
  };
  voice?: VoiceOperations;
  startupNotice?: {
    title: string;
    detail: string;
  };
}

export interface QueuedTurn {
  recovery?: string;
  context?: string;
  id: string;
  threadId: string;
  text: string;
  attachments?: readonly ProviderAttachment[];
  source?: 'manual' | 'schedule' | 'goal' | 'review';
  fromPhone?: true;
  reviewTarget?: BridgeRequestMap['reviews.start']['target'];
  fakeDelayMs?: number;
  scheduleRunId?: string;
}

export interface AttachmentGrant {
  readonly threadId: string;
  readonly attachment: ProviderAttachment;
  readonly view: AttachmentView;
  readonly expiresAt: number;
}

export interface PendingApproval {
  resolve(decision: 'allow' | 'deny' | 'cancel'): void;
  /** Only computer-helper requests carry their own deadline; the rest wait for the person. */
  timeout?: NodeJS.Timeout | undefined;
  kind: 'computer' | 'gateway' | 'provider';
  threadId: string;
  turnId: string;
  requestId?: string;
  /** What "Allow for this task" would cover; absent when it is not offered. */
  taskGrant?: string;
}

export interface ApprovedConnectorBinding {
  readonly approvalId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly app: ConnectionView['id'];
  readonly selector: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly account?: string;
}
