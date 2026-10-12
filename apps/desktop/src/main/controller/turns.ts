import { randomUUID } from 'node:crypto';
import type { ProviderAttachment } from '@sia/protocol';
import {
  type BridgeRequestMap,
  type BridgeResultMap,
  type DesktopSnapshot,
  type ThreadView,
} from '../../shared/bridge.js';
import { conversationTitle, UNTITLED_THREAD_TITLE } from '../../shared/plain-text.js';
import { taskRecoveryContext } from './task-recovery.js';
import type { ControllerContext } from './context.js';
import type { QueuedTurn } from './types.js';

/** The parts of the controller context Turns uses. */
type TurnsContext = Pick<
  ControllerContext,
  | 'appendTimeline'
  | 'approvals'
  | 'assistant'
  | 'attachments'
  | 'commit'
  | 'computerAccess'
  | 'deps'
  | 'mac'
  | 'providers'
  | 'requireSignedInReleaseAccount'
  | 'requireThread'
  | 'researchCapture'
  | 'resultSnapshot'
  | 'runner'
  | 'runtime'
  | 'shuttingDown'
  | 'speech'
  | 'state'
>;

/**
 * Sends, queues, steers, retries, redoes and cancels turns, and tracks the turns in flight and
 * the per-thread queues they drain from.
 */
export class Turns {
  readonly running = new Map<string, AbortController>();
  readonly phoneTurns = new Set<string>();
  readonly tasks = new Map<string, Promise<void>>();
  readonly workspaceLeases = new Map<string, string>();
  readonly pendingQuestions = new Map<string, { requestId: string; turnId: string }>();
  queued: QueuedTurn[] = [];

  /**
   * Threads whose Mac task paused on lock or sleep. Their queued follow-ups wait for the
   * person to press Continue task, send a message, or Stop, instead of skipping the pause.
   */
  readonly heldThreads = new Set<string>();

  readonly failedTurnAttachments = new Map<string, readonly ProviderAttachment[]>();

  constructor(private readonly ctx: TurnsContext) {}

