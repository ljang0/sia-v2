import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { ResearchObjectStore } from '../ports.js';
import { delay, safeSegment } from './shared.js';

const DEFAULT_S3_DELETE_ATTEMPTS = 8;

const DEFAULT_S3_DELETE_BASE_DELAY_MS = 25;

export interface S3ResearchObjectOptions {
  deleteAttempts?: number;
  deleteBaseDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
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
    objects: readonly { objectKey: string; sha256: string; byteLength: number }[],
  ): Promise<{ objectKey: string }> {
    const objectKey = researchKey(userId, `exports/${safeSegment(exportId)}.jsonl`);
    const common = {
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: 'application/x-ndjson',
      ContentDisposition: `attachment; filename="sia-research-${safeSegment(exportId)}.jsonl"`,
      ServerSideEncryption: 'aws:kms' as const,
      SSEKMSKeyId: this.kmsKeyArn,
    };
    const orderedObjects = [...objects].sort((left, right) =>
      left.objectKey.localeCompare(right.objectKey),
    );
    if (orderedObjects.length === 0) {
      await this.client.send(new PutObjectCommand({ ...common, Body: Buffer.alloc(0) }));
    } else {
      const started = await this.client.send(new CreateMultipartUploadCommand(common));
      const uploadId = started.UploadId;
      if (!uploadId) throw new Error('S3 did not create a research export upload');
      const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
      const minimumPartBytes = 5 * 1024 * 1024;
      let pending = Buffer.alloc(0);
      let partNumber = 1;
      const uploadPart = async (body: Uint8Array) => {
        const uploaded = await this.client.send(
          new UploadPartCommand({
            Bucket: this.bucketName,
            Key: objectKey,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: body,
          }),
        );
        if (!uploaded.ETag) throw new Error('S3 did not acknowledge an export part');
        completedParts.push({ ETag: uploaded.ETag, PartNumber: partNumber });
        partNumber += 1;
      };
      try {
        for (const object of orderedObjects) {
          const batchObjectKey = object.objectKey;
          if (!batchObjectKey.startsWith(researchKey(userId, 'batches/'))) {
            throw new Error(
              'Research metadata referenced an object outside the user batch prefix',
            );
          }
          const fetched = await this.client.send(
            new GetObjectCommand({ Bucket: this.bucketName, Key: batchObjectKey }),
          );
          if (!fetched.Body) throw new Error('A claimed research batch object is missing');
          const bytes = await fetched.Body.transformToByteArray();
          const sha256 = createHash('sha256').update(bytes).digest('base64url');
          if (bytes.byteLength !== object.byteLength || sha256 !== object.sha256) {
            throw new Error('A research batch failed its export integrity check');
          }
          pending = Buffer.concat([pending, Buffer.from(bytes), Buffer.from('\n')]);
          while (pending.byteLength >= minimumPartBytes) {
            await uploadPart(pending.subarray(0, minimumPartBytes));
            pending = pending.subarray(minimumPartBytes);
          }
        }
        if (pending.byteLength > 0) await uploadPart(pending);
        await this.client.send(
          new CompleteMultipartUploadCommand({
            Bucket: this.bucketName,
            Key: objectKey,
            UploadId: uploadId,
            MultipartUpload: { Parts: completedParts },
          }),
        );
      } catch (error) {
        await this.client
          .send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucketName,
              Key: objectKey,
              UploadId: uploadId,
            }),
          )
          .catch(() => undefined);
        throw error;
      }
    }
    return { objectKey };
  }

  async readBatchObject(
    objectKey: string,
  ): Promise<{ document: unknown; sha256: string; byteLength: number }> {
    const fetched = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
    );
    if (!fetched.Body) throw new Error('The requested research batch object is missing');
    const bytes = await fetched.Body.transformToByteArray();
    return {
      document: JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown,
      sha256: createHash('sha256').update(bytes).digest('base64url'),
      byteLength: bytes.byteLength,
    };
  }

  async createExportDownloadUrl(userId: string, objectKey: string): Promise<string> {
    if (!objectKey.startsWith(researchKey(userId, 'exports/'))) {
      throw new Error('Research export metadata referenced an object outside the user prefix');
    }
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      { expiresIn: 15 * 60 },
    );
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

function researchKey(userId: string, suffix: string): string {
  return `users/${safeSegment(userId)}/${suffix}`;
}

function versionedObjectId(key: string, versionId: string): string {
  return `${key}\u0000${versionId}`;
}
