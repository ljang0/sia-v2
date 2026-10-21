import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoRatings } from '../../src/aws/dynamo-ratings.js';
import type { StoredTaskRating } from '../../src/ports.js';

const stored: StoredTaskRating = {
  id: 'abc',
  labId: 'arena',
  day: '2026-10-20',
  model: 'llama-5',
  harnessId: 'codex_app_server',
  receivedAt: '2026-10-20T12:00:00.000Z',
  record: {
    schemaVersion: 1,
    rating: 'good',
    reasons: ['fast'],
    route: {
      provider: 'meta',
      lab: { id: 'arena', name: 'Arena' },
      model: 'llama-5',
      harnessId: 'codex_app_server',
    },
    task: {
      outcome: 'completed',
      durationMs: 30_000,
      stepCount: 4,
      usedComputer: true,
      usedBrowser: false,
      finishedAt: '2026-10-20T11:00:00.000Z',
    },
    appVersion: '0.1.0-alpha.30',
    createdAt: '2026-10-20T11:01:00.000Z',
  },
};

/** A transaction-boundary fault harness: failure cannot partially change stored state. */
function fixture() {
  let saved: StoredTaskRating | undefined;
  const counters: Record<string, number> = {};
  let reference: Record<string, unknown> | undefined;
  const commands: unknown[] = [];
  let failure: 'before' | 'after' | 'conflict' | undefined;
  const client = {
    async send(command: unknown) {
      commands.push(command);
      if (command instanceof GetCommand)
        return { Item: saved ? { rating: structuredClone(saved), expiresAt: 999 } : undefined };
      if (command instanceof TransactWriteCommand) {
        const put = command.input.TransactItems?.[0]?.Put;
        const update = command.input.TransactItems?.[1]?.Update;
        const deletion = command.input.TransactItems?.[0]?.Delete;
        const condition = command.input.TransactItems?.[0]?.ConditionCheck;
        if (condition) {
          assert.equal(saved, undefined);
          reference = undefined;
          return {};
        }
        assert.ok((put || deletion) && update);
        if (failure === 'before') {
          failure = undefined;
          throw new Error('storage unavailable');
        }
        if (failure === 'conflict') {
          failure = undefined;
          // A competing request commits the same rating after this request's read.
          saved = structuredClone(stored);
          Object.assign(counters, {
            ratings: 1,
            good: 1,
            reason_fast: 1,
            outcome_completed: 1,
            durationMsTotal: 30_000,
            stepsTotal: 4,
            usedComputer: 1,
          });
          throw Object.assign(new Error('compare-and-swap lost'), {
            name: 'TransactionCanceledException',
            CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
          });
        }
        const previous = (put ?? deletion)?.ExpressionAttributeValues?.[':previous'];
        assert.deepEqual(previous, saved);
        assert.equal(
          (put ?? deletion)?.ConditionExpression,
          saved ? '#rating = :previous' : 'attribute_not_exists(PK)',
        );
        saved = put ? structuredClone(put.Item?.rating as StoredTaskRating) : undefined;
        reference = put ? command.input.TransactItems?.[2]?.Put?.Item : undefined;
        for (const [alias, name] of Object.entries(update.ExpressionAttributeNames ?? {})) {
          if (!name.startsWith('c_')) continue;
          const value: unknown = update.ExpressionAttributeValues?.[alias.replace('#', ':')];
          assert.equal(typeof value, 'number');
          counters[name.slice(2)] = (counters[name.slice(2)] ?? 0) + Number(value);
        }
        if (failure === 'after') {
          failure = undefined;
          throw new Error('acknowledgement lost');
        }
        return {};
      }
      if (command instanceof QueryCommand) {
        if (command.input.ExpressionAttributeValues?.[':prefix'] === 'RATING_REF#')
          return { Items: reference ? [reference] : [] };
        return {
          Items: [
            {
              labName: 'Arena',
              provider: 'meta',
              day: stored.day,
              model: stored.model,
              harnessId: stored.harnessId,
              ...Object.fromEntries(Object.entries(counters).map(([k, v]) => [`c_${k}`, v])),
            },
          ],
        };
      }
      return { Attributes: { requestCount: 1 } };
    },
  } as unknown as DynamoDBDocumentClient;
  return {
    repo: new DynamoRatings(client, 'table'),
    commands,
    counters,
    fail: (kind: typeof failure) => {
      failure = kind;
    },
    saved: () => saved,
  };
}

