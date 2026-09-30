import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { S3ResearchObjects } from '../../src/aws/research-objects.js';

const BUCKET = 'research-bucket';
const KMS_KEY = 'arn:aws:kms:us-east-1:123456789012:key/test';

describe('S3ResearchObjects deletion', () => {
  it('paginates versions, retries only per-object errors, and verifies emptiness', async () => {
    const listInputs: Array<{ key: string | undefined; version: string | undefined }> = [];
    const deleted: Array<Array<{ Key: string | undefined; VersionId: string | undefined }>> =
      [];
    const sleeps: number[] = [];
    let deleteCall = 0;
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectVersionsCommand) {
          listInputs.push({
            key: command.input.KeyMarker,
            version: command.input.VersionIdMarker,
          });
          if (listInputs.length === 1) {
            return {
              Versions: [{ Key: 'users/person-1/batches/a.json', VersionId: 'v1' }],
              IsTruncated: true,
              NextKeyMarker: 'users/person-1/batches/a.json',
              NextVersionIdMarker: 'v1',
            };
          }
          if (listInputs.length === 2) {
            return {
              DeleteMarkers: [{ Key: 'users/person-1/exports/b.jsonl', VersionId: 'd1' }],
              IsTruncated: false,
            };
          }
          return { IsTruncated: false };
        }
        assert.ok(command instanceof DeleteObjectsCommand);
        const objects = command.input.Delete?.Objects ?? [];
        deleted.push(objects.map(({ Key, VersionId }) => ({ Key, VersionId })));
        deleteCall += 1;
        return deleteCall === 1
          ? {
              Errors: [
                {
                  Key: 'users/person-1/exports/b.jsonl',
                  VersionId: 'd1',
                  Code: 'InternalError',
                },
              ],
            }
          : {};
      },
    } as unknown as S3Client;
    const store = new S3ResearchObjects(client, BUCKET, KMS_KEY, {
      deleteAttempts: 3,
      deleteBaseDelayMs: 2,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await store.deleteAllForUser('person-1');

    assert.deepEqual(listInputs, [
      { key: undefined, version: undefined },
      { key: 'users/person-1/batches/a.json', version: 'v1' },
      { key: undefined, version: undefined },
    ]);
    assert.deepEqual(
      deleted.map((objects) => objects.map(({ Key }) => Key)),
      [
        ['users/person-1/batches/a.json', 'users/person-1/exports/b.jsonl'],
        ['users/person-1/exports/b.jsonl'],
      ],
    );
    assert.deepEqual(sleeps, [2]);
  });

  it('sweeps again when verification finds a remaining version', async () => {
    const object = { Key: 'users/person-1/batches/a.json', VersionId: 'v1' };
    let listCall = 0;
    let deleteCalls = 0;
    const sleeps: number[] = [];
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectVersionsCommand) {
          listCall += 1;
          return listCall < 4 ? { Versions: [object], IsTruncated: false } : {};
        }
        assert.ok(command instanceof DeleteObjectsCommand);
        deleteCalls += 1;
        return {};
      },
    } as unknown as S3Client;
    const store = new S3ResearchObjects(client, BUCKET, KMS_KEY, {
      deleteAttempts: 3,
      deleteBaseDelayMs: 5,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await store.deleteAllForUser('person-1');

    assert.equal(deleteCalls, 2);
    assert.equal(listCall, 4);
    assert.deepEqual(sleeps, [5]);
  });

  it('fails closed when per-object errors survive bounded retries', async () => {
    const object = { Key: 'users/person-1/batches/a.json', VersionId: 'v1' };
    const sleeps: number[] = [];
    let deleteCalls = 0;
    const client = {
      async send(command: unknown) {
        if (command instanceof ListObjectVersionsCommand) {
          return { Versions: [object], IsTruncated: false };
        }
        assert.ok(command instanceof DeleteObjectsCommand);
        deleteCalls += 1;
        return { Errors: [{ ...object, Code: 'AccessDenied' }] };
      },
    } as unknown as S3Client;
    const store = new S3ResearchObjects(client, BUCKET, KMS_KEY, {
      deleteAttempts: 3,
      deleteBaseDelayMs: 2,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
    });

    await assert.rejects(
      store.deleteAllForUser('person-1'),
      /remained incomplete after bounded retries/,
    );
    assert.equal(deleteCalls, 3);
    assert.deepEqual(sleeps, [2, 4]);
  });
});
