import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  ActionClaim,
  ActionRepository,
  ConnectionRecord,
  ConnectionRepository,
  ConnectorUploadRecord,
  ConnectorUploadRepository,
  ConsentReceipt,
  DeletionJob,
  DeletionRepository,
  DeletionState,
  GoogleCredentialRepository,
  GoogleOAuthStateRecord,
  GoogleTokenRecord,
  InviteRecord,
  InviteRepository,
  PreparedActionRecord,
  RegistrationRateLimitRepository,
  ResearchBatchMetadata,
  ResearchExportJob,
  ResearchExportRepository,
  ResearchExportState,
  ResearchRepository,
} from '../ports.js';
import { delay, safeSegment, userPk } from './shared.js';

const DEFAULT_BATCH_DELETE_ATTEMPTS = 8;

const DEFAULT_BATCH_DELETE_BASE_DELAY_MS = 25;

export interface DynamoStateOptions {
  batchDeleteAttempts?: number;
  batchDeleteBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class DynamoState
  implements
    ConnectionRepository,
    ActionRepository,
    ConnectorUploadRepository,
    ResearchRepository,
    ResearchExportRepository,
    InviteRepository,
    RegistrationRateLimitRepository,
    DeletionRepository,
    GoogleCredentialRepository
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

  async putGoogleOAuthState(record: GoogleOAuthStateRecord): Promise<void> {
    await this.put({
      PK: `GOOGLE_OAUTH_STATE#${record.stateHash}`,
      SK: 'STATE',
      Type: 'GoogleOAuthState',
      ...record,
    });
  }

  async consumeGoogleOAuthState(
    stateHash: string,
  ): Promise<GoogleOAuthStateRecord | undefined> {
    const result = await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: `GOOGLE_OAUTH_STATE#${stateHash}`, SK: 'STATE' },
        ReturnValues: 'ALL_OLD',
      }),
    );
    return result.Attributes as GoogleOAuthStateRecord | undefined;
  }

  async putGoogleToken(record: GoogleTokenRecord): Promise<void> {
    await this.put({
      PK: `GOOGLE_CONNECTION#${record.connectionId}`,
      SK: 'TOKEN',
      Type: 'GoogleToken',
      ...record,
    });
  }

  async getGoogleToken(connectionId: string): Promise<GoogleTokenRecord | undefined> {
    return this.get<GoogleTokenRecord>(`GOOGLE_CONNECTION#${connectionId}`, 'TOKEN');
  }

  async deleteGoogleToken(connectionId: string): Promise<void> {
    await this.delete(`GOOGLE_CONNECTION#${connectionId}`, 'TOKEN');
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

  async listAllBatches(): Promise<ResearchBatchMetadata[]> {
    const records: ResearchBatchMetadata[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: { ':pk': 'RESEARCH#BATCHES' },
          ...(cursor ? { ExclusiveStartKey: cursor } : {}),
        }),
      );
      records.push(...((result.Items ?? []) as ResearchBatchMetadata[]));
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return records;
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
            GSI1PK: 'RESEARCH#BATCHES',
            GSI1SK: `${batch.createdAt}#${safeSegment(batch.userId)}#${safeSegment(batch.batchId)}`,
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

  async putResearchExport(job: ResearchExportJob): Promise<void> {
    await this.put({
      PK: userPk(job.userId),
      SK: `EXPORT#${job.id}`,
      Type: 'ResearchExport',
      ...job,
    });
  }

  async getResearchExport(
    userId: string,
    exportId: string,
  ): Promise<ResearchExportJob | undefined> {
    return this.get<ResearchExportJob>(userPk(userId), `EXPORT#${exportId}`);
  }

  async transitionResearchExport(
    userId: string,
    exportId: string,
    expected: readonly ResearchExportState[],
    next: ResearchExportState,
    updatedAt: string,
    detail: { objectKey?: string; failureCode?: string } = {},
  ): Promise<boolean> {
    if (expected.length === 0) return false;
    const values: Record<string, unknown> = { ':next': next, ':updated': updatedAt };
    const expectedTokens = expected.map((state, index) => {
      values[`:expected${index}`] = state;
      return `:expected${index}`;
    });
    const set = ['#state = :next', 'updatedAt = :updated'];
    const remove = ['objectKey', 'failureCode'];
    if (detail.objectKey) {
      values[':objectKey'] = detail.objectKey;
      set.push('objectKey = :objectKey');
      remove.splice(remove.indexOf('objectKey'), 1);
    }
    if (detail.failureCode) {
      values[':failureCode'] = detail.failureCode;
      set.push('failureCode = :failureCode');
      remove.splice(remove.indexOf('failureCode'), 1);
    }
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: `EXPORT#${exportId}` },
          UpdateExpression: `SET ${set.join(', ')}${remove.length ? ` REMOVE ${remove.join(', ')}` : ''}`,
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

  async deleteResearchExportsForUser(userId: string): Promise<void> {
    await this.deletePrefix(userPk(userId), 'EXPORT#');
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
        FilterExpression: 'invitedBy <> :selfRegistration',
        ExpressionAttributeValues: {
          ':pk': 'ADMIN#INVITES',
          ':prefix': 'EMAIL#',
          ':selfRegistration': 'self-registration',
        },
        Select: 'COUNT',
        ConsistentRead: true,
      }),
    );
    return result.Count ?? 0;
  }

  async consumeRegistrationLimit(
    kind: 'email' | 'network',
    fingerprint: string,
    windowStart: number,
    expiresAt: number,
    limit: number,
  ): Promise<boolean> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `REGISTRATION_RATE#${kind}#${fingerprint}`,
          SK: `WINDOW#${windowStart}`,
        },
        UpdateExpression:
          'SET #type = if_not_exists(#type, :type), expiresAt = :expiresAt ADD requestCount :one',
        ExpressionAttributeNames: { '#type': 'Type' },
        ExpressionAttributeValues: {
          ':type': 'RegistrationRateLimit',
          ':expiresAt': expiresAt,
          ':one': 1,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const count = result.Attributes?.requestCount;
    return typeof count === 'number' && count <= limit;
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
