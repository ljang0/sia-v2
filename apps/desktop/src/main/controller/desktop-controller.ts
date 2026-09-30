import type {
  ActionExecutionResult,
  ActionInvocationObserver,
  ActionResultObserver,
  ApprovalBroker,
  ValidatedActionInvocation,
} from '@sia/action-gateway';
import type {
  BridgeMethod,
  BridgeRequestMap,
  BridgeResultMap,
  ConnectionView,
  DesktopPushEvent,
  DesktopSnapshot,
  ScheduleView,
} from '../../shared/bridge.js';
import type { TextSize, ThemePreference } from '../../shared/display.js';
import type { PhoneRemoteApi } from '../../shared/phone-remote.js';
import type { ScottySettingsApi } from '../../shared/scotty.js';
import type { CuaAuthorizationContext } from '../cua-service.js';
import type { TaskSnapshot } from '../latest-task-turn.js';
import type { VoiceHelperFactory } from '../push-to-talk.js';
import type { RuntimeCoordinator } from '../runtime-coordinator.js';
import { ControllerContext } from './context.js';
import type { BrowserCapabilitySink, ControllerOptions } from './types.js';
import { ResearchOutbox } from './research-outbox.js';
import { ResearchCapture } from './research-capture.js';
import { ConnectorConnections } from './connections.js';
import { CloudAccount } from './account.js';
import { ProviderAccess } from './providers.js';
import { Schedules } from './schedules.js';
import { Attachments } from './attachments.js';

/**
 * The desktop app's single entry point for the main process, IPC bridge, launcher, phone
 * remote and tests. Each method delegates to the domain collaborator that owns it.
 */
export class DesktopController {
  readonly #ctx: ControllerContext;

