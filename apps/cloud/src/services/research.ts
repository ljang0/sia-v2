import { createHash } from 'node:crypto';
import type { AuthContext, DeletionScope, ResearchBatchRequest } from '../contracts.js';
import {
  CloudError,
  assertResearchEvent,
  canonicalJson,
  isRecord,
  requireString,
} from '../domain.js';
import type { ResearchBatchMetadata } from '../ports.js';
import type { ServiceDependencies } from '../services.js';
import { requireFeature, requireParticipant } from './access.js';

const MAX_RESEARCH_BATCH_BYTES = 4 * 1024 * 1024;

const MAX_RESEARCH_EVENTS = 2_000;

export class ResearchService {
  constructor(private readonly deps: ServiceDependencies) {}

  async upload(user: AuthContext, request: ResearchBatchRequest) {
    requireParticipant(user);
    requireFeature(this.deps.config.features.researchUploads, 'research_uploads_disabled');
    requireString(request.batchId, 'batchId', { max: 128 });
    if (request.consent.version !== this.deps.config.consentVersion) {
      throw new CloudError(
        409,
        'consent_version_required',
        'Research consent must be reviewed again',
      );
    }
    if (request.consent.purpose !== 'research_evaluation_debugging') {
      throw new CloudError(400, 'invalid_consent_purpose', 'Unsupported research purpose');
    }
    if (!Number.isFinite(Date.parse(request.consent.acceptedAt))) {
      throw new CloudError(400, 'invalid_consent', 'Consent timestamp is invalid');
    }
    if (
      !Array.isArray(request.events) ||
      request.events.length === 0 ||
      request.events.length > MAX_RESEARCH_EVENTS
    ) {
      throw new CloudError(
        400,
        'invalid_research_batch',
        `A batch must contain 1-${MAX_RESEARCH_EVENTS} events`,
      );
    }
    if (request.format === 'raw_v1') validateRawResearchBatch(request);
    rejectGoogleWorkspaceResearchData(request);
    const events = request.events.map((event) =>
      assertResearchEvent(event, request.format === 'raw_v1'),
    );
    const stored = {
      schemaVersion: 1,
      batchId: request.batchId,
      subject: user.subject,
      consentVersion: request.consent.version,
      ...(request.format ? { format: request.format } : {}),
      ...(request.scope ? { scope: request.scope } : {}),
      events,
    };
    const body = Buffer.from(canonicalJson(stored));
    if (body.byteLength > MAX_RESEARCH_BATCH_BYTES) {
      throw new CloudError(413, 'research_batch_too_large', 'Research batch exceeds 4 MiB');
    }
    const sha256 = createHash('sha256').update(body).digest('base64url');
    const existing = await this.deps.research.getBatch(user.subject, request.batchId);
    if (existing) return duplicateResearchBatch(existing, sha256, body.byteLength);

    const now = this.deps.clock.now().toISOString();
    await this.deps.research.putConsent({
      userId: user.subject,
      version: request.consent.version,
      acceptedAt: request.consent.acceptedAt,
      purpose: request.consent.purpose,
      recordedAt: now,
    });
    const objectKey = await this.deps.researchObjects.putBatch(
      user.subject,
      request.batchId,
      sha256,
      body,
    );
    const metadata = {
      userId: user.subject,
      batchId: request.batchId,
      consentVersion: request.consent.version,
      eventCount: events.length,
      objectKey,
      sha256,
      byteLength: body.byteLength,
      createdAt: now,
      ...(request.format ? { format: request.format } : {}),
      ...(request.scope ? { scope: request.scope } : {}),
    };
    let persisted;
    try {
      persisted = await this.deps.research.putBatchIfAbsent(metadata);
    } catch (error) {
      try {
        await this.deps.researchObjects.deleteBatchObject(objectKey);
      } catch {
        throw new CloudError(
          500,
          'research_object_cleanup_failed',
          'An unclaimed research object could not be removed',
          true,
        );
      }
      throw error;
    }
    if (!persisted.created) {
      if (persisted.existing.objectKey !== objectKey) {
        await this.deps.researchObjects.deleteBatchObject(objectKey);
      }
      return duplicateResearchBatch(persisted.existing, sha256, body.byteLength);
    }
    return {
      status: 'uploaded' as const,
      batchId: request.batchId,
      eventCount: events.length,
      sha256,
    };
  }

