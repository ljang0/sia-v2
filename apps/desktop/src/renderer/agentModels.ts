import type { ProviderId, ProviderSetup } from './types';

interface ModelChoice {
  provider: ProviderId;
  model: string;
  label: string;
  ready: boolean;
}

const RELEASE_PROVIDER_ORDER: ProviderId[] = ['codex', 'meta', 'byok', 'lab'];

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
      ? provider.models.map((model) => ({ id: model.id, label: model.label }))
      : [{ id: provider.model, label: friendlyModelName(provider.id, provider.model) }];
    return models.map((model) => ({
      provider: provider.id,
      model: model.id,
      label:
        provider.id === 'meta'
          ? `${model.label} · Included`
          : provider.id === 'codex'
            ? `${model.label} · Codex plan`
            : provider.id === 'byok'
              ? `${model.label} · Your API key`
              : provider.id === 'lab'
                ? `${model.label} · Lab test`
                : `${model.label} — ${provider.name}`,
      ready: provider.status === 'ready',
    }));
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
  if (provider === 'meta') return 'Included model';
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
  return (
    provider?.plan ?? provider?.models?.find(({ id }) => id === model)?.label ?? provider?.name
  );
}
