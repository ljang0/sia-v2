import { createHash } from 'node:crypto';
import {
  TOOL_POLICIES,
  type AppId,
  type AuthContext,
  type CommitActionRequest,
  type ConnectorUploadDescriptor,
  type ConnectorUploadRequest,
  type DeletionScope,
  type InviteRequest,
  type MetaStreamEvent,
  type MetaTurnRequest,
  type PrepareActionRequest,
  type ResearchBatchRequest,
} from './contracts.js';
import {
  CloudError,
  actionDigest,
  assertResearchEvent,
  canonicalJson,
  constantTimeEqual,
  makeActionPreview,
  requireString,
} from './domain.js';
import {
  assertComposioContract,
  mapCanonicalConnectorInput,
  validateCanonicalDriveUploadInput,
} from './connector-contract.js';
import type {
  ActionRepository,
  AuditSink,
  Clock,
  ConnectionRepository,
  ConnectorProvider,
  ConnectorUploadRecord,
  ConnectorUploadRepository,
  DeletionQueue,
  DeletionRepository,
  IdGenerator,
  IdentityProvider,
  InviteRepository,
  QuotaGate,
  ResearchBatchMetadata,
  ResearchObjectStore,
  ResearchRepository,
  SecretProvider,
  MetaProvider,
} from './ports.js';

const MAX_CONNECTOR_INPUT_BYTES = 256 * 1024;
const MAX_CONNECTOR_UPLOAD_BYTES = 5_000_000;
const CONNECTOR_UPLOAD_TTL_SECONDS = 15 * 60;
const MAX_RESEARCH_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_RESEARCH_EVENTS = 2_000;
const CONNECTOR_UPLOAD_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'application/zip',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/tab-separated-values',
]);

export interface ServiceDependencies {
  clock: Clock;
  ids: IdGenerator;
  connections: ConnectionRepository;
  connector: ConnectorProvider;
  connectorUploads: ConnectorUploadRepository;
  actions: ActionRepository;
  research: ResearchRepository;
  researchObjects: ResearchObjectStore;
  invites: InviteRepository;
  identity: IdentityProvider;
  deletions: DeletionRepository;
  deletionQueue: DeletionQueue;
  secrets: SecretProvider;
  metaProvider: MetaProvider;
  quota: QuotaGate;
  audit: AuditSink;
  config: {
    actionTtlSeconds: number;
    consentVersion: string;
    inviteLimit: number;
  };
}

export class ConnectorFilesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async requestUpload(user: AuthContext, request: ConnectorUploadRequest) {
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (!connection || connection.status !== 'connected' || connection.app !== 'google_drive') {
      throw new CloudError(
        404,
        'connection_not_ready',
        'The selected Drive connection is not ready',
      );
    }
    const fileName = validateConnectorFileName(request.fileName);
    const mimeType = validateConnectorMimeType(request.mimeType);
    const byteLength = validateConnectorByteLength(request.byteLength);
    const md5 = validateHash(request.md5, 'md5', /^[a-f0-9]{32}$/);
    const sha256 = validateHash(request.sha256, 'sha256', /^[A-Za-z0-9_-]{43}$/);
    assertComposioContract(await this.deps.secrets.composio(), 'drive.upload');

    const grant = await this.deps.connector.requestFileUpload(
      'drive.upload',
      fileName,
      mimeType,
      md5,
    );
    const now = this.deps.clock.now();
    const uploadId = this.deps.ids.next();
    const expiresAt = Math.floor(now.getTime() / 1000) + CONNECTOR_UPLOAD_TTL_SECONDS;
    const record: ConnectorUploadRecord = {
      uploadId,
      userId: user.subject,
      connectionId: request.connectionId,
      providerKey: grant.providerKey,
      fileName,
      mimeType,
      byteLength,
      md5,
      sha256,
      createdAt: now.toISOString(),
      expiresAt,
    };
    await this.deps.connectorUploads.putConnectorUpload(record);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connector.file_stage',
      app: 'google_drive',
      tool: 'drive.upload',
      connectionId: request.connectionId,
      outcome: 'allowed',
      occurredAt: now.toISOString(),
    });
    return {
      file: publicUploadDescriptor(record),
      upload: {
        method: 'PUT' as const,
        url: grant.uploadUrl,
        headers: {
          'content-type': mimeType,
          'content-length': String(byteLength),
        },
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      },
    };
  }
}

