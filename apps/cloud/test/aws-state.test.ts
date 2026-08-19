import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { BatchWriteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { DynamoState } from '../src/aws.js';

const TABLE_NAME = 'state-table';
const USER_PK = 'USER#person-1';

describe('DynamoState prefix deletion', () => {
  it('queries every page, deletes every 25-item chunk, and retries only unprocessed keys', async () => {
    const firstPage = keys(0, 27);
    const secondPage = keys(27, 31);
    const queryInputs: Array<Record<string, unknown> | undefined> = [];
    const batchKeys: string[][] = [];
    const sleeps: number[] = [];
    let batchCall = 0;
    const client = {
      async send(command: unknown) {
        if (command instanceof QueryCommand) {
          queryInputs.push(command.input.ExclusiveStartKey);
          return queryInputs.length === 1
            ? { Items: firstPage, LastEvaluatedKey: { PK: USER_PK, SK: 'ACTION#26' } }
            : { Items: secondPage };
        }
        assert.ok(command instanceof BatchWriteCommand);
        const requests = command.input.RequestItems?.[TABLE_NAME] ?? [];
        batchKeys.push(
          requests.map((request) => String(request.DeleteRequest?.Key?.SK ?? 'missing')),
        );
        batchCall += 1;
        if (batchCall === 1) {
          return { UnprocessedItems: { [TABLE_NAME]: requests.slice(-2) } };
        }
        return { UnprocessedItems: {} };
      },
    } as unknown as DynamoDBDocumentClient;
    const state = new DynamoState(client, TABLE_NAME, {
      batchDeleteAttempts: 4,
      batchDeleteBaseDelayMs: 3,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await state.deleteActionsForUser('person-1');

    assert.deepEqual(queryInputs, [undefined, { PK: USER_PK, SK: 'ACTION#26' }]);
    assert.deepEqual(
      batchKeys.map((batch) => batch.length),
      [25, 2, 6],
    );
    assert.deepEqual(batchKeys[1], batchKeys[0]?.slice(-2));
    assert.deepEqual(
      [...batchKeys[0]!, ...batchKeys[2]!],
      keys(0, 31).map(({ SK }) => SK),
    );
    assert.deepEqual(sleeps, [3]);
  });

  it('fails closed after bounded exponential retries leave keys unprocessed', async () => {
    const record = { PK: USER_PK, SK: 'ACTION#0' };
    const sleeps: number[] = [];
    let attempts = 0;
    const client = {
      async send(command: unknown) {
        if (command instanceof QueryCommand) return { Items: [record] };
        assert.ok(command instanceof BatchWriteCommand);
        attempts += 1;
        return {
          UnprocessedItems: {
            [TABLE_NAME]: command.input.RequestItems?.[TABLE_NAME] ?? [],
          },
        };
      },
    } as unknown as DynamoDBDocumentClient;
    const state = new DynamoState(client, TABLE_NAME, {
      batchDeleteAttempts: 3,
      batchDeleteBaseDelayMs: 2,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await assert.rejects(
      state.deleteActionsForUser('person-1'),
      /remained incomplete after bounded retries/,
    );
    assert.equal(attempts, 3);
    assert.deepEqual(sleeps, [2, 4]);
  });

  it('fails closed if DynamoDB returns an unrecognized unprocessed request', async () => {
    const client = {
      async send(command: unknown) {
        if (command instanceof QueryCommand) {
          return { Items: [{ PK: USER_PK, SK: 'ACTION#0' }] };
        }
        assert.ok(command instanceof BatchWriteCommand);
        return { UnprocessedItems: { [TABLE_NAME]: [{}] } };
      },
    } as unknown as DynamoDBDocumentClient;

    await assert.rejects(
      new DynamoState(client, TABLE_NAME).deleteActionsForUser('person-1'),
      /invalid unprocessed deletion request/,
    );
  });
});

describe('DynamoState research batch creation', () => {
  it('uses a conditional put and returns the winning record after a race', async () => {
    const metadata = {
      userId: 'person-1',
      batchId: 'batch-1',
      consentVersion: 'alpha-1',
      eventCount: 1,
      objectKey: 'users/person-1/batches/batch-1/hash.json',
      sha256: 'hash',
      byteLength: 123,
      createdAt: '2026-08-13T00:00:00.000Z',
    };
    const client = {
      async send(command: unknown) {
        if (command instanceof PutCommand) {
          assert.equal(
            command.input.ConditionExpression,
            'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          );
          throw new ConditionalCheckFailedException({
            $metadata: {},
            message: 'lost race',
          });
        }
        assert.ok(command instanceof GetCommand);
        assert.equal(command.input.ConsistentRead, true);
        return { Item: metadata };
      },
    } as unknown as DynamoDBDocumentClient;

    const result = await new DynamoState(client, TABLE_NAME).putBatchIfAbsent(metadata);

    assert.deepEqual(result, { created: false, existing: metadata });
  });
});

function keys(start: number, end: number): Array<{ PK: string; SK: string }> {
  return Array.from({ length: end - start }, (_, index) => ({
    PK: USER_PK,
    SK: `ACTION#${start + index}`,
  }));
}
