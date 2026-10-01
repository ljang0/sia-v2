/** Provider runtime events as they reach the desktop controller. */

import { randomUUID } from 'node:crypto';
import type { ThreadEventEnvelope } from '@sia/protocol';
import type { ActivityPresentationView } from '../../shared/bridge.js';
import { mapRuntimePresentation, runtimeToolTitle } from '../providers/runtime-activity.js';
import type { ControllerContext } from './context.js';

export function isStreamingDelta(event: ThreadEventEnvelope): boolean {
  return (
    ((event.type === 'message' || event.type === 'reasoning') &&
      event.payload.delta === true) ||
    // Command output and patch progress repeat the running tool; its terminal phase commits.
    (event.type === 'tool' && event.payload.phase === 'started')
  );
}

/** The parts of the controller context RuntimeEventApplier uses. */
type RuntimeEventApplierContext = Pick<
  ControllerContext,
  | 'appendTimeline'
  | 'approvals'
  | 'providers'
  | 'requireThread'
  | 'researchCapture'
  | 'runner'
  | 'state'
  | 'turns'
>;

/**
 * Applies provider runtime events to thread state: streaming text, activities, questions,
 * usage, and turn completion.
 */
export class RuntimeEventApplier {
  constructor(private readonly ctx: RuntimeEventApplierContext) {}