export class ConnectionsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async start(user: AuthContext, app: AppId, callbackUrl?: string) {
    if (callbackUrl !== undefined) validateCallback(callbackUrl);
    const link = await this.deps.connector.beginConnection(user.subject, app, callbackUrl);
    const now = this.deps.clock.now().toISOString();
    await this.deps.connections.putConnection({
      id: link.connectionId,
      userId: user.subject,
      app,
      status: 'link_pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: Math.floor(Date.parse(link.expiresAt) / 1000),
    });
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.start',
      app,
      connectionId: link.connectionId,
      outcome: 'allowed',
      occurredAt: now,
    });
    return {
      app,
      connectionId: link.connectionId,
      redirectUrl: link.redirectUrl,
      expiresAt: link.expiresAt,
    };
  }

  async status(user: AuthContext, app: AppId) {
    const records = (await this.deps.connections.listConnections(user.subject)).filter(
      (record) => record.app === app && record.status !== 'disconnected',
    );
    const output = [];
    for (const record of records) {
      const current = await this.deps.connector.connectionStatus(record.id);
      const { expiresAt: _pendingLinkExpiry, ...durableRecord } = record;
      const updated = {
        ...(current.status === 'link_pending' ? record : durableRecord),
        status: current.status,
        updatedAt: this.deps.clock.now().toISOString(),
        ...(current.accountLabel === undefined ? {} : { accountLabel: current.accountLabel }),
      };
      await this.deps.connections.putConnection(updated);
      output.push({
        id: updated.id,
        app: updated.app,
        status: updated.status,
        accountLabel: updated.accountLabel,
      });
    }
    return { connections: output };
  }

  async disconnect(user: AuthContext, app: AppId, connectionId: string) {
    const record = await this.deps.connections.getConnection(user.subject, connectionId);
    if (!record || record.app !== app)
      throw new CloudError(404, 'connection_not_found', 'Connection not found');
    await this.deps.connector.disconnect(connectionId);
    await this.deps.connections.deleteConnection(user.subject, connectionId);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.disconnect',
      app,
      connectionId,
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return { disconnected: true };
  }
}

export class ActionsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async prepare(user: AuthContext, request: PrepareActionRequest) {
    const policy = TOOL_POLICIES[request.tool];
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (!connection || connection.status !== 'connected') {
      throw new CloudError(404, 'connection_not_ready', 'The selected connection is not ready');
    }
    if (connection.app !== policy.app) {
      throw new CloudError(
        400,
        'tool_connection_mismatch',
        'The tool does not belong to this connection',
      );
    }
    const executionInput = await resolveConnectorInput(
      this.deps,
      user.subject,
      request.connectionId,
      request.tool,
      request.input,
    );
    const encoded = canonicalJson(request.input);
    if (Buffer.byteLength(encoded) > MAX_CONNECTOR_INPUT_BYTES) {
      throw new CloudError(413, 'connector_input_too_large', 'Connector input exceeds 256 KiB');
    }

