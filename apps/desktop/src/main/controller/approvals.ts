import { randomUUID } from 'node:crypto';
import {
  type ApprovalBroker,
  type ApprovalRequest as GatewayApprovalRequest,
  parseActionArguments,
} from '@sia/action-gateway';
import type { ThreadEventEnvelope } from '@sia/protocol';
import { activityLabel } from '../../shared/activity-label.js';
import type { ApprovalView, BridgeRequestMap, DesktopSnapshot } from '../../shared/bridge.js';
import {
  computerApprovalPresentation,
  safeResourceLabel,
  summarizeActionTarget,
  summarizeDataLeaving,
} from '../approval-copy.js';
import type { CuaAuthorizationContext } from '../cua-service.js';
import { humanizeToolName, runtimeToolTitle } from '../runtime-activity.js';
import { gatewayTaskGrant } from './approval-grants.js';
import { connectorAppForTool, GOOGLE_WORKSPACE_ACTION } from './connection-ids.js';
import type { ControllerContext } from './context.js';
import type { ApprovedConnectorBinding, PendingApproval } from './types.js';

/**
 * Authorizes provider requests, Sia-hosted gateway actions and computer use: per-turn trust,
 * pending approval cards, task grants and approved connector bindings.
 */
export class Approvals {
  readonly pending = new Map<string, PendingApproval>();

  /** "Allow for this task" grants by turn id; a grant ends with its turn. */
  readonly taskGrants = new Map<string, Set<string>>();

  readonly approvedConnectorBindings = new Map<string, ApprovedConnectorBinding>();

  constructor(private readonly ctx: ControllerContext) {}

  approvalBroker(): ApprovalBroker {
    return {
      requestApproval: (request, signal) => this.authorizeGatewayAction(request, signal),
    };
  }

  /**
   * Full bypass never extends to phone turns: the phone link is plain HTTP on the local network,
   * so anyone who observes it could otherwise run unattended actions on this Mac.
   */
  trustForTurn(turnId: string | undefined): 'auto' | 'ask' {
    return turnId && this.ctx.turns.phoneTurns.has(turnId)
      ? 'ask'
      : this.ctx.computerAccess.trust();
  }