  sendTurn(
    input: BridgeRequestMap['threads.send'],
    source: QueuedTurn['source'] = 'manual',
    reviewTarget?: QueuedTurn['reviewTarget'],
    scheduleRunId?: string,
    context?: string,
  ): BridgeResultMap['threads.send'] {
    this.ctx.requireSignedInReleaseAccount();
    this.ctx.providers.requireCodexSetupIdle();
    if (this.ctx.state.capture.status === 'blocked') {
      throw new Error(
        this.ctx.state.capture.blockedReason ??
          'Raw research capture could not be stored. Free disk space or sign out before starting another task.',
      );
    }
    const thread = this.ctx.requireThread(input.threadId);
    if (thread.archivedAt) throw new Error('Unarchive this thread before sending a message.');
    const attachmentGrants = (input.attachmentIds ?? []).map((id) => {
      const grant = this.ctx.attachments.grants.get(id);
      if (!grant || grant.threadId !== thread.id || grant.expiresAt <= Date.now()) {
        throw new Error('An attachment expired. Choose it again before sending.');
      }
      return grant;
    });
    const messageText =
      input.text.trim() ||
      `Review the attached ${attachmentGrants.length === 1 ? 'file' : 'files'}.`;
    const pendingQuestion = this.pendingQuestions.get(thread.id);
    if (pendingQuestion) {
      if (attachmentGrants.length) {
        throw new Error('Answer the pending question with text before attaching files.');
      }
      this.pendingQuestions.delete(thread.id);
      const questionItem = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === thread.id &&
          item.turnId === pendingQuestion.turnId &&
          item.kind === 'question' &&
          item.status === 'pending',
      );
      if (questionItem) questionItem.status = 'complete';
      delete thread.draft;
      const eventId = randomUUID();
      const timestamp = new Date().toISOString();
      this.ctx.appendTimeline(thread.id, {
        id: eventId,
        turnId: pendingQuestion.turnId,
        kind: 'user',
        text: messageText,
        status: 'complete',
        timestamp,
      });
      this.ctx.researchCapture.stageResearchText({
        turnId: pendingQuestion.turnId,
        eventId,
        occurredAt: timestamp,
        role: 'user',
        text: messageText,
        provider: thread.provider,
      });
      thread.status = 'running';
      void this.ctx.runtime
        ?.respondToRequest(thread.id, {
          requestId: pendingQuestion.requestId,
          text: messageText,
        })
        .catch((error: unknown) => {
          thread.status = 'failed';
          this.ctx.appendTimeline(thread.id, {
            id: randomUUID(),
            turnId: pendingQuestion.turnId,
            kind: 'error',
            title: 'Answer could not be delivered',
            text: error instanceof Error ? error.message : 'The provider session ended.',
            status: 'failed',
            timestamp: new Date().toISOString(),
          });
          this.ctx.commit();
        });
      this.ctx.commit();
      return { turnId: pendingQuestion.turnId, snapshot: this.ctx.resultSnapshot() };
    }
    // Provider state can change after an agent or immutable thread was created.
    // Revalidate every new turn instead of trusting persisted configuration.
    this.ctx.providers.requireReadyProvider(thread.provider, thread.model);
    const running = this.running.get(thread.id);
    // A person can add follow-ups while the thread works, or while a stopped turn is still
    // winding down. They wait behind the thread's own turn and start in order when it ends.
    const followUp =
      Boolean(running) || this.queued.some(({ threadId }) => threadId === thread.id);
    if (followUp && (source !== 'manual' || reviewTarget)) {
      throw new Error('This thread already has an active turn.');
    }
    delete thread.draft;
    const turnId = randomUUID();
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();
    this.ctx.appendTimeline(thread.id, {
      id: eventId,
      turnId,
      kind: 'user',
      text: messageText,
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ view }) => structuredClone(view)) }
        : {}),
      // A pending user message is a queued follow-up. startTurn marks it complete.
      status: followUp ? 'pending' : 'complete',
      timestamp,
      ...(scheduleRunId ? { scheduleRunId } : {}),
    });
    this.ctx.researchCapture.stageResearchText({
      turnId,
      eventId,
      occurredAt: timestamp,
      role: 'user',
      text: messageText,
      provider: thread.provider,
    });
    if (thread.title === UNTITLED_THREAD_TITLE) {
      thread.title =
        conversationTitle(input.text) ||
        attachmentGrants[0]?.view.name ||
        (attachmentGrants.length ? 'Attached files' : UNTITLED_THREAD_TITLE);
    }
    const queued: QueuedTurn = {
      ...(context ? { context } : {}),
      id: turnId,
      threadId: thread.id,
      text: messageText,
      source,
      ...(input.fromPhone ? { fromPhone: true as const } : {}),
      ...(reviewTarget ? { reviewTarget } : {}),
      ...(scheduleRunId ? { scheduleRunId } : {}),
      ...(attachmentGrants.length
        ? { attachments: attachmentGrants.map(({ attachment }) => attachment) }
        : {}),
    };
    // Keep short-lived grants available for local preview/open after send. They still expire
    // after one hour and are never persisted, so a relaunch cannot revive file access.
    if (followUp && this.heldThreads.delete(thread.id)) {
      // Writing again after a pause moves on from it; held follow-ups run in order.
      this.queued.push(queued);
      if (running?.signal.aborted) {
        thread.status = 'queued';
        thread.queueReason = 'Finishing the stopped task.';
      } else {
        this.drainQueue();
        this.markWaitingFollowUps(thread);
      }
    } else if (followUp) {
      this.queued.push(queued);
      if (running?.signal.aborted) {
        thread.status = 'queued';
        thread.queueReason = 'Finishing the stopped task.';
      }
    } else if (this.running.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      this.queued.push(queued);
    } else if (this.workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      this.queued.push(queued);
      // A person's message goes ahead of a memory review that holds the agent's workspace;
      // the review runs again on a later idle pass.
      const review = this.ctx.state.threads.find(
        (candidate) =>
          candidate.id !== thread.id &&
          candidate.workspace === thread.workspace &&
          this.ctx.assistant.library.isReview(candidate.id) &&
          this.activeTurnId(candidate.id) === this.workspaceLeases.get(thread.workspace),
      );
      if (source === 'manual' && review && !this.ctx.assistant.library.isReview(thread.id)) {
        thread.queueReason = 'Starting after Sia pauses its memory review.';
        void this.cancelTurn(review.id).catch(() => undefined);
      }
    } else {
      this.startTurn(queued);
    }
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return { turnId, snapshot: this.ctx.resultSnapshot() };
  }

  /**
   * Edit or Try again: replaces the thread's last exchange with a new turn. The last message
   * and everything after it leave the transcript, and the provider starts a fresh session
   * seeded with the conversation before it, so the old reply is not part of the context.
   * Actions the agent already took stay done.
   */
  async redoLastTurn(
    input: BridgeRequestMap['threads.redo'],
  ): Promise<BridgeResultMap['threads.redo']> {
    const thread = this.ctx.requireThread(input.threadId);
    if (
      !['idle', 'failed'].includes(thread.status) ||
      this.running.has(thread.id) ||
      this.queued.some((turn) => turn.threadId === thread.id) ||
      this.pendingQuestions.has(thread.id)
    ) {
      throw new Error('Wait for Sia to finish before changing the last message.');
    }
    const items = this.ctx.state.timeline
      .filter((item) => item.threadId === thread.id)
      .sort((left, right) => left.sequence - right.sequence);
    const last = items.findLast((item) => item.kind === 'user' && item.status === 'complete');
    if (!last?.text) throw new Error('There is no message to change in this conversation.');
    const text = input.text?.trim() || last.text;
    // The original files go with the message again while their one-hour access lasts.
    const attachmentIds = [
      ...new Set([
        ...(last.attachments ?? []).map(({ id }) => id),
        ...(input.attachmentIds ?? []),
      ]),
    ];
    for (const id of attachmentIds) {
      const grant = this.ctx.attachments.grants.get(id);
      if (!grant || grant.threadId !== thread.id || grant.expiresAt <= Date.now()) {
        throw new Error(
          'A file on this message is no longer available. Attach it again and send.',
        );
      }
    }
    const removed = new Set(items.filter((item) => item.sequence >= last.sequence));
    const timeline = this.ctx.state.timeline;
    this.ctx.state.timeline = timeline.filter((item) => !removed.has(item));
    const previousStatus = thread.status;
    thread.status = 'idle';
    try {
      // The next turn starts a fresh provider session from the remaining conversation.
      void this.ctx.runtime?.releaseSession(thread.id).catch(() => undefined);
      return this.sendTurn({
        threadId: thread.id,
        text,
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
    } catch (error) {
      this.ctx.state.timeline = timeline;
      thread.status = previousStatus;
      throw error;
    }
  }

  retryTurn(threadId: string): BridgeResultMap['threads.retry'] {
    this.ctx.requireSignedInReleaseAccount();
    this.ctx.providers.requireCodexSetupIdle();
    const thread = this.ctx.requireThread(threadId);
    if (thread.status !== 'failed') throw new Error('Only a failed turn can be retried.');
    this.ctx.providers.requireReadyProvider(thread.provider, thread.model);
    // Follow-ups held behind a paused task run after it continues.
    const held = this.heldThreads.has(thread.id);
    if (
      this.running.has(thread.id) ||
      (!held && this.queued.some((turn) => turn.threadId === thread.id))
    ) {
      throw new Error('This thread already has an active turn.');
    }
    const failed = this.ctx.state.timeline.findLast(
      (item) => item.threadId === thread.id && item.kind === 'error' && Boolean(item.turnId),
    );
    const userMessage = failed?.turnId
      ? this.ctx.state.timeline.find(
          (item) =>
            item.threadId === thread.id &&
            item.turnId === failed.turnId &&
            item.kind === 'user' &&
            Boolean(item.text?.trim()),
        )
      : undefined;
    if (!failed?.turnId || !userMessage?.text) {
      throw new Error('There is no failed user turn to retry in this thread.');
    }

    this.ctx.researchCapture.stageResearchText({
      turnId: failed.turnId,
      eventId: userMessage.id,
      occurredAt: userMessage.timestamp,
      role: 'user',
      text: userMessage.text,
      provider: thread.provider,
    });
    const failedAttachments = this.failedTurnAttachments.get(failed.turnId);
    const retry: QueuedTurn = {
      id: failed.turnId,
      threadId: thread.id,
      text: userMessage.text,
      recovery: taskRecoveryContext(this.ctx.state.timeline, thread.id, failed.turnId),
      source: 'manual',
      fakeDelayMs: 160,
      ...(failedAttachments?.length ? { attachments: failedAttachments } : {}),
    };
    this.ctx.appendTimeline(thread.id, {
      id: randomUUID(),
      turnId: failed.turnId,
      kind: 'notice',
      title: 'Continuing task',
      status: 'complete',
      timestamp: new Date().toISOString(),
    });
    this.heldThreads.delete(thread.id);
    // The continued task goes ahead of any follow-ups that waited behind it.
    const enqueue = (turn: QueuedTurn) =>
      held ? this.queued.unshift(turn) : this.queued.push(turn);
    if (this.running.size >= 4) {
      thread.status = 'queued';
      thread.queueReason = 'Four local tasks are already running.';
      enqueue(retry);
    } else if (this.workspaceLeases.has(thread.workspace)) {
      thread.status = 'queued';
      thread.queueReason = 'Waiting for another task to release this workspace.';
      enqueue(retry);
    } else {
      this.startTurn(retry);
    }
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return { turnId: failed.turnId, snapshot: this.ctx.resultSnapshot() };
  }

  async cancelTurn(threadId: string): Promise<DesktopSnapshot> {
    const thread = this.ctx.requireThread(threadId);
    this.ctx.speech.pushToTalk?.cancelTask(threadId);
    const running = this.running.get(threadId);
    const activeTurnId = running ? this.workspaceLeases.get(thread.workspace) : undefined;
    if (running) {
      running.abort();
      if (activeTurnId) {
        this.ctx.approvals.revokeApprovalsForTurn(threadId, activeTurnId);
        await this.ctx.runtime?.cancel(threadId, activeTurnId).catch(() => undefined);
      }
    }
    const queuedTurnIds = this.queued
      .filter((turn) => turn.threadId === threadId)
      .map((turn) => turn.id);
    this.queued = this.queued.filter((turn) => turn.threadId !== threadId);
    this.heldThreads.delete(threadId);
    if (activeTurnId) this.ctx.researchCapture.discardResearchTurn(activeTurnId);
    for (const turnId of queuedTurnIds) this.ctx.researchCapture.discardResearchTurn(turnId);
    // Stop cancels queued follow-ups too; their unsent messages leave the thread.
    const removedFollowUps = this.removeQueuedMessages(threadId, new Set(queuedTurnIds));
    const question = this.pendingQuestions.get(threadId);
    this.pendingQuestions.delete(threadId);
    if (question) {
      void this.ctx.runtime
        ?.respondToRequest(threadId, { requestId: question.requestId })
        .catch(() => undefined);
    }
    thread.status = 'idle';
    delete thread.queueReason;
    this.ctx.appendTimeline(threadId, {
      id: randomUUID(),
      kind: 'notice',
      title: 'Task cancelled',
      text: removedFollowUps
        ? `Completed work remains in this thread. ${removedFollowUps === 1 ? 'Your queued message was' : 'Your queued messages were'} not sent.`
        : 'Completed work remains in this thread.',
      status: 'complete',
      timestamp: new Date().toISOString(),
    });
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  /** A finished turn leaves its thread idle, or queued when a follow-up is about to start. */
  settleFinishedTurn(thread: ThreadView): void {
    if (this.queued.some((turn) => turn.threadId === thread.id)) {
      thread.status = 'queued';
      thread.queueReason = 'Starting your next message.';
    } else {
      thread.status = 'idle';
      delete thread.queueReason;
    }
  }

  /** Removes a follow-up that has not started yet. */
  unqueueMessage(threadId: string, messageId: string): DesktopSnapshot {
    const thread = this.ctx.requireThread(threadId);
    const item = this.ctx.state.timeline.find(
      (candidate) =>
        candidate.id === messageId &&
        candidate.threadId === threadId &&
        candidate.kind === 'user' &&
        candidate.status === 'pending',
    );
    const turnId = item?.turnId;
    if (!turnId || !this.queued.some((turn) => turn.id === turnId)) {
      throw new Error('This message has already started or was removed.');
    }
    this.queued = this.queued.filter((turn) => turn.id !== turnId);
    this.ctx.researchCapture.discardResearchTurn(turnId);
    this.removeQueuedMessages(threadId, new Set([turnId]));
    if (
      thread.status === 'queued' &&
      !this.running.has(threadId) &&
      !this.queued.some((turn) => turn.threadId === threadId)
    ) {
      thread.status = 'idle';
      delete thread.queueReason;
    }
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  /**
   * "Send now": a queued follow-up joins the running turn instead of waiting for it to end.
   * The message stays queued when the provider cannot take it.
   */
  async steerQueuedMessage(threadId: string, messageId: string): Promise<DesktopSnapshot> {
    const thread = this.ctx.requireThread(threadId);
    const item = this.ctx.state.timeline.find(
      (candidate) =>
        candidate.id === messageId &&
        candidate.threadId === threadId &&
        candidate.kind === 'user' &&
        candidate.status === 'pending',
    );
    const index = this.queued.findIndex((turn) => turn.id === item?.turnId);
    const queued = this.queued[index];
    if (!item || !queued) throw new Error('This message has already started or was removed.');
    const activeTurnId = this.activeTurnId(threadId);
    if (
      !activeTurnId ||
      thread.status !== 'running' ||
      this.running.get(threadId)?.signal.aborted
    ) {
      throw new Error('Sia is not working on this right now. Your message will be sent next.');
    }
    // Take it out of the queue first so the turn ending meanwhile cannot also start it.
    this.queued.splice(index, 1);
    try {
      if (!this.ctx.deps.fakeServices) {
        const runtime = this.ctx.runtime;
        if (!runtime) throw new Error('The provider runtime did not initialize.');
        await runtime.steer(threadId, activeTurnId, {
          text: queued.text,
          ...(queued.attachments?.length ? { attachments: queued.attachments } : {}),
        });
      }
    } catch (error) {
      this.queued.splice(Math.min(index, this.queued.length), 0, queued);
      // The turn may have ended while the provider refused; the message then runs next.
      if (!this.running.has(threadId)) this.drainQueue();
      this.ctx.commit();
      throw new Error(
        `Sia could not add this to the current task, so it will be sent next. ${error instanceof Error ? error.message : ''}`.trim(),
      );
    }
    // The message now belongs to the running turn and appears where it joined.
    item.status = 'complete';
    item.turnId = activeTurnId;
    item.sequence =
      this.ctx.state.timeline.reduce(
        (highest, candidate) =>
          candidate.threadId === threadId ? Math.max(highest, candidate.sequence) : highest,
        0,
      ) + 1;
    this.ctx.researchCapture.discardResearchTurn(queued.id);
    this.ctx.researchCapture.stageResearchText({
      turnId: activeTurnId,
      eventId: item.id,
      occurredAt: item.timestamp,
      role: 'user',
      text: queued.text,
      provider: thread.provider,
    });
    thread.updatedAt = new Date().toISOString();
    this.ctx.commit();
    return this.ctx.resultSnapshot();
  }

  /** Drops the pending user messages of queued follow-ups that will no longer run. */
  private removeQueuedMessages(threadId: string, turnIds: ReadonlySet<string>): number {
    const before = this.ctx.state.timeline.length;
    this.ctx.state.timeline = this.ctx.state.timeline.filter(
      (item) =>
        !(
          item.threadId === threadId &&
          item.kind === 'user' &&
          item.status === 'pending' &&
          item.turnId &&
          turnIds.has(item.turnId)
        ),
    );
    return before - this.ctx.state.timeline.length;
  }

  private startTurn(turn: QueuedTurn): void {
    if (this.ctx.shuttingDown) return;
    const thread = this.ctx.requireThread(turn.threadId);
    if (this.ctx.mac.unavailable && this.ctx.mac.isMacTurn(thread.id)) {
      // Screen control cannot work while the Mac is locked or asleep; start once it is back.
      this.queued.unshift(turn);
      thread.status = 'queued';
      thread.queueReason =
        this.ctx.mac.unavailable === 'locked'
          ? 'Waiting for your Mac to unlock.'
          : 'Waiting for your Mac to wake.';
      return;
    }
    // Any turn starting on a paused thread means the person moved on from the pause.
    this.heldThreads.delete(thread.id);
    const followUp = this.ctx.state.timeline.find(
      (item) =>
        item.threadId === thread.id &&
        item.turnId === turn.id &&
        item.kind === 'user' &&
        item.status === 'pending',
    );
    if (followUp) {
      // A queued follow-up joins the conversation when it starts, after the previous turn.
      followUp.status = 'complete';
      followUp.sequence =
        this.ctx.state.timeline.reduce(
          (highest, item) =>
            item.threadId === thread.id ? Math.max(highest, item.sequence) : highest,
          0,
        ) + 1;
    }
    const unavailable = this.ctx.providers.providerReadinessError(
      thread.provider,
      thread.model,
    );
    if (unavailable) {
      thread.status = 'failed';
      delete thread.queueReason;
      this.ctx.researchCapture.discardResearchTurn(turn.id);
      this.ctx.appendTimeline(thread.id, {
        id: randomUUID(),
        turnId: turn.id,
        kind: 'error',
        title: 'Provider is not ready',
        text: unavailable,
        status: 'failed',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const controller = new AbortController();
    this.running.set(thread.id, controller);
    this.workspaceLeases.set(thread.workspace, turn.id);
    if (this.ctx.mac.isMacTurn(thread.id)) {
      this.ctx.mac.turns.set(thread.id, turn);
      if (!this.ctx.computerAccess.backgroundControl())
        this.ctx.mac.foregroundTurns.add(thread.id);
      this.ctx.mac.awakeTurns.add(thread.id);
      this.ctx.deps.keepAwake?.hold(thread.id);
    }
    if (turn.fromPhone) this.phoneTurns.add(turn.id);
    thread.status = 'running';
    delete thread.queueReason;
    this.ctx.appendTimeline(thread.id, {
      id: randomUUID(),
      turnId: turn.id,
      kind: 'activity',
      title: this.ctx.deps.fakeServices
        ? 'Preparing local tools'
        : `Starting ${thread.provider === 'codex' ? 'Codex' : thread.provider}`,
      detail: thread.workspace,
      status: 'running',
      toolName: 'runtime.start',
      timestamp: new Date().toISOString(),
    });
    const reviewTimeout = this.ctx.assistant.library.isReview(thread.id)
      ? setTimeout(() => {
          void this.cancelTurn(thread.id).catch(() => undefined);
        }, 180_000)
      : undefined;
    reviewTimeout?.unref();
    const task = this.ctx.runner.runTurn(turn, controller.signal).finally(() => {
      if (reviewTimeout) clearTimeout(reviewTimeout);
      if (this.tasks.get(thread.id) === task) this.tasks.delete(thread.id);
    });
    this.tasks.set(thread.id, task);
  }

  activeTurnId(threadId: string): string | undefined {
    if (!this.running.has(threadId)) return undefined;
    const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
    return thread ? this.workspaceLeases.get(thread.workspace) : undefined;
  }

  releaseTurn(threadId: string): void {
    const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
    const turnId = this.activeTurnId(threadId);
    if (turnId) {
      this.phoneTurns.delete(turnId);
      this.ctx.approvals.taskGrants.delete(turnId);
    }
    this.running.delete(threadId);
    this.ctx.mac.turns.delete(threadId);
    this.ctx.mac.foregroundTurns.delete(threadId);
    if (this.ctx.mac.awakeTurns.delete(threadId)) this.ctx.deps.keepAwake?.release(threadId);
    if (thread) this.workspaceLeases.delete(thread.workspace);
    this.drainQueue();
    // A follow-up can still wait when another thread took the workspace first. A paused
    // thread keeps its failed state and Continue task until the person acts.
    if (thread && !this.heldThreads.has(threadId)) this.markWaitingFollowUps(thread);
  }

  /** Shows why a thread's queued follow-up has not started yet. */
  private markWaitingFollowUps(thread: ThreadView): void {
    if (this.running.has(thread.id) || !this.queued.some((turn) => turn.threadId === thread.id))
      return;
    thread.status = 'queued';
    thread.queueReason =
      this.ctx.mac.unavailable && this.ctx.mac.isMacTurn(thread.id)
        ? this.ctx.mac.unavailable === 'locked'
          ? 'Waiting for your Mac to unlock.'
          : 'Waiting for your Mac to wake.'
        : 'Waiting for another task to release this workspace.';
  }

  drainQueue(): void {
    if (this.ctx.shuttingDown) return;
    if (this.running.size >= 4) return;
    const nextIndex = this.queued.findIndex((turn) => {
      const thread = this.ctx.state.threads.find(({ id }) => id === turn.threadId);
      return (
        thread &&
        !this.heldThreads.has(thread.id) &&
        !this.workspaceLeases.has(thread.workspace) &&
        !(this.ctx.mac.unavailable && this.ctx.mac.isMacTurn(thread.id))
      );
    });
    if (nextIndex < 0) return;
    const [next] = this.queued.splice(nextIndex, 1);
    if (next) this.startTurn(next);
    if (this.running.size < 4) this.drainQueue();
  }

  requireIdleThread(id: string, action: string): ThreadView {
    const thread = this.ctx.requireThread(id);
    if (
      thread.status === 'running' ||
      thread.status === 'queued' ||
      thread.status === 'waiting' ||
      this.running.has(id) ||
      this.queued.some(({ threadId }) => threadId === id)
    ) {
      throw new Error(`Stop the active task before you ${action}.`);
    }
    return thread;
  }

  sendLauncherTurn(
    input: BridgeRequestMap['threads.send'],
    context?: string,
  ): BridgeResultMap['threads.send'] {
    return this.sendTurn(
      input,
      'manual',
      undefined,
      undefined,
      this.ctx.computerAccess.accessMode() === 'mac' &&
        !this.ctx.computerAccess.backgroundControl()
        ? context
        : undefined,
    );
  }
}
