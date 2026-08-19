import type {
  AppId,
  ConnectorUploadDescriptor,
  DeletionScope,
  MetaStreamEvent,
  MetaTurnRequest,
  ToolName,
} from './contracts.js';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface ConnectionRecord {
  id: string;
  userId: string;
  app: AppId;
  status: 'link_pending' | 'connected' | 'failed' | 'disconnected';
  createdAt: string;
  updatedAt: string;
  expiresAt?: number;
  accountLabel?: string;
}

export interface ConnectionRepository {
  putConnection(record: ConnectionRecord): Promise<void>;
  getConnection(userId: string, connectionId: string): Promise<ConnectionRecord | undefined>;
  listConnections(userId: string): Promise<ConnectionRecord[]>;
  deleteConnection(userId: string, connectionId: string): Promise<void>;
}

export interface ConnectorLink {
  connectionId: string;
  redirectUrl: string;
  expiresAt: string;
}

export interface ConnectorStatus {
  status: ConnectionRecord['status'];
  accountLabel?: string;
}

export interface ConnectorExecution {
  /** Raw data is returned to the caller and must never be logged or persisted. */
  data: unknown;
  opaqueResourceIds?: string[];
  providerRequestId?: string;
}

export interface ConnectorFileUploadGrant {
  /** Provider-private object key. It must never be returned to the desktop. */
  providerKey: string;
  uploadUrl: string;
}

export interface ConnectorProvider {
  beginConnection(userId: string, app: AppId, callbackUrl?: string): Promise<ConnectorLink>;
  connectionStatus(connectionId: string): Promise<ConnectorStatus>;
  disconnect(connectionId: string): Promise<void>;
  requestFileUpload(
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant>;
  execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution>;
}

export interface ConnectorUploadRecord extends ConnectorUploadDescriptor {
  userId: string;
  connectionId: string;
  providerKey: string;
  md5: string;
  createdAt: string;
  expiresAt: number;
}

export interface ConnectorUploadRepository {
  putConnectorUpload(record: ConnectorUploadRecord): Promise<void>;
  getConnectorUpload(
    userId: string,
    uploadId: string,
  ): Promise<ConnectorUploadRecord | undefined>;
  deleteConnectorUploadsForUser(userId: string): Promise<void>;
}

export interface PreparedActionRecord {
  id: string;
  userId: string;
  connectionId: string;
  tool: ToolName;
  digest: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  expiresAt: number;
  inputBytes: number;
  inputKeys: string[];
  completedAt?: string;
  failureCode?: string;
  opaqueResourceIds?: string[];
}

export type ActionClaim =
  'claimed' | 'executing' | 'completed' | 'failed' | 'expired' | 'missing';

export interface ActionRepository {
  putAction(record: PreparedActionRecord): Promise<void>;
  getAction(userId: string, actionId: string): Promise<PreparedActionRecord | undefined>;
  claimAction(userId: string, actionId: string, nowEpochSeconds: number): Promise<ActionClaim>;
  completeAction(
    userId: string,
    actionId: string,
    completedAt: string,
    opaqueResourceIds: string[],
  ): Promise<void>;
  failAction(userId: string, actionId: string, failureCode: string): Promise<void>;
  deleteActionsForUser(userId: string): Promise<void>;
}

export interface ConsentReceipt {
  userId: string;
  version: string;
  acceptedAt: string;
  purpose: 'research_evaluation_debugging';
  recordedAt: string;
}

export interface ResearchBatchMetadata {
  userId: string;
  batchId: string;
  consentVersion: string;
  eventCount: number;
  objectKey: string;
  sha256: string;
  byteLength: number;
  createdAt: string;
}

export interface ResearchRepository {
  putConsent(receipt: ConsentReceipt): Promise<void>;
  getConsent(userId: string, version: string): Promise<ConsentReceipt | undefined>;
  getBatch(userId: string, batchId: string): Promise<ResearchBatchMetadata | undefined>;
  listBatches(userId: string): Promise<ResearchBatchMetadata[]>;
  putBatchIfAbsent(
    batch: ResearchBatchMetadata,
  ): Promise<{ created: true } | { created: false; existing: ResearchBatchMetadata }>;
  deleteResearchForUser(userId: string): Promise<void>;
}

export interface ResearchObjectStore {
  putBatch(userId: string, batchId: string, sha256: string, body: Uint8Array): Promise<string>;
  deleteBatchObject(objectKey: string): Promise<void>;
  createExport(
    userId: string,
    exportId: string,
    objectKeys: readonly string[],
  ): Promise<{ objectKey: string; downloadUrl: string }>;
  deleteAllForUser(userId: string): Promise<void>;
}

export interface InviteRecord {
  email: string;
  invitedBy: string;
  invitedAt: string;
  subject?: string;
  status: 'invited' | 'active' | 'failed';
}

export interface InviteRepository {
  getInvite(email: string): Promise<InviteRecord | undefined>;
  putInvite(record: InviteRecord): Promise<void>;
  listInvites(): Promise<InviteRecord[]>;
  countInvites(): Promise<number>;
  deleteInvitesForSubject(subject: string): Promise<void>;
}

export interface IdentityProvider {
  createPasswordlessUser(email: string): Promise<{ subject: string }>;
  deleteUser(subject: string): Promise<void>;
}

export type DeletionState =
  | 'requested'
  | 'processing'
  | 'research_deleted'
  | 'connections_revoked'
  | 'identity_deleted'
  | 'completed'
  | 'failed';

export interface DeletionJob {
  id: string;
  userId: string;
  scope: DeletionScope;
  state: DeletionState;
  requestedAt: string;
  updatedAt: string;
  failureCode?: string;
}

export interface DeletionRepository {
  putDeletion(job: DeletionJob): Promise<void>;
  getDeletion(userId: string, jobId: string): Promise<DeletionJob | undefined>;
  latestDeletion(userId: string): Promise<DeletionJob | undefined>;
  transitionDeletion(
    userId: string,
    jobId: string,
    expected: readonly DeletionState[],
    next: DeletionState,
    updatedAt: string,
    failureCode?: string,
  ): Promise<boolean>;
}

export interface DeletionQueue {
  enqueue(job: { id: string; userId: string; scope: DeletionScope }): Promise<void>;
}

export interface MetaConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
  sessionHeader?: string;
  allowedModels?: string[];
}

export interface ComposioConfig {
  apiKey: string;
  baseUrl: string;
  authConfigIds: Record<AppId, string>;
  toolSlugs: Record<ToolName, string>;
  toolVersion: string;
}

export interface SecretProvider {
  meta(): Promise<MetaConfig>;
  composio(): Promise<ComposioConfig>;
}

export interface MetaProvider {
  stream(config: MetaConfig, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent>;
}

export interface ConcurrencyLease {
  release(): Promise<void>;
}

export interface QuotaGate {
  acquireMeta(userId: string): Promise<ConcurrencyLease>;
}

export interface AuditEvent {
  userId: string;
  action: string;
  outcome: 'allowed' | 'denied' | 'failed';
  occurredAt: string;
  app?: AppId;
  tool?: ToolName;
  connectionId?: string;
  opaqueResourceIds?: string[];
  errorCode?: string;
}

export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
}
