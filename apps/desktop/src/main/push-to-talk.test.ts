import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PushToTalkService,
  nativeVoiceEvent,
  type VoiceHelperFactory,
} from './push-to-talk.js';
import type { VoiceOperations } from './voice-service.js';
import type { RecordRepository } from './persistence.js';

const services: PushToTalkService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  vi.useRealTimers();
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  let event!: Parameters<VoiceHelperFactory>[0];
  let exit!: () => void;
  let allowed = true;
  let target = {
    agentId: randomUUID(),
    threadId: randomUUID(),
    label: 'Research · Current conversation',
  };
  const native = { send: vi.fn(), stop: vi.fn() };
  const createHelper = vi.fn<VoiceHelperFactory>((onEvent, onExit) => {
    event = onEvent;
    exit = onExit;
    return native;
  });
  const voice: VoiceOperations = {
    view: () => ({ status: 'connected', voices: [] }),
    configure: vi.fn(),
    refresh: vi.fn(),
    select: vi.fn(),
    disconnect: vi.fn(),
    transcribe: vi.fn(),
    speak: vi.fn(),
    startRealtime: vi.fn(async () => ({ sessionId: 'session' })),
    appendRealtime: vi.fn(),
    stopRealtime: vi.fn(async (_id, commit) =>
      commit ? 'Please summarize this document.' : '',
    ),
  };
  const repository = { get: vi.fn(), put: vi.fn() } as unknown as RecordRepository;
  const send = vi.fn(async (): Promise<string | undefined> => undefined);
  const tasks = new Map<string, 'running' | 'queued' | 'waiting' | 'finished'>();
  const service = new PushToTalkService({
    repository,
    voice,
    available: true,
    createHelper,
    allowed: () => allowed,
    target: () => ({ ...target }),
    send,
    taskStatus: (threadId) => tasks.get(threadId) ?? 'finished',
    changed: vi.fn(),
  });
  services.push(service);
  service.configure(true, target.agentId);
  return {
    service,
    tasks,
    voice,
    native,
    send,
    createHelper,
    event: (value: Parameters<typeof event>[0]) => event(value),
    exit: () => exit(),
    setAllowed: (value: boolean) => {
      allowed = value;
    },
    changeTarget: () => {
      target = { ...target, threadId: randomUUID() };
    },
    target: () => ({ ...target }),
  };
}

async function listen(h: ReturnType<typeof harness>, id = randomUUID()) {
  h.event({ type: 'hold', id });
  await flush();
  h.event({ type: 'recording', id });
  return id;
}

function release(h: ReturnType<typeof harness>, id: string) {
  h.event({ type: 'released', id });
  h.event({ type: 'audio', id, audioBase64: 'AAAA' }); // Final buffered tap comes before stopped.
  h.event({ type: 'stopped', id, hasSpeech: true });
}

