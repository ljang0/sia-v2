import { randomUUID } from 'node:crypto';
import type { ActionResultObserver } from '@sia/action-gateway';
import { type ProviderId, RESEARCH_CONSENT_VERSION } from '../../shared/bridge.js';
import type { ControllerContext } from './context.js';
import {
  containsSecretShapedText,
  expandRawResearchEvents,
  jsonSafeValue,
  LOCAL_RESEARCH_IDENTITY,
  MAX_LOCAL_RESEARCH_BATCH_BYTES,
  MAX_RESEARCH_SCREENSHOT_BASE64_BYTES,
  partitionRawResearchEvents,
  type ResearchBatchRecord,
  type ResearchEventRecord,
  SAFE_RESEARCH_ACTIONS,
  type StagedResearchTurn,
} from './research-records.js';

/** The parts of the controller context ResearchCapture uses. */
type ResearchCaptureContext = Pick<ControllerContext, 'deps' | 'researchOutbox' | 'state'>;

/**
 * Stages consented research capture for a turn: redacted text, trajectories and action results,
 * and raw events when raw capture is enabled. Staged turns go to the outbox when they finish.
 */
export class ResearchCapture {
  readonly staging = new Map<string, StagedResearchTurn>();

  /**
   * A Google Workspace action excludes its entire turn from research capture. The set lets us
   * discard events staged before the action was invoked and reject events that arrive afterwards.
   */
  private readonly excludedTurns = new Set<string>();

  constructor(private readonly ctx: ResearchCaptureContext) {}

  stageResearchText(input: {
    turnId: string;
    eventId: string;
    occurredAt: string;
    role: 'user' | 'assistant';
    text: string;
    provider: ProviderId;
    messageId?: string;
    append?: boolean;
  }): void {
    if (!this.researchCaptureActive() || !input.text || this.excludedTurns.has(input.turnId))
      return;
    let staged = this.staging.get(input.turnId);
    if (!staged && input.role === 'assistant') return;
    if (!staged) {
      staged = {
        tainted: false,
        events: [],
        rawEvents: [],
        eventByMessageId: new Map(),
        safeActionNames: [],
      };
      this.staging.set(input.turnId, staged);
    }
    if (staged.tainted) return;
    if (containsSecretShapedText(input.text)) {
      staged.tainted = true;
      staged.events = [];
      staged.eventByMessageId.clear();
      return;
    }
    const existingId = input.messageId
      ? staged.eventByMessageId.get(input.messageId)
      : undefined;
    const existing = existingId
      ? staged.events.find((event) => event.id === existingId)
      : undefined;
    if (existing?.kind === 'conversation.text') {
      existing.payload.text = input.append
        ? `${existing.payload.text}${input.text}`
        : input.text;
      if (!existing.sourceEventIds.includes(input.eventId)) {
        existing.sourceEventIds.push(input.eventId);
      }
      if (containsSecretShapedText(existing.payload.text)) {
        staged.tainted = true;
        staged.events = [];
        staged.eventByMessageId.clear();
      }
      return;
    }
    const event: ResearchEventRecord = {
      id: randomUUID(),
      occurredAt: input.occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'conversation.text',
      payload: { role: input.role, text: input.text, provider: input.provider },
      sourceEventIds: [input.eventId],
    };
    staged.events.push(event);
    if (input.messageId) staged.eventByMessageId.set(input.messageId, event.id);
  }

  taintResearchTurn(turnId: string): void {
    if (this.excludedTurns.has(turnId)) return;
    const staged = this.staging.get(turnId) ?? {
      tainted: false,
      events: [],
      rawEvents: [],
      eventByMessageId: new Map<string, string>(),
      safeActionNames: [],
    };
    staged.tainted = true;
    staged.events = [];
    staged.eventByMessageId.clear();
    this.staging.set(turnId, staged);
  }

  excludeResearchTurn(turnId: string): void {
    this.excludedTurns.add(turnId);
    this.staging.delete(turnId);
  }

  discardResearchTurn(turnId: string): void {
    if (this.excludedTurns.delete(turnId)) {
      this.staging.delete(turnId);
      return;
    }
    if (this.rawResearchEnabled()) {
      this.persistRawResearchTurn(turnId, 'discarded');
      return;
    }
    this.staging.delete(turnId);
  }

  private rawResearchEnabled(): boolean {
    return (
      this.researchCaptureActive() &&
      this.ctx.state.capture.consentVersion === RESEARCH_CONSENT_VERSION
    );
  }

