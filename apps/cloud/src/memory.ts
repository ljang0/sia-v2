import { createHash } from 'node:crypto';

import type {
  AppId,
  DeletionScope,
  MetaStreamEvent,
  MetaTurnRequest,
  ToolName,
} from './contracts.js';
import { CloudError } from './domain.js';
import type {
  ActionClaim,
  ActionRepository,
  AuditEvent,
  AuditSink,
  Clock,
  ComposioConfig,
  ConcurrencyLease,
  ConnectionRecord,
  ConnectionRepository,
  ConnectorExecution,
  ConnectorFileUploadGrant,
  ConnectorLink,
  ConnectorProvider,
  ConnectorStatus,
  ConnectorUploadRecord,
  ConnectorUploadRepository,
  ConsentReceipt,
  DeletionJob,
  DeletionQueue,
  DeletionRepository,
  DeletionState,
  GoogleCredentialRepository,
  GoogleOAuthConfig,
  GoogleOAuthStateRecord,
  GoogleTokenRecord,
  IdGenerator,
  IdentityProvider,
  InviteRecord,
  InviteRepository,
  MetaConfig,
  MetaProvider,
  PreparedActionRecord,
  QuotaGate,
  ResearchBatchMetadata,
  ResearchExportJob,
  ResearchExportQueue,
  ResearchExportRepository,
  ResearchExportState,
  ResearchObjectStore,
  ResearchRepository,
  SecretProvider,
} from './ports.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

export class SequenceIds implements IdGenerator {
  private value = 0;
  constructor(private readonly prefix = 'id') {}
  next(): string {
    this.value += 1;
    return `${this.prefix}-${this.value}`;
  }
}

const key = (...parts: string[]): string => parts.join('\u0000');

