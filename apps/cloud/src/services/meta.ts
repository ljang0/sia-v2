import { createHash } from 'node:crypto';
import type { HostedCatalogRoute } from '@sia/protocol';
import type { AuthContext, MetaStreamEvent, MetaTurnRequest } from '../contracts.js';
import { CloudError, canonicalJson, requireString } from '../domain.js';
import type { HostedLabConfig, MetaConfig, MetaTokenUsage } from '../ports.js';
import type { ServiceDependencies } from '../services.js';
import { requireFeature, requireMetaAccess } from './access.js';
import { dailyQuotaWindow, nextUtcDay } from './quota-window.js';

export class MetaService {
  constructor(private readonly deps: ServiceDependencies) {}

  async capabilities(user: AuthContext) {
    requireMetaAccess(user);
    if (!this.deps.config.features.hostedModels) {
      return unavailableMetaCapabilities('Hosted models are temporarily unavailable');
    }
    const config = await this.deps.secrets.meta();
    const now = this.deps.clock.now();
    const labs = hostedLabConfigs(config).filter((lab) => labActive(lab, now));
    if (labs.length === 0) {
      return unavailableMetaCapabilities('Hosted models are temporarily unavailable');
    }
    const capabilities = await Promise.all(
      labs.map((lab) => this.deps.metaProvider.capabilities(lab).catch(() => undefined)),
    );
    const available = capabilities.filter((value) => value !== undefined);
    if (available.length === 0) {
      return unavailableMetaCapabilities('Hosted model capability check failed');
    }
    return {
      available: true,
      models: [...new Set(available.flatMap(({ models }) => models))],
      streaming: available.every(({ streaming }) => streaming),
      tools: available.every(({ tools }) => tools),
    };
  }

