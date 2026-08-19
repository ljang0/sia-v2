import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  APP_IDS,
  TOOL_POLICIES,
  type AppId,
  type DeletionScope,
  type MetaStreamEvent,
  type MetaTurnRequest,
  type ToolName,
} from './contracts.js';
import { assertComposioContract } from './connector-contract.js';
import { CloudError, isRecord } from './domain.js';
import { SystemClock } from './memory.js';
import type {
  ActionClaim,
  ActionRepository,
  AuditEvent,
  AuditSink,
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
  IdentityProvider,
  InviteRecord,
  InviteRepository,
  MetaConfig,
  MetaProvider,
  PreparedActionRecord,
  QuotaGate,
  ResearchBatchMetadata,
  ResearchObjectStore,
  ResearchRepository,
  SecretProvider,
} from './ports.js';
import type { ServiceDependencies } from './services.js';

const USER_PREFIX = 'USER#';
const DEFAULT_BATCH_DELETE_ATTEMPTS = 8;
const DEFAULT_BATCH_DELETE_BASE_DELAY_MS = 25;
const DEFAULT_S3_DELETE_ATTEMPTS = 8;
const DEFAULT_S3_DELETE_BASE_DELAY_MS = 25;

export interface DynamoStateOptions {
  batchDeleteAttempts?: number;
  batchDeleteBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface S3ResearchObjectOptions {
  deleteAttempts?: number;
  deleteBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface RuntimeConfig {
  tableName: string;
  bucketName: string;
  kmsKeyArn: string;
  deletionQueueUrl: string;
  userPoolId: string;
  metaSecretArn: string;
  composioSecretArn: string;
  consentVersion: string;
  actionTtlSeconds: number;
  inviteLimit: number;
  metaConcurrency: number;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    tableName: requiredEnv(environment, 'TABLE_NAME'),
    bucketName: requiredEnv(environment, 'RESEARCH_BUCKET'),
    kmsKeyArn: requiredEnv(environment, 'KMS_KEY_ARN'),
    deletionQueueUrl: requiredEnv(environment, 'DELETION_QUEUE_URL'),
    userPoolId: requiredEnv(environment, 'USER_POOL_ID'),
    metaSecretArn: requiredEnv(environment, 'META_SECRET_ARN'),
    composioSecretArn: requiredEnv(environment, 'COMPOSIO_SECRET_ARN'),
    consentVersion: requiredEnv(environment, 'RESEARCH_CONSENT_VERSION'),
    actionTtlSeconds: positiveInteger(
      environment.ACTION_TTL_SECONDS ?? '600',
      'ACTION_TTL_SECONDS',
    ),
    inviteLimit: positiveInteger(environment.INVITE_LIMIT ?? '20', 'INVITE_LIMIT'),
    metaConcurrency: positiveInteger(environment.META_CONCURRENCY ?? '2', 'META_CONCURRENCY'),
  };
}

export class DynamoState
  implements
    ConnectionRepository,
    ActionRepository,
    ConnectorUploadRepository,
    ResearchRepository,
    InviteRepository,
    DeletionRepository
{
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly options: DynamoStateOptions = {},
  ) {}

  async putConnection(record: ConnectionRecord): Promise<void> {
    await this.put({
      PK: userPk(record.userId),
      SK: `CONNECTION#${record.id}`,
      Type: 'Connection',
      ...record,
    });
  }

  async getConnection(
    userId: string,
    connectionId: string,
  ): Promise<ConnectionRecord | undefined> {
    return this.get<ConnectionRecord>(userPk(userId), `CONNECTION#${connectionId}`);
  }

  async listConnections(userId: string): Promise<ConnectionRecord[]> {
    return this.queryPrefix<ConnectionRecord>(userPk(userId), 'CONNECTION#');
  }

  async deleteConnection(userId: string, connectionId: string): Promise<void> {
    await this.delete(userPk(userId), `CONNECTION#${connectionId}`);
  }

  async putAction(record: PreparedActionRecord): Promise<void> {
    await this.put({
      PK: userPk(record.userId),
      SK: `ACTION#${record.id}`,
      Type: 'Action',
      ...record,
    });
  }

  async getAction(userId: string, actionId: string): Promise<PreparedActionRecord | undefined> {
    return this.get<PreparedActionRecord>(userPk(userId), `ACTION#${actionId}`);
  }

