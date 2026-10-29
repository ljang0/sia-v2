import type { AssistantMemory } from '../../shared/assistant-library.js';
import { memoryMatchScore } from '../notch/memory-selection.js';
import { containsMemoryCredentials } from './memory-privacy.js';

/** Select whole entries within a budget; never cut JSON or a preference halfway through. */
export function promptMemories(
  memories: readonly AssistantMemory[],
  agentId: string,
  request = '',
) {
  const selected: { title: string; text: string }[] = [];
  let remaining = 15_500;
  const ranked = memories
    .filter(
      (entry) =>
        entry.enabled &&
        entry.agentId === agentId &&
        !containsMemoryCredentials(entry.title + '\n' + entry.text),
    )
    .map((entry, index) => ({
      entry,
      index,
      score: memoryMatchScore(entry.title, request) * 3 + memoryMatchScore(entry.text, request),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  for (const { entry } of ranked) {
    const value = { title: entry.title, text: entry.text };
    const cost = JSON.stringify(value).length + 1;
    if (cost > remaining) continue;
    selected.push(value);
    remaining -= cost;
  }
  return selected;
}
