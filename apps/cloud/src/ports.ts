import type {
  AppId,
  ConnectorUploadDescriptor,
  DeletionScope,
  GoogleAccessLevel,
  MetaStreamEvent,
  MetaTurnRequest,
  ToolName,
  VoiceTokenType,
} from './contracts.js';
import type { LegacyGoogleAppId } from './contracts.js';

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

export class ConnectorReconnectRequiredError extends Error {
  constructor() {
    super('The connected account must be authorized again.');
    this.name = 'ConnectorReconnectRequiredError';
  }
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
  access?: GoogleAccessLevel;
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
  beginConnection(
    userId: string,
    app: AppId,
    callbackUrl?: string,
    access?: GoogleAccessLevel,
  ): Promise<ConnectorLink>;
  connectionStatus(connectionId: string): Promise<ConnectorStatus>;
  validateAccess?(userId: string, connectionId: string, tool: ToolName): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
  /**
   * Deletes a superseded local credential without revoking the provider authorization grant.
   * This is intentionally separate from disconnect: some providers bind multiple refresh tokens
   * to one grant, so revoking the old token can also invalidate its verified replacement.
   */
  retireSuperseded?(connectionId: string): Promise<void>;
  requestFileUpload(
    connectionId: string,
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
  completeGoogleOAuth?(request: { state: string; code?: string; error?: string }): Promise<{
    connectionId: string;
    userId: string;
    connected: boolean;
    accountLabel?: string;
    failure?: 'access_denied' | 'missing_scopes';
  }>;
}

export interface GoogleOAuthStateRecord {
  stateHash: string;
  userId: string;
  connectionId: string;
  encryptedVerifier: string;
  access: GoogleAccessLevel;
  expiresAt: number;
}

export interface GoogleTokenRecord {
  connectionId: string;
  userId: string;
  encryptedRefreshToken: string;
  accountLabel: string;
  grantedScopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GoogleCredentialRepository {
  putGoogleOAuthState(record: GoogleOAuthStateRecord): Promise<void>;
  consumeGoogleOAuthState(stateHash: string): Promise<GoogleOAuthStateRecord | undefined>;
  putGoogleToken(record: GoogleTokenRecord): Promise<void>;
  getGoogleToken(connectionId: string): Promise<GoogleTokenRecord | undefined>;
  deleteGoogleToken(connectionId: string): Promise<void>;
}

export interface TokenCipher {
  encrypt(plaintext: string, context: Record<string, string>): Promise<string>;
  decrypt(ciphertext: string, context: Record<string, string>): Promise<string>;
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
  format?: 'filtered_v2' | 'raw_v1';
  scope?: {
    threadId: string;
    turnId: string;
    sequenceStart?: number;
    sequenceEnd?: number;
    eventKinds: string[];
  };
}

export interface ResearchRepository {
  putConsent(receipt: ConsentReceipt): Promise<void>;
  getConsent(userId: string, version: string): Promise<ConsentReceipt | undefined>;
  getBatch(userId: string, batchId: string): Promise<ResearchBatchMetadata | undefined>;
  listBatches(userId: string): Promise<ResearchBatchMetadata[]>;
  listAllBatches(): Promise<ResearchBatchMetadata[]>;
  putBatchIfAbsent(
    batch: ResearchBatchMetadata,
  ): Promise<{ created: true } | { created: false; existing: ResearchBatchMetadata }>;
  deleteResearchForUser(userId: string): Promise<void>;
}

export type ResearchExportState = 'requested' | 'processing' | 'completed' | 'failed';

export interface ResearchExportJob {
  id: string;
  userId: string;
  state: ResearchExportState;
  requestedAt: string;
  updatedAt: string;
  objectKey?: string;
  failureCode?: string;
  expiresAt: number;
}

export interface ResearchExportRepository {
  putResearchExport(job: ResearchExportJob): Promise<void>;
  getResearchExport(userId: string, exportId: string): Promise<ResearchExportJob | undefined>;
  transitionResearchExport(
    userId: string,
    exportId: string,
    expected: readonly ResearchExportState[],
    next: ResearchExportState,
    updatedAt: string,
    detail?: { objectKey?: string; failureCode?: string },
  ): Promise<boolean>;
  deleteResearchExportsForUser(userId: string): Promise<void>;
}

export interface ResearchExportQueue {
  enqueue(job: { id: string; userId: string }): Promise<void>;
}

export interface ResearchObjectStore {
  putBatch(userId: string, batchId: string, sha256: string, body: Uint8Array): Promise<string>;
  deleteBatchObject(objectKey: string): Promise<void>;
  createExport(
    userId: string,
    exportId: string,
    objects: readonly {
      objectKey: string;
      sha256: string;
      byteLength: number;
    }[],
  ): Promise<{ objectKey: string }>;
  createExportDownloadUrl(userId: string, objectKey: string): Promise<string>;
  readBatchObject(
    objectKey: string,
  ): Promise<{ document: unknown; sha256: string; byteLength: number }>;
  deleteAllForUser(userId: string): Promise<void>;
}

export interface ReleaseManifestStore {
  readLatest(): Promise<unknown>;
  createArtifactDownloadUrl(objectKey: string): Promise<string>;
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

export interface RegistrationRateLimitRepository {
  consumeRegistrationLimit(
    kind: 'email' | 'network',
    fingerprint: string,
    windowStart: number,
    expiresAt: number,
    limit: number,
  ): Promise<boolean>;
}

export interface IdentityProvider {
  createPasswordlessUser(
    email: string,
    options?: { suppressMessage?: boolean },
  ): Promise<{ subject: string }>;
  addUserToGroup(
    email: string,
    group: 'Users' | 'Participants' | 'ConnectorTesters',
  ): Promise<void>;
  deleteUser(subject: string): Promise<void>;
  hasMfa(email: string): Promise<boolean>;
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

export interface HostedLabConfig {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
  sessionHeader?: string;
  allowedModels?: string[];
  catalogId?: string;
  displayName?: string;
  modelLabels?: Record<string, string>;
  dailyRequestLimit?: number;
  dailyTokenLimit?: number;
  maxOutputTokens?: number;
  /** Protocol spoken by this lab endpoint. Legacy secrets default to Chat Completions. */
  apiProtocol?: ModelApiProtocol;
  /** Catalog routes are data; the desktop still requires a registered release adapter. */
  harnessRoutes?: HostedCatalogRoute[];
  defaultHarnessId?: HarnessId;
}

/**
 * The existing secret remains a valid single-lab config. Add `additionalLabs`
 * to onboard more labs without a deployment or code change.
 */
export interface MetaConfig extends HostedLabConfig {
  additionalLabs?: HostedLabConfig[];
}

export interface ElevenLabsConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  displayName?: string;
  allowedVoiceIds?: string[];
  allowedTokenTypes?: VoiceTokenType[];
  dailyTokenMintLimit?: number;
}

export interface ComposioConfig {
  apiKey: string;
  baseUrl: string;
  authConfigIds: Record<LegacyGoogleAppId | 'slack', string>;
  toolSlugs: Record<ToolName, string>;
  toolVersions: Record<ToolName, string>;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SecretProvider {
  meta(): Promise<MetaConfig>;
  elevenLabs(): Promise<ElevenLabsConfig>;
  composio(): Promise<ComposioConfig>;
  google(): Promise<GoogleOAuthConfig>;
  registrationSalt(): Promise<string>;
}

export interface MetaProvider {
  capabilities(config: HostedLabConfig): Promise<{
    models: string[];
    streaming: boolean;
    tools: boolean;
  }>;
  stream(config: HostedLabConfig, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent>;
}

export interface VoiceCatalogEntry {
  id: string;
  name: string;
  category?: string;
}

export interface VoiceProvider {
  catalog(config: ElevenLabsConfig): Promise<VoiceCatalogEntry[]>;
  mintSingleUseToken(
    config: ElevenLabsConfig,
    type: VoiceTokenType,
  ): Promise<{ token: string }>;
}

export interface ConcurrencyLease {
  release(): Promise<void>;
}

export interface DailyQuotaWindow {
  /** UTC calendar day in YYYY-MM-DD form. */
  period: string;
  /** DynamoDB TTL used only for quota-record cleanup. */
  expiresAt: number;
}

export interface MetaQuotaPolicy extends DailyQuotaWindow {
  requestLimit: number;
  tokenLimit: number;
}

export interface MetaUsageSnapshot {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface MetaTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface VoiceTokenQuotaPolicy extends DailyQuotaWindow {
  tokenMintLimit: number;
}

export interface QuotaGate {
  acquireMeta(userId: string, policy: MetaQuotaPolicy): Promise<ConcurrencyLease>;
  getMetaUsage(userId: string, period: string): Promise<MetaUsageSnapshot>;
  recordMetaUsage(
    userId: string,
    window: DailyQuotaWindow,
    usage: MetaTokenUsage,
  ): Promise<void>;
  consumeVoiceToken(userId: string, policy: VoiceTokenQuotaPolicy): Promise<void>;
  getVoiceTokenUsage(userId: string, period: string): Promise<number>;
  deleteUserUsage(userId: string): Promise<void>;
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
import type { HarnessId, HostedCatalogRoute, ModelApiProtocol } from '@sia/protocol';