  async claimAction(
    userId: string,
    actionId: string,
    nowEpochSeconds: number,
  ): Promise<ActionClaim> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: `ACTION#${actionId}` },
          UpdateExpression: 'SET #status = :executing',
          ConditionExpression:
            'attribute_exists(PK) AND #status = :pending AND expiresAt > :now',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':executing': 'executing',
            ':pending': 'pending',
            ':now': nowEpochSeconds,
          },
        }),
      );
      return 'claimed';
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const record = await this.getAction(userId, actionId);
      if (!record) return 'missing';
      if (record.status === 'completed') return 'completed';
      if (record.status === 'executing') return 'executing';
      if (record.status === 'failed') return 'failed';
      if (record.expiresAt <= nowEpochSeconds) return 'expired';
      return 'executing';
    }
  }

  async completeAction(
    userId: string,
    actionId: string,
    completedAt: string,
    opaqueResourceIds: string[],
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `ACTION#${actionId}` },
        UpdateExpression:
          'SET #status = :completed, completedAt = :at, opaqueResourceIds = :ids',
        ConditionExpression: '#status = :executing',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':completed': 'completed',
          ':executing': 'executing',
          ':at': completedAt,
          ':ids': opaqueResourceIds,
        },
      }),
    );
  }

  async failAction(userId: string, actionId: string, failureCode: string): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `ACTION#${actionId}` },
        UpdateExpression: 'SET #status = :failed, failureCode = :code',
        ConditionExpression: '#status = :executing',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':failed': 'failed',
          ':executing': 'executing',
          ':code': failureCode,
        },
      }),
    );
  }

  async deleteActionsForUser(userId: string): Promise<void> {
    await this.deletePrefix(userPk(userId), 'ACTION#');
  }

  async putConnectorUpload(record: ConnectorUploadRecord): Promise<void> {
    await this.put({
      PK: userPk(record.userId),
      SK: `UPLOAD#${record.uploadId}`,
      Type: 'ConnectorUpload',
      ...record,
    });
  }

  async getConnectorUpload(
    userId: string,
    uploadId: string,
  ): Promise<ConnectorUploadRecord | undefined> {
    return this.get<ConnectorUploadRecord>(userPk(userId), `UPLOAD#${uploadId}`);
  }

  async deleteConnectorUploadsForUser(userId: string): Promise<void> {
    await this.deletePrefix(userPk(userId), 'UPLOAD#');
  }

  async putConsent(receipt: ConsentReceipt): Promise<void> {
    await this.put({
      PK: userPk(receipt.userId),
      SK: `CONSENT#${receipt.version}`,
      Type: 'Consent',
      ...receipt,
    });
  }

  async getConsent(userId: string, version: string): Promise<ConsentReceipt | undefined> {
    return this.get<ConsentReceipt>(userPk(userId), `CONSENT#${version}`);
  }

  async getBatch(userId: string, batchId: string): Promise<ResearchBatchMetadata | undefined> {
    return this.get<ResearchBatchMetadata>(userPk(userId), `BATCH#${batchId}`);
  }

  async listBatches(userId: string): Promise<ResearchBatchMetadata[]> {
    return this.queryPrefix<ResearchBatchMetadata>(userPk(userId), 'BATCH#');
  }

  async putBatchIfAbsent(
    batch: ResearchBatchMetadata,
  ): Promise<{ created: true } | { created: false; existing: ResearchBatchMetadata }> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: userPk(batch.userId),
            SK: `BATCH#${batch.batchId}`,
            Type: 'ResearchBatch',
            ...batch,
          },
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        }),
      );
      return { created: true };
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
      const existing = await this.getBatch(batch.userId, batch.batchId);
      if (!existing) {
        throw new Error('Research batch creation lost a conditional race without a record');
      }
      return { created: false, existing };
    }
  }

  async deleteResearchForUser(userId: string): Promise<void> {
    await this.deletePrefix(userPk(userId), 'BATCH#');
    await this.deletePrefix(userPk(userId), 'CONSENT#');
  }

  async getInvite(email: string): Promise<InviteRecord | undefined> {
    return this.get<InviteRecord>('ADMIN#INVITES', `EMAIL#${email}`);
  }

  async putInvite(record: InviteRecord): Promise<void> {
    await this.put({
      PK: 'ADMIN#INVITES',
      SK: `EMAIL#${record.email}`,
      Type: 'Invite',
      ...record,
    });
  }

  async listInvites(): Promise<InviteRecord[]> {
    return this.queryPrefix<InviteRecord>('ADMIN#INVITES', 'EMAIL#');
  }

  async countInvites(): Promise<number> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': 'ADMIN#INVITES', ':prefix': 'EMAIL#' },
        Select: 'COUNT',
        ConsistentRead: true,
      }),
    );
    return result.Count ?? 0;
  }

  async deleteInvitesForSubject(subject: string): Promise<void> {
    for (const invite of await this.listInvites()) {
      if (invite.subject === subject) {
        await this.delete('ADMIN#INVITES', `EMAIL#${invite.email}`);
      }
    }
  }

  async putDeletion(job: DeletionJob): Promise<void> {
    await this.put({
      PK: userPk(job.userId),
      SK: `DELETION#${job.id}`,
      Type: 'Deletion',
      ...job,
    });
  }

  async getDeletion(userId: string, jobId: string): Promise<DeletionJob | undefined> {
    return this.get<DeletionJob>(userPk(userId), `DELETION#${jobId}`);
  }

  async latestDeletion(userId: string): Promise<DeletionJob | undefined> {
    const records = await this.queryPrefix<DeletionJob>(userPk(userId), 'DELETION#');
    return records.sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0];
  }

  async transitionDeletion(
    userId: string,
    jobId: string,
    expected: readonly DeletionState[],
    next: DeletionState,
    updatedAt: string,
    failureCode?: string,
  ): Promise<boolean> {
    if (expected.length === 0) return false;
    const values: Record<string, unknown> = { ':next': next, ':updated': updatedAt };
    const expectedTokens = expected.map((state, index) => {
      values[`:expected${index}`] = state;
      return `:expected${index}`;
    });
    const update =
      failureCode === undefined
        ? 'SET #state = :next, updatedAt = :updated REMOVE failureCode'
        : 'SET #state = :next, updatedAt = :updated, failureCode = :failure';
    if (failureCode !== undefined) values[':failure'] = failureCode;
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: `DELETION#${jobId}` },
          UpdateExpression: update,
          ConditionExpression: `#state IN (${expectedTokens.join(', ')})`,
          ExpressionAttributeNames: { '#state': 'state' },
          ExpressionAttributeValues: values,
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  private async put(item: Record<string, unknown>): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  private async get<T>(PK: string, SK: string): Promise<T | undefined> {
    const result = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { PK, SK }, ConsistentRead: true }),
    );
    return result.Item as T | undefined;
  }

  private async delete(PK: string, SK: string): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { PK, SK } }));
  }

  private async queryPrefix<T>(PK: string, prefix: string): Promise<T[]> {
    const items: T[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        }),
      );
      items.push(...((result.Items ?? []) as T[]));
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items;
  }

  private async deletePrefix(PK: string, prefix: string): Promise<void> {
    const records = await this.queryRawKeys(PK, prefix);
    for (let offset = 0; offset < records.length; offset += 25) {
      const chunk = records.slice(offset, offset + 25);
      if (chunk.length === 0) continue;
      await this.deleteBatch(chunk);
    }
  }

  private async deleteBatch(records: Array<{ PK: string; SK: string }>): Promise<void> {
    const attempts = this.options.batchDeleteAttempts ?? DEFAULT_BATCH_DELETE_ATTEMPTS;
    const baseDelayMs =
      this.options.batchDeleteBaseDelayMs ?? DEFAULT_BATCH_DELETE_BASE_DELAY_MS;
    const sleep = this.options.sleep ?? delay;
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new Error('DynamoDB batch deletion requires at least one attempt');
    }
    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
      throw new Error('DynamoDB batch deletion requires a non-negative backoff');
    }

    let pending = records.map((record) => ({ DeleteRequest: { Key: record } }));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await this.client.send(
        new BatchWriteCommand({
          RequestItems: { [this.tableName]: pending },
        }),
      );
      const unprocessed = result.UnprocessedItems?.[this.tableName] ?? [];
      const nextPending: typeof pending = [];
      for (const request of unprocessed) {
        const key = request.DeleteRequest?.Key;
        if (typeof key?.PK !== 'string' || typeof key.SK !== 'string') {
          throw new Error('DynamoDB returned an invalid unprocessed deletion request');
        }
        nextPending.push({ DeleteRequest: { Key: { PK: key.PK, SK: key.SK } } });
      }
      pending = nextPending;
      if (pending.length === 0) return;
      if (attempt === attempts) break;
      const backoffMs = Math.min(baseDelayMs * 2 ** (attempt - 1), 1_000);
      await sleep(backoffMs);
    }
    throw new Error('DynamoDB batch deletion remained incomplete after bounded retries');
  }

  private async queryRawKeys(
    PK: string,
    prefix: string,
  ): Promise<Array<{ PK: string; SK: string }>> {
    const records: Array<{ PK: string; SK: string }> = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
          ProjectionExpression: 'PK, SK',
          ExclusiveStartKey: cursor,
          ConsistentRead: true,
        }),
      );
      records.push(
        ...((result.Items ?? []).filter(
          (item): item is { PK: string; SK: string } =>
            typeof item.PK === 'string' && typeof item.SK === 'string',
        ) as Array<{ PK: string; SK: string }>),
      );
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return records;
  }
}