  async authorizeComputer(
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
    if (this.ctx.releaseAccessLocked()) return 'deny';
    if (context.kind === 'direct_user') return 'allow';
    const active = this.ctx.turns.activeTurnId(context.threadId);
    if (active !== context.turnId) return 'cancel';
    const presentation = computerApprovalPresentation(request.adapterId, request.humanSummary);
    const resource = safeResourceLabel(request.resourceJson, presentation.kind);
    const taskGrant =
      ['native_tool', 'foreground_takeover'].includes(presentation.kind) &&
      !this.ctx.turns.phoneTurns.has(context.turnId)
        ? [
            'computer',
            request.adapterId,
            request.riskClass,
            request.permissionMode,
            resource,
          ].join('\u0000')
        : undefined;
    if (
      this.trustForTurn(active) === 'auto' ||
      (taskGrant && this.hasTaskGrant(context.threadId, context.turnId, taskGrant))
    ) {
      // Trusted local mode: the driver's own risk prompt is answered for the person, but the
      // decision is written to the trajectory log so every action stays reviewable afterwards.
      this.ctx.deps.trajectory?.record({
        type: 'computer_authorization',
        threadId: context.threadId,
        turnId: context.turnId,
        decision: 'allow',
        automatic: true,
        adapterId: request.adapterId,
        riskClass: request.riskClass,
        summary: request.humanSummary,
      });
      this.ctx.researchCapture.stageRawResearchEvent({
        threadId: context.threadId,
        turnId: context.turnId,
        eventType: 'computer.authorization',
        data: {
          decision: 'allow',
          automatic: true,
          adapterId: request.adapterId,
          riskClass: request.riskClass,
          permissionMode: request.permissionMode,
          requestDigest: request.requestDigest,
          humanSummary: request.humanSummary,
          resourceJson: request.resourceJson,
          expiresUnixMs: request.expiresUnixMs.toString(),
        },
      });
      return 'allow';
    }
    const approvalId = randomUUID();
    const expiresAt = new Date(Number(request.expiresUnixMs)).toISOString();
    this.ctx.state.approvals.push({
      id: approvalId,
      threadId: context.threadId,
      callId: request.requestDigest,
      kind: presentation.kind,
      title: presentation.title,
      summary: `${request.humanSummary} (${request.riskClass}, ${request.permissionMode})`,
      target: resource,
      reversible: false,
      expiresAt,
      status: 'pending',
      ...(taskGrant ? { allowForTask: true } : {}),
    });
    this.ctx.researchCapture.stageRawResearchEvent({
      threadId: context.threadId,
      turnId: context.turnId,
      eventType: 'computer.authorization_request',
      data: {
        approvalId,
        adapterId: request.adapterId,
        riskClass: request.riskClass,
        permissionMode: request.permissionMode,
        requestDigest: request.requestDigest,
        humanSummary: request.humanSummary,
        resourceJson: request.resourceJson,
        expiresUnixMs: request.expiresUnixMs.toString(),
      },
    });
    this.waitForApproval(context.threadId);
    this.ctx.commit();
    this.ctx.notifyNeedsAttention(context.threadId, 'approval', presentation.title);

    return new Promise((resolve) => {
      // Wait for the person until the driver's own deadline; Sia adds no shorter limit.
      const remaining = Math.max(0, Number(request.expiresUnixMs) - Date.now());
      const timeout = setTimeout(
        () => {
          this.pending.delete(approvalId);
          this.resumeAfterRequest(context.threadId);
          this.setApprovalStatus(approvalId, 'expired');
          this.stageApprovalDecision(approvalId, context, 'expired');
          resolve('cancel');
        },
        Math.min(remaining, 2_147_483_647),
      );
      this.pending.set(approvalId, {
        resolve,
        timeout,
        kind: 'computer',
        threadId: context.threadId,
        turnId: context.turnId,
        ...(taskGrant ? { taskGrant } : {}),
      });
    });
  }