  /**
   * Records non-turn product activity without ever retaining an OAuth URL, code, or token.
   * Research is optional; lifecycle telemetry is copied only while capture is active.
   */
  recordLifecycleEvent(eventType: string, data: Record<string, unknown>): void {
    const occurredAt = new Date().toISOString();
    const threadId = 'app-lifecycle';
    const turnId = `lifecycle-${randomUUID()}`;
    this.ctx.deps.trajectory?.record({
      type: eventType,
      threadId,
      turnId,
      data: jsonSafeValue(data),
    });

    if (!this.rawResearchEnabled()) {
      return;
    }

    this.stageRawResearchEvent({
      threadId,
      turnId,
      eventType,
      data,
      occurredAt,
    });
    this.persistRawResearchTurn(turnId, 'completed');
  }

  stageRawResearchEvent(input: {
    threadId: string;
    turnId: string;
    eventType: string;
    sequence?: number;
    data: unknown;
    occurredAt?: string;
    sourceEventId?: string;
  }): void {
    if (!this.rawResearchEnabled() || this.excludedTurns.has(input.turnId)) return;
    const staged = this.staging.get(input.turnId) ?? {
      tainted: false,
      events: [],
      rawEvents: [],
      eventByMessageId: new Map<string, string>(),
      safeActionNames: [],
    };
    staged.rawEvents.push({
      id: randomUUID(),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      classification: 'research_allowed',
      taints: [],
      kind: 'raw.event',
      payload: {
        schemaVersion: 1,
        threadId: input.threadId,
        turnId: input.turnId,
        eventType: input.eventType,
        ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
        data: jsonSafeValue(input.data),
      },
      sourceEventIds: input.sourceEventId ? [input.sourceEventId] : [],
    });
    this.staging.set(input.turnId, staged);
  }

  markSafeResearchAction(turnId: string, name: string): void {
    if (!this.researchCaptureActive()) return;
    const staged = this.staging.get(turnId);
    if (!staged || staged.tainted) return;
    staged.safeActionNames.push(name);
  }

  consumeSafeResearchAction(turnId: string, name: string): boolean {
    const staged = this.staging.get(turnId);
    if (!staged || staged.tainted) return false;
    const index = staged.safeActionNames.indexOf(name);
    if (index < 0) return false;
    staged.safeActionNames.splice(index, 1);
    return true;
  }

  stageResearchTrajectory(input: {
    turnId: string;
    eventId: string;
    occurredAt: string;
    payload: Extract<ResearchEventRecord['payload'], { source: string; type: string }>;
  }): void {
    if (!this.researchCaptureActive() || this.excludedTurns.has(input.turnId)) return;
    const staged = this.staging.get(input.turnId);
    if (!staged || staged.tainted) return;
    staged.events.push({
      id: randomUUID(),
      occurredAt: input.occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'trajectory.step',
      payload: input.payload,
      sourceEventIds: [input.eventId],
    });
  }

  stageResearchActionResult(notice: Parameters<ActionResultObserver>[0]): void {
    if (!SAFE_RESEARCH_ACTIONS.has(notice.name) || !this.researchCaptureActive()) return;
    const staged = this.staging.get(notice.context.turnId);
    if (!staged || staged.tainted) return;
    const occurredAt = new Date().toISOString();
    this.stageResearchTrajectory({
      turnId: notice.context.turnId,
      eventId: randomUUID(),
      occurredAt,
      payload: {
        source: 'sia_action',
        type: 'action_result',
        name: notice.name,
        outcome: notice.result.outcome,
      },
    });
    if (
      notice.name !== 'computer_snapshot' ||
      notice.result.outcome !== 'verified' ||
      staged.events.some(({ kind }) => kind === 'trajectory.screenshot')
    ) {
      return;
    }
    const image = notice.result.images?.find(
      (candidate) =>
        /^(?:image\/png|image\/jpeg|image\/webp)$/.test(candidate.mimeType) &&
        Buffer.byteLength(candidate.dataBase64, 'utf8') <= MAX_RESEARCH_SCREENSHOT_BASE64_BYTES,
    );
    if (!image) return;
    staged.events.push({
      id: randomUUID(),
      occurredAt,
      classification: 'research_allowed',
      taints: [],
      kind: 'trajectory.screenshot',
      payload: {
        source: 'sia_action',
        tool: 'computer_snapshot',
        mimeType: image.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        dataBase64: image.dataBase64,
      },
      sourceEventIds: [],
    });
  }