export class S3ResearchObjects implements ResearchObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
    private readonly kmsKeyArn: string,
    private readonly options: S3ResearchObjectOptions = {},
  ) {}

  async putBatch(
    userId: string,
    batchId: string,
    sha256: string,
    body: Uint8Array,
  ): Promise<string> {
    const objectKey = researchKey(
      userId,
      `batches/${safeSegment(batchId)}/${safeSegment(sha256)}.json`,
    );
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: body,
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.kmsKeyArn,
      }),
    );
    return objectKey;
  }

  async deleteBatchObject(objectKey: string): Promise<void> {
    const attempts = this.options.deleteAttempts ?? DEFAULT_S3_DELETE_ATTEMPTS;
    const baseDelayMs = this.options.deleteBaseDelayMs ?? DEFAULT_S3_DELETE_BASE_DELAY_MS;
    const sleep = this.options.sleep ?? delay;
    const objects = (await this.listVersionedObjects(objectKey)).filter(
      ({ Key }) => Key === objectKey,
    );
    if (objects.length > 0) {
      await this.deleteVersionedObjects(objects, attempts, baseDelayMs, sleep);
    }
  }

  async createExport(
    userId: string,
    exportId: string,
    objectKeys: readonly string[],
  ): Promise<{ objectKey: string; downloadUrl: string }> {
    const chunks: Uint8Array[] = [];
    for (const objectKey of [...objectKeys].sort()) {
      if (!objectKey.startsWith(researchKey(userId, 'batches/'))) {
        throw new Error('Research metadata referenced an object outside the user batch prefix');
      }
      const fetched = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      );
      if (!fetched.Body) throw new Error('A claimed research batch object is missing');
      const bytes = await fetched.Body.transformToByteArray();
      chunks.push(bytes, Buffer.from('\n'));
      if (chunks.reduce((total, chunk) => total + chunk.byteLength, 0) > 64 * 1024 * 1024) {
        throw new CloudError(
          413,
          'research_export_too_large',
          'Research export exceeds the alpha export limit',
        );
      }
    }
    const objectKey = researchKey(userId, `exports/${safeSegment(exportId)}.jsonl`);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: Buffer.concat(chunks),
        ContentType: 'application/x-ndjson',
        ContentDisposition: `attachment; filename="sia-research-${safeSegment(exportId)}.jsonl"`,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.kmsKeyArn,
      }),
    );
    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      { expiresIn: 15 * 60 },
    );
    return { objectKey, downloadUrl };
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const prefix = researchKey(userId, '');
    const attempts = this.options.deleteAttempts ?? DEFAULT_S3_DELETE_ATTEMPTS;
    const baseDelayMs = this.options.deleteBaseDelayMs ?? DEFAULT_S3_DELETE_BASE_DELAY_MS;
    const sleep = this.options.sleep ?? delay;
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new Error('S3 research deletion requires at least one attempt');
    }
    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) {
      throw new Error('S3 research deletion requires a non-negative backoff');
    }

    for (let sweep = 1; sweep <= attempts; sweep += 1) {
      const objects = await this.listVersionedObjects(prefix);
      if (objects.length === 0) return;
      for (let offset = 0; offset < objects.length; offset += 1_000) {
        await this.deleteVersionedObjects(
          objects.slice(offset, offset + 1_000),
          attempts,
          baseDelayMs,
          sleep,
        );
      }

      // A successful DeleteObjects response is not enough: re-list the versioned
      // prefix so the deletion worker cannot mark a job complete while data remains.
      if ((await this.listVersionedObjects(prefix)).length === 0) return;
      if (sweep < attempts) {
        await sleep(Math.min(baseDelayMs * 2 ** (sweep - 1), 1_000));
      }
    }
    throw new Error('S3 research deletion remained incomplete after bounded retries');
  }

  private async listVersionedObjects(
    prefix: string,
  ): Promise<Array<{ Key: string; VersionId: string }>> {
    const objects: Array<{ Key: string; VersionId: string }> = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    do {
      const versions = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.bucketName,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }),
      );
      for (const entry of [...(versions.Versions ?? []), ...(versions.DeleteMarkers ?? [])]) {
        if (typeof entry.Key !== 'string' || typeof entry.VersionId !== 'string') {
          throw new Error('S3 returned an invalid versioned research object');
        }
        objects.push({ Key: entry.Key, VersionId: entry.VersionId });
      }
      if (versions.IsTruncated !== true) break;
      if (!versions.NextKeyMarker && !versions.NextVersionIdMarker) {
        throw new Error('S3 truncated a research object listing without a continuation marker');
      }
      if (
        versions.NextKeyMarker === keyMarker &&
        versions.NextVersionIdMarker === versionIdMarker
      ) {
        throw new Error('S3 repeated a research object continuation marker');
      }
      keyMarker = versions.NextKeyMarker;
      versionIdMarker = versions.NextVersionIdMarker;
    } while (true);
    return objects;
  }

  private async deleteVersionedObjects(
    objects: Array<{ Key: string; VersionId: string }>,
    attempts: number,
    baseDelayMs: number,
    sleep: (milliseconds: number) => Promise<void>,
  ): Promise<void> {
    let pending = objects;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: { Objects: pending, Quiet: true },
        }),
      );
      const requested = new Map(
        pending.map((object) => [versionedObjectId(object.Key, object.VersionId), object]),
      );
      const nextPending: Array<{ Key: string; VersionId: string }> = [];
      const seen = new Set<string>();
      for (const error of result.Errors ?? []) {
        if (typeof error.Key !== 'string' || typeof error.VersionId !== 'string') {
          throw new Error('S3 returned an invalid failed research object deletion');
        }
        const id = versionedObjectId(error.Key, error.VersionId);
        const object = requested.get(id);
        if (!object || seen.has(id)) {
          throw new Error('S3 returned an unrecognized failed research object deletion');
        }
        seen.add(id);
        nextPending.push(object);
      }
      pending = nextPending;
      if (pending.length === 0) return;
      if (attempt < attempts) {
        await sleep(Math.min(baseDelayMs * 2 ** (attempt - 1), 1_000));
      }
    }
    throw new Error('S3 research object deletion remained incomplete after bounded retries');
  }
}