  async export(user: AuthContext) {
    const exportId = this.deps.ids.next();
    const requestedAt = this.deps.clock.now().toISOString();
    await this.deps.researchExports.putResearchExport({
      id: exportId,
      userId: user.subject,
      state: 'requested',
      requestedAt,
      updatedAt: requestedAt,
      expiresAt: Math.floor(this.deps.clock.now().getTime() / 1_000) + 24 * 60 * 60,
    });
    try {
      await this.deps.researchExportQueue.enqueue({ id: exportId, userId: user.subject });
    } catch {
      await this.deps.researchExports.transitionResearchExport(
        user.subject,
        exportId,
        ['requested'],
        'failed',
        this.deps.clock.now().toISOString(),
        { failureCode: 'research_export_queue_failed' },
      );
      throw new CloudError(
        503,
        'research_export_queue_failed',
        'Research export is temporarily unavailable',
        true,
      );
    }
    return { exportId, status: 'requested' as const };
  }

  async exportStatus(user: AuthContext, exportId: string) {
    requireString(exportId, 'exportId', { max: 128 });
    const job = await this.deps.researchExports.getResearchExport(user.subject, exportId);
    if (!job)
      throw new CloudError(404, 'research_export_not_found', 'Research export not found');
    if (job.state === 'completed' && job.objectKey) {
      return {
        exportId: job.id,
        status: job.state,
        downloadUrl: await this.deps.researchObjects.createExportDownloadUrl(
          user.subject,
          job.objectKey,
        ),
      };
    }
    return {
      exportId: job.id,
      status: job.state,
      ...(job.failureCode ? { failureCode: job.failureCode } : {}),
    };
  }

  async requestDeletion(user: AuthContext, scope: DeletionScope) {
    const existing = await this.deps.deletions.latestDeletion(user.subject);
    if (existing && !['completed', 'failed'].includes(existing.state)) return existing;
    const now = this.deps.clock.now().toISOString();
    const job = {
      id: this.deps.ids.next(),
      userId: user.subject,
      scope,
      state: 'requested' as const,
      requestedAt: now,
      updatedAt: now,
    };
    await this.deps.deletions.putDeletion(job);
    await this.deps.deletionQueue.enqueue({ id: job.id, userId: user.subject, scope });
    return job;
  }

  status(user: AuthContext) {
    return this.deps.deletions.latestDeletion(user.subject);
  }
}

