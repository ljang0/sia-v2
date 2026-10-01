import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  harnessIdSchema,
  hostedCatalogRouteSchema,
  modelApiProtocolSchema,
} from '@sia/protocol';
import {
  LEGACY_GOOGLE_APP_IDS,
  TOOL_POLICIES,
  VOICE_TOKEN_TYPES,
  type ToolName,
  type VoiceTokenType,
} from '../contracts.js';
import { assertComposioContract } from '../connector-contract.js';
import { CloudError, isRecord } from '../domain.js';
import type {
  ComposioConfig,
  ElevenLabsConfig,
  GoogleOAuthConfig,
  HostedLabConfig,
  MetaConfig,
  SecretProvider,
} from '../ports.js';
import { ensureTrailingSlash } from './shared.js';

export class SecretsManagerProvider implements SecretProvider {
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  constructor(
    private readonly client: SecretsManagerClient,
    private readonly metaSecretArn: string,
    private readonly elevenLabsSecretArn: string,
    private readonly composioSecretArn: string,
    private readonly googleSecretArn: string,
    private readonly registrationSecretArn: string,
    private readonly cacheMilliseconds = 60_000,
  ) {}

  async meta(): Promise<MetaConfig> {
    const value = await this.read(this.metaSecretArn);
    return parseMetaConfig(value);
  }

  async elevenLabs(): Promise<ElevenLabsConfig> {
    const value = await this.read(this.elevenLabsSecretArn);
    return parseElevenLabsConfig(value);
  }

  async composio(): Promise<ComposioConfig> {
    const value = await this.read(this.composioSecretArn);
    return parseComposioConfig(value);
  }

  async google(): Promise<GoogleOAuthConfig> {
    const value = await this.read(this.googleSecretArn);
    return parseGoogleOAuthConfig(value);
  }

  async registrationSalt(): Promise<string> {
    const value = await this.read(this.registrationSecretArn);
    if (!isRecord(value)) {
      throw new CloudError(503, 'secret_invalid', 'Registration protection is unavailable');
    }
    return secretString(value.salt);
  }

  private async read(secretId: string): Promise<unknown> {
    const cached = this.cache.get(secretId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const text =
      result.SecretString ??
      (result.SecretBinary ? Buffer.from(result.SecretBinary).toString('utf8') : undefined);
    if (!text)
      throw new CloudError(
        503,
        'secret_unavailable',
        'Provider configuration is unavailable',
        true,
      );
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new CloudError(503, 'secret_invalid', 'Provider configuration is invalid', false);
    }
    this.cache.set(secretId, { expiresAt: Date.now() + this.cacheMilliseconds, value });
    return value;
  }
}

function parseMetaConfig(value: unknown): MetaConfig {
  const primary = parseHostedLabConfig(value);
  const additionalLabs =
    isRecord(value) && Array.isArray(value.additionalLabs)
      ? value.additionalLabs.map((lab) => parseHostedLabConfig(lab))
      : undefined;
  const ids = new Set<string>();
  const models = new Set<string>();
  for (const lab of [primary, ...(additionalLabs ?? [])]) {
    const id = lab.catalogId ?? 'meta';
    if (ids.has(id)) {
      throw new CloudError(503, 'secret_invalid', 'Hosted model lab ids must be unique');
    }
    ids.add(id);
    for (const model of lab.allowedModels ?? [lab.model]) {
      if (models.has(model)) {
        throw new CloudError(
          503,
          'secret_invalid',
          'Hosted model ids must be unique across labs',
        );
      }
      models.add(model);
    }
  }
  return {
    ...primary,
    ...(additionalLabs?.length ? { additionalLabs } : {}),
  };
}

