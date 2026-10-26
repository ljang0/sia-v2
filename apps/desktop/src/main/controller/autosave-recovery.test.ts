import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopPushEvent } from '../../shared/bridge.js';
import { EphemeralPayloadCipher, SqliteRecordRepository } from '../storage/persistence.js';
import { createHarness } from './test-support.js';

const close: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const dispose of close.splice(0)) await dispose();
});

async function fixture() {
  const repository = new SqliteRecordRepository(':memory:', new EphemeralPayloadCipher());
  const { controller } = await createHarness({ repository });
  let closed = false;
  const dispose = async () => {
    if (closed) return;
    closed = true;
    await controller.shutdown();
  };
  close.push(dispose);
  const agent = await controller.invoke('agents.save', {
    name: 'Disposable autosave check',
    instructions: '',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    workspace: '/tmp/sia-workspace',
  });
  const { threadId } = await controller.invoke('threads.create', { agentId: agent.agentId });
  const events: DesktopPushEvent[] = [];
  controller.subscribe((event) => events.push(event));
  vi.useFakeTimers();
  const fail = () =>
    vi.spyOn(repository, 'put').mockImplementation(() => {
      throw new Error('Synthetic disk failure containing private fixture details');
    });
  const draft = (text: string) => controller.invoke('threads.draft', { threadId, text });
  const persistedDraft = () =>
    repository
      .get<{ threads: Array<{ id: string; draft?: string }> }>('desktop', 'state')
      ?.threads.find((thread) => thread.id === threadId)?.draft;
  return { controller, repository, threadId, events, fail, draft, persistedDraft, dispose };
}

it('retains an unsaved draft and reports a private-data-free warning instead of throwing from the timer', async () => {
  const h = await fixture();
  await h.draft('Previously saved draft');
  vi.advanceTimersByTime(500);
  const stored = h.repository.get('desktop', 'state');
  h.fail();
  const revision = h.controller.snapshot().revision;
  const ack = await h.draft('Keep this unsent thought');
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  expect(ack).toEqual({ accepted: true });
  expect(h.controller.snapshot().localSaveFailed).toBe(true);
  expect(h.controller.snapshot().revision).toBeGreaterThan(revision);
  expect(h.controller.snapshot().threads.find((t) => t.id === h.threadId)?.draft).toBe(
    'Keep this unsent thought',
  );
  expect(h.persistedDraft()).toBe('Previously saved draft');
  expect(h.repository.get('desktop', 'state')).toEqual(stored);
  expect(h.events).toContainEqual(
    expect.objectContaining({
      type: 'snapshot',
      snapshot: expect.objectContaining({ localSaveFailed: true }),
    }),
  );
  expect(JSON.stringify(h.events)).not.toContain('private fixture details');
});

it('bounds retries despite more typing and saves the latest draft when storage recovers', async () => {
  const h = await fixture();
  const failed = h.fail();
  await h.draft('First version');
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  expect(failed).toHaveBeenCalledTimes(1);
  await h.draft('Latest version');
  vi.advanceTimersByTime(29_999);
  expect(failed).toHaveBeenCalledTimes(1);
  expect(() => vi.advanceTimersByTime(1)).not.toThrow();
  expect(failed).toHaveBeenCalledTimes(2);
  failed.mockRestore();
  vi.advanceTimersByTime(30_000);
  expect(h.persistedDraft()).toBe('Latest version');
  expect(h.repository.get('desktop', 'state')).not.toHaveProperty('localSaveFailed');
  expect(h.controller.snapshot().localSaveFailed).toBeUndefined();
  expect(h.events.at(-1)).toMatchObject({ type: 'snapshot' });
  const last = h.events.at(-1);
  if (last?.type === 'snapshot') expect(last.snapshot.localSaveFailed).toBeUndefined();
});

it('keeps a finished reply visible when its unattended final checkpoint cannot be saved', async () => {
  const h = await fixture();
  await h.controller.invoke('threads.send', {
    threadId: h.threadId,
    text: 'Reply to this disposable check',
  });
  // The request itself is already accepted and saved. Fail only the later
  // desktop checkpoint, not the task's optional journals or ratings.
  const put = h.repository.put.bind(h.repository);
  const failed = vi.spyOn(h.repository, 'put').mockImplementation((scope, id, value) => {
    if (scope === 'desktop') throw new Error('Synthetic final-checkpoint failure');
    return put(scope, id, value);
  });
  await vi.advanceTimersByTimeAsync(1000);
  const snapshot = h.controller.snapshot();
  expect(snapshot.threads.find((thread) => thread.id === h.threadId)?.status).toBe('idle');
  expect(snapshot.timeline).toContainEqual(
    expect.objectContaining({ threadId: h.threadId, kind: 'assistant', status: 'complete' }),
  );
  expect(snapshot.localSaveFailed).toBe(true);
  expect(
    h.repository.get<{ timeline: Array<{ kind: string }> }>('desktop', 'state')?.timeline,
  ).not.toContainEqual(expect.objectContaining({ kind: 'assistant' }));
  expect(h.events.at(-1)).toMatchObject({
    type: 'snapshot',
    snapshot: { localSaveFailed: true },
  });
  expect(JSON.stringify(h.events)).not.toContain('Synthetic final-checkpoint failure');
  failed.mockRestore();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(h.controller.snapshot().localSaveFailed).toBeUndefined();
  expect(
    h.repository.get<{ timeline: Array<{ kind: string; threadId: string }> }>(
      'desktop',
      'state',
    )?.timeline,
  ).toContainEqual(expect.objectContaining({ threadId: h.threadId, kind: 'assistant' }));
  expect(
    h.controller
      .snapshot()
      .timeline.filter((item) => item.threadId === h.threadId && item.kind === 'assistant'),
  ).toHaveLength(1);
});

it('clears the warning after an explicit successful save and cancels its redundant retry', async () => {
  const h = await fixture();
  const failed = h.fail();
  await h.draft('Preserved draft');
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  failed.mockRestore();
  const writes = vi.spyOn(h.repository, 'put');
  await h.controller.invoke('threads.rename', { threadId: h.threadId, title: 'Saved locally' });
  expect(h.controller.snapshot().localSaveFailed).toBeUndefined();
  expect(h.persistedDraft()).toBe('Preserved draft');
  const count = writes.mock.calls.length;
  vi.advanceTimersByTime(30_000);
  expect(writes).toHaveBeenCalledTimes(count);
});

it('cancels the retry on shutdown without writing to a closed repository', async () => {
  const h = await fixture();
  const failed = h.fail();
  await h.draft('Saved on quit');
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  failed.mockRestore();
  const writes = vi.spyOn(h.repository, 'put');
  const stopping = h.dispose();
  const before = writes.mock.calls.length;
  expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
  expect(writes).toHaveBeenCalledTimes(before);
  await stopping;
  const count = writes.mock.calls.length;
  expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  expect(writes).toHaveBeenCalledTimes(count);
});

it('preserves the retry and warning when an explicit save also fails', async () => {
  const h = await fixture();
  const failed = h.fail();
  await h.draft('Keep the pending changes');
  expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  await expect(
    h.controller.invoke('threads.rename', {
      threadId: h.threadId,
      title: 'Pending local title',
    }),
  ).rejects.toThrow('Synthetic disk failure');
  expect(h.controller.snapshot().localSaveFailed).toBe(true);
  expect(failed).toHaveBeenCalledTimes(2);
  expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
  expect(failed).toHaveBeenCalledTimes(3);
});
