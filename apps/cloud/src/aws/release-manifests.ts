import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ReleaseManifestStore } from '../ports.js';

export class S3ReleaseManifests implements ReleaseManifestStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string,
  ) {}

  async readLatest(): Promise<unknown> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName, Key: 'manifests/macos/latest.json' }),
    );
    if (!result.Body) throw new Error('The release manifest object is missing');
    const bytes = await result.Body.transformToByteArray();
    if (bytes.byteLength > 16_384) throw new Error('The release manifest is too large');
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  }

  async createArtifactDownloadUrl(objectKey: string): Promise<string> {
    if (
      !/^releases\/[0-9A-Za-z.-]+\/[a-f0-9]{16}\/Sia-[0-9A-Za-z.-]+-universal\.dmg$/.test(
        objectKey,
      )
    ) {
      throw new Error('The release artifact key is outside the private release prefix');
    }
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      { expiresIn: 15 * 60 },
    );
  }
}
