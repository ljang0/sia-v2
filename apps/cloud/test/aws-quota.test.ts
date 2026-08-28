import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { DynamoMetaQuota } from '../src/aws.js';
import { CloudError } from '../src/domain.js';

describe('Dynamo hosted-service quotas', () => {
  it('reserves concurrency and a UTC-day request before admitting a model turn', async () => {
    const updates: UpdateCommand[] = [];
    const client = {
      async send(command: unknown) {
        assert.ok(command instanceof UpdateCommand);
        updates.push(command);
        return {};
      },
    } as unknown as DynamoDBDocumentClient;
    const quota = new DynamoMetaQuota(client, 'table', 2);

    const lease = await quota.acquireMeta('user-1', {
      period: '2026-08-26',
      expiresAt: 123456,
      requestLimit: 100,
      tokenLimit: 250_000,
    });
    await lease.release();

    assert.equal(updates.length, 3);
    assert.deepEqual(updates[0]?.input.Key, { PK: 'USER#user-1', SK: 'QUOTA#META' });
    assert.deepEqual(updates[1]?.input.Key, {
      PK: 'USER#user-1',
      SK: 'USAGE#META#2026-08-26',
    });
    assert.match(updates[1]?.input.ConditionExpression ?? '', /requestLimit/);
    assert.match(updates[1]?.input.ConditionExpression ?? '', /tokenLimit/);
    assert.deepEqual(updates[2]?.input.Key, { PK: 'USER#user-1', SK: 'QUOTA#META' });
  });

  it('releases concurrency and fails closed when the daily model limit is reached', async () => {
    let call = 0;
    const client = {
      async send(command: unknown) {
        assert.ok(command instanceof UpdateCommand);
        call += 1;
        if (call === 2) {
          throw new ConditionalCheckFailedException({ $metadata: {}, message: 'limited' });
        }
        return {};
      },
    } as unknown as DynamoDBDocumentClient;
    const quota = new DynamoMetaQuota(client, 'table', 2);

    await assert.rejects(
      quota.acquireMeta('user-1', {
        period: '2026-08-26',
        expiresAt: 123456,
        requestLimit: 1,
        tokenLimit: 1,
      }),
      (error: unknown) =>
        error instanceof CloudError && error.code === 'hosted_model_daily_limit',
    );
    assert.equal(call, 3);
  });

  it('replaces an expired concurrency lease after an interrupted model turn', async () => {
    const updates: UpdateCommand[] = [];
    let call = 0;
    const client = {
      async send(command: unknown) {
        assert.ok(command instanceof UpdateCommand);
        updates.push(command);
        call += 1;
        if (call === 1) {
          throw new ConditionalCheckFailedException({ $metadata: {}, message: 'stale' });
        }
        return {};
      },
    } as unknown as DynamoDBDocumentClient;
    const quota = new DynamoMetaQuota(client, 'table', 2);

    const lease = await quota.acquireMeta('user-1', {
      period: '2026-08-26',
      expiresAt: 123456,
      requestLimit: 100,
      tokenLimit: 250_000,
    });
    await lease.release();

    assert.equal(updates.length, 4);
    assert.equal(updates[1]?.input.UpdateExpression, 'SET active = :one, expiresAt = :ttl');
    assert.equal(updates[1]?.input.ConditionExpression, 'expiresAt < :now');
    assert.equal(updates[1]?.input.ExpressionAttributeValues?.[':one'], 1);
  });

  it('stores only numeric usage metadata for model and voice allowances', async () => {
    const commands: unknown[] = [];
    const client = {
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof GetCommand) {
          return command.input.Key?.SK === 'USAGE#META#2026-08-26'
            ? {
                Item: {
                  requests: 2,
                  inputTokens: 30,
                  outputTokens: 10,
                  totalTokens: 40,
                },
              }
            : { Item: { tokenMints: 3 } };
        }
        return {};
      },
    } as unknown as DynamoDBDocumentClient;
    const quota = new DynamoMetaQuota(client, 'table', 2);

    await quota.recordMetaUsage(
      'user-1',
      { period: '2026-08-26', expiresAt: 123456 },
      { inputTokens: 20, outputTokens: 5, totalTokens: 25 },
    );
    await quota.consumeVoiceToken('user-1', {
      period: '2026-08-26',
      expiresAt: 123456,
      tokenMintLimit: 20,
    });
    assert.deepEqual(await quota.getMetaUsage('user-1', '2026-08-26'), {
      requests: 2,
      inputTokens: 30,
      outputTokens: 10,
      totalTokens: 40,
    });
    assert.equal(await quota.getVoiceTokenUsage('user-1', '2026-08-26'), 3);
    assert.doesNotMatch(JSON.stringify(commands), /prompt|message|token":"|apiKey/);
  });
});