/** Test/dev adapter. It intentionally keeps state in process and is never used by deployed Lambdas. */
export class MemoryState
  implements
    ConnectionRepository,
    ActionRepository,
    ConnectorUploadRepository,
    ResearchRepository,
    ResearchExportRepository,
    InviteRepository,
    DeletionRepository,
    GoogleCredentialRepository
{
  readonly connectionRecords = new Map<string, ConnectionRecord>();
  readonly actionRecords = new Map<string, PreparedActionRecord>();
  readonly connectorUploadRecords = new Map<string, ConnectorUploadRecord>();
  readonly consentRecords = new Map<string, ConsentReceipt>();
  readonly batchRecords = new Map<string, ResearchBatchMetadata>();
  readonly researchExportRecords = new Map<string, ResearchExportJob>();
  readonly inviteRecords = new Map<string, InviteRecord>();
  readonly deletionRecords = new Map<string, DeletionJob>();
  readonly googleOAuthStates = new Map<string, GoogleOAuthStateRecord>();
  readonly googleTokens = new Map<string, GoogleTokenRecord>();

  async putConnection(record: ConnectionRecord): Promise<void> {
    this.connectionRecords.set(key(record.userId, record.id), structuredClone(record));
  }

  async getConnection(userId: string, id: string): Promise<ConnectionRecord | undefined> {
    return clone(this.connectionRecords.get(key(userId, id)));
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    return [...this.connectionRecords.values()]
      .filter((record) => record.userId === userId)
      .map((value) => structuredClone(value));
  }

  async deleteConnection(userId: string, connectionId: string): Promise<void> {
    this.connectionRecords.delete(key(userId, connectionId));
  }

  async putGoogleOAuthState(record: GoogleOAuthStateRecord): Promise<void> {
    this.googleOAuthStates.set(record.stateHash, structuredClone(record));
  }

  async consumeGoogleOAuthState(
    stateHash: string,
  ): Promise<GoogleOAuthStateRecord | undefined> {
    const record = this.googleOAuthStates.get(stateHash);
    this.googleOAuthStates.delete(stateHash);
    return clone(record);
  }

  async putGoogleToken(record: GoogleTokenRecord): Promise<void> {
    this.googleTokens.set(record.connectionId, structuredClone(record));
  }

  async getGoogleToken(connectionId: string): Promise<GoogleTokenRecord | undefined> {
    return clone(this.googleTokens.get(connectionId));
  }

  async deleteGoogleToken(connectionId: string): Promise<void> {
    this.googleTokens.delete(connectionId);
  }

  async putAction(record: PreparedActionRecord): Promise<void> {
    this.actionRecords.set(key(record.userId, record.id), structuredClone(record));
  }

  async getAction(userId: string, id: string): Promise<PreparedActionRecord | undefined> {
    return clone(this.actionRecords.get(key(userId, id)));
  }

  async claimAction(
    userId: string,
    actionId: string,
    nowEpochSeconds: number,
  ): Promise<ActionClaim> {
    const recordKey = key(userId, actionId);
    const record = this.actionRecords.get(recordKey);
    if (!record) return 'missing';
    if (record.status === 'completed') return 'completed';
    if (record.status === 'executing') return 'executing';
    if (record.status === 'failed') return 'failed';
    if (record.expiresAt <= nowEpochSeconds) return 'expired';
    record.status = 'executing';
    this.actionRecords.set(recordKey, record);
    return 'claimed';
  }

  async completeAction(
    userId: string,
    actionId: string,
    completedAt: string,
    opaqueResourceIds: string[],
  ): Promise<void> {
    const recordKey = key(userId, actionId);
    const record = this.actionRecords.get(recordKey);
    if (!record) throw new Error('action missing');
    record.status = 'completed';
    record.completedAt = completedAt;
    record.opaqueResourceIds = [...opaqueResourceIds];
  }

  async failAction(userId: string, actionId: string, failureCode: string): Promise<void> {
    const record = this.actionRecords.get(key(userId, actionId));
    if (!record) return;
    record.status = 'failed';
    record.failureCode = failureCode;
  }

  async deleteActionsForUser(userId: string): Promise<void> {
    for (const recordKey of [...this.actionRecords.keys()]) {
      if (recordKey.startsWith(`${userId}\u0000`)) this.actionRecords.delete(recordKey);
    }
  }

  async putConnectorUpload(record: ConnectorUploadRecord): Promise<void> {
    this.connectorUploadRecords.set(
      key(record.userId, record.uploadId),
      structuredClone(record),
    );
  }

  async getConnectorUpload(
    userId: string,
    uploadId: string,
  ): Promise<ConnectorUploadRecord | undefined> {
    return clone(this.connectorUploadRecords.get(key(userId, uploadId)));
  }

  async deleteConnectorUploadsForUser(userId: string): Promise<void> {
    for (const recordKey of [...this.connectorUploadRecords.keys()]) {
      if (recordKey.startsWith(`${userId}\u0000`))
        this.connectorUploadRecords.delete(recordKey);
    }
  }

  async deleteResearchForUser(userId: string): Promise<void> {
    for (const recordKey of [...this.consentRecords.keys()]) {
      if (recordKey.startsWith(`${userId}\u0000`)) this.consentRecords.delete(recordKey);
    }
    for (const recordKey of [...this.batchRecords.keys()]) {
      if (recordKey.startsWith(`${userId}\u0000`)) this.batchRecords.delete(recordKey);
    }
  }

  async putResearchExport(job: ResearchExportJob): Promise<void> {
    this.researchExportRecords.set(key(job.userId, job.id), structuredClone(job));
  }

  async getResearchExport(
    userId: string,
    exportId: string,
  ): Promise<ResearchExportJob | undefined> {
    return clone(this.researchExportRecords.get(key(userId, exportId)));
  }

  async transitionResearchExport(
    userId: string,
    exportId: string,
    expected: readonly ResearchExportState[],
    next: ResearchExportState,
    updatedAt: string,
    detail: { objectKey?: string; failureCode?: string } = {},
  ): Promise<boolean> {
    const job = this.researchExportRecords.get(key(userId, exportId));
    if (!job || !expected.includes(job.state)) return false;
    job.state = next;
    job.updatedAt = updatedAt;
    if (detail.objectKey) job.objectKey = detail.objectKey;
    else delete job.objectKey;
    if (detail.failureCode) job.failureCode = detail.failureCode;
    else delete job.failureCode;
    return true;
  }

  async deleteResearchExportsForUser(userId: string): Promise<void> {
    for (const [recordKey, job] of this.researchExportRecords) {
      if (job.userId === userId) this.researchExportRecords.delete(recordKey);
    }
  }

  async putConsent(receipt: ConsentReceipt): Promise<void> {
    this.consentRecords.set(key(receipt.userId, receipt.version), structuredClone(receipt));
  }

  async getConsent(userId: string, version: string): Promise<ConsentReceipt | undefined> {
    return clone(this.consentRecords.get(key(userId, version)));
  }

  async getBatch(userId: string, batchId: string): Promise<ResearchBatchMetadata | undefined> {
    return clone(this.batchRecords.get(key(userId, batchId)));
  }

  async listBatches(userId: string): Promise<ResearchBatchMetadata[]> {
    return [...this.batchRecords.values()]
      .filter((record) => record.userId === userId)
      .map((record) => structuredClone(record));
  }

  async listAllBatches(): Promise<ResearchBatchMetadata[]> {
    return [...this.batchRecords.values()].map((record) => structuredClone(record));
  }

  async putBatchIfAbsent(
    batch: ResearchBatchMetadata,
  ): Promise<{ created: true } | { created: false; existing: ResearchBatchMetadata }> {
    const recordKey = key(batch.userId, batch.batchId);
    const existing = this.batchRecords.get(recordKey);
    if (existing) return { created: false, existing: structuredClone(existing) };
    this.batchRecords.set(recordKey, structuredClone(batch));
    return { created: true };
  }

  async getInvite(email: string): Promise<InviteRecord | undefined> {
    return clone(this.inviteRecords.get(email));
  }

  async putInvite(record: InviteRecord): Promise<void> {
    this.inviteRecords.set(record.email, structuredClone(record));
  }

  async listInvites(): Promise<InviteRecord[]> {
    return [...this.inviteRecords.values()].map((value) => structuredClone(value));
  }

  async countInvites(): Promise<number> {
    return this.inviteRecords.size;
  }

  async deleteInvitesForSubject(subject: string): Promise<void> {
    for (const [email, record] of this.inviteRecords) {
      if (record.subject === subject) this.inviteRecords.delete(email);
    }
  }

  async putDeletion(job: DeletionJob): Promise<void> {
    this.deletionRecords.set(key(job.userId, job.id), structuredClone(job));
  }

  async getDeletion(userId: string, jobId: string): Promise<DeletionJob | undefined> {
    return clone(this.deletionRecords.get(key(userId, jobId)));
  }

  async latestDeletion(userId: string): Promise<DeletionJob | undefined> {
    return [...this.deletionRecords.values()]
      .filter((job) => job.userId === userId)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
      .map((job) => structuredClone(job))[0];
  }

  async transitionDeletion(
    userId: string,
    jobId: string,
    expected: readonly DeletionState[],
    next: DeletionState,
    updatedAt: string,
    failureCode?: string,
  ): Promise<boolean> {
    const record = this.deletionRecords.get(key(userId, jobId));
    if (!record || !expected.includes(record.state)) return false;
    record.state = next;
    record.updatedAt = updatedAt;
    if (failureCode === undefined) delete record.failureCode;
    else record.failureCode = failureCode;
    return true;
  }
}