  completeResearchTurn(turnId: string): void {
    if (this.excludedTurns.delete(turnId)) {
      this.staging.delete(turnId);
      return;
    }
    if (this.rawResearchEnabled()) {
      this.persistRawResearchTurn(turnId, 'completed');
      return;
    }
    const staged = this.staging.get(turnId);
    this.staging.delete(turnId);
    if (!staged || staged.tainted || staged.events.length === 0) return;
    const version = this.ctx.state.capture.consentVersion;
    const acceptedAt = this.ctx.state.capture.consentAcceptedAt;
    if (!version || !acceptedAt) return;
    const batch: ResearchBatchRecord = {
      batchId: randomUUID(),
      syncEligible: this.ctx.state.researchIdentity !== LOCAL_RESEARCH_IDENTITY,
      consent: {
        version,
        acceptedAt,
        purpose: 'research_evaluation_debugging',
      },
      events: staged.events,
    };
    const batchBytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
    if (batchBytes > MAX_LOCAL_RESEARCH_BATCH_BYTES) {
      this.ctx.researchOutbox.blockCapture(
        "A research bundle exceeded Sia's durable batch limit. Sign out and contact Sia support before continuing.",
      );
      return;
    }
    this.ctx.researchOutbox.prepareLocalStorage(batchBytes);
    if (!this.ctx.researchOutbox.storeBatch(batch)) return;
    this.ctx.researchOutbox.refreshPendingCount();
    this.ctx.researchOutbox.scheduleSync();
  }

  private persistRawResearchTurn(turnId: string, outcome: 'completed' | 'discarded'): void {
    if (this.excludedTurns.has(turnId)) {
      this.staging.delete(turnId);
      return;
    }
    const staged = this.staging.get(turnId);
    if (!staged?.rawEvents.length) return;
    const version = this.ctx.state.capture.consentVersion;
    const acceptedAt = this.ctx.state.capture.consentAcceptedAt;
    if (version !== RESEARCH_CONSENT_VERSION || !acceptedAt) return;
    const first = staged.rawEvents[0]!;
    const threadId = first.payload.threadId;
    const expanded = expandRawResearchEvents([
      ...staged.rawEvents,
      {
        id: randomUUID(),
        occurredAt: new Date().toISOString(),
        classification: 'research_allowed',
        taints: [],
        kind: 'raw.event',
        payload: {
          schemaVersion: 1,
          threadId,
          turnId,
          eventType: 'turn.capture_finished',
          data: { outcome },
        },
        sourceEventIds: [],
      },
    ]);
    for (const events of partitionRawResearchEvents(expanded)) {
      const sequences = events
        .map(({ payload }) => payload.sequence)
        .filter((value): value is number => typeof value === 'number');
      const batch: ResearchBatchRecord = {
        batchId: randomUUID(),
        syncEligible: this.ctx.state.researchIdentity !== LOCAL_RESEARCH_IDENTITY,
        format: 'raw_v1',
        scope: {
          threadId,
          turnId,
          ...(sequences.length ? { sequenceStart: Math.min(...sequences) } : {}),
          ...(sequences.length ? { sequenceEnd: Math.max(...sequences) } : {}),
          eventKinds: [...new Set(events.map(({ payload }) => payload.eventType))],
        },
        consent: {
          version,
          acceptedAt,
          purpose: 'research_evaluation_debugging',
        },
        events,
      };
      const batchBytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
      if (batchBytes > MAX_LOCAL_RESEARCH_BATCH_BYTES) {
        this.ctx.researchOutbox.blockCapture(
          "A raw research bundle exceeded Sia's durable batch limit. Sign out and contact Sia support before continuing.",
        );
        return;
      }
      this.ctx.researchOutbox.prepareLocalStorage(batchBytes);
      if (!this.ctx.researchOutbox.storeBatch(batch)) return;
    }
    this.staging.delete(turnId);
    this.ctx.researchOutbox.refreshPendingCount();
    this.ctx.researchOutbox.scheduleSync();
  }

  researchCaptureActive(): boolean {
    if (
      this.ctx.deps.cloud.configured &&
      this.ctx.deps.identity.status().state === 'signed_in' &&
      this.ctx.state.cloudFeatures.researchUploads === false
    ) {
      return false;
    }
    return (
      this.ctx.state.capture.status === 'recording' ||
      this.ctx.state.capture.status === 'sync_pending'
    );
  }
}