export class AwsDeletionQueue implements DeletionQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}
  async enqueue(job: { id: string; userId: string; scope: DeletionScope }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(job) }),
    );
  }
}

export class CognitoIdentity implements IdentityProvider {
  constructor(
    private readonly client: CognitoIdentityProviderClient,
    private readonly userPoolId: string,
  ) {}
  async createPasswordlessUser(email: string): Promise<{ subject: string }> {
    const result = await this.client.send(
      new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        DesiredDeliveryMediums: ['EMAIL'],
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    );
    const subject = result.User?.Attributes?.find(
      (attribute) => attribute.Name === 'sub',
    )?.Value;
    if (!subject)
      throw new CloudError(
        502,
        'identity_create_failed',
        'The invite could not be created',
        true,
      );
    return { subject };
  }
  async deleteUser(subject: string): Promise<void> {
    const result = await this.client.send(
      new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Filter: `sub = "${subject.replaceAll('"', '')}"`,
        Limit: 1,
      }),
    );
    const username = result.Users?.[0]?.Username;
    if (!username) return;
    await this.client.send(
      new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username }),
    );
  }
}

export class SecretsManagerProvider implements SecretProvider {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  constructor(
    private readonly client: SecretsManagerClient,
    private readonly metaSecretArn: string,
    private readonly composioSecretArn: string,
    private readonly cacheMilliseconds = 60_000,
  ) {}

