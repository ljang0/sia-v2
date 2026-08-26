import { createHash, createHmac } from 'node:crypto';
import {
  LEGACY_GOOGLE_APP_IDS,
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
  type RegistrationRequest,
} from './contracts.js';
import {
  CloudError,
  actionDigest,
  assertResearchEvent,
  canonicalJson,
  constantTimeEqual,
  isRecord,
  makeActionPreview,
  requireString,
} from './domain.js';
import {
  mapCanonicalConnectorInput,
  validateCanonicalDriveUploadInput,
} from './connector-contract.js';
import { ConnectorReconnectRequiredError } from './ports.js';
import type {
  ActionRepository,
  AuditSink,
  Clock,
  ConnectionRepository,
  ConnectorExecution,
  ConnectorProvider,
  ConnectorUploadRecord,
  ConnectorUploadRepository,
  DeletionQueue,
  DeletionRepository,
  IdGenerator,
  IdentityProvider,
  InviteRepository,
  RegistrationRateLimitRepository,
  QuotaGate,
  ResearchBatchMetadata,
  ResearchExportQueue,
  ResearchExportRepository,
  ResearchObjectStore,
  ReleaseManifestStore,
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
  researchExports: ResearchExportRepository;
  researchExportQueue: ResearchExportQueue;
  researchObjects: ResearchObjectStore;
  releaseManifests: ReleaseManifestStore;
  invites: InviteRepository;
  registrationLimits: RegistrationRateLimitRepository;
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
    features: {
      researchUploads: boolean;
      researchArchive: boolean;
      connectors: boolean;
      schedules: boolean;
    };
  };
}

export class SessionService {
  constructor(private readonly deps: ServiceDependencies) {}

  status(user: AuthContext) {
    const admin = isAdmin(user);
    const participant = isParticipant(user);
    return {
      admin,
      participant,
      features: {
        researchUploads: this.deps.config.features.researchUploads && participant,
        researchArchive: this.deps.config.features.researchArchive && admin,
        connectors: this.deps.config.features.connectors && isConnectorTester(user),
        schedules: this.deps.config.features.schedules && participant,
      },
    };
  }
}

export class ReleaseService {
  constructor(private readonly deps: ServiceDependencies) {}

  async latestMac(user: AuthContext) {
    requireReleaseRecipient(user);
    const manifest = validateStoredReleaseManifest(
      await this.deps.releaseManifests.readLatest(),
    );
    return {
      ...manifest,
      downloadUrl: await this.deps.releaseManifests.createArtifactDownloadUrl(
        manifest.payload.artifact.key,
      ),
    };
  }
}