  resolveApproval(input: BridgeRequestMap['approvals.resolve']): DesktopSnapshot {
    const pending = this.pending.get(input.approvalId);
    if (!pending) throw new Error('This approval expired or was already resolved.');
    if (this.ctx.turns.activeTurnId(pending.threadId) !== pending.turnId) {
      this.revokeApproval(input.approvalId, pending);
      this.ctx.commit();
      throw new Error('This approval belongs to a turn that is no longer active.');
    }
    const approval = this.ctx.state.approvals.find(({ id }) => id === input.approvalId);
    const forTask = input.decision === 'approve_task';
    if (forTask && (!approval?.allowForTask || this.ctx.turns.phoneTurns.has(pending.turnId)))
      throw new Error('This request can only be allowed once.');
    const approved = input.decision !== 'deny';
    clearTimeout(pending.timeout);
    this.pending.delete(input.approvalId);
    this.resumeAfterRequest(pending.threadId);
    if (forTask) {
      approval!.scope = 'task';
      if (pending.taskGrant) {
        const grants = this.taskGrants.get(pending.turnId) ?? new Set<string>();
        grants.add(`${pending.threadId}\u0000${pending.taskGrant}`);
        this.taskGrants.set(pending.turnId, grants);
      }
    }
    this.setApprovalStatus(input.approvalId, approved ? 'approved' : 'denied');
    this.stageApprovalDecision(
      input.approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      approved ? 'approved' : 'denied',
    );
    if (pending.kind === 'provider' && pending.threadId && pending.requestId) {
      void this.ctx.runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: forTask ? 'allow_task' : approved ? 'allow_once' : 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve(approved ? 'allow' : 'deny');
    return this.ctx.resultSnapshot();
  }

  async authorizeProviderRequest(
    event: Extract<ThreadEventEnvelope, { type: 'approval' }>,
  ): Promise<void> {
    if (this.ctx.assistant.library.isReview(event.threadId)) {
      await this.ctx.runtime?.respondToRequest(event.threadId, {
        requestId: event.payload.requestId,
        choiceId: 'deny',
      });
      return;
    }
    this.ctx.researchCapture.taintResearchTurn(event.turnId);
    const alreadyRequested = [...this.pending.values()].some(
      (pending) =>
        pending.kind === 'provider' &&
        pending.threadId === event.threadId &&
        pending.requestId === event.payload.requestId,
    );
    const approvalId = randomUUID();
    // Like Codex, a native approval waits until it is answered or the turn ends.
    this.ctx.state.approvals.push({
      id: approvalId,
      threadId: event.threadId,
      callId: event.payload.requestId,
      kind: 'native_tool',
      title: event.payload.title,
      summary: event.payload.description,
      target: event.provider,
      reversible: false,
      status: 'pending',
      // Phone turns always ask on the Mac, one request at a time.
      ...(event.payload.choices?.some(({ kind }) => kind === 'allow_task') &&
      !this.ctx.turns.phoneTurns.has(event.turnId)
        ? { allowForTask: true }
        : {}),
    });
    this.ctx.appendTimeline(event.threadId, {
      id: event.id,
      turnId: event.turnId,
      kind: 'approval',
      title: event.payload.title,
      text: event.payload.description,
      detail: event.provider,
      status: 'pending',
      approvalId,
      toolName: 'provider.native',
      timestamp: event.timestamp,
    });
    this.pending.set(approvalId, {
      resolve: () => undefined,
      kind: 'provider',
      threadId: event.threadId,
      turnId: event.turnId,
      requestId: event.payload.requestId,
    });
    this.ctx.commit();
    if (!alreadyRequested)
      this.ctx.notifyNeedsAttention(
        event.threadId,
        'approval',
        event.payload.description || event.payload.title,
      );
  }

  async authorizeGatewayAction(
    request: GatewayApprovalRequest,
    signal?: AbortSignal,
  ): Promise<{ approved: boolean }> {
    this.ctx.researchCapture.taintResearchTurn(request.turnId);
    const approvalId = randomUUID();
    const connector = /^(mail|drive|docs|sheets|slides|slack)_/.test(request.tool.name);
    const upload = /upload/.test(request.tool.name);
    let reviewArguments = request.arguments;
    if (request.tool.name === 'skill_run') {
      const args = parseActionArguments('skill_run', request.arguments);
      const agentId = this.ctx.requireThread(request.threadId).agentId;
      const skill = this.ctx.assistant.library.skill(agentId, args.id, args.revision);
      // The approval digest binds id + SHA-256 revision + input. Resolve the
      // exact source in the host, never ask the model to copy it back to us.
      reviewArguments = { ...args, source: skill.source };
    }
    const dataLeaving = summarizeDataLeaving(reviewArguments, request.tool.name);
    const dataLabel = request.tool.name.startsWith('skill_')
      ? 'Bash source and inputs to review'
      : request.tool.name === 'mac_automation'
        ? 'Native app action'
        : dataLeaving && request.tool.name === 'computer_action'
          ? 'Text or keys used in this action'
          : undefined;
    const capabilityBound = ['computer_action', 'browser_action', 'browser_upload'].includes(
      request.tool.name,
    );
    const trustedTarget = capabilityBound
      ? this.ctx.browserCapabilitySink?.trustedApprovalTarget(
          request.tool.name,
          request.arguments,
        )
      : undefined;
    if (capabilityBound && !trustedTarget) return { approved: false };
    const connectorApp = connector ? connectorAppForTool(request.tool.name) : undefined;
    const connectorSelector =
      connector && typeof request.arguments.account_id === 'string'
        ? request.arguments.account_id
        : undefined;
    const pinnedConnectionId =
      connectorApp && connectorSelector
        ? this.ctx.connections.connectionIdForAction(connectorApp, connectorSelector)
        : undefined;
    const pinnedGeneration = connectorApp
      ? (this.ctx.connections.generations.get(connectorApp) ?? 0)
      : undefined;
    if (connector && (!connectorApp || !connectorSelector || !pinnedConnectionId)) {
      return { approved: false };
    }
    const account = connector
      ? this.ctx.connections.connectorAccountLabel(request.arguments.account_id)
      : undefined;
    const taskGrant = this.ctx.turns.phoneTurns.has(request.turnId)
      ? undefined
      : gatewayTaskGrant(request.tool.name, request.arguments);
    if (
      (this.trustForTurn(request.turnId) === 'auto' &&
        !request.tool.name.startsWith('skill_')) ||
      (taskGrant && this.hasTaskGrant(request.threadId, request.turnId, taskGrant))
    ) {
      if (
        connectorApp &&
        connectorSelector &&
        pinnedConnectionId &&
        pinnedGeneration !== undefined
      ) {
        this.approvedConnectorBindings.set(request.id, {
          approvalId: request.id,
          threadId: request.threadId,
          turnId: request.turnId,
          app: connectorApp,
          selector: connectorSelector,
          connectionId: pinnedConnectionId,
          generation: pinnedGeneration,
          ...(account ? { account } : {}),
        });
      }
      const automaticTarget =
        trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name);
      this.ctx.deps.trajectory?.record({
        type: 'action_authorization',
        threadId: request.threadId,
        turnId: request.turnId,
        decision: 'allow',
        automatic: true,
        toolName: request.tool.name,
        target: GOOGLE_WORKSPACE_ACTION.test(request.tool.name)
          ? 'Google Workspace'
          : automaticTarget,
      });
      this.ctx.researchCapture.stageRawResearchEvent({
        threadId: request.threadId,
        turnId: request.turnId,
        eventType: 'action.authorization',
        data: {
          requestId: request.id,
          decision: 'allow',
          automatic: true,
          toolName: request.tool.name,
          target: automaticTarget,
          ...(account ? { account } : {}),
          ...(dataLeaving ? { dataLeaving } : {}),
        },
      });
      return { approved: true };
    }
    this.ctx.state.approvals.push({
      id: approvalId,
      threadId: request.threadId,
      callId: request.id,
      kind: connector ? 'connector_write' : upload ? 'file_upload' : 'native_tool',
      title: `Approve ${humanizeToolName(request.tool.name)}`,
      summary: request.reason,
      target: trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name),
      ...(account ? { account } : {}),
      ...(dataLeaving ? { dataLeaving } : {}),
      ...(dataLabel ? { dataLabel } : {}),
      reversible: false,
      status: 'pending',
      ...(taskGrant ? { allowForTask: true } : {}),
    });
    this.ctx.appendTimeline(request.threadId, {
      id: randomUUID(),
      turnId: request.turnId,
      kind: 'approval',
      title: `Approve ${humanizeToolName(request.tool.name)}`,
      text: request.reason,
      detail: trustedTarget ?? summarizeActionTarget(request.arguments, request.tool.name),
      status: 'pending',
      approvalId,
      toolName: request.tool.name,
      timestamp: new Date().toISOString(),
    });
    this.waitForApproval(request.threadId);
    this.ctx.commit();
    // The notification names the step in words ("Sending your mail"), not the tool id.
    const step = activityLabel(request.tool.name);
    this.ctx.notifyNeedsAttention(
      request.threadId,
      'approval',
      step === activityLabel(undefined) ? runtimeToolTitle(request.tool.name) : step,
    );
    return await new Promise((resolve) => {
      const finish = (decision: 'allow' | 'deny' | 'cancel'): void => {
        signal?.removeEventListener('abort', abort);
        const connectionUnchanged =
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId &&
          pinnedGeneration !== undefined
            ? this.ctx.connections.connectionIdForAction(connectorApp, connectorSelector) ===
                pinnedConnectionId &&
              (this.ctx.connections.generations.get(connectorApp) ?? 0) === pinnedGeneration
            : true;
        if (
          decision === 'allow' &&
          connectionUnchanged &&
          connectorApp &&
          connectorSelector &&
          pinnedConnectionId
        ) {
          this.approvedConnectorBindings.set(request.id, {
            approvalId: request.id,
            threadId: request.threadId,
            turnId: request.turnId,
            app: connectorApp,
            selector: connectorSelector,
            connectionId: pinnedConnectionId,
            generation: pinnedGeneration!,
            ...(account ? { account } : {}),
          });
        } else {
          this.approvedConnectorBindings.delete(request.id);
        }
        resolve({ approved: decision === 'allow' && connectionUnchanged });
      };
      const abort = (): void => {
        this.pending.delete(approvalId);
        this.resumeAfterRequest(request.threadId);
        this.setApprovalStatus(approvalId, 'expired');
        finish('cancel');
      };
      // Waits for the person; the turn ending (or the tool call aborting) revokes it.
      this.pending.set(approvalId, {
        resolve: finish,
        kind: 'gateway',
        threadId: request.threadId,
        turnId: request.turnId,
        requestId: request.id,
        ...(taskGrant ? { taskGrant } : {}),
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }

  /** A task keeps working after its approval is answered; leave "waiting" once nothing is pending. */
  resumeAfterRequest(threadId: string): void {
    const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
    if (
      thread?.status === 'waiting' &&
      this.ctx.turns.running.has(threadId) &&
      !this.ctx.turns.pendingQuestions.has(threadId) &&
      ![...this.pending.values()].some((pending) => pending.threadId === threadId)
    )
      thread.status = 'running';
  }

  /** A running task that asks the person to approve an action is waiting on them. */
  waitForApproval(threadId: string): void {
    const thread = this.ctx.state.threads.find(({ id }) => id === threadId);
    if (thread?.status === 'running' && this.ctx.turns.running.has(threadId))
      thread.status = 'waiting';
  }

  hasTaskGrant(threadId: string, turnId: string, grant: string): boolean {
    return (
      !this.ctx.turns.phoneTurns.has(turnId) &&
      this.ctx.turns.activeTurnId(threadId) === turnId &&
      Boolean(this.taskGrants.get(turnId)?.has(`${threadId}\u0000${grant}`))
    );
  }

  revokeApprovalsForTurn(threadId: string, turnId: string): void {
    this.taskGrants.delete(turnId);
    for (const [approvalId, pending] of [...this.pending]) {
      if (pending.threadId === threadId && pending.turnId === turnId) {
        this.revokeApproval(approvalId, pending);
      }
    }
    for (const [approvalId, binding] of this.approvedConnectorBindings) {
      if (binding.threadId === threadId && binding.turnId === turnId) {
        this.approvedConnectorBindings.delete(approvalId);
      }
    }
  }

  revokeApproval(approvalId: string, pending: PendingApproval): void {
    clearTimeout(pending.timeout);
    this.pending.delete(approvalId);
    if (pending.requestId) this.approvedConnectorBindings.delete(pending.requestId);
    const approval = this.ctx.state.approvals.find(({ id }) => id === approvalId);
    if (approval?.status === 'pending') approval.status = 'expired';
    this.stageApprovalDecision(
      approvalId,
      { threadId: pending.threadId, turnId: pending.turnId },
      'expired',
    );
    if (pending.kind === 'provider' && pending.requestId) {
      void this.ctx.runtime
        ?.respondToRequest(pending.threadId, {
          requestId: pending.requestId,
          choiceId: 'deny',
        })
        .catch(() => undefined);
    }
    pending.resolve('cancel');
  }

  stageApprovalDecision(
    approvalId: string,
    context: { threadId: string; turnId: string },
    decision: 'approved' | 'denied' | 'expired',
  ): void {
    const approval = this.ctx.state.approvals.find(({ id }) => id === approvalId);
    this.ctx.researchCapture.stageRawResearchEvent({
      threadId: context.threadId,
      turnId: context.turnId,
      eventType: 'approval.decision',
      data: {
        approvalId,
        decision,
        ...(approval
          ? {
              kind: approval.kind,
              title: approval.title,
              summary: approval.summary,
              target: approval.target,
            }
          : {}),
      },
    });
  }

  setApprovalStatus(id: string, status: ApprovalView['status']): void {
    const approval = this.ctx.state.approvals.find((candidate) => candidate.id === id);
    if (approval) approval.status = status;
    this.ctx.commit();
  }
}
