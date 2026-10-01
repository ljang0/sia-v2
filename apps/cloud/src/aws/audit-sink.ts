import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { AuditEvent, AuditSink } from '../ports.js';
import { safeSegment } from './shared.js';

export class MetadataAuditSink implements AuditSink {
  constructor(
    private readonly client?: S3Client,
    private readonly bucketName?: string,
    private readonly kmsKeyArn?: string,
  ) {}

  async write(event: AuditEvent): Promise<void> {
    // Deliberately metadata-only: never add request bodies or provider responses here.
    console.info(JSON.stringify({ logType: 'audit', ...event }));
    if (
      event.action.startsWith('research.admin.') &&
      (event.outcome === 'denied' || event.outcome === 'failed')
    ) {
      console.info(
        JSON.stringify({
          _aws: {
            Timestamp: Date.now(),
            CloudWatchMetrics: [
              {
                Namespace: 'Sia/Research',
                Dimensions: [[]],
                Metrics: [{ Name: 'ArchiveAccessFailure', Unit: 'Count' }],
              },
            ],
          },
          ArchiveAccessFailure: 1,
        }),
      );
    }
    if (!this.client || !this.bucketName || !this.kmsKeyArn) return;
    const occurred = new Date(event.occurredAt);
    const date = Number.isFinite(occurred.getTime())
      ? occurred.toISOString().slice(0, 10)
      : 'invalid-date';
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: `audit/${date}/${safeSegment(event.action)}/${randomUUID()}.json`,
        Body: Buffer.from(JSON.stringify({ schemaVersion: 1, ...event })),
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.kmsKeyArn,
      }),
    );
  }
}