  async meta(): Promise<MetaConfig> {
    const value = await this.read(this.metaSecretArn);
    return parseMetaConfig(value);
  }

  async composio(): Promise<ComposioConfig> {
    const value = await this.read(this.composioSecretArn);
    return parseComposioConfig(value);
  }

  private async read(secretId: string): Promise<unknown> {
    const cached = this.cache.get(secretId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const text =
      result.SecretString ??
      (result.SecretBinary ? Buffer.from(result.SecretBinary).toString('utf8') : undefined);
    if (!text)
      throw new CloudError(
        503,
        'secret_unavailable',
        'Provider configuration is unavailable',
        true,
      );
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new CloudError(503, 'secret_invalid', 'Provider configuration is invalid', false);
    }
    this.cache.set(secretId, { expiresAt: Date.now() + this.cacheMilliseconds, value });
    return value;
  }
}

export class ComposioConnector implements ConnectorProvider {
  constructor(private readonly secrets: SecretProvider) {}

  async beginConnection(
    userId: string,
    app: AppId,
    callbackUrl?: string,
  ): Promise<ConnectorLink> {
    const config = await this.secrets.composio();
    const body = await composioRequest(config, 'POST', '/api/v3.1/connected_accounts/link', {
      auth_config_id: config.authConfigIds[app],
      user_id: userId,
      ...(callbackUrl === undefined ? {} : { callback_url: callbackUrl }),
    });
    return {
      connectionId: stringField(body, 'connected_account_id'),
      redirectUrl: httpsUrlField(body, 'redirect_url'),
      expiresAt: stringField(body, 'expires_at'),
    };
  }

