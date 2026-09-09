import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { AssistantLibrary } from './assistant-library.js';
import type { RecordRepository } from './persistence.js';
function setup() {
  const records = new Map<string, unknown>();
  const repository = {
    get: (scope: string, id: string) => structuredClone(records.get(scope + id)),
    put: (scope: string, id: string, data: unknown) =>
      records.set(scope + id, structuredClone(data)),
  } as unknown as RecordRepository;
  const library = new AssistantLibrary(repository),
    agentId = randomUUID();
  const change = (input: Parameters<AssistantLibrary['change']>[0]) =>
    library.change(input, () => undefined);
  change({ operation: 'learning', agentId, enabled: true });
  const memories = ['Prefer concise updates.', 'Write brief status reports.'].map((text) =>
    change({
      operation: 'saveMemory',
      entry: { agentId, title: 'Writing', text, enabled: true },
    }).memories.at(-1)!,
  );
  for (let i = 0; i < 2; i++) {
    const turnId = randomUUID(),
      threadId = randomUUID();
    library.record({
      agentId,
      threadId,
      turnId,
      kind: 'lesson',
      title: 'Style',
      text: 'Use concise updates.',
    });
    library.record({
      agentId,
      threadId,
      turnId,
      kind: 'task',
      title: 'Task finished',
      text: 'complete',
    });
  }
  const evidence_ids = library
    .view()
    .journal!.filter((entry) => entry.kind === 'lesson')
    .map((entry) => entry.id);
  const merge = {
    kind: 'merge',
    title: 'Concise writing',
    reason: 'Both completed tasks support the same preference.',
    memory_ids: memories.map((entry) => entry.id),
    evidence_ids,
    text: 'Keep status updates concise.',
    description: '',
    source: '',
  };
  return { library, repository, agentId, change, merge, evidence_ids, memories };
}
it('stores proposals without changing memory, then applies an exact reviewed merge across restarts', () => {
  const { library, repository, agentId, merge, memories } = setup();
  const proposed = library.suggest(agentId, merge);
  expect(proposed.memories).toEqual(memories);
  const suggestion = proposed.suggestions![0]!;
  const restarted = new AssistantLibrary(repository);
  const next = restarted.change(
    {
      operation: 'resolveSuggestion',
      id: suggestion.id,
      revision: suggestion.revision,
      accept: true,
    },
    () => undefined,
  );
  expect(next.memories).toHaveLength(1);
  expect(next.memories[0]?.text).toBe(merge.text);
  expect(next.suggestions).toEqual([]);
});
it('refuses stale reviews, unknown revisions, cross-agent targets and incomplete-task evidence', () => {
  const { library, agentId, change, merge, memories } = setup();
  expect(() => library.suggest(randomUUID(), merge)).toThrow('Enable automatic');
  expect(() =>
    library.suggest(agentId, { ...merge, memory_ids: [memories[0]!.id, randomUUID()] }),
  ).toThrow('another agent');
  expect(() => library.suggest(agentId, { ...merge, evidence_ids: [randomUUID()] })).toThrow(
    'completed tasks',
  );
  const entry = library.suggest(agentId, merge).suggestions![0]!;
  expect(() =>
    change({
      operation: 'resolveSuggestion',
      id: entry.id,
      revision: '0'.repeat(64),
      accept: true,
    }),
  ).toThrow('changed');
  change({ operation: 'saveMemory', entry: { ...memories[0]!, text: 'A new preference.' } });
  expect(() =>
    change({
      operation: 'resolveSuggestion',
      id: entry.id,
      revision: entry.revision,
      accept: true,
    }),
  ).toThrow('memory changed');
  expect(library.view().memories[0]?.text).not.toBe(merge.text);
});
it('dismisses identical proposals durably even if the reason is reworded', () => {
  const { library, agentId, merge, change } = setup();
  const entry = library.suggest(agentId, merge).suggestions![0]!;
  change({
    operation: 'resolveSuggestion',
    id: entry.id,
    revision: entry.revision,
    accept: false,
  });
  expect(
    library.suggest(agentId, { ...merge, reason: 'Different reason' }).suggestions,
  ).toEqual([]);
  expect(library.view().memories).toHaveLength(2);
});
it('requires repeated evidence for a skill, saves exact code on acceptance, never runs it', () => {
  const { library, agentId, evidence_ids, change } = setup();
  const skill = {
    kind: 'skill',
    title: 'Inspect apps',
    description: 'Find available apps.',
    reason: 'Repeated observation.',
    memory_ids: [],
    evidence_ids,
    text: '',
    source: "sia_action computer_list '{}'",
  };
  expect(() => library.suggest(agentId, { ...skill, evidence_ids: [evidence_ids[0]] })).toThrow(
    'two completed',
  );
  const proposal = library.suggest(agentId, skill).suggestions![0]!;
  expect(library.view().skills).toEqual([]);
  const view = change({
    operation: 'resolveSuggestion',
    id: proposal.id,
    revision: proposal.revision,
    accept: true,
  });
  expect(view.skills![0]?.source).toBe(skill.source);
  expect(view.skills![0]?.revision).toMatch(/^[a-f0-9]{64}$/);
});
it('requires opt-in and new experience, throttles reviews, stops on pause and clears evidence on deletion', () => {
  const { library, agentId, change, merge } = setup();
  expect(library.reviewDue(agentId)).toBe(false);
  change({ operation: 'backgroundReview', agentId, enabled: true });
  expect(library.reviewDue(agentId)).toBe(true);
  library.markReview(agentId, randomUUID());
  expect(library.reviewDue(agentId, Date.now() + 7 * 3600000)).toBe(false);
  library.suggest(agentId, merge);
  change({ operation: 'clearJournal', agentId });
  expect(library.view().suggestions).toEqual([]);
  change({ operation: 'learning', agentId, enabled: false });
  expect(library.view().reviewAgents).toEqual([]);
  expect(() => library.suggest(agentId, merge)).toThrow('Enable automatic');
});
it('retirement suppresses identical relearning and merging preserves paused memories', () => {
  const { library, agentId, change, merge, memories } = setup();
  change({ operation: 'saveMemory', entry: { ...memories[0]!, enabled: false } });
  const merged = library.suggest(agentId, merge).suggestions![0]!;
  const view = change({
    operation: 'resolveSuggestion',
    id: merged.id,
    revision: merged.revision,
    accept: true,
  });
  expect(view.memories[0]?.enabled).toBe(false);
  const retire = library.suggest(agentId, {
    ...merge,
    kind: 'retire',
    memory_ids: [view.memories[0]!.id],
    text: '',
  }).suggestions![0]!;
  change({
    operation: 'resolveSuggestion',
    id: retire.id,
    revision: retire.revision,
    accept: true,
  });
  const prior = library.view().journal![0]!;
  library.record({ ...prior, kind: 'lesson', text: merge.text });
  expect(library.view().journal?.some((entry) => entry.text === merge.text)).toBe(false);
});