export class MemoryResearchObjects implements ResearchObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  async putBatch(
    userId: string,
    batchId: string,
    sha256: string,
    body: Uint8Array,
  ): Promise<string> {
    const objectKey = `users/${userId}/batches/${batchId}/${sha256}.json`;
    this.objects.set(objectKey, body.slice());
    return objectKey;
  }
  async deleteBatchObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }
  async createExport(
    userId: string,
    exportId: string,
    objects: readonly { objectKey: string; sha256: string; byteLength: number }[],
  ) {
    const body = Buffer.concat(
      [...objects]
        .sort((left, right) => left.objectKey.localeCompare(right.objectKey))
        .map((object) => {
          const value = this.objects.get(object.objectKey);
          if (!value) throw new Error('A claimed research batch object is missing');
          const sha256 = createHash('sha256').update(value).digest('base64url');
          if (value.byteLength !== object.byteLength || sha256 !== object.sha256) {
            throw new Error('A research batch failed its export integrity check');
          }
          return Buffer.concat([value, Buffer.from('\n')]);
        }),
    );
    const objectKey = `users/${userId}/exports/${exportId}.jsonl`;
    this.objects.set(objectKey, body);
    return { objectKey };
  }
  async readBatchObject(
    objectKey: string,
  ): Promise<{ document: unknown; sha256: string; byteLength: number }> {
    const value = this.objects.get(objectKey);
    if (!value) throw new Error('The requested research batch object is missing');
    return {
      document: JSON.parse(Buffer.from(value).toString('utf8')) as unknown,
      sha256: createHash('sha256').update(value).digest('base64url'),
      byteLength: value.byteLength,
    };
  }
  async createExportDownloadUrl(userId: string, objectKey: string): Promise<string> {
    if (!objectKey.startsWith(`users/${userId}/exports/`) || !this.objects.has(objectKey)) {
      throw new Error('The requested research export is unavailable');
    }
    return `memory://${objectKey}`;
  }
  async deleteAllForUser(userId: string): Promise<void> {
    for (const objectKey of [...this.objects.keys()]) {
      if (objectKey.startsWith(`users/${userId}/`)) this.objects.delete(objectKey);
    }
  }
}