describe('Fn push-to-talk sessions', () => {
  it('streams audio and sends exactly once to the target pinned at activation', async () => {
    const h = harness();
    const target = h.target();
    const id = await listen(h);
    h.changeTarget();
    release(h, id);
    h.event({ type: 'stopped', id, hasSpeech: true });
    await flush();
    expect(h.voice.appendRealtime).toHaveBeenCalledWith('session', 'AAAA');
    expect(h.send).toHaveBeenCalledExactlyOnceWith(target, 'Please summarize this document.');
    expect(h.service.view().phase).toBe('idle');
  });

  it('releases during startup without recording or sending a late session', async () => {
    const h = harness();
    const start = deferred<{ sessionId: string }>();
    vi.mocked(h.voice.startRealtime).mockReturnValue(start.promise);
    const id = randomUUID();
    h.event({ type: 'hold', id });
    h.event({ type: 'released', id });
    start.resolve({ sessionId: 'late' });
    await flush();
    expect(h.native.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'start' }));
    expect(h.voice.stopRealtime).toHaveBeenCalledWith('late', false);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(['escape', 'disable', 'sign-out', 'sleep', 'shutdown', 'helper-exit'] as const)(
    'discards late transcription after %s',
    async (reason) => {
      const h = harness();
      const final = deferred<string>();
      vi.mocked(h.voice.stopRealtime).mockImplementation(async (_id, commit) =>
        commit ? final.promise : '',
      );
      const id = await listen(h);
      release(h, id);
      if (reason === 'escape') h.event({ type: 'cancelled', id });
      if (reason === 'disable') h.service.configure(false);
      if (reason === 'sign-out') {
        h.setAllowed(false);
        h.service.syncAccess();
      }
      if (reason === 'sleep') h.service.suspend(true);
      if (reason === 'shutdown') h.service.dispose();
      if (reason === 'helper-exit') h.exit();
      final.resolve('Do not send this');
      await flush();
      expect(h.send).not.toHaveBeenCalled();
      expect(h.voice.stopRealtime).toHaveBeenCalledWith('session', false);
    },
  );

  it('rejects stale audio and does not send silent, short, or duplicate recordings', async () => {
    const h = harness();
    const id = await listen(h);
    h.event({ type: 'audio', id: randomUUID(), audioBase64: 'AAAA' });
    expect(h.voice.appendRealtime).not.toHaveBeenCalled();
    h.event({ type: 'released', id });
    h.event({ type: 'stopped', id, hasSpeech: false });
    h.event({ type: 'stopped', id, hasSpeech: true });
    await flush();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.voice.stopRealtime).toHaveBeenCalledWith('session', false);
  });

  it('does not send a stopped event without the release gesture', async () => {
    const h = harness();
    const id = await listen(h);
    h.event({ type: 'stopped', id, hasSpeech: true });
    await flush();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.voice.stopRealtime).toHaveBeenCalledWith('session', false);
  });

  it('shares exclusive microphone ownership with the composer', async () => {
    const h = harness();
    const lease = h.service.acquireRendererCapture();
    h.event({ type: 'hold', id: randomUUID() });
    await flush();
    expect(h.voice.startRealtime).not.toHaveBeenCalled();
    h.service.releaseRendererCapture(randomUUID());
    expect(() => h.service.acquireRendererCapture()).toThrow(/Another voice recording/);
    h.service.releaseRendererCapture(lease);
    const id = await listen(h);
    expect(() => h.service.acquireRendererCapture()).toThrow(/Another voice recording/);
    h.event({ type: 'cancelled', id });
    expect(h.service.acquireRendererCapture()).toBeTruthy();
  });

  it('ignores a second hold while transcribing and stops on a bounded timeout', async () => {
    vi.useFakeTimers();
    const h = harness();
    const id = await listen(h);
    h.event({ type: 'hold', id: randomUUID() });
    expect(h.voice.startRealtime).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(65_000);
    expect(h.native.send).toHaveBeenCalledWith({ type: 'cancel', id });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('does not start the helper while signed out and retries a crash only on explicit re-enable', () => {
    const h = harness();
    h.exit();
    h.service.syncAccess();
    expect(h.createHelper).toHaveBeenCalledOnce();
    h.service.configure(false);
    h.setAllowed(false);
    expect(() => h.service.configure(true, h.target().agentId)).toThrow(/sign in/);
    h.setAllowed(true);
    h.service.configure(true, h.target().agentId);
    expect(h.createHelper).toHaveBeenCalledTimes(2);
  });

  it('validates native event sizes and rejects unknown command-like data', () => {
    expect(
      nativeVoiceEvent.safeParse({
        type: 'audio',
        id: randomUUID(),
        audioBase64: 'A'.repeat(48_001),
      }).success,
    ).toBe(false);
    expect(
      nativeVoiceEvent.safeParse({ type: 'hold', id: randomUUID(), command: 'arbitrary' })
        .success,
    ).toBe(false);
    expect(nativeVoiceEvent.safeParse({ type: 'ready', accessibility: true }).success).toBe(
      true,
    );
  });
});

it('reports actual microphone permission and observes revocation without starting capture', () => {
  const h = harness();
  h.event({ type: 'ready', accessibility: true, microphone: false });
  expect(h.service.view().microphone).toBe(false);
  expect(h.service.view().detail).toContain('Microphone');
  h.event({ type: 'ready', accessibility: true, microphone: true });
  expect(h.service.view().microphone).toBe(true);
  expect(h.service.view().detail).toBeUndefined();
  h.event({ type: 'ready', accessibility: false, microphone: false });
  expect(h.service.view().accessibility).toBe(false);
  expect(h.voice.startRealtime).not.toHaveBeenCalled();
});

it('includes pinned Fn context only after opting in and clears it when disabled during capture', async () => {
  const h = harness();
  const context = {
    app: 'TextEdit',
    bundleID: 'com.apple.TextEdit',
    selectedText: 'A selected paragraph',
  };
  const first = randomUUID();
  h.event({ type: 'hold', id: first, context });
  await flush();
  h.event({ type: 'recording', id: first });
  release(h, first);
  await flush();
  expect(h.send).toHaveBeenLastCalledWith(h.target(), 'Please summarize this document.');
  h.service.setContextEnabled(true);
  const second = randomUUID();
  h.event({ type: 'hold', id: second, context });
  await flush();
  h.event({ type: 'recording', id: second });
  release(h, second);
  await flush();
  expect(h.send).toHaveBeenLastCalledWith(
    h.target(),
    'Please summarize this document.',
    JSON.stringify(context),
  );
  const third = randomUUID();
  h.event({ type: 'hold', id: third, context });
  await flush();
  h.event({ type: 'recording', id: third });
  h.service.setContextEnabled(false);
  release(h, third);
  await flush();
  expect(h.send).toHaveBeenLastCalledWith(h.target(), 'Please summarize this document.');
});

