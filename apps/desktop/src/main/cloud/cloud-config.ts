import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

export const CLOUD_CONFIG_RESOURCE = 'sia-cloud.json';

const cleanHttpsUrl = z.string().min(1).refine(isCleanHttpsUrl, {
  message: 'apiBaseUrl must be a clean HTTPS URL',
});
const region = z.string().regex(/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/);
const clientId = z.string().regex(/^[A-Za-z0-9]{10,128}$/);
const updatePublicKey = z.string().regex(/^[A-Za-z0-9_-]{59}$/);
const cleanWssUrl = z
  .string()
  .min(1)
  .refine((value) => isCleanUrl(value, 'wss:'), {
    message: 'phoneRelayUrl must be a clean WSS URL',
  });

export const packagedCloudConfigSchema = z.discriminatedUnion('enabled', [
  z
    .object({
      schemaVersion: z.literal(1),
      enabled: z.literal(false),
      updateManifestUrl: cleanHttpsUrl.optional(),
      updateManifestPublicKey: updatePublicKey.optional(),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal(1),
      enabled: z.literal(true),
      apiBaseUrl: cleanHttpsUrl,
      cognitoRegion: region,
      cognitoClientId: clientId,
      updateManifestUrl: cleanHttpsUrl.optional(),
      updateManifestPublicKey: updatePublicKey.optional(),
      /** The encrypted phone relay (docs/phone-cloud-relay.md) and the HTTPS page phones open. */
      phoneRelayUrl: cleanWssUrl.optional(),
      phonePageUrl: cleanHttpsUrl.optional(),
    })
    .strict(),
]);

export interface CloudRuntimeConfiguration {
  apiBaseUrl?: string;
  cognitoRegion?: string;
  cognitoClientId?: string;
  updateManifestUrl?: string;
  updateManifestPublicKey?: string;
  phoneRelayUrl?: string;
  phonePageUrl?: string;
}

interface CloudConfigurationEnvironment {
  SIA_API_BASE_URL?: string;
  SIA_COGNITO_REGION?: string;
  SIA_COGNITO_CLIENT_ID?: string;
  SIA_UPDATE_MANIFEST_URL?: string;
  SIA_UPDATE_MANIFEST_PUBLIC_KEY?: string;
  SIA_PHONE_RELAY_URL?: string;
  SIA_PHONE_PAGE_URL?: string;
}

export async function loadCloudConfiguration(options: {
  packaged: boolean;
  resourcesPath: string;
  environment: CloudConfigurationEnvironment;
  readResource?: (path: string) => Promise<string>;
}): Promise<CloudRuntimeConfiguration> {
  if (!options.packaged) return developmentCloudConfiguration(options.environment);

  const path = join(options.resourcesPath, CLOUD_CONFIG_RESOURCE);
  let raw: string;
  try {
    raw = await (options.readResource ?? readUtf8)(path);
  } catch {
    throw new Error('The packaged Sia cloud configuration is missing.');
  }
  if (Buffer.byteLength(raw, 'utf8') > 8_192) {
    throw new Error('The packaged Sia cloud configuration is too large.');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('The packaged Sia cloud configuration is not valid JSON.');
  }
  const parsed = packagedCloudConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('The packaged Sia cloud configuration does not match schema version 1.');
  }
  const update = completeUpdateConfiguration(parsed.data);
  return parsed.data.enabled
    ? {
        apiBaseUrl: parsed.data.apiBaseUrl,
        cognitoRegion: parsed.data.cognitoRegion,
        cognitoClientId: parsed.data.cognitoClientId,
        ...update,
        ...completePhoneRelayConfiguration(parsed.data),
      }
    : update;
}

export function developmentCloudConfiguration(
  environment: CloudConfigurationEnvironment,
): CloudRuntimeConfiguration {
  const apiBaseUrl = environment.SIA_API_BASE_URL;
  const cognitoRegion = environment.SIA_COGNITO_REGION;
  const cognitoClientId = environment.SIA_COGNITO_CLIENT_ID;
  const updateManifestUrl = environment.SIA_UPDATE_MANIFEST_URL;
  const updateManifestPublicKey = environment.SIA_UPDATE_MANIFEST_PUBLIC_KEY;
  if (!apiBaseUrl && !cognitoRegion && !cognitoClientId) {
    if (!updateManifestUrl && !updateManifestPublicKey) return {};
    if (!updateManifestUrl || !isCleanHttpsUrl(updateManifestUrl)) {
      throw new Error('Development update configuration requires a clean HTTPS manifest URL.');
    }
    if (
      !updateManifestPublicKey ||
      !updatePublicKey.safeParse(updateManifestPublicKey).success
    ) {
      throw new Error('Development update configuration requires an Ed25519 public key.');
    }
    return { updateManifestUrl, updateManifestPublicKey };
  }
  const parsed = packagedCloudConfigSchema.safeParse({
    schemaVersion: 1,
    enabled: true,
    apiBaseUrl,
    cognitoRegion,
    cognitoClientId,
    ...(updateManifestUrl ? { updateManifestUrl } : {}),
    ...(updateManifestPublicKey ? { updateManifestPublicKey } : {}),
    ...(environment.SIA_PHONE_RELAY_URL
      ? { phoneRelayUrl: environment.SIA_PHONE_RELAY_URL }
      : {}),
    ...(environment.SIA_PHONE_PAGE_URL ? { phonePageUrl: environment.SIA_PHONE_PAGE_URL } : {}),
  });
  if (!parsed.success || !parsed.data.enabled) {
    throw new Error(
      'Development cloud configuration requires a clean HTTPS API URL, Cognito region, and client ID.',
    );
  }
  const update = completeUpdateConfiguration(parsed.data);
  return {
    apiBaseUrl: parsed.data.apiBaseUrl,
    cognitoRegion: parsed.data.cognitoRegion,
    cognitoClientId: parsed.data.cognitoClientId,
    ...update,
    ...completePhoneRelayConfiguration(parsed.data),
  };
}

function completePhoneRelayConfiguration(value: {
  phoneRelayUrl?: string | undefined;
  phonePageUrl?: string | undefined;
}): Pick<CloudRuntimeConfiguration, 'phoneRelayUrl' | 'phonePageUrl'> {
  if (Boolean(value.phoneRelayUrl) !== Boolean(value.phonePageUrl)) {
    throw new Error('The phone relay requires both its WSS URL and its HTTPS page URL.');
  }
  return value.phoneRelayUrl && value.phonePageUrl
    ? { phoneRelayUrl: value.phoneRelayUrl, phonePageUrl: value.phonePageUrl }
    : {};
}

function completeUpdateConfiguration(value: {
  updateManifestUrl?: string | undefined;
  updateManifestPublicKey?: string | undefined;
}): Pick<CloudRuntimeConfiguration, 'updateManifestUrl' | 'updateManifestPublicKey'> {
  const url = value.updateManifestUrl;
  const publicKey = value.updateManifestPublicKey;
  if (Boolean(url) !== Boolean(publicKey)) {
    throw new Error('Update configuration requires both its HTTPS URL and Ed25519 public key.');
  }
  return url && publicKey ? { updateManifestUrl: url, updateManifestPublicKey: publicKey } : {};
}

async function readUtf8(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function isCleanHttpsUrl(value: string): boolean {
  return isCleanUrl(value, 'https:');
}

function isCleanUrl(value: string, protocol: 'https:' | 'wss:'): boolean {
  try {
    const url = new URL(value);
    return Boolean(
      url.protocol === protocol && !url.username && !url.password && !url.search && !url.hash,
    );
  } catch {
    return false;
  }
}