    if (!policy.mutation) {
      const executionId = this.deps.ids.next();
      const result = await this.deps.connector.execute(
        user.subject,
        request.connectionId,
        request.tool,
        executionInput,
        executionId,
      );
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.read',
        app: policy.app,
        tool: request.tool,
        connectionId: request.connectionId,
        outcome: 'allowed',
        occurredAt: this.deps.clock.now().toISOString(),
        ...(result.opaqueResourceIds === undefined
          ? {}
          : { opaqueResourceIds: result.opaqueResourceIds.slice(0, 20) }),
      });
      return { status: 'executed' as const, executionId, result: result.data };
    }

    const id = this.deps.ids.next();
    const now = this.deps.clock.now();
    const digest = actionDigest(
      id,
      user.subject,
      request.connectionId,
      request.tool,
      request.input,
    );
    const expiresAt = Math.floor(now.getTime() / 1000) + this.deps.config.actionTtlSeconds;
    await this.deps.actions.putAction({
      id,
      userId: user.subject,
      connectionId: request.connectionId,
      tool: request.tool,
      digest,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
      inputBytes: Buffer.byteLength(encoded),
      inputKeys: Object.keys(request.input).sort(),
    });
    return {
      status: 'approval_required' as const,
      actionId: id,
      digest,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      tool: request.tool,
      app: policy.app,
      preview: makeActionPreview(request.tool, request.input),
    };
  }

  async commit(user: AuthContext, request: CommitActionRequest) {
    const record = await this.deps.actions.getAction(user.subject, request.actionId);
    if (!record) throw new CloudError(404, 'action_not_found', 'Prepared action not found');
    const supplied = actionDigest(
      record.id,
      user.subject,
      record.connectionId,
      record.tool,
      request.input,
    );
    if (
      !constantTimeEqual(record.digest, request.digest) ||
      !constantTimeEqual(record.digest, supplied)
    ) {
      throw new CloudError(
        409,
        'action_digest_mismatch',
        'The approved action no longer matches its preview',
      );
    }
    const executionInput = await resolveConnectorInput(
      this.deps,
      user.subject,
      record.connectionId,
      record.tool,
      request.input,
    );
    const now = this.deps.clock.now();
    const claim = await this.deps.actions.claimAction(
      user.subject,
      record.id,
      Math.floor(now.getTime() / 1000),
    );
    if (claim === 'expired')
      throw new CloudError(410, 'action_expired', 'The approval expired; preview it again');
    if (claim === 'executing') {
      throw new CloudError(409, 'action_in_progress', 'This action is already executing', true);
    }
    if (claim === 'failed') {
      throw new CloudError(
        409,
        'action_outcome_unknown',
        'This action failed or its remote outcome is unknown; it will not be retried automatically',
      );
    }
    if (claim === 'completed')
      return { status: 'already_completed' as const, actionId: record.id };
    if (claim === 'missing')
      throw new CloudError(404, 'action_not_found', 'Prepared action not found');

    try {
      const result = await this.deps.connector.execute(
        user.subject,
        record.connectionId,
        record.tool,
        executionInput,
        record.id,
      );
      const opaqueIds = (result.opaqueResourceIds ?? []).slice(0, 20);
      await this.deps.actions.completeAction(
        user.subject,
        record.id,
        this.deps.clock.now().toISOString(),
        opaqueIds,
      );
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.write',
        app: TOOL_POLICIES[record.tool].app,
        tool: record.tool,
        connectionId: record.connectionId,
        outcome: 'allowed',
        occurredAt: this.deps.clock.now().toISOString(),
        ...(opaqueIds.length === 0 ? {} : { opaqueResourceIds: opaqueIds }),
      });
      return { status: 'completed' as const, actionId: record.id, result: result.data };
    } catch (error) {
      await this.deps.actions.failAction(user.subject, record.id, 'connector_execution_failed');
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.write',
        app: TOOL_POLICIES[record.tool].app,
        tool: record.tool,
        connectionId: record.connectionId,
        outcome: 'failed',
        occurredAt: this.deps.clock.now().toISOString(),
        errorCode: 'connector_execution_failed',
      });
      throw error;
    }
  }
}

export class ResearchService {
  constructor(private readonly deps: ServiceDependencies) {}

