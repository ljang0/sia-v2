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
  const selected = {
    id: selectedModel,
    label: friendlyModelName(provider as ProviderId, selectedModel),
  };
  if (!models.length) return [selected];
  const available = models.map((model) => ({
    id: model.id,
    label: model.label,
    detail: model.description,
  }));
  // A refreshed catalog can drop a conversation's pinned model. A select whose value has
  // no option visually selects the first model without actually changing the conversation.
  return models.some((model) => model.id === selectedModel)
    ? available
    : [{ ...selected, label: `${selected.label} (unavailable)`, disabled: true }, ...available];
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
