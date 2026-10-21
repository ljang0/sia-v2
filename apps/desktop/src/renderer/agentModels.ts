import type { ProviderId, ProviderSetup } from './types';

interface ModelChoice {
  provider: ProviderId;
  model: string;
  label: string;
  ready: boolean;
}

const RELEASE_PROVIDER_ORDER: ProviderId[] = ['codex', 'meta', 'byok', 'lab'];

/** How the picker says who pays for a model, per provider. */
const ACCESS_LABEL: Partial<Record<ProviderId, string>> = {
  meta: 'Included',
  codex: 'ChatGPT plan',
  byok: 'Your API key',
  lab: 'Lab test',
};

/** The default name the hosted catalog gives a lab that has no display name of its own. */
const UNNAMED_LAB = 'Included model';

export function firstReadyModel(providers: ProviderSetup[]): ModelChoice | undefined {
  return modelChoices(providers).find((choice) => choice.ready);
}

export function modelChoices(
  providers: ProviderSetup[],
  current?: { provider: ProviderId; model: string },
): ModelChoice[] {
  const choices = RELEASE_PROVIDER_ORDER.flatMap((providerId) => {
    const provider = providers.find((candidate) => candidate.id === providerId);
    // Your own model appears only once its key is saved.
    if (!provider || (provider.id === 'byok' && provider.status !== 'ready')) return [];
    const models = provider.models?.length
      ? provider.models
      : [{ id: provider.model, label: friendlyModelName(provider.id, provider.model) }];
    return models.map((model) => {
      // A named sponsor or lab ("Arena") says more than the generic "Included".
      const lab = 'lab' in model && model.lab?.name !== UNNAMED_LAB ? model.lab : undefined;
      const access = lab?.name ?? ACCESS_LABEL[provider.id];
      return {
        provider: provider.id,
        model: model.id,
        label: access ? `${model.label} · ${access}` : `${model.label} — ${provider.name}`,
        ready: provider.status === 'ready',
      };
    });
  });

  if (
    current &&
    !choices.some(
      (choice) => choice.provider === current.provider && choice.model === current.model,
    )
  ) {
    const provider = providers.find((candidate) => candidate.id === current.provider);
    choices.push({
      provider: current.provider,
      model: current.model,
      label: `${friendlyModelName(current.provider, current.model)} — ${provider?.name ?? 'Current plan'}`,
      ready: provider?.status === 'ready',
    });
  }

  return choices;
}

/** A model's display name when the provider catalog does not supply one. */
export function friendlyModelName(provider: ProviderId, model: string): string {
  if (provider === 'meta') return 'Included AI';
  if (model === 'gpt-5.6-sol') return 'GPT-5.6 Sol';
  if (model === 'sonnet') return 'Sonnet';
  return model
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * What the composer says runs a thread, in consumer words: the plan from the provider
 * catalog ("ChatGPT plan"), else the model's display name, else the provider name.
 */
export function executionLabel(
  providers: readonly ProviderSetup[],
  providerId: ProviderId,
  model: string,
): string | undefined {
  const provider = providers.find(({ id }) => id === providerId);
  const entry = provider?.models?.find(({ id }) => id === model);
  const lab = entry?.lab && entry.lab.name !== UNNAMED_LAB ? entry.lab.name : undefined;
  if (provider?.plan) return lab ? `${provider.plan} · ${lab}` : provider.plan;
  return entry?.label ?? provider?.name;
}
