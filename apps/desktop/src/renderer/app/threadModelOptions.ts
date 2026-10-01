import { friendlyModelName } from '../agentModels';
import type { ProviderId, RendererSnapshot } from '../types';

// The model and reasoning choices offered for the open conversation.

function providerModels(snapshot: RendererSnapshot, provider: string) {
  return snapshot.providers.find((candidate) => candidate.id === provider)?.models ?? [];
}

export function modelOptions(
  snapshot: RendererSnapshot,
  provider: string,
  selectedModel: string,
) {
  const models = providerModels(snapshot, provider);
  return models.length
    ? models.map((model) => ({ id: model.id, label: model.label, detail: model.description }))
    : [
        {
          id: selectedModel,
          label: friendlyModelName(provider as ProviderId, selectedModel),
        },
      ];
}

export function reasoningOptions(
  snapshot: RendererSnapshot,
  provider: string,
  modelId: string,
  selected?: string,
) {
  const efforts =
    providerModels(snapshot, provider).find((model) => model.id === modelId)
      ?.reasoningEfforts ?? [];
  const values = efforts.length ? efforts : selected ? [selected] : [''];
  return values.map((effort) => ({
    id: effort,
    label: effort ? effort[0]!.toUpperCase() + effort.slice(1) : 'Default',
  }));
}

export function defaultReasoning(
  snapshot: RendererSnapshot,
  provider: string,
  modelId: string,
) {
  return providerModels(snapshot, provider).find((model) => model.id === modelId)
    ?.defaultReasoningEffort;
}
