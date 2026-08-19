import { describe, expect, it, vi } from 'vitest';

import {
  CLOUD_CONFIG_RESOURCE,
  developmentCloudConfiguration,
  loadCloudConfiguration,
  packagedCloudConfigSchema,
} from './cloud-config.js';

const ENABLED_CONFIG = {
  schemaVersion: 1,
  enabled: true,
  apiBaseUrl: 'https://api.example.test/alpha',
  cognitoRegion: 'us-east-1',
  cognitoClientId: 'clientid123456789',
} as const;

describe('cloud configuration', () => {
  it('accepts the strict enabled and disabled packaged schema', () => {
    expect(packagedCloudConfigSchema.parse(ENABLED_CONFIG)).toEqual(ENABLED_CONFIG);
    expect(packagedCloudConfigSchema.parse({ schemaVersion: 1, enabled: false })).toEqual({
      schemaVersion: 1,
      enabled: false,
    });
    expect(() =>
      packagedCloudConfigSchema.parse({ ...ENABLED_CONFIG, token: 'secret' }),
    ).toThrow();
    expect(() =>
      packagedCloudConfigSchema.parse({ ...ENABLED_CONFIG, apiBaseUrl: 'http://api.test' }),
    ).toThrow();
  });

  it('uses only the packaged resource in production and ignores redirecting environment values', async () => {
    const readResource = vi.fn(async () => JSON.stringify(ENABLED_CONFIG));

    await expect(
      loadCloudConfiguration({
        packaged: true,
        resourcesPath: '/Applications/Sia.app/Contents/Resources',
        environment: {
          SIA_API_BASE_URL: 'https://attacker.example',
          SIA_COGNITO_REGION: 'eu-west-1',
          SIA_COGNITO_CLIENT_ID: 'attackerclient123',
        },
        readResource,
      }),
    ).resolves.toEqual({
      apiBaseUrl: ENABLED_CONFIG.apiBaseUrl,
      cognitoRegion: ENABLED_CONFIG.cognitoRegion,
      cognitoClientId: ENABLED_CONFIG.cognitoClientId,
    });
    expect(readResource).toHaveBeenCalledWith(
      `/Applications/Sia.app/Contents/Resources/${CLOUD_CONFIG_RESOURCE}`,
    );
  });

  it('uses the complete environment contract only in development', () => {
    expect(
      developmentCloudConfiguration({
        SIA_API_BASE_URL: ENABLED_CONFIG.apiBaseUrl,
        SIA_COGNITO_REGION: ENABLED_CONFIG.cognitoRegion,
        SIA_COGNITO_CLIENT_ID: ENABLED_CONFIG.cognitoClientId,
      }),
    ).toEqual({
      apiBaseUrl: ENABLED_CONFIG.apiBaseUrl,
      cognitoRegion: ENABLED_CONFIG.cognitoRegion,
      cognitoClientId: ENABLED_CONFIG.cognitoClientId,
    });
    expect(() =>
      developmentCloudConfiguration({ SIA_API_BASE_URL: ENABLED_CONFIG.apiBaseUrl }),
    ).toThrow(/requires/);
  });

  it('fails closed for missing, malformed, oversized, or unknown packaged configuration', async () => {
    const base = {
      packaged: true,
      resourcesPath: '/resources',
      environment: {},
    } as const;
    await expect(
      loadCloudConfiguration({
        ...base,
        readResource: async () => Promise.reject(new Error()),
      }),
    ).rejects.toThrow(/missing/);
    await expect(
      loadCloudConfiguration({ ...base, readResource: async () => '{' }),
    ).rejects.toThrow(/valid JSON/);
    await expect(
      loadCloudConfiguration({ ...base, readResource: async () => 'x'.repeat(8_193) }),
    ).rejects.toThrow(/too large/);
    await expect(
      loadCloudConfiguration({
        ...base,
        readResource: async () => JSON.stringify({ ...ENABLED_CONFIG, extra: true }),
      }),
    ).rejects.toThrow(/schema version 1/);
  });
});