function parseHostedLabConfig(value: unknown): HostedLabConfig {
  if (!isRecord(value))
    throw new CloudError(503, 'secret_invalid', 'Meta configuration is invalid');
  const allowedModels = Array.isArray(value.allowedModels)
    ? uniqueConfigStrings(value.allowedModels, 'allowedModels')
    : undefined;
  const modelLabels = isRecord(value.modelLabels)
    ? Object.fromEntries(
        Object.entries(value.modelLabels).map(([model, label]) => [
          configIdentifier(model, 'modelLabels model'),
          boundedConfigString(label, `modelLabels.${model}`, 120),
        ]),
      )
    : undefined;
  const apiProtocolResult = modelApiProtocolSchema.safeParse(
    value.apiProtocol ?? 'openai_chat_completions',
  );
  if (!apiProtocolResult.success) {
    throw new CloudError(503, 'secret_invalid', 'Hosted model apiProtocol is invalid');
  }
  const harnessRoutes = Array.isArray(value.harnessRoutes)
    ? value.harnessRoutes.map((route, index) => {
        const parsed = hostedCatalogRouteSchema.safeParse(route);
        if (!parsed.success) {
          throw new CloudError(
            503,
            'secret_invalid',
            `Hosted model harnessRoutes[${index}] is invalid`,
          );
        }
        return parsed.data;
      })
    : undefined;
  const defaultHarnessResult =
    value.defaultHarnessId === undefined
      ? undefined
      : harnessIdSchema.safeParse(value.defaultHarnessId);
  if (defaultHarnessResult && !defaultHarnessResult.success) {
    throw new CloudError(503, 'secret_invalid', 'Hosted model defaultHarnessId is invalid');
  }
  const enabledModels = new Set(allowedModels ?? [configString(value.model, 'model')]);
  for (const route of harnessRoutes ?? []) {
    if (!enabledModels.has(route.model) || route.apiProtocol !== apiProtocolResult.data) {
      throw new CloudError(
        503,
        'secret_invalid',
        'Hosted model routes must reference an allowed model and its configured API protocol',
      );
    }
  }
  if (
    defaultHarnessResult?.success &&
    harnessRoutes &&
    !harnessRoutes.some(({ harnessId }) => harnessId === defaultHarnessResult.data)
  ) {
    throw new CloudError(
      503,
      'secret_invalid',
      'Hosted model defaultHarnessId does not have a configured route',
    );
  }
  return {
    apiKey: secretString(value.apiKey),
    endpoint: configString(value.endpoint, 'endpoint'),
    model: configString(value.model, 'model'),
    enabled: value.enabled === true,
    apiProtocol: apiProtocolResult.data,
    ...(typeof value.sessionHeader === 'string' ? { sessionHeader: value.sessionHeader } : {}),
    ...(allowedModels === undefined ? {} : { allowedModels }),
    ...(value.catalogId === undefined
      ? {}
      : { catalogId: configIdentifier(value.catalogId, 'catalogId') }),
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedConfigString(value.displayName, 'displayName', 120) }),
    ...(modelLabels === undefined ? {} : { modelLabels }),
    ...(value.dailyRequestLimit === undefined
      ? {}
      : {
          dailyRequestLimit: configPositiveInteger(
            value.dailyRequestLimit,
            'dailyRequestLimit',
          ),
        }),
    ...(value.dailyTokenLimit === undefined
      ? {}
      : { dailyTokenLimit: configPositiveInteger(value.dailyTokenLimit, 'dailyTokenLimit') }),
    ...(value.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: configPositiveInteger(value.maxOutputTokens, 'maxOutputTokens') }),
    ...(harnessRoutes === undefined ? {} : { harnessRoutes }),
    ...(defaultHarnessResult?.success ? { defaultHarnessId: defaultHarnessResult.data } : {}),
  };
}

function parseElevenLabsConfig(value: unknown): ElevenLabsConfig {
  if (!isRecord(value)) {
    throw new CloudError(503, 'secret_invalid', 'ElevenLabs configuration is invalid');
  }
  const baseUrl =
    value.baseUrl === undefined
      ? 'https://api.elevenlabs.io/'
      : configString(value.baseUrl, 'baseUrl');
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new CloudError(503, 'secret_invalid', 'ElevenLabs base URL is invalid');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new CloudError(503, 'secret_invalid', 'ElevenLabs base URL is not allowed');
  }
  const allowedVoiceIds = Array.isArray(value.allowedVoiceIds)
    ? uniqueConfigStrings(value.allowedVoiceIds, 'allowedVoiceIds')
    : undefined;
  const allowedTokenTypes = Array.isArray(value.allowedTokenTypes)
    ? uniqueConfigStrings(value.allowedTokenTypes, 'allowedTokenTypes').map((type) => {
        if (!(VOICE_TOKEN_TYPES as readonly string[]).includes(type)) {
          throw new CloudError(
            503,
            'secret_invalid',
            'ElevenLabs allowedTokenTypes contains an unsupported value',
          );
        }
        return type as VoiceTokenType;
      })
    : undefined;
  return {
    apiKey: secretString(value.apiKey),
    baseUrl: ensureTrailingSlash(endpoint.toString()),
    enabled: value.enabled === true,
    ...(value.displayName === undefined
      ? {}
      : { displayName: boundedConfigString(value.displayName, 'displayName', 120) }),
    ...(allowedVoiceIds === undefined ? {} : { allowedVoiceIds }),
    ...(allowedTokenTypes === undefined ? {} : { allowedTokenTypes }),
    ...(value.dailyTokenMintLimit === undefined
      ? {}
      : {
          dailyTokenMintLimit: configPositiveInteger(
            value.dailyTokenMintLimit,
            'dailyTokenMintLimit',
          ),
        }),
  };
}

