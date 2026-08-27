import type {
  CredentialSource,
  HarnessId,
  HostedCatalogRoute,
  ModelApiProtocol,
  ModelRoute,
  ProviderId,
} from '@sia/protocol';

export interface HarnessDefinition {
  readonly id: HarnessId;
  readonly name: string;
  readonly modelProtocols: readonly ModelApiProtocol[];
  readonly credentialSources: readonly CredentialSource[];
  /** A catalog route is not executable until its adapter has passed release admission. */
  readonly productionEnabled: boolean;
}

/**
 * One deliberately small registry is the only policy file that needs changing
 * when a built-in harness completes conformance. Protocol schemas intentionally
 * accept additional safe ids so lab adapters do not require a persistence migration.
 */
export const BUILTIN_HARNESS_DEFINITIONS = [
  {
    id: 'codex_app_server',
    name: 'Codex app server',
    modelProtocols: ['openai_responses'],
    credentialSources: ['provider_subscription', 'provider_api', 'sia_managed'],
    productionEnabled: true,
  },
  {
    id: 'claude_code',
    name: 'Claude Code',
    modelProtocols: ['anthropic_messages'],
    credentialSources: ['provider_subscription'],
    productionEnabled: true,
  },
  {
    id: 'legacy_acp',
    name: 'Legacy ACP',
    modelProtocols: ['openai_chat_completions', 'anthropic_messages'],
    credentialSources: ['provider_subscription', 'provider_api'],
    productionEnabled: false,
  },
  {
    id: 'opencode_acp',
    name: 'OpenCode ACP',
    modelProtocols: ['openai_responses', 'openai_chat_completions', 'anthropic_messages'],
    credentialSources: ['provider_subscription', 'provider_api'],
    productionEnabled: false,
  },
  {
    id: 'pi_rpc',
    name: 'Pi RPC',
    modelProtocols: ['openai_responses', 'openai_chat_completions', 'anthropic_messages'],
    credentialSources: ['provider_subscription', 'provider_api'],
    productionEnabled: false,
  },
  {
    id: 'sia_direct',
    name: 'Sia managed',
    modelProtocols: ['openai_responses', 'openai_chat_completions'],
    credentialSources: ['sia_managed'],
    productionEnabled: true,
  },
] as const satisfies readonly HarnessDefinition[];

export class HarnessRegistry {
  readonly #definitions = new Map<HarnessId, HarnessDefinition>();

  constructor(definitions: readonly HarnessDefinition[] = BUILTIN_HARNESS_DEFINITIONS) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: HarnessDefinition): void {
    if (this.#definitions.has(definition.id)) {
      throw new Error(`Harness ${definition.id} is already registered`);
    }
    this.#definitions.set(definition.id, Object.freeze({ ...definition }));
  }

  get(id: HarnessId): HarnessDefinition | undefined {
    return this.#definitions.get(id);
  }

  list(): readonly HarnessDefinition[] {
    return [...this.#definitions.values()];
  }

  accepts(route: HostedCatalogRoute, productionOnly = true): boolean {
    const definition = this.get(route.harnessId);
    return Boolean(
      definition &&
      (!productionOnly || definition.productionEnabled) &&
      definition.modelProtocols.includes(route.apiProtocol) &&
      definition.credentialSources.includes(route.credentialSource),
    );
  }
}

export interface AdmittedHostedRoutes {
  readonly allowedRoutes: readonly ModelRoute[];
  readonly backendDefault?: ModelRoute;
  readonly rejectedRoutes: readonly HostedCatalogRoute[];
}

/**
 * Converts authenticated catalog data into immutable runtime routes. Unknown,
 * protocol-incompatible, credential-incompatible, and non-release harnesses fail closed.
 */
export function admitHostedRoutes(input: {
  readonly provider: ProviderId;
  readonly defaultHarnessId: HarnessId;
  readonly routes: readonly HostedCatalogRoute[];
  readonly registry?: HarnessRegistry;
  readonly productionOnly?: boolean;
}): AdmittedHostedRoutes {
  const registry = input.registry ?? new HarnessRegistry();
  const productionOnly = input.productionOnly ?? true;
  const allowedRoutes: ModelRoute[] = [];
  const rejectedRoutes: HostedCatalogRoute[] = [];
  for (const route of input.routes) {
    if (!registry.accepts(route, productionOnly)) {
      rejectedRoutes.push(route);
      continue;
    }
    allowedRoutes.push(
      Object.freeze({
        provider: input.provider,
        model: route.model,
        harnessId: route.harnessId,
        harnessModelId: route.harnessModelId,
        credentialSource: route.credentialSource,
      }),
    );
  }
  const backendDefault = allowedRoutes.find(
    ({ harnessId }) => harnessId === input.defaultHarnessId,
  );
  return {
    allowedRoutes: Object.freeze(allowedRoutes),
    ...(backendDefault ? { backendDefault } : {}),
    rejectedRoutes: Object.freeze(rejectedRoutes),
  };
}