  async upload(user: AuthContext, request: ResearchBatchRequest) {
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
    const events = request.events.map(assertResearchEvent);
    const stored = {
      schemaVersion: 1,
      batchId: request.batchId,
      subject: user.subject,
      consentVersion: request.consent.version,
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
    const batches = await this.deps.research.listBatches(user.subject);
    const result = await this.deps.researchObjects.createExport(
      user.subject,
      exportId,
      batches.map(({ objectKey }) => objectKey),
    );
    return { exportId, status: 'complete' as const, downloadUrl: result.downloadUrl };
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

export class InvitesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async create(user: AuthContext, request: InviteRequest) {
    requireAdmin(user);
    const email = normalizeEmail(request.email);
    const existing = await this.deps.invites.getInvite(email);
    if (existing) return existing;
    if ((await this.deps.invites.countInvites()) >= this.deps.config.inviteLimit) {
      throw new CloudError(
        409,
        'invite_limit_reached',
        'The alpha invite limit has been reached',
      );
    }
    const created = await this.deps.identity.createPasswordlessUser(email);
    const record = {
      email,
      invitedBy: user.subject,
      invitedAt: this.deps.clock.now().toISOString(),
      subject: created.subject,
      status: 'invited' as const,
    };
    await this.deps.invites.putInvite(record);
    return record;
  }

  async list(user: AuthContext) {
    requireAdmin(user);
    return {
      invites: await this.deps.invites.listInvites(),
      limit: this.deps.config.inviteLimit,
    };
  }
}

export class MetaService {
  constructor(private readonly deps: ServiceDependencies) {}

  async *stream(user: AuthContext, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent> {
    validateMetaRequest(request);
    const config = await this.deps.secrets.meta();
    if (!config.enabled)
      throw new CloudError(503, 'meta_disabled', 'Meta is temporarily unavailable', true);
    const model = request.model ?? config.model;
    if (config.allowedModels && !config.allowedModels.includes(model)) {
      throw new CloudError(400, 'meta_model_not_allowed', 'That Meta model is not enabled');
    }
    const lease = await this.deps.quota.acquireMeta(user.subject);
    try {
      yield* this.deps.metaProvider.stream(config, { ...request, model });
    } finally {
      await lease.release();
    }
  }
}

export class DeletionWorker {
  constructor(private readonly deps: ServiceDependencies) {}

  async process(userId: string, jobId: string, scope: DeletionScope): Promise<void> {
    const now = (): string => this.deps.clock.now().toISOString();
    const claimed = await this.deps.deletions.transitionDeletion(
      userId,
      jobId,
      ['requested', 'failed'],
      'processing',
      now(),
    );
    if (!claimed) {
      const job = await this.deps.deletions.getDeletion(userId, jobId);
      if (job?.state === 'completed') return;
      throw new CloudError(
        409,
        'deletion_not_claimed',
        'Deletion job is already being processed',
        true,
      );
    }
    try {
      await this.deps.researchObjects.deleteAllForUser(userId);
      await this.deps.research.deleteResearchForUser(userId);
      await this.deps.actions.deleteActionsForUser(userId);
      await this.deps.deletions.transitionDeletion(
        userId,
        jobId,
        ['processing'],
        'research_deleted',
        now(),
      );

      if (scope === 'account') {
        await this.deps.connectorUploads.deleteConnectorUploadsForUser(userId);
        for (const connection of await this.deps.connections.listConnections(userId)) {
          await this.deps.connector.disconnect(connection.id);
          await this.deps.connections.deleteConnection(userId, connection.id);
        }
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['research_deleted'],
          'connections_revoked',
          now(),
        );
        await this.deps.invites.deleteInvitesForSubject(userId);
        await this.deps.identity.deleteUser(userId);
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['connections_revoked'],
          'identity_deleted',
          now(),
        );
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['identity_deleted'],
          'completed',
          now(),
        );
      } else {
        await this.deps.deletions.transitionDeletion(
          userId,
          jobId,
          ['research_deleted'],
          'completed',
          now(),
        );
      }
    } catch (error) {
      await this.deps.deletions.transitionDeletion(
        userId,
        jobId,
        ['processing', 'research_deleted', 'connections_revoked', 'identity_deleted'],
        'failed',
        now(),
        error instanceof CloudError ? error.code : 'deletion_failed',
      );
      throw error;
    }
  }
}

export function createServices(deps: ServiceDependencies) {
  return {
    connections: new ConnectionsService(deps),
    connectorFiles: new ConnectorFilesService(deps),
    actions: new ActionsService(deps),
    research: new ResearchService(deps),
    invites: new InvitesService(deps),
    meta: new MetaService(deps),
    deletionWorker: new DeletionWorker(deps),
  };
}

function publicUploadDescriptor(record: ConnectorUploadRecord): ConnectorUploadDescriptor {
  return {
    uploadId: record.uploadId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    byteLength: record.byteLength,
    sha256: record.sha256,
  };
}

async function resolveConnectorInput(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
  tool: keyof typeof TOOL_POLICIES,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  assertComposioContract(await deps.secrets.composio(), tool);
  if (tool === 'drive.upload') {
    validateCanonicalDriveUploadInput(input);
    return resolveDriveUpload(deps, userId, connectionId, input);
  }
  return mapCanonicalConnectorInput(tool, input);
}