export class MemoryConnector implements ConnectorProvider {
  executeError?: Error;
  readonly statuses = new Map<string, ConnectorStatus>();
  readonly executions: Array<{
    userId: string;
    connectionId: string;
    tool: ToolName;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }> = [];
  readonly uploadRequests: Array<{
    tool: 'drive.upload';
    fileName: string;
    mimeType: string;
    md5: string;
  }> = [];
  private sequence = 0;

  async beginConnection(
    _userId: string,
    app: AppId,
    _callbackUrl?: string,
  ): Promise<ConnectorLink> {
    this.sequence += 1;
    const connectionId = `${app}-${this.sequence}`;
    this.statuses.set(connectionId, { status: 'link_pending' });
    return {
      connectionId,
      redirectUrl: `https://connect.invalid/${connectionId}`,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }
  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    return this.statuses.get(connectionId) ?? { status: 'failed' };
  }
  async disconnect(connectionId: string): Promise<void> {
    this.statuses.set(connectionId, { status: 'disconnected' });
  }
  async requestFileUpload(
    _connectionId: string,
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant> {
    this.uploadRequests.push({ tool, fileName, mimeType, md5 });
    return {
      providerKey: `provider-private-${this.uploadRequests.length}`,
      uploadUrl: `https://uploads.invalid/${this.uploadRequests.length}?signed=yes`,
    };
  }
  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    if (this.executeError) throw this.executeError;
    this.executions.push({
      userId,
      connectionId,
      tool,
      input: structuredClone(input),
      idempotencyKey,
    });
    return { data: { ok: true }, opaqueResourceIds: [`opaque-${this.executions.length}`] };
  }
}

export class MemoryIdentity implements IdentityProvider {
  readonly users = new Map<string, string>();
  async createPasswordlessUser(email: string): Promise<{ subject: string }> {
    const subject = `subject-${email}`;
    this.users.set(subject, email);
    return { subject };
  }
  async deleteUser(subject: string): Promise<void> {
    this.users.delete(subject);
  }
  async hasMfa(_email: string): Promise<boolean> {
    return true;
  }
}

export class MemoryDeletionQueue implements DeletionQueue {
  readonly messages: Array<{ id: string; userId: string; scope: DeletionScope }> = [];
  async enqueue(job: { id: string; userId: string; scope: DeletionScope }): Promise<void> {
    this.messages.push(structuredClone(job));
  }
}

export class MemoryResearchExportQueue implements ResearchExportQueue {
  readonly messages: Array<{ id: string; userId: string }> = [];
  async enqueue(job: { id: string; userId: string }): Promise<void> {
    this.messages.push(structuredClone(job));
  }
}

export class MemoryAudit implements AuditSink {
  readonly events: AuditEvent[] = [];
  async write(event: AuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}

export class FixedSecrets implements SecretProvider {
  constructor(
    private readonly metaConfig: MetaConfig,
    private readonly composioConfig: ComposioConfig,
    private readonly googleConfig: GoogleOAuthConfig = {
      clientId: 'test-google-client.apps.googleusercontent.com',
      clientSecret: 'test-google-client-secret',
      redirectUri: 'https://api.example.test/v1/oauth/google/callback',
    },
  ) {}
  async meta(): Promise<MetaConfig> {
    return structuredClone(this.metaConfig);
  }
  async composio(): Promise<ComposioConfig> {
    return structuredClone(this.composioConfig);
  }
  async google(): Promise<GoogleOAuthConfig> {
    return structuredClone(this.googleConfig);
  }
}

export class EchoMetaProvider implements MetaProvider {
  async capabilities(config: MetaConfig): Promise<{
    models: string[];
    streaming: boolean;
    tools: boolean;
  }> {
    return {
      models: config.allowedModels?.length ? [...config.allowedModels] : [config.model],
      streaming: true,
      tools: true,
    };
  }

  async *stream(config: MetaConfig, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent> {
    const sessionId = request.sessionId ?? `session-${request.turnId}`;
    yield {
      type: 'started',
      turnId: request.turnId,
      sessionId,
      model: request.model ?? config.model,
    };
    yield { type: 'delta', text: 'test' };
    yield { type: 'done', finishReason: 'stop' };
  }
}

export class MemoryQuota implements QuotaGate {
  private readonly active = new Map<string, number>();
  constructor(private readonly limit = 2) {}
  async acquireMeta(userId: string): Promise<ConcurrencyLease> {
    const count = this.active.get(userId) ?? 0;
    if (count >= this.limit)
      throw new CloudError(429, 'meta_concurrency_limit', 'Too many active Meta turns', true);
    this.active.set(userId, count + 1);
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        const current = this.active.get(userId) ?? 1;
        if (current <= 1) this.active.delete(userId);
        else this.active.set(userId, current - 1);
      },
    };
  }
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