  async connectionStatus(connectionId: string): Promise<ConnectorStatus> {
    const config = await this.secrets.composio();
    const body = await composioRequest(
      config,
      'GET',
      `/api/v3.1/connected_accounts/${encodeURIComponent(connectionId)}`,
    );
    const rawStatus = String(body.status ?? '').toUpperCase();
    const status: ConnectorStatus['status'] =
      rawStatus === 'ACTIVE' || rawStatus === 'CONNECTED'
        ? 'connected'
        : rawStatus === 'INITIALIZING' || rawStatus === 'INITIATED' || rawStatus === 'PENDING'
          ? 'link_pending'
          : rawStatus === 'DISABLED' || rawStatus === 'REVOKED'
            ? 'disconnected'
            : 'failed';
    const label =
      typeof body.account_display_name === 'string' ? body.account_display_name : undefined;
    return { status, ...(label === undefined ? {} : { accountLabel: label }) };
  }

  async disconnect(connectionId: string): Promise<void> {
    const config = await this.secrets.composio();
    const encodedConnectionId = encodeURIComponent(connectionId);
    try {
      await composioRequest(
        config,
        'POST',
        `/api/v3.1/connected_accounts/${encodedConnectionId}/revoke`,
        undefined,
        {},
        [404, 410],
      );
    } catch (error) {
      if (!(error instanceof ConnectorUpstreamHttpError) || error.upstreamStatus !== 409) {
        throw error;
      }

      const account = await composioRequest(
        config,
        'GET',
        `/api/v3.1/connected_accounts/${encodedConnectionId}`,
        undefined,
        {},
        [404, 410],
      );
      const status = String(account.status ?? '').toUpperCase();
      if (!['INITIALIZING', 'INITIATED', 'PENDING', 'FAILED', 'EXPIRED'].includes(status)) {
        throw error;
      }
    }
    await composioRequest(
      config,
      'DELETE',
      `/api/v3.1/connected_accounts/${encodedConnectionId}`,
      undefined,
      {},
      [404, 410],
    );
  }

  async requestFileUpload(
    tool: 'drive.upload',
    fileName: string,
    mimeType: string,
    md5: string,
  ): Promise<ConnectorFileUploadGrant> {
    const config = await this.secrets.composio();
    assertComposioContract(config, tool);
    const body = await composioRequest(config, 'POST', '/api/v3.1/files/upload/request', {
      toolkit_slug: 'googledrive',
      tool_slug: config.toolSlugs[tool],
      filename: fileName,
      mimetype: mimeType,
      md5,
    });
    const uploadUrlField =
      typeof body.new_presigned_url === 'string' ? 'new_presigned_url' : 'newPresignedUrl';
    return {
      providerKey: stringField(body, 'key'),
      uploadUrl: httpsUrlField(body, uploadUrlField),
    };
  }