  async catalog(user: AuthContext) {
    requireMetaAccess(user);
    if (!this.deps.config.features.hostedModels) {
      return { schemaVersion: 1 as const, providers: [] };
    }
    const config = await this.deps.secrets.meta();
    const providers = await Promise.all(
      hostedLabConfigs(config).map(async (lab) => {
        const id = labIdOf(lab);
        const name = lab.displayName ?? 'Included model';
        const limits = metaLimits(this.deps, lab);
        if (!labActive(lab, this.deps.clock.now()) || (await this.#creditExhausted(lab))) {
          return hostedModelCatalogEntry(lab, id, name, limits, false, []);
        }
        try {
          const capabilities = await this.deps.metaProvider.capabilities(lab);
          return hostedModelCatalogEntry(
            lab,
            id,
            name,
            limits,
            true,
            capabilities.models,
            capabilities,
          );
        } catch {
          return hostedModelCatalogEntry(lab, id, name, limits, false, []);
        }
      }),
    );
    return { schemaVersion: 1 as const, providers };
  }

  async usage(user: AuthContext) {
    requireMetaAccess(user);
    if (!this.deps.config.features.hostedModels) {
      return { schemaVersion: 1 as const, providers: [] };
    }
    const config = await this.deps.secrets.meta();
    const window = dailyQuotaWindow(this.deps.clock.now());
    return {
      schemaVersion: 1 as const,
      providers: await Promise.all(
        hostedLabConfigs(config).map(async (lab) => {
          const limits = metaLimits(this.deps, lab);
          const usage = await this.deps.quota.getMetaUsage(
            user.subject,
            labIdOf(lab),
            window.period,
          );
          return {
            id: labIdOf(lab),
            period: {
              startsAt: `${window.period}T00:00:00.000Z`,
              endsAt: nextUtcDay(window.period),
            },
            usage,
            limits: {
              requests: limits.requestLimit,
              tokens: limits.tokenLimit,
            },
            remaining: {
              requests: Math.max(0, limits.requestLimit - usage.requests),
              tokens: Math.max(0, limits.tokenLimit - usage.totalTokens),
            },
          };
        }),
      ),
    };
  }

  async *stream(user: AuthContext, request: MetaTurnRequest): AsyncIterable<MetaStreamEvent> {
    requireMetaAccess(user);
    requireFeature(this.deps.config.features.hostedModels, 'hosted_models_disabled');
    validateMetaRequest(request);
    const rootConfig = await this.deps.secrets.meta();
    const requestedModel = request.model?.trim();
    const now = this.deps.clock.now();
    const config = hostedLabConfigs(rootConfig).find((lab) => {
      if (!labActive(lab, now)) return false;
      const models = lab.allowedModels ?? [lab.model];
      return requestedModel ? models.includes(requestedModel) : lab === rootConfig;
    });
    if (!config)
      throw new CloudError(
        503,
        'meta_disabled',
        requestedModel
          ? 'That hosted model is unavailable'
          : 'Hosted models are temporarily unavailable',
        true,
      );
    const model = requestedModel ?? config.model;
    if (config.allowedModels && !config.allowedModels.includes(model)) {
      throw new CloudError(400, 'meta_model_not_allowed', 'That hosted model is not enabled');
    }
    const window = dailyQuotaWindow(now);
    const limits = metaLimits(this.deps, config);
    const labId = labIdOf(config);
    const lease = await this.deps.quota.acquireMeta(user.subject, {
      ...window,
      labId,
      requestLimit: limits.requestLimit,
      tokenLimit: limits.tokenLimit,
      ...(config.creditTokenLimit === undefined
        ? {}
        : { creditTokenLimit: config.creditTokenLimit }),
    });
    const attribution = {
      ...window,
      labId,
      model,
      harnessId: request.harnessId ?? 'unknown',
    };
    let usage: MetaTokenUsage | undefined;
    let usageRecorded = false;
    let doneEvent: Extract<MetaStreamEvent, { type: 'done' }> | undefined;
    try {
      const upstreamSessionId = scopedProviderSessionId(user.subject, request);
      for await (const event of this.deps.metaProvider.stream(
        { ...config, maxOutputTokens: limits.maxOutputTokens },
        {
          ...request,
          model,
          sessionId: upstreamSessionId,
        },
      )) {
        if (event.type === 'usage') usage = parseMetaTokenUsage(event.usage);
        if (event.type === 'done') doneEvent = event;
        else yield event;
      }
      await this.deps.quota.recordMetaUsage(user.subject, attribution, usage ?? NO_TOKENS);
      usageRecorded = true;
      if (doneEvent) yield doneEvent;
    } finally {
      try {
        // Every admitted request is attributed, even one that fails before reporting usage.
        if (!usageRecorded) {
          await this.deps.quota.recordMetaUsage(user.subject, attribution, usage ?? NO_TOKENS);
        }
      } finally {
        await lease.release();
      }
    }
  }

  async #creditExhausted(lab: HostedLabConfig): Promise<boolean> {
    if (lab.creditTokenLimit === undefined) return false;
    return (await this.deps.quota.getLabCreditUsage(labIdOf(lab))) >= lab.creditTokenLimit;
  }
}

const NO_TOKENS: MetaTokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function labIdOf(lab: HostedLabConfig): string {
  return lab.catalogId ?? 'meta';
}

/** Disabled and expired labs (for example, after sponsor credit ends) are never offered. */
function labActive(lab: HostedLabConfig, now: Date): boolean {
  if (!lab.enabled) return false;
  return lab.availableUntil === undefined || now.getTime() < Date.parse(lab.availableUntil);
}

function validateMetaRequest(request: MetaTurnRequest): void {
  requireString(request.turnId, 'turnId', { max: 128 });
  if (
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > 500
  ) {
    throw new CloudError(400, 'invalid_meta_turn', 'A Meta turn must contain 1-500 messages');
  }
  if ((request.tools?.length ?? 0) > 64) {
    throw new CloudError(400, 'invalid_meta_turn', 'A Meta turn can expose at most 64 tools');
  }
  const bytes = Buffer.byteLength(canonicalJson(request));
  if (bytes > 2 * 1024 * 1024)
    throw new CloudError(413, 'meta_turn_too_large', 'Meta turn exceeds 2 MiB');
}