export class ConnectorFilesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async requestUpload(user: AuthContext, request: ConnectorUploadRequest) {
    requireConnectorAccess(this.deps, user);
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (
      !connection ||
      connection.status !== 'connected' ||
      (connection.app !== 'google_drive' && connection.app !== 'google_workspace')
    ) {
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
    const grant = await this.deps.connector.requestFileUpload(
      request.connectionId,
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

  async start(
    user: AuthContext,
    app: AppId,
    callbackUrl?: string,
    access?: 'read_only' | 'read_write',
  ) {
    requireConnectorAccess(this.deps, user);
    if (callbackUrl !== undefined) validateCallback(callbackUrl);
    if (app !== 'google_workspace' && access !== undefined) {
      throw new CloudError(400, 'invalid_request', 'Access level is only supported for Google');
    }
    const link = await this.deps.connector.beginConnection(
      user.subject,
      app,
      callbackUrl,
      access,
    );
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
      if (record.status === 'failed') {
        output.push({
          id: record.id,
          app: record.app,
          status: record.status,
          accountLabel: record.accountLabel,
        });
        continue;
      }
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
        ...(current.access === undefined ? {} : { access: current.access }),
      });
    }
    return { connections: output };
  }

  async disconnect(user: AuthContext, app: AppId, connectionId: string) {
    const record = await this.deps.connections.getConnection(user.subject, connectionId);
    if (!record) {
      // Disconnect is intentionally idempotent. The upstream grant may already have
      // been removed (for example, after an OAuth window is cancelled or a retry
      // races with status reconciliation) while the desktop still holds its opaque
      // connection id. Returning success lets the client discard that stale local
      // reference without attempting to revoke an unowned grant.
      return { disconnected: true };
    }
    if (!connectionAppMatches(record.app, app))
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

  async retireSupersededGoogle(
    user: AuthContext,
    app: AppId,
    connectionId: string,
    replacementConnectionId: string,
  ) {
    requireConnectorAccess(this.deps, user);
    if (app !== 'google_workspace') {
      throw new CloudError(
        400,
        'invalid_request',
        'Only a Google Workspace credential can be superseded',
      );
    }
    if (connectionId === replacementConnectionId) {
      throw new CloudError(
        400,
        'invalid_request',
        'The replacement connection must be different from the superseded connection',
      );
    }

    const replacement = await this.deps.connections.getConnection(
      user.subject,
      replacementConnectionId,
    );
    if (
      !replacement ||
      replacement.app !== 'google_workspace' ||
      replacement.status !== 'connected'
    ) {
      throw new CloudError(
        409,
        'replacement_connection_not_ready',
        'The replacement Google editor connection is not ready',
      );
    }
    const replacementStatus =
      await this.deps.connector.connectionStatus(replacementConnectionId);
    if (replacementStatus.status !== 'connected' || replacementStatus.access !== 'read_write') {
      throw new CloudError(
        409,
        'replacement_connection_not_ready',
        'The replacement Google editor connection is not ready',
      );
    }

    const superseded = await this.deps.connections.getConnection(user.subject, connectionId);
    if (!superseded) return { retired: true };
    if (superseded.app !== 'google_workspace') {
      throw new CloudError(404, 'connection_not_found', 'Connection not found');
    }
    const supersededAccount = superseded.accountLabel?.trim().toLowerCase();
    const replacementAccount = (replacementStatus.accountLabel ?? replacement.accountLabel)
      ?.trim()
      .toLowerCase();
    if (!supersededAccount || !replacementAccount || supersededAccount !== replacementAccount) {
      throw new CloudError(
        409,
        'replacement_account_mismatch',
        'The replacement must use the same Google account',
      );
    }
    if (!this.deps.connector.retireSuperseded) {
      throw new CloudError(
        503,
        'connection_retirement_unavailable',
        'Google connection upgrade is unavailable',
        true,
      );
    }

    await this.deps.connector.retireSuperseded(connectionId);
    await this.deps.connections.deleteConnection(user.subject, connectionId);
    await this.deps.audit.write({
      userId: user.subject,
      action: 'connection.superseded',
      app,
      connectionId,
      outcome: 'allowed',
      occurredAt: this.deps.clock.now().toISOString(),
    });
    return { retired: true };
  }

  async completeGoogleOAuth(request: { state: string; code?: string; error?: string }) {
    if (!this.deps.connector.completeGoogleOAuth) {
      throw new CloudError(503, 'google_oauth_unavailable', 'Google connection is unavailable');
    }
    const result = await this.deps.connector.completeGoogleOAuth(request);
    const record = await this.deps.connections.getConnection(
      result.userId,
      result.connectionId,
    );
    if (!record || record.app !== 'google_workspace') {
      throw new CloudError(400, 'oauth_state_invalid', 'This Google connection link expired');
    }
    const now = this.deps.clock.now().toISOString();
    await this.deps.connections.putConnection({
      ...record,
      status: result.connected ? 'connected' : 'failed',
      updatedAt: now,
      ...(result.accountLabel === undefined ? {} : { accountLabel: result.accountLabel }),
    });
    await this.deps.audit.write({
      userId: result.userId,
      action: result.connected ? 'connection.oauth.completed' : 'connection.oauth.denied',
      app: 'google_workspace',
      connectionId: result.connectionId,
      outcome: result.connected ? 'allowed' : 'denied',
      occurredAt: now,
    });
    return {
      connected: result.connected,
      accountLabel: result.accountLabel,
      failure: result.failure,
    };
  }
}

export class ActionsService {
  constructor(private readonly deps: ServiceDependencies) {}