function validateRawResearchBatch(request: ResearchBatchRequest): void {
  const scope = request.scope;
  if (!scope) {
    throw new CloudError(
      400,
      'invalid_raw_research_batch',
      'Raw research batches require thread and turn scope',
    );
  }
  if (
    (scope.sequenceStart === undefined) !== (scope.sequenceEnd === undefined) ||
    (scope.sequenceStart !== undefined && scope.sequenceStart > scope.sequenceEnd!)
  ) {
    throw new CloudError(
      400,
      'invalid_raw_research_batch',
      'Raw research sequence bounds are invalid',
    );
  }
  const declaredKinds = new Set(scope.eventKinds);
  const observedKinds = new Set<string>();
  for (const event of request.events) {
    if (event.kind !== 'raw.event' && event.kind !== 'raw.event_chunk') {
      throw new CloudError(
        400,
        'invalid_raw_research_batch',
        'Raw research batches may contain only raw event records',
      );
    }
    if (!isRecord(event.payload)) {
      throw new CloudError(
        400,
        'invalid_raw_research_batch',
        'Raw event payload must be an object',
      );
    }
    const payload = event.payload;
    if (
      payload.schemaVersion !== 1 ||
      payload.threadId !== scope.threadId ||
      payload.turnId !== scope.turnId
    ) {
      throw new CloudError(
        400,
        'invalid_raw_research_batch',
        'Raw event scope does not match its batch',
      );
    }
    const eventType = requireString(payload.eventType, 'event.payload.eventType', { max: 128 });
    observedKinds.add(eventType);
    if (!declaredKinds.has(eventType)) {
      throw new CloudError(
        400,
        'invalid_raw_research_batch',
        'Raw event kind is missing from batch scope',
      );
    }
    if (payload.sequence !== undefined) {
      if (!Number.isSafeInteger(payload.sequence) || Number(payload.sequence) < 0) {
        throw new CloudError(
          400,
          'invalid_raw_research_batch',
          'Raw event sequence must be a positive integer',
        );
      }
      const sequence = Number(payload.sequence);
      if (
        scope.sequenceStart !== undefined &&
        (sequence < scope.sequenceStart || sequence > scope.sequenceEnd!)
      ) {
        throw new CloudError(
          400,
          'invalid_raw_research_batch',
          'Raw event sequence is outside the declared batch scope',
        );
      }
    }
    if (event.kind === 'raw.event_chunk') {
      const chunkIndex = payload.chunkIndex;
      const chunkCount = payload.chunkCount;
      if (
        payload.encoding !== 'base64-json' ||
        typeof payload.eventId !== 'string' ||
        !payload.eventId ||
        !Number.isSafeInteger(chunkIndex) ||
        !Number.isSafeInteger(chunkCount) ||
        Number(chunkCount) < 1 ||
        Number(chunkIndex) < 0 ||
        Number(chunkIndex) >= Number(chunkCount) ||
        typeof payload.chunkData !== 'string' ||
        payload.chunkData.length === 0 ||
        payload.chunkData.length > 2_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.chunkData)
      ) {
        throw new CloudError(
          400,
          'invalid_raw_research_batch',
          'Raw event chunk metadata is invalid',
        );
      }
    }
  }
  if (
    observedKinds.size !== declaredKinds.size ||
    [...observedKinds].some((kind) => !declaredKinds.has(kind))
  ) {
    throw new CloudError(
      400,
      'invalid_raw_research_batch',
      'Raw event kinds do not match the declared batch scope',
    );
  }
}

const GOOGLE_WORKSPACE_RESEARCH_TOOL =
  /"(?:name|toolName)"\s*:\s*"(?:mail|drive|docs|sheets|slides)[._][^"]*"/u;

/**
 * Defense in depth for older or faulty clients: Google Workspace connector turns are never valid
 * research input. Current desktop clients omit the whole turn before upload; this rejects a batch
 * that still exposes a connector tool name in either an ordinary or chunked raw event.
 */
function rejectGoogleWorkspaceResearchData(request: ResearchBatchRequest): void {
  const containsGoogleTool = request.events.some((event) => {
    if (event.kind === 'raw.event_chunk' && isRecord(event.payload)) {
      const chunkData = event.payload.chunkData;
      if (typeof chunkData !== 'string') return false;
      return GOOGLE_WORKSPACE_RESEARCH_TOOL.test(
        Buffer.from(chunkData, 'base64').toString('utf8'),
      );
    }
    return GOOGLE_WORKSPACE_RESEARCH_TOOL.test(JSON.stringify(event.payload));
  });
  if (containsGoogleTool) {
    throw new CloudError(
      400,
      'google_workspace_research_forbidden',
      'Google Workspace connector turns cannot be uploaded as research data',
    );
  }
}

function duplicateResearchBatch(
  existing: ResearchBatchMetadata,
  incomingSha256: string,
  incomingByteLength: number,
) {
  if (existing.sha256 !== incomingSha256 || existing.byteLength !== incomingByteLength) {
    throw new CloudError(
      409,
      'research_batch_conflict',
      'That research batch ID is already bound to different content',
    );
  }
  return {
    status: 'already_uploaded' as const,
    batchId: existing.batchId,
    sha256: existing.sha256,
  };
}