function unavailableMetaCapabilities(reason: string) {
  return {
    available: false,
    models: [] as string[],
    streaming: false,
    tools: false,
    reason,
  };
}

function metaLimits(deps: ServiceDependencies, config: HostedLabConfig) {
  return {
    requestLimit: config.dailyRequestLimit ?? deps.config.metaDailyRequestLimit,
    tokenLimit: config.dailyTokenLimit ?? deps.config.metaDailyTokenLimit,
    maxOutputTokens: config.maxOutputTokens ?? 4_096,
  };
}

function hostedModelCatalogEntry(
  config: HostedLabConfig,
  id: string,
  name: string,
  limits: ReturnType<typeof metaLimits>,
  available: boolean,
  models: readonly string[],
  capabilities: { streaming: boolean; tools: boolean } = {
    streaming: false,
    tools: false,
  },
) {
  const routeByModelAndHarness = new Map<string, HostedCatalogRoute>(
    models.map((model) => {
      const route = {
        model,
        harnessId: 'codex_app_server' as const,
        harnessModelId: model,
        credentialSource: 'sia_managed' as const,
        apiProtocol: 'openai_responses' as const,
      };
      return [`${route.model}\0${route.harnessId}`, route] as const;
    }),
  );
  for (const route of config.harnessRoutes ?? []) {
    const key = `${route.model}\0${route.harnessId}`;
    // Lab routes add to the managed Codex baseline; they never replace it.
    if (models.includes(route.model) && !routeByModelAndHarness.has(key)) {
      routeByModelAndHarness.set(key, route);
    }
  }
  const routes = [...routeByModelAndHarness.values()];
  const defaultHarnessId = config.defaultHarnessId ?? ('codex_app_server' as const);
  return {
    id,
    name,
    kind: 'hosted' as const,
    credentialMode: 'managed' as const,
    available,
    defaultModel: config.model,
    models: models.map((model) => ({
      id: model,
      name: config.modelLabels?.[model] ?? model,
      apiProtocols: [
        ...new Set(
          routes
            .filter((route) => route.model === model)
            .map(({ apiProtocol: routeProtocol }) => routeProtocol),
        ),
      ],
    })),
    capabilities: {
      streaming: capabilities.streaming,
      tools: capabilities.tools,
    },
    execution: {
      defaultHarnessId,
      routes,
    },
    limits: {
      dailyRequests: limits.requestLimit,
      dailyTokens: limits.tokenLimit,
      maxOutputTokens: limits.maxOutputTokens,
    },
  };
}

/** Catalog ids and display names of every configured hosted lab, active or not. */
export function hostedLabs(config: MetaConfig): { id: string; name: string }[] {
  return hostedLabConfigs(config).map((lab) => ({
    id: labIdOf(lab),
    name: lab.displayName ?? 'Included model',
  }));
}

function hostedLabConfigs(config: MetaConfig): readonly HostedLabConfig[] {
  return [config, ...(config.additionalLabs ?? [])];
}

function scopedProviderSessionId(userId: string, request: MetaTurnRequest): string {
  return createHash('sha256')
    .update('sia-hosted-model\0')
    .update(userId)
    .update('\0')
    .update(request.sessionId ?? request.turnId)
    .digest('base64url');
}

function parseMetaTokenUsage(value: Record<string, unknown>): MetaTokenUsage | undefined {
  const inputTokens = nonNegativeUsageInteger(value.input_tokens ?? value.prompt_tokens);
  const outputTokens = nonNegativeUsageInteger(value.output_tokens ?? value.completion_tokens);
  const suppliedTotal = nonNegativeUsageInteger(value.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && suppliedTotal === undefined) {
    return undefined;
  }
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: Math.max(suppliedTotal ?? 0, input + output),
  };
}

function nonNegativeUsageInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
