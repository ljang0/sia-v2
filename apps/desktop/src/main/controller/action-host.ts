import type { ActionInvocationObserver, ActionResultObserver } from '@sia/action-gateway';
import { GOOGLE_WORKSPACE_ACTION, isConnectorActionTool } from './connection-ids.js';
import type { ControllerContext } from './context.js';
import { SAFE_RESEARCH_ACTIONS } from './research-records.js';

/**
 * Hosts Sia's gateway actions for the runtime: which action tools are available, what an
 * invocation excludes from research, and how results reach trajectories and research.
 */
export class ActionHost {
  constructor(private readonly ctx: ControllerContext) {}

  invocationObserver(): ActionInvocationObserver {
    return (invocation) => {
      if (GOOGLE_WORKSPACE_ACTION.test(invocation.name)) {
        this.ctx.researchCapture.excludeResearchTurn(invocation.context.turnId);
        this.ctx.deps.trajectory?.excludeTurn(
          invocation.context.threadId,
          invocation.context.turnId,
        );
        return;
      }
      if (SAFE_RESEARCH_ACTIONS.has(invocation.name)) {
        this.ctx.researchCapture.markSafeResearchAction(
          invocation.context.turnId,
          invocation.name,
        );
      } else {
        this.ctx.researchCapture.taintResearchTurn(invocation.context.turnId);
      }
    };
  }

  resultObserver(): ActionResultObserver {
    return (notice) => {
      const thread = this.ctx.state.threads.find(
        (entry) => entry.id === notice.context.threadId,
      );
      if (
        thread &&
        !this.ctx.assistant.library.isReview(thread.id) &&
        !this.ctx.releaseAccessLocked() &&
        !/^(memory_|assistant_)/.test(notice.name)
      ) {
        // Operational journal deliberately excludes arguments, message bodies, URLs and screenshots.
        this.ctx.assistant.library.record({
          agentId: thread.agentId,
          threadId: thread.id,
          turnId: notice.context.turnId,
          kind: 'action',
          title: notice.name,
          text: notice.result.outcome,
        });
      }
      this.recordActionResult(notice);
      if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) return;
      this.ctx.researchCapture.stageRawResearchEvent({
        threadId: notice.context.threadId,
        turnId: notice.context.turnId,
        eventType: 'sia.action_result',
        data: {
          name: notice.name,
          arguments: notice.arguments ?? {},
          result: notice.result,
        },
      });
      this.ctx.researchCapture.stageResearchActionResult(notice);
    };
  }

  toolAvailable(name: string): boolean {
    if (this.ctx.releaseAccessLocked()) return false;
    if (isConnectorActionTool(name)) {
      return (
        this.ctx.deps.fakeServices ||
        (this.ctx.deps.cloud.configured &&
          this.ctx.deps.identity.status().state === 'signed_in' &&
          this.ctx.state.cloudFeatures.connectors)
      );
    }
    if (name.startsWith('schedule_')) return this.ctx.schedules.schedulesAvailable();
    return true;
  }

  recordActionResult(notice: Parameters<ActionResultObserver>[0]): void {
    if (!this.ctx.deps.trajectory) return;
    if (GOOGLE_WORKSPACE_ACTION.test(notice.name)) {
      return;
    }
    const images = (notice.result.images ?? []).map((image) => ({
      mimeType: image.mimeType,
      dataBase64: image.dataBase64,
    }));
    this.ctx.deps.trajectory.record(
      {
        type: 'action_result',
        threadId: notice.context.threadId,
        turnId: notice.context.turnId,
        name: notice.name,
        arguments: notice.arguments ?? {},
        outcome: notice.result.outcome,
        summary: notice.result.summary,
        ...(notice.result.reason ? { reason: notice.result.reason } : {}),
        ...(notice.result.data !== undefined ? { data: notice.result.data } : {}),
      },
      images,
    );
  }
}
