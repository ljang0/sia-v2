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
import type { TaskRatingRecord } from '@sia/protocol/ratings';
import type { ComposioToolName, LegacyGoogleAppId } from './contracts.js';

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
    expectedUpdatedAt?: string,
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
    expectedUpdatedAt?: string,
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
  /**
   * Sponsor-funded token ceiling for this lab across every account and the life of the grant.
   * Checked before each turn, so turns already in flight may finish slightly past it.
   */
  creditTokenLimit?: number;
  /** ISO-8601 instant after which the lab is unavailable, e.g. when sponsor credit expires. */
  availableUntil?: string;
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
  toolSlugs: Record<ComposioToolName, string>;
  toolVersions: Record<ComposioToolName, string>;
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
  /** Each lab has its own daily allowance and, optionally, a sponsor-wide credit ceiling. */
  labId: string;
  requestLimit: number;
  tokenLimit: number;
  creditTokenLimit?: number;
}

/** Where a turn's tokens are charged: the account, the lab's credit, and its model/harness. */
export interface MetaUsageAttribution extends DailyQuotaWindow {
  labId: string;
  model: string;
  harnessId: string;
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
  getMetaUsage(userId: string, labId: string, period: string): Promise<MetaUsageSnapshot>;
  recordMetaUsage(
    userId: string,
    attribution: MetaUsageAttribution,
    usage: MetaTokenUsage,
  ): Promise<void>;
  /** Total tokens charged to a lab's sponsor credit by every account. */
  getLabCreditUsage(labId: string): Promise<number>;
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

/** A phone paired with one account's Mac for the encrypted phone relay. */
export interface RemoteDevice {
  deviceId: string;
  userId: string;
  /** SHA-256 (base64url) of the device token; the token itself is never stored. */
  tokenHash: string;
  createdAt: string;
  lastSeenAt?: string;
}

export type RemoteConnectionRole = 'pending' | 'mac' | 'phone';

export interface RemoteConnection {
  connectionId: string;
  role: RemoteConnectionRole;
  userId?: string;
  deviceId?: string;
  connectedAt: string;
  /** DynamoDB TTL (epoch seconds) so abandoned records clean themselves up. */
  expiresAt: number;
}

export interface RemoteRelayStore {
  getDevice(deviceId: string): Promise<RemoteDevice | undefined>;
  listDevices(userId: string): Promise<RemoteDevice[]>;
  createDevice(device: RemoteDevice): Promise<void>;
  deleteDevice(userId: string, deviceId: string): Promise<void>;
  touchDevice(deviceId: string, at: string): Promise<void>;
  putConnection(connection: RemoteConnection): Promise<void>;
  getConnection(connectionId: string): Promise<RemoteConnection | undefined>;
  deleteConnection(connectionId: string): Promise<void>;
  /** Connection ids for every live connection of one device. */
  deviceConnections(deviceId: string): Promise<string[]>;
  macConnection(userId: string): Promise<string | undefined>;
  setMacConnection(userId: string, connectionId: string): Promise<string | undefined>;
  clearMacConnection(userId: string, connectionId: string): Promise<void>;
  /** Increments and returns this connection's frame count for the given minute bucket. */
  countFrame(connectionId: string, minute: number): Promise<number>;
  deleteUserDevices(userId: string): Promise<void>;
}

/** Pushes frames to WebSocket connections held by API Gateway. */
export interface ConnectionPusher {
  /** Returns false when the connection no longer exists. */
  send(connectionId: string, frame: Record<string, unknown>): Promise<boolean>;
  close(connectionId: string): Promise<void>;
}

/** Verifies a Cognito ID token presented by a Mac in its first relay frame. */
export interface IdTokenVerifier {
  verify(idToken: string): Promise<{ subject: string }>;
}

/**
 * A task rating as the cloud keeps it (docs/arena-ratings.md). It holds no account id: `id` is a
 * one-way hash of the account and the Mac's random turn id, so a re-rating replaces the earlier
 * one without the record pointing back at the person.
 */
export interface StoredTaskRating {
  id: string;
  labId: string;
  day: string;
  model: string;
  harnessId: string;
  record: Omit<TaskRatingRecord, 'threadId' | 'turnId'>;
  receivedAt: string;
}

export interface RatingAggregateKey {
  labId: string;
  labName: string;
  provider: TaskRatingRecord['route']['provider'];
  day: string;
  model: string;
  harnessId: string;
}

/** Daily counters per lab, model, and engine. Counter names come from `ratingCounters`. */
export interface RatingAggregate extends RatingAggregateKey {
  counters: Record<string, number>;
}

export interface RatingRepository {
  /** Counts one rating against the account's window; false once the limit is passed. */
  consumeRatingLimit(
    userId: string,
    windowStart: number,
    expiresAt: number,
    limit: number,
  ): Promise<boolean>;
  /** Stores the rating, replacing any earlier one with the same key; returns the earlier one. */
  putRating(rating: StoredTaskRating, expiresAt: number): Promise<StoredTaskRating | undefined>;
  addRatingCounters(
    key: RatingAggregateKey,
    deltas: Record<string, number>,
    expiresAt: number,
  ): Promise<void>;
  listRatingAggregates(
    labId: string,
    fromDay: string,
    toDay: string,
  ): Promise<RatingAggregate[]>;
}