async function resolveDriveUpload(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allowedInputKeys = new Set(['file', 'parent_id']);
  if (Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
    throw new CloudError(
      400,
      'invalid_drive_upload',
      'Drive upload contains unsupported fields',
    );
  }
  const file = input.file;
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    throw new CloudError(
      400,
      'invalid_drive_upload',
      'Drive upload requires a staged file reference',
    );
  }
  const descriptor = file as Record<string, unknown>;
  const allowedDescriptorKeys = new Set([
    'uploadId',
    'fileName',
    'mimeType',
    'byteLength',
    'sha256',
  ]);
  if (Object.keys(descriptor).some((key) => !allowedDescriptorKeys.has(key))) {
    throw new CloudError(400, 'invalid_drive_upload', 'The staged file reference is invalid');
  }
  const uploadId = requireString(descriptor.uploadId, 'file.uploadId', { max: 128 });
  const upload = await deps.connectorUploads.getConnectorUpload(userId, uploadId);
  if (!upload || upload.connectionId !== connectionId) {
    throw new CloudError(404, 'connector_upload_not_found', 'The staged file is unavailable');
  }
  if (upload.expiresAt <= Math.floor(deps.clock.now().getTime() / 1000)) {
    throw new CloudError(
      410,
      'connector_upload_expired',
      'The staged file expired; upload it again',
    );
  }
  const supplied: ConnectorUploadDescriptor = {
    uploadId,
    fileName: requireString(descriptor.fileName, 'file.fileName', { max: 255 }),
    mimeType: requireString(descriptor.mimeType, 'file.mimeType', { max: 127 }),
    byteLength: validateConnectorByteLength(descriptor.byteLength),
    sha256: requireString(descriptor.sha256, 'file.sha256', { max: 64 }),
  };
  if (canonicalJson(supplied) !== canonicalJson(publicUploadDescriptor(upload))) {
    throw new CloudError(409, 'connector_upload_mismatch', 'The staged file metadata changed');
  }
  const parentId =
    input.parent_id === undefined
      ? undefined
      : requireString(input.parent_id, 'parent_id', { max: 512 });
  return {
    file_to_upload: {
      name: upload.fileName,
      mimetype: upload.mimeType,
      s3key: upload.providerKey,
    },
    ...(parentId === undefined ? {} : { folder_to_upload_to: parentId }),
  };
}

function validateConnectorFileName(value: unknown): string {
  const fileName = requireString(value, 'fileName', { max: 255 });
  if (
    fileName !== fileName.trim() ||
    fileName === '.' ||
    fileName === '..' ||
    /[\\/\u0000-\u001f\u007f]/.test(fileName)
  ) {
    throw new CloudError(400, 'invalid_connector_file', 'The upload filename is invalid');
  }
  return fileName;
}

function validateConnectorMimeType(value: unknown): string {
  const mimeType = requireString(value, 'mimeType', { max: 127 });
  if (mimeType !== mimeType.toLowerCase() || !CONNECTOR_UPLOAD_MIME_TYPES.has(mimeType)) {
    throw new CloudError(
      415,
      'unsupported_connector_file_type',
      'That file type is not supported',
    );
  }
  return mimeType;
}

function validateConnectorByteLength(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_CONNECTOR_UPLOAD_BYTES
  ) {
    throw new CloudError(
      413,
      'connector_file_too_large',
      `Drive uploads must be 1-${MAX_CONNECTOR_UPLOAD_BYTES} bytes`,
    );
  }
  return value;
}

function validateHash(value: unknown, label: string, pattern: RegExp): string {
  const hash = requireString(value, label, { max: 128 });
  if (!pattern.test(hash)) {
    throw new CloudError(400, 'invalid_connector_file', `${label} is invalid`);
  }
  return hash;
}

function requireAdmin(user: AuthContext): void {
  if (!user.groups.includes('Admins'))
    throw new CloudError(403, 'admin_required', 'Admin access is required');
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

function normalizeEmail(value: unknown): string {
  const email = requireString(value, 'email', { max: 254 }).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CloudError(400, 'invalid_email', 'Enter a valid email address');
  }
  return email;
}

function validateCallback(callbackUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new CloudError(400, 'invalid_callback', 'The callback URL is invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'sia:') {
    throw new CloudError(
      400,
      'invalid_callback',
      'Only HTTPS or sia: callback URLs are allowed',
    );
  }
  if (parsed.username || parsed.password) {
    throw new CloudError(400, 'invalid_callback', 'Callback credentials are not allowed');
  }
}

function validateMetaRequest(request: MetaTurnRequest): void {
  requireString(request.turnId, 'turnId', { max: 128 });
  if (
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > 500
  ) {
    throw new CloudError(400, 'invalid_meta_turn', 'A Meta turn must contain 1-500 messages');
  }
  if ((request.tools?.length ?? 0) > 64) {
    throw new CloudError(400, 'invalid_meta_turn', 'A Meta turn can expose at most 64 tools');
  }
  const bytes = Buffer.byteLength(canonicalJson(request));
  if (bytes > 2 * 1024 * 1024)
    throw new CloudError(413, 'meta_turn_too_large', 'Meta turn exceeds 2 MiB');
}