  async execute(
    userId: string,
    connectionId: string,
    tool: ToolName,
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<ConnectorExecution> {
    const config = await this.secrets.composio();
    assertComposioContract(config, tool);
    const slug = config.toolSlugs[tool];
    const body = await composioRequest(
      config,
      'POST',
      `/api/v3/tools/execute/${encodeURIComponent(slug)}`,
      {
        connected_account_id: connectionId,
        user_id: userId,
        version: config.toolVersion,
        arguments: input,
      },
      { 'Idempotency-Key': idempotencyKey },
    );
    if (body.successful === false)
      throw new CloudError(
        502,
        'connector_execution_failed',
        'Connected app action failed',
        true,
      );
    const requestId = typeof body.log_id === 'string' ? body.log_id : undefined;
    return {
      data: body.data,
      ...(requestId === undefined ? {} : { providerRequestId: requestId }),
    };
  }
}

export class OpenAiCompatibleMetaProvider implements MetaProvider {
  async *stream(config: MetaConfig, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent> {
    const endpoint = new URL('chat/completions', ensureTrailingSlash(config.endpoint));
    if (endpoint.protocol !== 'https:')
      throw new CloudError(503, 'meta_config_invalid', 'Meta endpoint must use HTTPS');
    const sessionId = request.sessionId ?? randomUUID();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
        [config.sessionHeader ?? 'x-session-id']: sessionId,
      },
      body: JSON.stringify({
        model: request.model ?? config.model,
        messages: request.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(request.tools === undefined ? {} : { tools: request.tools, tool_choice: 'auto' }),
      }),
    });
    if (!response.ok || !response.body) {
      throw new CloudError(
        502,
        'meta_upstream_error',
        `Meta returned HTTP ${response.status}`,
        response.status >= 500,
      );
    }
    yield {
      type: 'started',
      turnId: request.turnId,
      sessionId: response.headers.get(config.sessionHeader ?? 'x-session-id') ?? sessionId,
      model: request.model ?? config.model,
    };
    let finishReason: string | undefined;
    for await (const data of sseData(response.body)) {
      if (data === '[DONE]') {
        yield { type: 'done', ...(finishReason === undefined ? {} : { finishReason }) };
        return;
      }
      let chunk: unknown;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (!isRecord(chunk)) continue;
      if (isRecord(chunk.usage)) yield { type: 'usage', usage: chunk.usage };
      const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
      for (const choice of choices) {
        if (!isRecord(choice)) continue;
        const delta = isRecord(choice.delta) ? choice.delta : undefined;
        if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
          yield { type: 'delta', text: delta.content };
        }
        if (delta && delta.tool_calls !== undefined) {
          yield { type: 'tool_call_delta', delta: delta.tool_calls };
        }
        if (typeof choice.finish_reason === 'string') {
          finishReason = choice.finish_reason;
        }
      }
    }
    yield { type: 'done', ...(finishReason === undefined ? {} : { finishReason }) };
  }
}

export class DynamoMetaQuota implements QuotaGate {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly limit: number,
  ) {}
  async acquireMeta(userId: string): Promise<ConcurrencyLease> {
    const key = { PK: userPk(userId), SK: 'QUOTA#META' };
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: key,
          UpdateExpression:
            'SET active = if_not_exists(active, :zero) + :one, expiresAt = :ttl',
          ConditionExpression: 'attribute_not_exists(active) OR active < :limit',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':limit': this.limit,
            ':ttl': Math.floor(Date.now() / 1000) + 15 * 60,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new CloudError(429, 'meta_concurrency_limit', 'Too many active Meta turns', true);
      }
      throw error;
    }
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        try {
          await this.client.send(
            new UpdateCommand({
              TableName: this.tableName,
              Key: key,
              UpdateExpression: 'ADD active :minusOne',
              ConditionExpression: 'active > :zero',
              ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
            }),
          );
        } catch (error) {
          if (!(error instanceof ConditionalCheckFailedException)) throw error;
        }
      },
    };
  }
}

export class MetadataAuditSink implements AuditSink {
  async write(event: AuditEvent): Promise<void> {
    // Deliberately metadata-only: never add request bodies or provider responses here.
    console.info(JSON.stringify({ logType: 'audit', ...event }));
  }
}

export function createAwsDependencies(config = loadRuntimeConfig()): ServiceDependencies {
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const state = new DynamoState(documentClient, config.tableName);
  const secrets = new SecretsManagerProvider(
    new SecretsManagerClient({}),
    config.metaSecretArn,
    config.composioSecretArn,
  );
  return {
    clock: new SystemClock(),
    ids: { next: () => randomUUID() },
    connections: state,
    connector: new ComposioConnector(secrets),
    connectorUploads: state,
    actions: state,
    research: state,
    researchObjects: new S3ResearchObjects(
      new S3Client({}),
      config.bucketName,
      config.kmsKeyArn,
    ),
    invites: state,
    identity: new CognitoIdentity(new CognitoIdentityProviderClient({}), config.userPoolId),
    deletions: state,
    deletionQueue: new AwsDeletionQueue(new SQSClient({}), config.deletionQueueUrl),
    secrets,
    metaProvider: new OpenAiCompatibleMetaProvider(),
    quota: new DynamoMetaQuota(documentClient, config.tableName, config.metaConcurrency),
    audit: new MetadataAuditSink(),
    config: {
      actionTtlSeconds: config.actionTtlSeconds,
      consentVersion: config.consentVersion,
      inviteLimit: config.inviteLimit,
    },
  };
}