function parseComposioConfig(value: unknown): ComposioConfig {
  if (
    !isRecord(value) ||
    !isRecord(value.authConfigIds) ||
    !isRecord(value.toolSlugs) ||
    !isRecord(value.toolVersions)
  ) {
    throw new CloudError(503, 'secret_invalid', 'Composio configuration is invalid');
  }
  const authConfigIdsValue = value.authConfigIds;
  const toolSlugsValue = value.toolSlugs;
  const toolVersionsValue = value.toolVersions;
  const authConfigIds = Object.fromEntries(
    [...LEGACY_GOOGLE_APP_IDS, 'slack'].map((app) => [
      app,
      configString(authConfigIdsValue[app], `authConfigIds.${app}`),
    ]),
  ) as ComposioConfig['authConfigIds'];
  const toolSlugs = Object.fromEntries(
    (Object.keys(TOOL_POLICIES) as ToolName[]).map((tool) => [
      tool,
      configString(toolSlugsValue[tool], `toolSlugs.${tool}`),
    ]),
  ) as Record<ToolName, string>;
  const toolVersions = Object.fromEntries(
    (Object.keys(TOOL_POLICIES) as ToolName[]).map((tool) => [
      tool,
      configString(toolVersionsValue[tool], `toolVersions.${tool}`),
    ]),
  ) as Record<ToolName, string>;
  const config: ComposioConfig = {
    apiKey: secretString(value.apiKey),
    baseUrl: configString(value.baseUrl, 'baseUrl'),
    authConfigIds,
    toolSlugs,
    toolVersions,
  };
  assertComposioContract(config);
  return config;
}

function parseGoogleOAuthConfig(value: unknown): GoogleOAuthConfig {
  if (!isRecord(value)) {
    throw new CloudError(503, 'secret_invalid', 'Google OAuth configuration is invalid');
  }
  const redirectUri = configString(value.redirectUri, 'redirectUri');
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new CloudError(503, 'secret_invalid', 'Google redirect URI is invalid');
  }
  if (
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    redirect.search ||
    !redirect.pathname.endsWith('/v1/oauth/google/callback')
  ) {
    throw new CloudError(503, 'secret_invalid', 'Google redirect URI is not allowed');
  }
  return {
    clientId: secretString(value.clientId),
    clientSecret: secretString(value.clientSecret),
    redirectUri: redirect.toString(),
  };
}

function secretString(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.startsWith('REPLACE')) {
    throw new CloudError(
      503,
      'provider_not_configured',
      'Provider credentials have not been configured',
    );
  }
  return value;
}

function configString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CloudError(503, 'secret_invalid', `Provider ${label} is missing`);
  }
  return value;
}

function boundedConfigString(value: unknown, label: string, maximum: number): string {
  const text = configString(value, label).trim();
  if (text.length > maximum) {
    throw new CloudError(503, 'secret_invalid', `Provider ${label} is too long`);
  }
  return text;
}

function configIdentifier(value: unknown, label: string): string {
  const identifier = boundedConfigString(value, label, 128);
  if (!/^[A-Za-z0-9._/-]+$/.test(identifier)) {
    throw new CloudError(503, 'secret_invalid', `Provider ${label} is invalid`);
  }
  return identifier;
}

function configPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new CloudError(503, 'secret_invalid', `Provider ${label} must be a positive integer`);
  }
  return value;
}

function uniqueConfigStrings(value: unknown[], label: string): string[] {
  const strings = value.map((item, index) =>
    boundedConfigString(item, `${label}[${index}]`, 256),
  );
  return [...new Set(strings)];
}
