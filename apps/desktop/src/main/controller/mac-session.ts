import { randomUUID } from 'node:crypto';
import type { ControllerContext } from './context.js';
import type { QueuedTurn } from './types.js';

/** The parts of the controller context MacSession uses. */
type MacSessionContext = Pick<
  ControllerContext,
  | 'appendTimeline'
  | 'approvals'
  | 'assistant'
  | 'commit'
  | 'computerAccess'
  | 'deps'
  | 'releaseAccessLocked'
  | 'requireThread'
  | 'runtime'
  | 'speech'
  | 'state'
  | 'turns'
>;

/**
 * Use my Mac turns in flight: keeping the display awake, pausing when the Mac locks or sleeps,
 * screen-control state for the overlay, and launcher context capture.
 */
export class MacSession {
  /** Running Use my Mac turns by thread; they hold the keep-awake assertion. */
  readonly turns = new Map<string, QueuedTurn>();

  /** Mac turns currently keeping the display awake; a turn waiting on the person does not. */
  readonly awakeTurns = new Set<string>();

  /** Mac turns that started with On my screen: they show the on-screen indicator and hold ⌃Esc. */
  readonly foregroundTurns = new Set<string>();

  unavailable: 'locked' | 'asleep' | undefined;

  constructor(private readonly ctx: MacSessionContext) {}

  /**
   * A locked or sleeping Mac blocks both Use my Mac routes. Running Mac tasks pause with a
   * Continue task banner; new ones wait in the queue until the Mac is available again.
   */
  setMacAvailability(state: 'available' | 'locked' | 'asleep'): void {
    const wasUnavailable = this.unavailable;
    this.unavailable = state === 'available' ? undefined : state;
    if (!this.unavailable) {
      if (wasUnavailable) {
        this.ctx.turns.drainQueue();
        this.ctx.commit();
      }
      return;
    }
    const text =
      state === 'locked'
        ? 'Your Mac locked, so Sia paused this task. Unlock your Mac and press Continue task.'
        : 'Your Mac went to sleep, so Sia paused this task. Wake your Mac and press Continue task.';
    if (!this.turns.size) return;
    for (const threadId of [...this.turns.keys()]) this.pauseMacTurn(threadId, text);
    this.ctx.commit();
  }

  private pauseMacTurn(threadId: string, text: string): void {
    const thread = this.ctx.requireThread(threadId);
    const running = this.ctx.turns.running.get(threadId);
    const turn = this.turns.get(threadId);
    if (!running || !turn || running.signal.aborted) return;
    this.ctx.speech.pushToTalk?.cancelTask(threadId);
    running.abort();
    this.ctx.approvals.revokeApprovalsForTurn(threadId, turn.id);
    void this.ctx.runtime?.cancel(threadId, turn.id).catch(() => undefined);
    const question = this.ctx.turns.pendingQuestions.get(threadId);
    this.ctx.turns.pendingQuestions.delete(threadId);
    if (question)
      void this.ctx.runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    if (turn.attachments?.length)
      this.ctx.turns.failedTurnAttachments.set(turn.id, turn.attachments);
    this.ctx.turns.heldThreads.add(threadId);
    thread.status = 'failed';
    delete thread.queueReason;
    thread.interruptedTurnId = turn.id;
    this.ctx.appendTimeline(threadId, {
      id: randomUUID(),
      turnId: turn.id,
      kind: 'error',
      title: 'Task paused',
      text,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });
    thread.updatedAt = new Date().toISOString();
  }

  isMacTurn(threadId: string): boolean {
    return (
      this.ctx.computerAccess.accessMode() === 'mac' &&
      !this.ctx.assistant.library.isReview(threadId)
    );
  }

  /**
   * Use my Mac turns that are actively working (not paused or waiting on the person), and
   * whether each controls the screen or works in the background.
   */
  screenControl(): Record<string, 'foreground' | 'background'> {
    const result: Record<string, 'foreground' | 'background'> = {};
    if (this.ctx.releaseAccessLocked() || this.unavailable) return result;
    for (const threadId of this.turns.keys()) {
      const running = this.ctx.turns.running.get(threadId);
      const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
      if (!running || running.signal.aborted || thread?.status !== 'running') continue;
      result[threadId] = this.foregroundTurns.has(threadId) ? 'foreground' : 'background';
    }
    return result;
  }

  /**
   * While a Mac task waits on the person (an approval or a question), let the display sleep
   * as usual; hold it awake again once the task resumes.
   */
  syncKeepAwake(): void {
    for (const threadId of this.turns.keys()) {
      const waiting =
        this.ctx.state.threads.find(({ id }) => id === threadId)?.status === 'waiting';
      if (waiting && this.awakeTurns.delete(threadId))
        this.ctx.deps.keepAwake?.release(threadId);
      else if (!waiting && !this.awakeTurns.has(threadId)) {
        this.awakeTurns.add(threadId);
        this.ctx.deps.keepAwake?.hold(threadId);
      }
    }
  }

  /** Host-only Cmd+E capture, before the command panel takes the user's app focus. */
  async captureLauncherContext(): Promise<string | undefined> {
    const allowed = () =>
      !this.ctx.deps.fakeServices &&
      !this.ctx.speech.assistantSuspended &&
      !this.ctx.releaseAccessLocked() &&
      this.ctx.computerAccess.accessMode() === 'mac' &&
      !this.ctx.computerAccess.backgroundControl();
    if (!allowed()) return undefined;
    const context = await this.ctx.deps.captureMacContext?.().catch(() => undefined);
    return allowed() ? context : undefined;
  }
}
