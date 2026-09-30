import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { CloudError } from '../domain.js';
import type {
  ConcurrencyLease,
  DailyQuotaWindow,
  MetaQuotaPolicy,
  MetaTokenUsage,
  MetaUsageSnapshot,
  QuotaGate,
  VoiceTokenQuotaPolicy,
} from '../ports.js';
import { userPk } from './shared.js';

export class DynamoMetaQuota implements QuotaGate {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly limit: number,
  ) {}
  async acquireMeta(userId: string, policy: MetaQuotaPolicy): Promise<ConcurrencyLease> {
    const lease = await this.acquireConcurrency(userId);
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: `USAGE#META#${policy.period}` },
          UpdateExpression:
            'SET #type = if_not_exists(#type, :type), expiresAt = :ttl ADD #requests :one',
          ConditionExpression:
            '(attribute_not_exists(#requests) OR #requests < :requestLimit) AND (attribute_not_exists(#totalTokens) OR #totalTokens < :tokenLimit)',
          ExpressionAttributeNames: {
            '#type': 'Type',
            '#requests': 'requests',
            '#totalTokens': 'totalTokens',
          },
          ExpressionAttributeValues: {
            ':type': 'MetaDailyUsage',
            ':ttl': policy.expiresAt,
            ':one': 1,
            ':requestLimit': policy.requestLimit,
            ':tokenLimit': policy.tokenLimit,
          },
        }),
      );
      return lease;
    } catch (error) {
      await lease.release();
      if (error instanceof ConditionalCheckFailedException) {
        throw new CloudError(
          429,
          'hosted_model_daily_limit',
          'The daily hosted model allowance has been reached',
          true,
        );
      }
      throw error;
    }
  }

  async getMetaUsage(userId: string, period: string): Promise<MetaUsageSnapshot> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `USAGE#META#${period}` },
        ConsistentRead: true,
      }),
    );
    return {
      requests: safeCounter(result.Item?.requests),
      inputTokens: safeCounter(result.Item?.inputTokens),
      outputTokens: safeCounter(result.Item?.outputTokens),
      totalTokens: safeCounter(result.Item?.totalTokens),
    };
  }

  async recordMetaUsage(
    userId: string,
    window: DailyQuotaWindow,
    usage: MetaTokenUsage,
  ): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `USAGE#META#${window.period}` },
        UpdateExpression:
          'SET #type = if_not_exists(#type, :type), expiresAt = :ttl ADD #inputTokens :input, #outputTokens :output, #totalTokens :total',
        ExpressionAttributeNames: {
          '#type': 'Type',
          '#inputTokens': 'inputTokens',
          '#outputTokens': 'outputTokens',
          '#totalTokens': 'totalTokens',
        },
        ExpressionAttributeValues: {
          ':type': 'MetaDailyUsage',
          ':ttl': window.expiresAt,
          ':input': usage.inputTokens,
          ':output': usage.outputTokens,
          ':total': usage.totalTokens,
        },
      }),
    );
  }

  async consumeVoiceToken(userId: string, policy: VoiceTokenQuotaPolicy): Promise<void> {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { PK: userPk(userId), SK: `USAGE#VOICE#${policy.period}` },
          UpdateExpression:
            'SET #type = if_not_exists(#type, :type), expiresAt = :ttl ADD #tokenMints :one',
          ConditionExpression:
            'attribute_not_exists(#tokenMints) OR #tokenMints < :tokenMintLimit',
          ExpressionAttributeNames: { '#type': 'Type', '#tokenMints': 'tokenMints' },
          ExpressionAttributeValues: {
            ':type': 'VoiceDailyUsage',
            ':ttl': policy.expiresAt,
            ':one': 1,
            ':tokenMintLimit': policy.tokenMintLimit,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new CloudError(
          429,
          'voice_token_daily_limit',
          'The daily voice token allowance has been reached',
          true,
        );
      }
      throw error;
    }
  }

  async getVoiceTokenUsage(userId: string, period: string): Promise<number> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `USAGE#VOICE#${period}` },
        ConsistentRead: true,
      }),
    );
    return safeCounter(result.Item?.tokenMints);
  }

  async deleteUserUsage(userId: string): Promise<void> {
    for (const prefix of ['USAGE#', 'QUOTA#']) {
      let cursor: Record<string, unknown> | undefined;
      do {
        const result = await this.client.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: { ':pk': userPk(userId), ':prefix': prefix },
            ProjectionExpression: 'PK, SK',
            ExclusiveStartKey: cursor,
            ConsistentRead: true,
          }),
        );
        for (const item of result.Items ?? []) {
          if (typeof item.PK === 'string' && typeof item.SK === 'string') {
            await this.client.send(
              new DeleteCommand({
                TableName: this.tableName,
                Key: { PK: item.PK, SK: item.SK },
              }),
            );
          }
        }
        cursor = result.LastEvaluatedKey;
      } while (cursor);
    }
  }

  private async acquireConcurrency(userId: string): Promise<ConcurrencyLease> {
    const key = { PK: userPk(userId), SK: 'QUOTA#META' };
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 15 * 60;
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
            ':ttl': expiresAt,
          },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        try {
          await this.client.send(
            new UpdateCommand({
              TableName: this.tableName,
              Key: key,
              UpdateExpression: 'SET active = :one, expiresAt = :ttl',
              ConditionExpression: 'expiresAt < :now',
              ExpressionAttributeValues: {
                ':one': 1,
                ':ttl': expiresAt,
                ':now': now,
              },
            }),
          );
        } catch (resetError) {
          if (resetError instanceof ConditionalCheckFailedException) {
            throw new CloudError(
              429,
              'meta_concurrency_limit',
              'Too many active Meta turns',
              true,
            );
          }
          throw resetError;
        }
      } else {
        throw error;
      }
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

function safeCounter(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