it('dispatches to the pinned voice thread without a result-window callback', async () => {
  const h = harness();
  const target = h.target();
  h.send.mockResolvedValue(target.threadId);
  const id = await listen(h);
  h.changeTarget();
  release(h, id);
  await flush();
  expect(h.send).toHaveBeenCalledExactlyOnceWith(target, 'Please summarize this document.');
  expect(h.service.view().phase).toBe('idle');
  expect(h.native.send.mock.calls.some(([command]) => command.type === 'status')).toBe(false);
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'session' });
  expect(
    nativeVoiceEvent.safeParse({ type: 'panelReply', id: target.threadId, text: 'obsolete' })
      .success,
  ).toBe(false);
});

it('keeps the edge on for Fn work after release, pauses for approval, and stops on completion', async () => {
  const h = harness();
  const threadId = h.target().threadId;
  h.tasks.set(threadId, 'running');
  h.send.mockResolvedValue(threadId);
  const id = await listen(h);
  release(h, id);
  await flush();
  expect(h.native.send).toHaveBeenCalledWith({ type: 'task', phase: 'working' });
  expect(h.service.view().phase).toBe('idle'); // Microphone is released while the task runs.
  const calls = h.native.send.mock.calls.length;
  h.service.syncTasks();
  expect(h.native.send.mock.calls).toHaveLength(calls);
  h.tasks.set(threadId, 'waiting');
  h.service.syncTasks();
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'waiting' });
  h.tasks.set(threadId, 'running');
  h.service.syncTasks();
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'working' });
  h.tasks.set(threadId, 'finished');
  h.service.syncTasks();
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'idle' });
  // A later typed request in the same conversation must not resurrect the Fn edge.
  h.tasks.set(threadId, 'running');
  h.service.syncTasks();
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'idle' });
});

it('tracks overlapping Fn tasks without showing activity for unrelated work', async () => {
  const h = harness();
  h.tasks.set(randomUUID(), 'running');
  h.service.syncTasks();
  expect(h.native.send).not.toHaveBeenCalledWith({ type: 'task', phase: 'working' });
  const first = h.target().threadId;
  h.tasks.set(first, 'running');
  h.send.mockResolvedValue(first);
  release(h, await listen(h));
  await flush();
  h.changeTarget();
  const second = h.target().threadId;
  h.tasks.set(second, 'queued');
  h.send.mockResolvedValue(second);
  release(h, await listen(h));
  await flush();
  h.tasks.set(first, 'finished');
  h.service.syncTasks();
  expect(h.native.send).not.toHaveBeenLastCalledWith({ type: 'task', phase: 'idle' });
  h.tasks.set(second, 'finished');
  h.service.syncTasks();
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'idle' });
});

it.each(['disable', 'sign-out', 'helper-exit'] as const)(
  'does not restore stale task glow after %s',
  async (reason) => {
    const h = harness();
    const thread = h.target().threadId;
    h.tasks.set(thread, 'running');
    h.send.mockResolvedValue(thread);
    release(h, await listen(h));
    await flush();
    if (reason === 'disable') h.service.configure(false);
    if (reason === 'sign-out') {
      h.setAllowed(false);
      h.service.syncAccess();
      h.setAllowed(true);
    }
    if (reason === 'helper-exit') h.exit();
    h.service.configure(true, h.target().agentId);
    h.native.send.mockClear();
    h.service.syncTasks();
    expect(h.native.send).not.toHaveBeenCalledWith({ type: 'task', phase: 'working' });
  },
);

it('restores ongoing task glow after wake, but not when work finished during sleep', async () => {
  const h = harness();
  const thread = h.target().threadId;
  h.tasks.set(thread, 'running');
  h.send.mockResolvedValue(thread);
  release(h, await listen(h));
  await flush();
  h.service.suspend(true);
  expect(h.native.stop).toHaveBeenCalled();
  h.service.suspend(false);
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'working' });
  h.service.suspend(true);
  h.tasks.delete(thread);
  h.service.suspend(false);
  expect(h.native.send).toHaveBeenLastCalledWith({ type: 'task', phase: 'idle' });
});