  async prepare(user: AuthContext, request: PrepareActionRequest) {
    requireConnectorAccess(this.deps, user);
    const policy = TOOL_POLICIES[request.tool];
    const connection = await this.deps.connections.getConnection(
      user.subject,
      request.connectionId,
    );
    if (!connection || connection.status !== 'connected') {
      throw new CloudError(404, 'connection_not_ready', 'The selected connection is not ready');
    }
    if (!connectionSupportsTool(connection.app, policy.app)) {
      throw new CloudError(
        400,
        'tool_connection_mismatch',
        'The tool does not belong to this connection',
      );
    }
    await this.deps.connector.validateAccess?.(
      user.subject,
      request.connectionId,
      request.tool,
    );
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
      let result: ConnectorExecution;
      try {
        result = await this.deps.connector.execute(
          user.subject,
          request.connectionId,
          request.tool,
          executionInput,
          executionId,
        );
      } catch (error) {
        await this.deps.audit.write({
          userId: user.subject,
          action: 'connector.read',
          app: policy.app,
          tool: request.tool,
          connectionId: request.connectionId,
          outcome: 'failed',
          occurredAt: this.deps.clock.now().toISOString(),
          errorCode:
            error instanceof ConnectorReconnectRequiredError
              ? 'connection_reconnect_required'
              : 'connector_execution_failed',
        });
        if (error instanceof ConnectorReconnectRequiredError) {
          await markConnectionFailed(this.deps, user.subject, request.connectionId);
          throw new CloudError(
            409,
            'connection_reconnect_required',
            'This app connection expired. Reconnect it in Settings, then try again.',
          );
        }
        throw error;
      }
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
    requireConnectorAccess(this.deps, user);
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
      const reconnectRequired = error instanceof ConnectorReconnectRequiredError;
      if (reconnectRequired) {
        await markConnectionFailed(this.deps, user.subject, record.connectionId);
      }
      const errorCode = reconnectRequired
        ? 'connection_reconnect_required'
        : 'connector_execution_failed';
      await this.deps.actions.failAction(user.subject, record.id, errorCode);
      await this.deps.audit.write({
        userId: user.subject,
        action: 'connector.write',
        app: TOOL_POLICIES[record.tool].app,
        tool: record.tool,
        connectionId: record.connectionId,
        outcome: 'failed',
        occurredAt: this.deps.clock.now().toISOString(),
        errorCode,
      });
      if (reconnectRequired) {
        throw new CloudError(
          409,
          'connection_reconnect_required',
          'This app connection expired. Reconnect it in Settings, then try again.',
        );
      }
      throw error;
    }
  }
}

async function markConnectionFailed(
  deps: ServiceDependencies,
  userId: string,
  connectionId: string,
): Promise<void> {
  const connection = await deps.connections.getConnection(userId, connectionId);
  if (!connection) return;
  await deps.connections.putConnection({
    ...connection,
    status: 'failed',
    updatedAt: deps.clock.now().toISOString(),
  });
}

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

export class ResearchAdminService {
  constructor(private readonly deps: ServiceDependencies) {}