describe('Dynamo task ratings', () => {
  it('stores the rating and report counters in one transaction under the lab', async () => {
    const { repo, commands, counters } = fixture();
    assert.equal(await repo.consumeRatingLimit('user-1', 1000, 2000, 120), true);
    await repo.writeRating('user-1', stored, 999);
    const read = commands.find((c) => c instanceof GetCommand) as GetCommand;
    assert.equal(read.input.ConsistentRead, true);
    const write = commands.find(
      (c) => c instanceof TransactWriteCommand,
    ) as TransactWriteCommand;
    assert.equal(write.input.TransactItems?.length, 3);
    assert.equal(write.input.TransactItems?.[0]?.Put?.Item?.PK, 'LAB#arena');
    assert.equal(
      write.input.TransactItems?.[0]?.Put?.Item?.SK,
      'RATING#2026-10-20#llama-5#codex_app_server#abc',
    );
    assert.deepEqual(write.input.TransactItems?.[1]?.Update?.Key, {
      PK: 'LAB#arena',
      SK: 'RATING_DAY#2026-10-20#llama-5#codex_app_server',
    });
    const rows = await repo.listRatingAggregates('arena', '2026-10-01', '2026-10-20');
    assert.deepEqual(rows[0]?.counters, counters);
    assert.equal(counters.ratings, 1);
  });

  it('can retry an interrupted write without losing the rating from the report', async () => {
    const { repo, fail, counters, saved } = fixture();
    fail('before');
    await assert.rejects(repo.writeRating('user-1', stored, 999), /storage unavailable/);
    assert.equal(saved(), undefined);
    assert.deepEqual(counters, {});
    await repo.writeRating('user-1', stored, 999);
    assert.equal(counters.ratings, 1);
    assert.equal(counters.good, 1);
  });

  it('does not count twice when the write succeeded but its response was lost', async () => {
    const { repo, fail, counters } = fixture();
    fail('after');
    await assert.rejects(repo.writeRating('user-1', stored, 999), /acknowledgement lost/);
    await repo.writeRating('user-1', stored, 999);
    assert.equal(counters.ratings, 1);
    assert.equal(counters.good, 1);
  });

  it('recomputes a competing re-rating against the committed value', async () => {
    const { repo, fail, counters, commands } = fixture();
    fail('conflict');
    await repo.writeRating(
      'user-1',
      { ...stored, record: { ...stored.record, rating: 'bad', reasons: ['got_stuck'] } },
      999,
    );
    assert.equal(commands.filter((c) => c instanceof GetCommand).length, 2);
    assert.equal(counters.ratings, 1);
    assert.equal(counters.good, 0);
    assert.equal(counters.bad, 1);
    assert.equal(counters.reason_fast, 0);
    assert.equal(counters.reason_got_stuck, 1);
  });
  it('removes notes and counters atomically, including retry after a lost deletion response', async () => {
    const { repo, fail, counters, saved } = fixture();
    await repo.writeRating(
      'user-1',
      { ...stored, record: { ...stored.record, comment: 'Disposable feedback' } },
      999,
    );
    fail('after');
    await assert.rejects(repo.deleteUserRatings('user-1'), /acknowledgement lost/);
    await repo.deleteUserRatings('user-1');
    assert.equal(saved(), undefined);
    assert.equal(counters.ratings, 0);
    assert.equal(counters.comments, 0);
  });
});
