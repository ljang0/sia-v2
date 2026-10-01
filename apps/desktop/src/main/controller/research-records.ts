/** Consented research records: their shapes, storage limits and pure encoding helpers. */

import { randomUUID } from 'node:crypto';
import type { ProviderId } from '../../shared/bridge.js';
import { isRecord } from '../actions/records.js';

export interface ResearchEventBase {
  id: string;
  occurredAt: string;
  classification: 'research_allowed';
  taints: [];
  sourceEventIds: string[];
}

export type ResearchEventRecord = ResearchEventBase &
  (
    | {
        kind: 'conversation.text';
        payload: { role: 'user' | 'assistant'; text: string; provider: ProviderId };
      }
    | {
        kind: 'trajectory.step';
        payload: {
          source: 'provider' | 'sia_action';
          type: 'tool' | 'plan' | 'subagent' | 'usage' | 'action_result';
          name?: string;
          phase?: string;
          presentation?: string;
          outcome?: string;
          counts?: Record<string, number>;
        };
      }
    | {
        kind: 'trajectory.screenshot';
        payload: {
          source: 'sia_action';
          tool: 'computer_snapshot';
          mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
          dataBase64: string;
        };
      }
  );

export interface RawResearchEventRecord extends ResearchEventBase {
  kind: 'raw.event' | 'raw.event_chunk';
  payload: {
    schemaVersion: 1;
    threadId: string;
    turnId: string;
    eventType: string;
    eventId?: string;
    sequence?: number;
    data?: unknown;
    encoding?: 'base64-json';
    chunkIndex?: number;
    chunkCount?: number;
    chunkData?: string;
  };
}

export interface ResearchBatchRecord {
  batchId: string;
  /** False for captures created before cloud was configured; never retroactively upload them. */
  syncEligible?: boolean;
  consent: {
    version: string;
    acceptedAt: string;
    purpose: 'research_evaluation_debugging';
  };
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
  events: Array<ResearchEventRecord | RawResearchEventRecord>;
}

export interface ResearchSyncRecord {
  batchId: string;
  synced: boolean;
}

export interface StagedResearchTurn {
  tainted: boolean;
  events: ResearchEventRecord[];
  rawEvents: RawResearchEventRecord[];
  eventByMessageId: Map<string, string>;
  safeActionNames: string[];
}

export const SAFE_RESEARCH_ACTIONS = new Set(['computer_list', 'computer_snapshot']);

export const MAX_LOCAL_RESEARCH_BATCH_BYTES = 3 * 1024 * 1024;

export const MAX_RESEARCH_SCREENSHOT_BASE64_BYTES = 1_500_000;

export const MAX_RAW_EVENT_JSON_BYTES = 768 * 1024;

// Synced batches are pruned at these soft targets. Unsynced research is never discarded to
// satisfy an application quota: it remains in the encrypted outbox until AWS acknowledges it.
export const TARGET_LOCAL_RESEARCH_BYTES = 128 * 1024 * 1024;

export const TARGET_LOCAL_RESEARCH_BATCHES = 500;

export const LOCAL_RESEARCH_RETENTION_MS = 90 * 24 * 60 * 60_000;

export const LOCAL_RESEARCH_IDENTITY = '__local__';

export function isResearchBatchRecord(value: unknown): value is ResearchBatchRecord {
  if (!isRecord(value) || typeof value.batchId !== 'string') return false;
  if (!Array.isArray(value.events) || !isRecord(value.consent)) return false;
  return (
    typeof value.consent.version === 'string' &&
    typeof value.consent.acceptedAt === 'string' &&
    value.consent.purpose === 'research_evaluation_debugging'
  );
}

export const SECRET_SHAPED_TEXT = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:sk|xai|meta|composio)[-_][A-Za-z0-9_-]{16,}\b/i,
];

export function containsSecretShapedText(value: string): boolean {
  return SECRET_SHAPED_TEXT.some((pattern) => pattern.test(value));
}

export function jsonSafeValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return { serializationError: 'The raw event was not JSON-serializable.' };
  }
}

export function researchSyncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return 'The encrypted research outbox could not reach AWS.';
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

export function expandRawResearchEvents(
  events: readonly RawResearchEventRecord[],
): RawResearchEventRecord[] {
  const expanded: RawResearchEventRecord[] = [];
  for (const event of events) {
    const body = Buffer.from(JSON.stringify(event.payload.data ?? null), 'utf8');
    if (body.byteLength <= MAX_RAW_EVENT_JSON_BYTES) {
      expanded.push(event);
      continue;
    }
    const chunkCount = Math.ceil(body.byteLength / MAX_RAW_EVENT_JSON_BYTES);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      expanded.push({
        ...event,
        id: randomUUID(),
        kind: 'raw.event_chunk',
        payload: {
          schemaVersion: 1,
          threadId: event.payload.threadId,
          turnId: event.payload.turnId,
          eventType: event.payload.eventType,
          eventId: event.id,
          ...(event.payload.sequence === undefined ? {} : { sequence: event.payload.sequence }),
          encoding: 'base64-json',
          chunkIndex,
          chunkCount,
          chunkData: body
            .subarray(
              chunkIndex * MAX_RAW_EVENT_JSON_BYTES,
              (chunkIndex + 1) * MAX_RAW_EVENT_JSON_BYTES,
            )
            .toString('base64'),
        },
      });
    }
  }
  return expanded;
}

export function partitionRawResearchEvents(
  events: readonly RawResearchEventRecord[],
): RawResearchEventRecord[][] {
  const partitions: RawResearchEventRecord[][] = [];
  let current: RawResearchEventRecord[] = [];
  let bytes = 0;
  const targetBytes = MAX_LOCAL_RESEARCH_BATCH_BYTES - 256 * 1024;
  for (const event of events) {
    const eventBytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
    if (current.length && bytes + eventBytes > targetBytes) {
      partitions.push(current);
      current = [];
      bytes = 0;
    }
    current.push(event);
    bytes += eventBytes;
  }
  if (current.length) partitions.push(current);
  return partitions;
}