  async participants(user: AuthContext) {
    await this.#requireAdmin(user, 'research.admin.participants', []);
    return await this.#audited(user, 'research.admin.participants', [], async () => {
      const [batches, invites] = await Promise.all([
        this.deps.research.listAllBatches(),
        this.deps.invites.listInvites(),
      ]);
      const emailBySubject = new Map(
        invites
          .filter((invite): invite is typeof invite & { subject: string } =>
            Boolean(invite.subject),
          )
          .map((invite) => [invite.subject, invite.email]),
      );
      const grouped = new Map<
        string,
        {
          subject: string;
          email?: string;
          batchCount: number;
          byteLength: number;
          lastCreatedAt: string;
        }
      >();
      for (const batch of batches) {
        const existing = grouped.get(batch.userId);
        if (existing) {
          existing.batchCount += 1;
          existing.byteLength += batch.byteLength;
          if (batch.createdAt > existing.lastCreatedAt)
            existing.lastCreatedAt = batch.createdAt;
        } else {
          const email = emailBySubject.get(batch.userId);
          grouped.set(batch.userId, {
            subject: batch.userId,
            ...(email ? { email } : {}),
            batchCount: 1,
            byteLength: batch.byteLength,
            lastCreatedAt: batch.createdAt,
          });
        }
      }
      return {
        participants: [...grouped.values()].sort((left, right) =>
          right.lastCreatedAt.localeCompare(left.lastCreatedAt),
        ),
      };
    });
  }

  async batches(user: AuthContext, subject: string) {
    requireString(subject, 'subject', { max: 256 });
    await this.#requireAdmin(user, 'research.admin.batches', [subject]);
    return await this.#audited(user, 'research.admin.batches', [subject], async () => {
      const batches = await this.deps.research.listBatches(subject);
      return {
        batches: batches
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map(({ objectKey: _objectKey, userId: _userId, ...batch }) => batch),
      };
    });
  }

  async batch(user: AuthContext, subject: string, batchId: string) {
    requireString(subject, 'subject', { max: 256 });
    requireString(batchId, 'batchId', { max: 128 });
    await this.#requireAdmin(user, 'research.admin.batch.read', [subject, batchId]);
    return await this.#audited(
      user,
      'research.admin.batch.read',
      [subject, batchId],
      async () => {
        const metadata = await this.deps.research.getBatch(subject, batchId);
        if (!metadata)
          throw new CloudError(404, 'research_batch_not_found', 'Research batch not found');
        const object = await this.deps.researchObjects.readBatchObject(metadata.objectKey);
        if (object.sha256 !== metadata.sha256 || object.byteLength !== metadata.byteLength) {
          throw new CloudError(
            500,
            'research_batch_integrity_failed',
            'The archived research batch failed its integrity check',
          );
        }
        return { batch: object.document };
      },
    );
  }

  async #audited<T>(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await operation();
      await this.#audit(user, action, opaqueResourceIds);
      return result;
    } catch (error) {
      await this.#audit(
        user,
        action,
        opaqueResourceIds,
        'failed',
        error instanceof CloudError ? error.code : 'internal_error',
      );
      throw error;
    }
  }

  async #requireAdmin(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
  ): Promise<void> {
    requireFeature(this.deps.config.features.researchArchive, 'research_archive_disabled');
    if (user.groups.includes('Admins')) {
      if (user.email && (await this.deps.identity.hasMfa(user.email))) return;
      await this.#audit(user, action, opaqueResourceIds, 'denied', 'admin_mfa_required');
      throw new CloudError(
        403,
        'admin_mfa_required',
        'Set up an authenticator before opening the research archive',
      );
    }
    await this.#audit(user, action, opaqueResourceIds, 'denied', 'admin_required');
    throw new CloudError(403, 'admin_required', 'Admin access is required');
  }

  async #audit(
    user: AuthContext,
    action: string,
    opaqueResourceIds: string[],
    outcome: 'allowed' | 'denied' | 'failed' = 'allowed',
    errorCode?: string,
  ): Promise<void> {
    await this.deps.audit.write({
      userId: user.subject,
      action,
      outcome,
      occurredAt: this.deps.clock.now().toISOString(),
      ...(opaqueResourceIds.length ? { opaqueResourceIds } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  }
}

export class InvitesService {
  constructor(private readonly deps: ServiceDependencies) {}

  async create(user: AuthContext, request: InviteRequest) {
    requireAdmin(user);
    const email = normalizeEmail(request.email);
    const existing = await this.deps.invites.getInvite(email);
    if (existing) {
      await this.deps.identity.addUserToGroup(email, 'Participants');
      return existing;
    }
    if ((await this.deps.invites.countInvites()) >= this.deps.config.inviteLimit) {
      throw new CloudError(
        409,
        'invite_limit_reached',
        'The alpha invite limit has been reached',
      );
    }
    const created = await this.deps.identity.createPasswordlessUser(email);
    await this.deps.identity.addUserToGroup(email, 'Participants');
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

const REGISTRATION_EMAIL_WINDOW_SECONDS = 15 * 60;
const REGISTRATION_NETWORK_WINDOW_SECONDS = 60 * 60;
const REGISTRATION_EMAIL_LIMIT = 4;
const REGISTRATION_NETWORK_LIMIT = 20;

/** Public, enumeration-resistant account bootstrap for the passwordless research release. */
export class RegistrationService {
  constructor(private readonly deps: ServiceDependencies) {}

  async create(request: RegistrationRequest, sourceIp: string) {
    if (request.researchEnrollmentAcknowledged !== true) {
      throw new CloudError(
        400,
        'research_enrollment_required',
        'Acknowledge the research release before creating an account',
      );
    }
    const email = normalizeEmail(request.email);
    const salt = await this.deps.secrets.registrationSalt();
    const now = Math.floor(this.deps.clock.now().getTime() / 1_000);
    const emailFingerprint = registrationFingerprint(salt, `email:${email}`);
    const networkFingerprint = registrationFingerprint(salt, `network:${sourceIp}`);
    const [emailAllowed, networkAllowed] = await Promise.all([
      this.deps.registrationLimits.consumeRegistrationLimit(
        'email',
        emailFingerprint,
        fixedWindowStart(now, REGISTRATION_EMAIL_WINDOW_SECONDS),
        now + REGISTRATION_EMAIL_WINDOW_SECONDS * 2,
        REGISTRATION_EMAIL_LIMIT,
      ),
      this.deps.registrationLimits.consumeRegistrationLimit(
        'network',
        networkFingerprint,
        fixedWindowStart(now, REGISTRATION_NETWORK_WINDOW_SECONDS),
        now + REGISTRATION_NETWORK_WINDOW_SECONDS * 2,
        REGISTRATION_NETWORK_LIMIT,
      ),
    ]);
    if (!emailAllowed || !networkAllowed) {
      throw new CloudError(
        429,
        'registration_rate_limited',
        'Too many account requests. Wait a little while and try again',
        true,
      );
    }

    const existing = await this.deps.invites.getInvite(email);
    // Keep this endpoint enumeration-resistant: uninvited and invited addresses receive
    // exactly the same response, but only an existing named invite can reach Cognito.
    if (!existing || existing.status === 'failed') return { accepted: true as const };

    // Suppress Cognito's separate welcome message. The desktop immediately starts
    // EMAIL_OTP after this returns, so an invited participant receives exactly one email.
    const created = await this.deps.identity.createPasswordlessUser(email, {
      suppressMessage: true,
    });
    await this.deps.identity.addUserToGroup(email, 'Participants');
    if (existing.subject !== created.subject || existing.status !== 'active')
      await this.deps.invites.putInvite({
        ...existing,
        subject: created.subject,
        status: 'active',
      });
    // New and existing addresses deliberately receive the same response.
    return { accepted: true as const };
  }
}

export class MetaService {
  constructor(private readonly deps: ServiceDependencies) {}

  async capabilities(user: AuthContext) {
    requireMetaAccess(user);
    const config = await this.deps.secrets.meta();
    if (!config.enabled) {
      return {
        available: false,
        models: [] as string[],
        streaming: false,
        tools: false,
        reason: 'Meta is temporarily unavailable',
      };
    }
    try {
      const capabilities = await this.deps.metaProvider.capabilities(config);
      return { available: true, ...capabilities };
    } catch (error) {
      return {
        available: false,
        models: [] as string[],
        streaming: false,
        tools: false,
        reason: error instanceof CloudError ? error.message : 'Meta capability check failed',
      };
    }
  }

  async *stream(user: AuthContext, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent> {
    requireMetaAccess(user);
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

export class ResearchExportWorker {
  constructor(private readonly deps: ServiceDependencies) {}

  async process(userId: string, exportId: string): Promise<void> {
    const now = () => this.deps.clock.now().toISOString();
    const claimed = await this.deps.researchExports.transitionResearchExport(
      userId,
      exportId,
      ['requested', 'processing', 'failed'],
      'processing',
      now(),
    );
    if (!claimed) {
      const current = await this.deps.researchExports.getResearchExport(userId, exportId);
      if (current?.state === 'completed') return;
      throw new CloudError(
        409,
        'research_export_not_claimed',
        'Export is already processing',
        true,
      );
    }
    try {
      const batches = await this.deps.research.listBatches(userId);
      const result = await this.deps.researchObjects.createExport(
        userId,
        exportId,
        batches.map(({ objectKey, sha256, byteLength }) => ({
          objectKey,
          sha256,
          byteLength,
        })),
      );
      await this.deps.researchExports.transitionResearchExport(
        userId,
        exportId,
        ['processing'],
        'completed',
        now(),
        { objectKey: result.objectKey },
      );
    } catch (error) {
      await this.deps.researchExports.transitionResearchExport(
        userId,
        exportId,
        ['processing'],
        'failed',
        now(),
        { failureCode: error instanceof CloudError ? error.code : 'research_export_failed' },
      );
      throw error;
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
      await this.deps.researchExports.deleteResearchExportsForUser(userId);
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
    session: new SessionService(deps),
    releases: new ReleaseService(deps),
    connections: new ConnectionsService(deps),
    connectorFiles: new ConnectorFilesService(deps),
    actions: new ActionsService(deps),
    research: new ResearchService(deps),
    researchAdmin: new ResearchAdminService(deps),
    researchExportWorker: new ResearchExportWorker(deps),
    invites: new InvitesService(deps),
    registration: new RegistrationService(deps),
    meta: new MetaService(deps),
    deletionWorker: new DeletionWorker(deps),
  };
}

function validateStoredReleaseManifest(value: unknown): {
  payload: {
    schemaVersion: 1;
    channel: 'internal';
    platform: 'macos';
    architecture: 'universal';
    version: string;
    publishedAt: string;
    minimumSystemVersion: string;
    artifact: { key: string; sha256: string; bytes: number };
  };
  keyId: string;
  signature: string;
} {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new CloudError(
      503,
      'release_manifest_invalid',
      'The release manifest is unavailable',
    );
  }
  const payload = value.payload;
  const artifact = payload.artifact;
  const version = typeof payload.version === 'string' ? payload.version : '';
  const key = isRecord(artifact) && typeof artifact.key === 'string' ? artifact.key : '';
  const expectedName = `Sia-${version}-universal.dmg`;
  if (
    payload.schemaVersion !== 1 ||
    payload.channel !== 'internal' ||
    payload.platform !== 'macos' ||
    payload.architecture !== 'universal' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
    typeof payload.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(payload.publishedAt)) ||
    typeof payload.minimumSystemVersion !== 'string' ||
    !isRecord(artifact) ||
    !key.startsWith(`releases/${version}/`) ||
    !key.endsWith(`/${expectedName}`) ||
    !/^[A-Za-z0-9._/-]+$/.test(key) ||
    !/^[a-f0-9]{64}$/.test(String(artifact.sha256)) ||
    !Number.isSafeInteger(artifact.bytes) ||
    Number(artifact.bytes) <= 0 ||
    typeof value.keyId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(value.keyId) ||
    typeof value.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(value.signature)
  ) {
    throw new CloudError(
      503,
      'release_manifest_invalid',
      'The release manifest is unavailable',
    );
  }
  return value as ReturnType<typeof validateStoredReleaseManifest>;
}

function fixedWindowStart(now: number, seconds: number): number {
  return Math.floor(now / seconds) * seconds;
}

function registrationFingerprint(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value).digest('hex');
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
      ...(connectionId.startsWith('gw_')
        ? {
            byte_length: upload.byteLength,
            md5: upload.md5,
            sha256: upload.sha256,
          }
        : {}),
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
  if (!isAdmin(user)) throw new CloudError(403, 'admin_required', 'Admin access is required');
}

function isAdmin(user: AuthContext): boolean {
  return user.groups.includes('Admins');
}

function isParticipant(user: AuthContext): boolean {
  return isAdmin(user) || user.groups.includes('Participants');
}

function isReleaseOperator(user: AuthContext): boolean {
  return user.groups.includes('Operators');
}

function isMetaTester(user: AuthContext): boolean {
  return user.groups.includes('MetaTesters');
}

function isConnectorTester(user: AuthContext): boolean {
  return isParticipant(user) && (isAdmin(user) || user.groups.includes('ConnectorTesters'));
}

function requireParticipant(user: AuthContext): void {
  if (!isParticipant(user)) {
    throw new CloudError(
      403,
      'participant_access_required',
      'This research release is available to invited participants only',
    );
  }
}

function requireReleaseRecipient(user: AuthContext): void {
  if (!isParticipant(user) && !isReleaseOperator(user) && !isMetaTester(user)) {
    throw new CloudError(
      403,
      'release_access_required',
      'This private release is available to approved operators, model testers, and participants only',
    );
  }
}

function requireMetaAccess(user: AuthContext): void {
  if (!isParticipant(user) && !isMetaTester(user)) {
    throw new CloudError(
      403,
      'meta_tester_required',
      'The hosted Meta preview is available to approved model testers and participants only',
    );
  }
}

function requireConnectorAccess(deps: ServiceDependencies, user: AuthContext): void {
  requireFeature(deps.config.features.connectors, 'connectors_disabled');
  requireParticipant(user);
  if (!isConnectorTester(user)) {
    throw new CloudError(
      403,
      'connector_tester_required',
      'Connected apps are limited to the acceptance-testing cohort',
    );
  }
}

function requireFeature(enabled: boolean, code: string): void {
  if (!enabled) {
    throw new CloudError(503, code, 'This capability is temporarily disabled', true);
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

function connectionAppMatches(recordApp: AppId, requestedApp: AppId): boolean {
  if (recordApp === requestedApp) return true;
  return (
    requestedApp === 'google_workspace' &&
    (LEGACY_GOOGLE_APP_IDS as readonly AppId[]).includes(recordApp)
  );
}

function connectionSupportsTool(connectionApp: AppId, toolApp: AppId): boolean {
  if (connectionApp === toolApp) return true;
  return (
    connectionApp === 'google_workspace' &&
    (LEGACY_GOOGLE_APP_IDS as readonly AppId[]).includes(toolApp)
  );
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