  apply(event: ThreadEventEnvelope): void {
    const thread = this.ctx.requireThread(event.threadId);
    this.ctx.researchCapture.stageRawResearchEvent({
      threadId: event.threadId,
      turnId: event.turnId,
      eventType: `provider.${event.type}`,
      sequence: event.sequence,
      data: event,
      occurredAt: event.timestamp,
      sourceEventId: event.id,
    });
    if (event.type === 'approval' || event.type === 'question') {
      this.ctx.researchCapture.taintResearchTurn(event.turnId);
    }
    if (event.type === 'message') {
      const text = event.payload.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('');
      if (!text) return;
      if (event.payload.role === 'assistant') {
        this.ctx.researchCapture.stageResearchText({
          turnId: event.turnId,
          eventId: event.id,
          occurredAt: event.timestamp,
          role: 'assistant',
          text,
          provider: event.provider,
          messageId: event.payload.messageId,
          append: event.payload.delta,
        });
      }
      const existing = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'assistant' &&
          item.detail === event.payload.messageId,
      );
      if (existing && event.payload.delta) existing.text = `${existing.text ?? ''}${text}`;
      else {
        this.ctx.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: event.payload.role === 'assistant' ? 'assistant' : 'notice',
          text,
          detail: event.payload.messageId,
          status: event.payload.delta ? 'running' : 'complete',
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'reasoning') {
      // Only the reasoning summary is shown (as the live status line). Raw reasoning text is
      // never merged into it.
      if (event.payload.part === 'text') return;
      const existing = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.kind === 'reasoning' &&
          item.detail === event.payload.reasoningId,
      );
      if (existing && event.payload.delta)
        existing.text = `${existing.text ?? ''}${event.payload.text}`;
      else {
        this.ctx.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'reasoning',
          title: 'Reasoning',
          text: event.payload.text,
          detail: event.payload.reasoningId,
          status: event.payload.delta ? 'running' : 'complete',
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'tool') {
      if (event.payload.native) {
        this.ctx.researchCapture.stageResearchTrajectory({
          turnId: event.turnId,
          eventId: event.id,
          occurredAt: event.timestamp,
          payload: {
            source: 'provider',
            type: 'tool',
            name: event.payload.name,
            phase: event.payload.phase,
            ...(event.payload.presentation
              ? { presentation: event.payload.presentation.kind }
              : {}),
          },
        });
      } else if (
        !this.ctx.researchCapture.consumeSafeResearchAction(event.turnId, event.payload.name)
      ) {
        this.ctx.researchCapture.taintResearchTurn(event.turnId);
      }
      const activity = mapRuntimePresentation(event.payload.presentation);
      const running = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.callId,
      );
      if (running) {
        running.status =
          event.payload.phase === 'failed'
            ? 'failed'
            : event.payload.phase === 'completed'
              ? 'complete'
              : 'running';
        running.title = runtimeToolTitle(event.payload.name, activity);
        if (event.payload.error) running.detail = event.payload.error;
        if (activity) running.activity = activity;
      } else {
        // Message and reasoning items already render as transcript content; an extra
        // "UserMessage"/"AgentMessage"/"Reasoning" activity row is pure noise.
        const normalizedTool = event.payload.name.replace(/[._-]/g, '').toLowerCase();
        if (
          event.payload.native &&
          (normalizedTool === 'usermessage' ||
            normalizedTool === 'agentmessage' ||
            normalizedTool === 'reasoning')
        ) {
          return;
        }
        this.ctx.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: runtimeToolTitle(event.payload.name, activity),
          status:
            event.payload.phase === 'failed'
              ? 'failed'
              : event.payload.phase === 'completed'
                ? 'complete'
                : 'running',
          toolName: event.payload.name,
          toolCallId: event.payload.callId,
          ...(activity ? { activity } : {}),
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'approval' && event.payload.phase === 'requested') {
      this.ctx.researchCapture.taintResearchTurn(event.turnId);
      void this.ctx.approvals.authorizeProviderRequest(event);
      thread.status = 'waiting';
      return;
    }
    if (event.type === 'question' && event.payload.phase === 'requested') {
      const alreadyAsked =
        this.ctx.turns.pendingQuestions.get(event.threadId)?.requestId ===
        event.payload.requestId;
      this.ctx.turns.pendingQuestions.set(event.threadId, {
        requestId: event.payload.requestId,
        turnId: event.turnId,
      });
      this.ctx.appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'question',
        title: 'Provider needs input',
        text: event.payload.prompt,
        status: 'pending',
        timestamp: event.timestamp,
      });
      thread.status = 'waiting';
      if (!alreadyAsked)
        this.ctx.runner.notifyNeedsAttention(event.threadId, 'question', event.payload.prompt);
      return;
    }
    if (event.type === 'plan') {
      this.ctx.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'plan',
          phase: event.payload.steps.every(({ status }) => status === 'completed')
            ? 'completed'
            : 'active',
          counts: {
            steps: event.payload.steps.length,
            completed: event.payload.steps.filter(({ status }) => status === 'completed')
              .length,
          },
        },
      });
      const existing = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.planId,
      );
      const activity = { kind: 'plan' as const, steps: structuredClone(event.payload.steps) };
      if (existing) {
        existing.title = event.payload.title ?? 'Plan';
        existing.activity = activity;
        existing.status = event.payload.steps.every((step) => step.status === 'completed')
          ? 'complete'
          : 'running';
      } else {
        this.ctx.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: event.payload.title ?? 'Plan',
          status: event.payload.steps.every((step) => step.status === 'completed')
            ? 'complete'
            : 'running',
          toolName: 'plan.update',
          toolCallId: event.payload.planId,
          activity,
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'subagent') {
      this.ctx.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'subagent',
          phase: event.payload.phase,
          ...(event.payload.operation ? { name: event.payload.operation } : {}),
        },
      });
      const existing = this.ctx.state.timeline.findLast(
        (item) =>
          item.threadId === event.threadId &&
          item.turnId === event.turnId &&
          item.toolCallId === event.payload.subagentId,
      );
      const activity: ActivityPresentationView = {
        kind: 'subagent',
        subagentId: event.payload.subagentId,
        name: event.payload.name,
        phase: event.payload.phase,
        ...(event.payload.text ? { text: event.payload.text } : {}),
        ...(event.payload.agentPath ? { agentPath: event.payload.agentPath } : {}),
        ...(event.payload.operation ? { operation: event.payload.operation } : {}),
        ...(event.payload.model ? { model: event.payload.model } : {}),
        ...(event.payload.reasoningEffort
          ? { reasoningEffort: event.payload.reasoningEffort }
          : {}),
      };
      const status =
        event.payload.phase === 'failed'
          ? 'failed'
          : event.payload.phase === 'completed'
            ? 'complete'
            : 'running';
      if (existing) {
        existing.title = event.payload.name;
        existing.status = status;
        existing.activity = activity;
        if (event.payload.text) existing.detail = event.payload.text;
      } else {
        this.ctx.appendTimeline(event.threadId, {
          id: event.id,
          turnId: event.turnId,
          kind: 'activity',
          title: event.payload.name,
          ...(event.payload.text ? { detail: event.payload.text } : {}),
          status,
          toolName: 'provider.subagent',
          toolCallId: event.payload.subagentId,
          activity,
          timestamp: event.timestamp,
        });
      }
      return;
    }
    if (event.type === 'usage') {
      if (event.payload.limits) {
        this.ctx.providers.usageLimits.set(thread.provider, {
          usedPercent: event.payload.limits.usedPercent,
          ...(event.payload.limits.resetsAt ? { resetsAt: event.payload.limits.resetsAt } : {}),
          ...(event.payload.limits.windowMinutes
            ? { windowMinutes: event.payload.limits.windowMinutes }
            : {}),
          updatedAt: event.timestamp,
        });
      }
      // A plan-usage update alone carries no token counts for this turn.
      if (
        event.payload.inputTokens === undefined &&
        event.payload.outputTokens === undefined &&
        event.payload.cachedInputTokens === undefined &&
        event.payload.limits
      )
        return;
      this.ctx.state.usageByTurn[event.turnId] = {
        threadId: event.threadId,
        provider: thread.provider,
        inputTokens: event.payload.inputTokens ?? 0,
        outputTokens: event.payload.outputTokens ?? 0,
        cachedInputTokens: event.payload.cachedInputTokens ?? 0,
        updatedAt: event.timestamp,
      };
      this.ctx.researchCapture.stageResearchTrajectory({
        turnId: event.turnId,
        eventId: event.id,
        occurredAt: event.timestamp,
        payload: {
          source: 'provider',
          type: 'usage',
          counts: Object.fromEntries(
            Object.entries({
              inputTokens: event.payload.inputTokens,
              outputTokens: event.payload.outputTokens,
              cachedInputTokens: event.payload.cachedInputTokens,
            }).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          ),
        },
      });
      return;
    }
    if (event.type === 'error') {
      this.ctx.researchCapture.discardResearchTurn(event.turnId);
      thread.status = 'failed';
      const previous = this.ctx.state.timeline.findLast(
        (item) => item.threadId === event.threadId && item.kind === 'error',
      );
      // Providers can repeat the same failure notice; one card per distinct message is enough.
      if (previous?.turnId === event.turnId && previous.text === event.payload.message) return;
      this.ctx.appendTimeline(event.threadId, {
        id: event.id,
        turnId: event.turnId,
        kind: 'error',
        title: 'Task stopped',
        text: event.payload.message,
        status: 'failed',
        timestamp: event.timestamp,
      });
      return;
    }
    if (event.type === 'completion') {
      this.ctx.turns.pendingQuestions.delete(event.threadId);
      this.ctx.runner.completeRunningActivities(event.threadId, event.turnId);
      if (event.payload.status === 'failed') thread.status = 'failed';
      else this.ctx.turns.settleFinishedTurn(thread);
      if (
        event.payload.status === 'failed' &&
        !this.ctx.state.timeline.some(
          (item) => item.turnId === event.turnId && item.kind === 'error',
        )
      ) {
        // A failed turn must never end silently: if the provider gave no reason, say so.
        this.ctx.appendTimeline(event.threadId, {
          id: randomUUID(),
          turnId: event.turnId,
          kind: 'error',
          title: 'Turn did not complete',
          text: 'The model stopped before finishing this task. Try again. If it keeps happening, check your plan’s sign-in and usage in Settings → AI.',
          status: 'failed',
          timestamp: event.timestamp,
        });
      }
      if (event.payload.status === 'completed')
        this.ctx.researchCapture.completeResearchTurn(event.turnId);
      else this.ctx.researchCapture.discardResearchTurn(event.turnId);
    }
  }
}