  constructor(options: ControllerOptions) {
    this.#ctx = new ControllerContext(options, (ctx) => ({
      researchOutbox: new ResearchOutbox(ctx),
      researchCapture: new ResearchCapture(ctx),
      connections: new ConnectorConnections(ctx),
      account: new CloudAccount(ctx),
      providers: new ProviderAccess(ctx),
      schedules: new Schedules(ctx),
      attachments: new Attachments(ctx),
    }));
  }

  attachPushToTalk(options: {
    available: boolean;
    createHelper: VoiceHelperFactory;
    isFocused(): boolean;
  }): void {
    this.#ctx.attachPushToTalk(options);
  }

  /**
   * A locked or sleeping Mac blocks both Use my Mac routes. Running Mac tasks pause with a
   * Continue task banner; new ones wait in the queue until the Mac is available again.
   */
  setMacAvailability(state: 'available' | 'locked' | 'asleep'): void {
    this.#ctx.setMacAvailability(state);
  }

  suspendVoice(suspended: boolean): void {
    this.#ctx.suspendVoice(suspended);
  }

  releaseRendererVoiceCapture(): void {
    this.#ctx.releaseRendererVoiceCapture();
  }

  attachRuntime(runtime: RuntimeCoordinator): void {
    this.#ctx.attachRuntime(runtime);
  }

  attachBrowserCapabilitySink(sink: BrowserCapabilitySink): void {
    this.#ctx.attachBrowserCapabilitySink(sink);
  }

  approvalBroker(): ApprovalBroker {
    return this.#ctx.approvalBroker();
  }

  actionInvocationObserver(): ActionInvocationObserver {
    return this.#ctx.actionInvocationObserver();
  }

  actionResultObserver(): ActionResultObserver {
    return this.#ctx.actionResultObserver();
  }

  actionToolAvailable(name: string): boolean {
    return this.#ctx.actionToolAvailable(name);
  }

  attachScotty(handler: ScottySettingsApi): void {
    this.#ctx.attachScotty(handler);
  }

  attachPhoneRemote(handler: PhoneRemoteApi): void {
    this.#ctx.attachPhoneRemote(handler);
  }

  remoteAccessAllowed(): boolean {
    return this.#ctx.remoteAccessAllowed();
  }

  setLauncherRegistered(registered: boolean): void {
    this.#ctx.setLauncherRegistered(registered);
  }

  allowsReviewAction(threadId: string, name: string): boolean {
    return this.#ctx.allowsReviewAction(threadId, name);
  }

  assistantAction(
    request: ValidatedActionInvocation,
    invoke: (
      name: string,
      args: unknown,
      signal: AbortSignal,
    ) => Promise<ActionExecutionResult>,
  ): Promise<ActionExecutionResult> {
    return this.#ctx.assistantAction(request, invoke);
  }

  /** Use my Mac, or connected apps only. */
  computerAccessMode(): 'mac' | 'connected' {
    return this.#ctx.computerAccessMode();
  }

  /**
   * Theme and text size. They hold nothing private, so they apply before sign-in too and main
   * mirrors them for the next launch's first frame.
   */
  displayPreferences(): { theme?: ThemePreference; textSize?: TextSize } {
    return this.#ctx.displayPreferences();
  }

  /** Settings → Developer tools (Command tool, worktree duplicates, View → Reload). */
  developerToolsEnabled(): boolean {
    return this.#ctx.developerToolsEnabled();
  }

  /** Use my Mac works in the background unless the person explicitly chose On my screen. */
  macBackgroundControl(): boolean {
    return this.#ctx.macBackgroundControl();
  }

  macBackgroundFallback(): 'pause' | 'foreground' {
    return this.#ctx.macBackgroundFallback();
  }

  /** Bypass is the default; only an explicit 'ask' turns confirmations on. */
  computerTrust(): 'auto' | 'ask' {
    return this.#ctx.computerTrust();
  }

  /** Action-gateway trust for one turn; phone turns always confirm on the Mac. */
  trustForTurn(turnId: string | undefined): 'auto' | 'ask' {
    return this.#ctx.trustForTurn(turnId);
  }

  trajectoryLogEnabled(): boolean {
    return this.#ctx.trajectoryLogEnabled();
  }

  createScheduleFromAction(
    threadId: string,
    input: {
      task: string;
      cadence: ScheduleView['cadence'];
      days?: number[];
      everyHours?: number;
      firstRunAt?: string;
      maxRuns?: number;
    },
  ): ScheduleView {
    return this.#ctx.schedules.createScheduleFromAction(threadId, input);
  }

  listSchedulesForAction(threadId: string): ScheduleView[] {
    return this.#ctx.schedules.listSchedulesForAction(threadId);
  }

  updateScheduleFromAction(
    threadId: string,
    input: {
      scheduleId: string;
      task?: string;
      cadence?: ScheduleView['cadence'];
      days?: number[];
      everyHours?: number;
      nextRunAt?: string;
      enabled?: boolean;
      maxRuns?: number;
    },
  ): ScheduleView {
    return this.#ctx.schedules.updateScheduleFromAction(threadId, input);
  }

  deleteScheduleFromAction(threadId: string, scheduleId: string): void {
    this.#ctx.schedules.deleteScheduleFromAction(threadId, scheduleId);
  }

  /** Any HTTP(S) origin is allowed while trusted; otherwise only origins granted at attach. */
  isBrowserOriginAllowed(origin: string): boolean {
    return this.#ctx.isBrowserOriginAllowed(origin);
  }

  ensureBrowserAttachedForActions(): Promise<string | undefined> {
    return this.#ctx.ensureBrowserAttachedForActions();
  }

  initialize(): Promise<void> {
    return this.#ctx.initialize();
  }

  /** The complete state, including every thread's history, for in-process callers and tests. */
  snapshot(): DesktopSnapshot {
    return this.#ctx.snapshot();
  }

  /**
   * What the renderer draws: the active thread's history, one preview per thread and the active
   * thread's approvals. Pushing every thread's history on each streamed token made the app slow
   * down as history grew.
   */
  rendererSnapshot(): DesktopSnapshot {
    return this.#ctx.rendererSnapshot();
  }

  /**
   * Use my Mac turns that are actively working (not paused or waiting on the person), and
   * whether each controls the screen or works in the background.
   */
  screenControl(): Record<string, 'foreground' | 'background'> {
    return this.#ctx.screenControl();
  }

  /** Task metadata and each thread's latest turn, without cloning every thread's history. */
  taskSnapshot(): TaskSnapshot {
    return this.#ctx.taskSnapshot();
  }

  /** Runs a renderer bridge call so that any snapshot it returns is the renderer's scoped view. */
  invokeForRenderer<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    return this.#ctx.invokeForRenderer(method, input);
  }

  subscribe(listener: (event: DesktopPushEvent) => void): () => void {
    return this.#ctx.subscribe(listener);
  }

  /** Keeps opaque cloud connection ids out of model arguments and renderer-controlled routing. */
  connectionIdForAction(
    app: ConnectionView['id'],
    selector: string,
    approvalId?: string,
  ): string | undefined {
    return this.#ctx.connections.connectionIdForAction(app, selector, approvalId);
  }

  markConnectionReconnectRequired(app: ConnectionView['id'], connectionId: string): void {
    this.#ctx.connections.markConnectionReconnectRequired(app, connectionId);
  }

  invoke<M extends BridgeMethod>(
    method: M,
    input: BridgeRequestMap[M],
  ): Promise<BridgeResultMap[M]> {
    return this.#ctx.invoke(method, input);
  }

  authorizeComputer(
    request: {
      adapterId: string;
      riskClass: string;
      permissionMode: string;
      publicSession: string;
      requestDigest: string;
      humanSummary: string;
      resourceJson: string;
      expiresUnixMs: bigint;
    },
    context: CuaAuthorizationContext,
  ): Promise<'allow' | 'deny' | 'cancel'> {
    return this.#ctx.authorizeComputer(request, context);
  }

  shutdown(): Promise<void> {
    return this.#ctx.shutdown();
  }

  /** Host-only Cmd+E capture, before the command panel takes the user's app focus. */
  captureLauncherContext(): Promise<string | undefined> {
    return this.#ctx.captureLauncherContext();
  }

  sendLauncherTurn(
    input: BridgeRequestMap['threads.send'],
    context?: string,
  ): BridgeResultMap['threads.send'] {
    return this.#ctx.sendLauncherTurn(input, context);
  }

  /** Called after the window loads, never on an ordinary launch without setup intent. */
  resumeCodexSetup(): Promise<void> {
    return this.#ctx.providers.resumeCodexSetup();
  }
}
