import type { AuthContext } from '../contracts.js';
import { CloudError, isRecord } from '../domain.js';
import type { ServiceDependencies } from '../services.js';
import { requireReleaseRecipient } from './access.js';

export class ReleaseService {
  constructor(private readonly deps: ServiceDependencies) {}

  async latestMac(user: AuthContext) {
    requireReleaseRecipient(user);
    const manifest = validateStoredReleaseManifest(
      await this.deps.releaseManifests.readLatest(),
    );
    return {
      ...manifest,
      downloadUrl: await this.deps.releaseManifests.createArtifactDownloadUrl(
        manifest.payload.artifact.key,
      ),
    };
  }
}

function validateStoredReleaseManifest(value: unknown): {
  payload: {
    schemaVersion: 1;
    channel: 'internal';
    platform: 'macos';
    architecture: 'universal';
    version: string;
    publishedAt: string;
    minimumSystemVersion: string;
    artifact: { key: string; sha256: string; bytes: number };
  };
  keyId: string;
  signature: string;
} {
  if (!isRecord(value) || !isRecord(value.payload)) {
    throw new CloudError(
      503,
      'release_manifest_invalid',
      'The release manifest is unavailable',
    );
  }
  const payload = value.payload;
  const artifact = payload.artifact;
  const version = typeof payload.version === 'string' ? payload.version : '';
  const key = isRecord(artifact) && typeof artifact.key === 'string' ? artifact.key : '';
  const expectedName = `Sia-${version}-universal.dmg`;
  if (
    payload.schemaVersion !== 1 ||
    payload.channel !== 'internal' ||
    payload.platform !== 'macos' ||
    payload.architecture !== 'universal' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) ||
    typeof payload.publishedAt !== 'string' ||
    !Number.isFinite(Date.parse(payload.publishedAt)) ||
    typeof payload.minimumSystemVersion !== 'string' ||
    !isRecord(artifact) ||
    !key.startsWith(`releases/${version}/`) ||
    !key.endsWith(`/${expectedName}`) ||
    !/^[A-Za-z0-9._/-]+$/.test(key) ||
    !/^[a-f0-9]{64}$/.test(String(artifact.sha256)) ||
    !Number.isSafeInteger(artifact.bytes) ||
    Number(artifact.bytes) <= 0 ||
    typeof value.keyId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(value.keyId) ||
    typeof value.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(value.signature)
  ) {
    throw new CloudError(
      503,
      'release_manifest_invalid',
      'The release manifest is unavailable',
    );
  }
  return value as ReturnType<typeof validateStoredReleaseManifest>;
}
