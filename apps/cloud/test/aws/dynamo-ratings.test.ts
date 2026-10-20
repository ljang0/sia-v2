import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { DynamoRatings } from '../../src/aws/dynamo-ratings.js';
import type { StoredTaskRating } from '../../src/ports.js';

const stored = {
  id: 'abc',
  labId: 'arena',
  day: '2026-10-20',
  model: 'llama-5',
  harnessId: 'codex_app_server',
  record: {} as StoredTaskRating['record'],
  receivedAt: '2026-10-20T12:00:00.000Z',
} satisfies StoredTaskRating;

describe('Dynamo task ratings', () => {
  it('keys ratings and daily counters under the lab partition', async () => {
    const commands: unknown[] = [];
    const client = {
      async send(command: unknown) {
        commands.push(command);
        if (command instanceof PutCommand) return { Attributes: { rating: stored } };
        if (command instanceof QueryCommand)
          return {
            Items: [
              {
                labName: 'Arena',
                provider: 'meta',
                day: '2026-10-20',
                model: 'llama-5',
                harnessId: 'codex_app_server',
                c_good: 2,
                c_reason_fast: 1,
                PK: 'LAB#arena',
              },
            ],
          };
        return { Attributes: { requestCount: 1 } };
      },
    } as unknown as DynamoDBDocumentClient;
    const ratings = new DynamoRatings(client, 'table');

    assert.equal(await ratings.consumeRatingLimit('user-1', 1000, 2000, 120), true);
    assert.deepEqual(await ratings.putRating(stored, 999), stored);
    await ratings.addRatingCounters(
      {
        labId: 'arena',
        labName: 'Arena',
        provider: 'meta',
        day: '2026-10-20',
        model: 'llama-5',
        harnessId: 'codex_app_server',
      },
      { good: 1, bad: -1, 'bad name': 5 },
      999,
    );
    const rows = await ratings.listRatingAggregates('arena', '2026-10-01', '2026-10-20');

    const [limit, put, update, query] = commands as [
      UpdateCommand,
      PutCommand,
      UpdateCommand,
      QueryCommand,
    ];
    assert.deepEqual(limit.input.Key, { PK: 'USER#user-1', SK: 'RATE#RATING#1000' });
    assert.equal(put.input.Item?.PK, 'LAB#arena');
    assert.equal(put.input.Item?.SK, 'RATING#2026-10-20#llama-5#codex_app_server#abc');
    assert.equal(put.input.ReturnValues, 'ALL_OLD');
    assert.deepEqual(update.input.Key, {
      PK: 'LAB#arena',
      SK: 'RATING_DAY#2026-10-20#llama-5#codex_app_server',
    });
    // Only well-formed counter names are written.
    assert.deepEqual(
      Object.values(update.input.ExpressionAttributeNames ?? {}).filter((name) =>
        name.startsWith('c_'),
      ),
      ['c_good', 'c_bad'],
    );
    assert.equal(query.input.ExpressionAttributeValues?.[':pk'], 'LAB#arena');
    assert.deepEqual(rows, [
      {
        labId: 'arena',
        labName: 'Arena',
        provider: 'meta',
        day: '2026-10-20',
        model: 'llama-5',
        harnessId: 'codex_app_server',
        counters: { good: 2, reason_fast: 1 },
      },
    ]);
  });
});
