import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type {
  RatingAggregate,
  RatingAggregateKey,
  RatingRepository,
  StoredTaskRating,
} from '../ports.js';
import { userPk } from './shared.js';

const labPk = (labId: string) => `LAB#${labId}`;
const ratingSk = (rating: Pick<StoredTaskRating, 'day' | 'model' | 'harnessId' | 'id'>) =>
  `RATING#${rating.day}#${rating.model}#${rating.harnessId}#${rating.id}`;
const aggregateSk = (key: Pick<RatingAggregateKey, 'day' | 'model' | 'harnessId'>) =>
  `RATING_DAY#${key.day}#${key.model}#${key.harnessId}`;
/** Counter names are a fixed vocabulary from `ratingCounters`; anything else is refused. */
const COUNTER_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/**
 * Ratings live in the lab's partition of the control table, next to its usage report:
 * `LAB#<lab> / RATING#<day>#<model>#<harness>#<id>` for each rating and
 * `LAB#<lab> / RATING_DAY#<day>#<model>#<harness>` for the daily counters.
 */
export class DynamoRatings implements RatingRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async consumeRatingLimit(
    userId: string,
    windowStart: number,
    expiresAt: number,
    limit: number,
  ): Promise<boolean> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: userPk(userId), SK: `RATE#RATING#${windowStart}` },
        UpdateExpression:
          'SET #type = if_not_exists(#type, :type), expiresAt = :expiresAt ADD requestCount :one',
        ExpressionAttributeNames: { '#type': 'Type' },
        ExpressionAttributeValues: {
          ':type': 'RatingRateLimit',
          ':expiresAt': expiresAt,
          ':one': 1,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    const count = result.Attributes?.requestCount;
    return typeof count === 'number' && count <= limit;
  }

  async putRating(
    rating: StoredTaskRating,
    expiresAt: number,
  ): Promise<StoredTaskRating | undefined> {
    const result = await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: labPk(rating.labId),
          SK: ratingSk(rating),
          Type: 'TaskRating',
          rating,
          expiresAt,
        },
        ReturnValues: 'ALL_OLD',
      }),
    );
    return result.Attributes?.rating as StoredTaskRating | undefined;
  }

  async addRatingCounters(
    key: RatingAggregateKey,
    deltas: Record<string, number>,
    expiresAt: number,
  ): Promise<void> {
    const names: Record<string, string> = {
      '#type': 'Type',
      '#labName': 'labName',
      '#provider': 'provider',
      '#model': 'model',
      '#harness': 'harnessId',
      '#day': 'day',
    };
    const values: Record<string, unknown> = {
      ':type': 'RatingDailyAggregate',
      ':labName': key.labName,
      ':provider': key.provider,
      ':model': key.model,
      ':harness': key.harnessId,
      ':day': key.day,
      ':ttl': expiresAt,
    };
    const adds: string[] = [];
    Object.entries(deltas).forEach(([name, value], index) => {
      if (!COUNTER_NAME.test(name) || !Number.isFinite(value)) return;
      names[`#c${index}`] = `c_${name}`;
      values[`:c${index}`] = value;
      adds.push(`#c${index} :c${index}`);
    });
    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: labPk(key.labId), SK: aggregateSk(key) },
        UpdateExpression: `SET #type = if_not_exists(#type, :type), #labName = :labName, #provider = :provider, #model = :model, #harness = :harness, #day = :day, expiresAt = :ttl${
          adds.length ? ` ADD ${adds.join(', ')}` : ''
        }`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  }

  async listRatingAggregates(
    labId: string,
    fromDay: string,
    toDay: string,
  ): Promise<RatingAggregate[]> {
    const rows: RatingAggregate[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to',
          ExpressionAttributeValues: {
            ':pk': labPk(labId),
            ':from': `RATING_DAY#${fromDay}`,
            ':to': `RATING_DAY#${toDay}#￿`,
          },
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      for (const item of page.Items ?? []) {
        const counters: Record<string, number> = {};
        for (const [name, value] of Object.entries(item))
          if (name.startsWith('c_') && typeof value === 'number')
            counters[name.slice(2)] = value;
        rows.push({
          labId,
          labName: String(item.labName ?? labId),
          provider: item.provider as RatingAggregate['provider'],
          day: String(item.day),
          model: String(item.model),
          harnessId: String(item.harnessId),
          counters,
        });
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return rows;
  }
}