function userPk(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

function safeSegment(value: string): string {
  return encodeURIComponent(value).replaceAll('%', '_');
}

function researchKey(userId: string, suffix: string): string {
  return `users/${safeSegment(userId)}/${suffix}`;
}

function versionedObjectId(key: string, versionId: string): string {
  return `${key}\u0000${versionId}`;
}

function requiredEnv(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseMetaConfig(value: unknown): MetaConfig {
  if (!isRecord(value))
    throw new CloudError(503, 'secret_invalid', 'Meta configuration is invalid');
  const allowedModels = Array.isArray(value.allowedModels)
    ? value.allowedModels.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    apiKey: secretString(value.apiKey),
    endpoint: configString(value.endpoint, 'endpoint'),
    model: configString(value.model, 'model'),
    enabled: value.enabled === true,
    ...(typeof value.sessionHeader === 'string' ? { sessionHeader: value.sessionHeader } : {}),
    ...(allowedModels === undefined ? {} : { allowedModels }),
  };
}

function parseComposioConfig(value: unknown): ComposioConfig {
  if (!isRecord(value) || !isRecord(value.authConfigIds) || !isRecord(value.toolSlugs)) {
    throw new CloudError(503, 'secret_invalid', 'Composio configuration is invalid');
  }
  const authConfigIdsValue = value.authConfigIds;
  const toolSlugsValue = value.toolSlugs;
  const authConfigIds = Object.fromEntries(
    APP_IDS.map((app) => [app, configString(authConfigIdsValue[app], `authConfigIds.${app}`)]),
  ) as Record<AppId, string>;
  const toolSlugs = Object.fromEntries(
    (Object.keys(TOOL_POLICIES) as ToolName[]).map((tool) => [
      tool,
      configString(toolSlugsValue[tool], `toolSlugs.${tool}`),
    ]),
  ) as Record<ToolName, string>;
  const config: ComposioConfig = {
    apiKey: secretString(value.apiKey),
    baseUrl: configString(value.baseUrl, 'baseUrl'),
    authConfigIds,
    toolSlugs,
    toolVersion: configString(value.toolVersion, 'toolVersion'),
  };
  assertComposioContract(config);
  return config;
}

function secretString(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.startsWith('REPLACE')) {
    throw new CloudError(
      503,
      'provider_not_configured',
      'Provider credentials have not been configured',
    );
  }
  return value;
}

function configString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudError(503, 'secret_invalid', `Provider ${label} is missing`);
  }
  return value;
}

async function composioRequest(
  config: ComposioConfig,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
  acceptedStatuses: readonly number[] = [],
): Promise<Record<string, unknown>> {
  const base = ensureTrailingSlash(config.baseUrl);
  const url = new URL(path.replace(/^\//, ''), base);
  if (url.protocol !== 'https:' || url.origin !== new URL(base).origin) {
    throw new CloudError(
      503,
      'connector_config_invalid',
      'Connector endpoint must use configured HTTPS origin',
    );
  }
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    // Never read or log the upstream error body; it may contain user data.
    throw new ConnectorUpstreamHttpError(response.status);
  }
  if (response.status === 204 || acceptedStatuses.includes(response.status)) return {};
  const parsed: unknown = await response.json();
  if (!isRecord(parsed))
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app returned invalid data',
    );
  return parsed;
}

class ConnectorUpstreamHttpError extends CloudError {
  constructor(readonly upstreamStatus: number) {
    super(
      502,
      'connector_upstream_error',
      `Connected app provider returned HTTP ${upstreamStatus}`,
      upstreamStatus === 429 || upstreamStatus >= 500,
    );
  }
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudError(502, 'connector_invalid_response', `Connected app omitted ${field}`);
  }
  return value;
}

function httpsUrlField(record: Record<string, unknown>, field: string): string {
  const value = stringField(record, field);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app returned an invalid URL',
    );
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new CloudError(
      502,
      'connector_invalid_response',
      'Connected app URL must use clean HTTPS',
    );
  }
  return value;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

async function* sseData(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of Readable.fromWeb(stream as never)) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    buffer = buffer.replaceAll('\r\n', '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary).replaceAll('\r', '');
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data.length > 0) yield data;
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
