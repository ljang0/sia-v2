import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { RuntimeTurnInput } from '../runtime-coordinator.js';
import { computer, createHarness } from './test-support.js';

describe('Use my Mac power and lock handling', () => {
  /** A runtime whose first turn keeps working until it is stopped; later turns complete. */
  function holdingRuntime(fail?: Error) {
    const requests: string[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput, signal: AbortSignal) {
        requests.push(input.text);
        if (fail) throw fail;
        if (requests.length === 1)
          await new Promise((_, reject) =>
            signal.addEventListener('abort', () => reject(new Error('stopped')), {
              once: true,
            }),
          );
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    return { runtime, requests };
  }

  /** Stands in for the macOS memory engine so these checks run on any platform. */
  let notchHelperPath: string | undefined;
  async function fakeNotchHelper() {
    if (notchHelperPath) return notchHelperPath;
    const directory = await mkdtemp(join(tmpdir(), 'sia-notch-helper-'));
    const path = join(directory, 'notch-helper');
    await writeFile(
      path,
      `#!${process.execPath}\nlet input = '';\nprocess.stdin.on('data', (chunk) => (input += chunk));\nprocess.stdin.on('end', () => {\n  const request = JSON.parse(input);\n  process.stdout.write(JSON.stringify({ prompt: String(request.request ?? ''), recorded: true }));\n});\n`,
      { mode: 0o755 },
    );
    notchHelperPath = path;
    return path;
  }
  afterAll(async () => {
    if (notchHelperPath)
      await rm(join(notchHelperPath, '..'), { recursive: true, force: true });
  });

  async function macThread(options: Parameters<typeof createHarness>[0]) {
    const keepAwake = { hold: vi.fn(), release: vi.fn() };
    const harness = await createHarness({
      fakeServices: false,
      keepAwake,
      notchHelperPath: await fakeNotchHelper(),
      ...options,
    });
    const agent = await harness.controller.invoke('agents.save', {
      name: 'Personal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await harness.controller.invoke('threads.create', {
      agentId: agent.agentId,
    });
    const status = () =>
      harness.controller.snapshot().threads.find(({ id }) => id === threadId)?.status;
    return { ...harness, keepAwake, threadId, status };
  }

  it('keeps the Mac awake for a Mac task and releases it when the task stops or fails', async () => {
    const { runtime } = holdingRuntime();
    const { controller, keepAwake, threadId, status } = await macThread({ runtime });
    expect(controller.computerAccessMode()).toBe('mac');
    await controller.invoke('threads.send', { threadId, text: 'Tidy my desktop' });
    await vi.waitFor(() => expect(keepAwake.hold).toHaveBeenCalledWith(threadId));
    expect(keepAwake.release).not.toHaveBeenCalled();
    await controller.invoke('threads.cancel', { threadId });
    await vi.waitFor(() => expect(keepAwake.release).toHaveBeenCalledWith(threadId));
    expect(status()).toBe('idle');
    await controller.shutdown();

    const failing = await macThread({ runtime: holdingRuntime(new Error('boom')).runtime });
    await failing.controller.invoke('threads.send', {
      threadId: failing.threadId,
      text: 'Tidy my desktop',
    });
    await vi.waitFor(() => expect(failing.status()).toBe('failed'));
    expect(failing.keepAwake.hold).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(failing.keepAwake.release).toHaveBeenCalledTimes(1));
    await failing.controller.shutdown();
  });

  it('reports which working Mac tasks use the screen and clears them on stop or lock', async () => {
    const quiet = await macThread({ runtime: holdingRuntime().runtime });
    await quiet.controller.invoke('threads.send', {
      threadId: quiet.threadId,
      text: 'Tidy my desktop',
    });
    await vi.waitFor(() =>
      expect(quiet.controller.screenControl()).toEqual({ [quiet.threadId]: 'background' }),
    );
    expect(quiet.controller.taskSnapshot().screenControl).toEqual({
      [quiet.threadId]: 'background',
    });
    await quiet.controller.invoke('threads.cancel', { threadId: quiet.threadId });
    await vi.waitFor(() => expect(quiet.status()).toBe('idle'));
    expect(quiet.controller.screenControl()).toEqual({});
    await quiet.controller.shutdown();

    const { runtime } = holdingRuntime();
    const { controller, threadId, status } = await macThread({ runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
    await controller.invoke('threads.send', { threadId, text: 'File my receipts' });
    await vi.waitFor(() =>
      expect(controller.screenControl()).toEqual({ [threadId]: 'foreground' }),
    );
    // Switching modes mid-task applies to the next task, not the one on screen.
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
    expect(controller.screenControl()).toEqual({ [threadId]: 'foreground' });
    controller.setMacAvailability('locked');
    expect(status()).toBe('failed');
    expect(controller.screenControl()).toEqual({});
    await controller.shutdown();
  });

  it('lets the display sleep while a Mac task waits on an approval', async () => {
    const gate = Promise.withResolvers<void>();
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        const base = {
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: randomUUID(),
          sequence: 1,
          type: 'approval' as const,
          payload: { phase: 'requested', requestId: 'r1', title: 'Run', description: 'ls' },
        } as never;
        await gate.promise;
        yield {
          ...base,
          id: randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => gate.resolve()),
      cancel: vi.fn(async () => gate.resolve()),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, keepAwake, threadId, status } = await macThread({ runtime });
    await controller.invoke('threads.send', { threadId, text: 'Tidy my desktop' });
    await vi.waitFor(() => expect(status()).toBe('waiting'));
    expect(keepAwake.hold).toHaveBeenCalledTimes(1);
    expect(keepAwake.release).toHaveBeenCalledWith(threadId);
    // Waiting on the person hides the screen cue and releases ⌃Esc.
    expect(controller.screenControl()).toEqual({});
    const approval = controller
      .snapshot()
      .approvals.find((item) => item.threadId === threadId)!;
    await controller.invoke('approvals.resolve', {
      approvalId: approval.id,
      decision: 'approve',
    });
    expect(status()).toBe('running');
    expect(controller.screenControl()).toEqual({ [threadId]: 'background' });
    expect(keepAwake.hold).toHaveBeenCalledTimes(2);
    gate.resolve();
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(keepAwake.release).toHaveBeenCalledTimes(2);
    await controller.shutdown();
  });

  it('runs the plain request when the native memory engine fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-broken-helper-'));
    const helper = join(directory, 'notch-helper');
    await writeFile(helper, `#!${process.execPath}\nprocess.exit(3);\n`, { mode: 0o755 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inputs: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        inputs.push(input);
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller, threadId } = await macThread({ runtime, notchHelperPath: helper });
    try {
      await controller.invoke('threads.send', { threadId, text: 'Tidy my desktop' });
      await vi.waitFor(() => expect(inputs).toHaveLength(1));
      expect(inputs[0]!.text).toContain('Tidy my desktop');
      expect(
        controller
          .snapshot()
          .timeline.some((item) => item.threadId === threadId && item.kind === 'error'),
      ).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[sia:notch]'));
    } finally {
      warn.mockRestore();
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not hold the Mac awake for connected-app tasks', async () => {
    const { runtime } = holdingRuntime();
    const { controller, keepAwake, threadId, status } = await macThread({ runtime });
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    await controller.invoke('threads.send', { threadId, text: 'Summarize my notes' });
    await vi.waitFor(() => expect(status()).toBe('running'));
    expect(keepAwake.hold).not.toHaveBeenCalled();
    await controller.invoke('threads.cancel', { threadId });
    await controller.shutdown();
  });

  it('pauses a Mac task when the screen locks and continues it after unlock', async () => {
    const { runtime, requests } = holdingRuntime();
    const { controller, keepAwake, threadId, status } = await macThread({ runtime });
    await controller.invoke('threads.send', { threadId, text: 'File my receipts' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    controller.setMacAvailability('locked');
    expect(status()).toBe('failed');
    expect(runtime.cancel).toHaveBeenCalled();
    expect(controller.snapshot().timeline.at(-1)).toMatchObject({
      kind: 'error',
      title: 'Task paused',
      text: 'Your Mac locked, so Sia paused this task. Unlock your Mac and press Continue task.',
    });
    await vi.waitFor(() => expect(keepAwake.release).toHaveBeenCalledWith(threadId));
    expect(status()).toBe('failed');

    // Continue task while still locked waits instead of driving a locked screen.
    await controller.invoke('threads.retry', { threadId });
    const waiting = controller.snapshot().threads.find(({ id }) => id === threadId)!;
    expect(waiting).toMatchObject({
      status: 'queued',
      queueReason: 'Waiting for your Mac to unlock.',
    });
    expect(requests).toHaveLength(1);
    controller.setMacAvailability('available');
    await vi.waitFor(() => expect(status()).toBe('idle'));
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain('File my receipts');
    await controller.shutdown();
  });

  it('holds a queued follow-up behind a paused Mac task until the person continues it', async () => {
    const { runtime, requests } = holdingRuntime();
    const { controller, keepAwake, threadId, status } = await macThread({ runtime });
    const thread = () => controller.snapshot().threads.find(({ id }) => id === threadId)!;
    await controller.invoke('threads.send', { threadId, text: 'File my receipts' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await controller.invoke('threads.send', { threadId, text: 'Then email Sam' });
    controller.setMacAvailability('locked');
    await vi.waitFor(() => expect(keepAwake.release).toHaveBeenCalledWith(threadId));
    // The pause keeps its Continue task instead of turning into a workspace wait.
    expect(thread().status).toBe('failed');
    expect(thread().queueReason).toBeUndefined();

    controller.setMacAvailability('available');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(1);
    expect(status()).toBe('failed');

    controller.setMacAvailability('locked');
    await controller.invoke('threads.retry', { threadId });
    expect(thread()).toMatchObject({
      status: 'queued',
      queueReason: 'Waiting for your Mac to unlock.',
    });
    controller.setMacAvailability('available');
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[1]).toContain('File my receipts');
    expect(requests[2]).toContain('Then email Sam');
    await vi.waitFor(() => expect(status()).toBe('idle'));
    await controller.shutdown();
  });

  it('forgets a pause hold once the person removes its follow-ups and writes again', async () => {
    const { runtime, requests } = holdingRuntime();
    const { controller, threadId, status } = await macThread({ runtime });
    await controller.invoke('threads.send', { threadId, text: 'File my receipts' });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await controller.invoke('threads.send', { threadId, text: 'Then email Sam' });
    controller.setMacAvailability('locked');
    await vi.waitFor(() => expect(controller.snapshot().threads[0]?.status).toBe('failed'));
    const queued = controller
      .snapshot()
      .timeline.find((item) => item.kind === 'user' && item.status === 'pending')!;
    await controller.invoke('threads.unqueue', { threadId, messageId: queued.id });
    controller.setMacAvailability('available');
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await controller.invoke('threads.send', { threadId, text: 'Just tidy the desktop' });
    await controller.invoke('threads.send', { threadId, text: 'And empty the trash' });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toContain('And empty the trash');
    await vi.waitFor(() => expect(status()).toBe('idle'));
    await controller.shutdown();
  });

  it('pauses with a plain message when the Mac goes to sleep', async () => {
    const { runtime } = holdingRuntime();
    const { controller, threadId, status } = await macThread({ runtime });
    await controller.invoke('threads.send', { threadId, text: 'File my receipts' });
    await vi.waitFor(() => expect(status()).toBe('running'));
    controller.setMacAvailability('asleep');
    expect(status()).toBe('failed');
    expect(controller.snapshot().timeline.at(-1)?.text).toBe(
      'Your Mac went to sleep, so Sia paused this task. Wake your Mac and press Continue task.',
    );
    await controller.shutdown();
  });

  it('stops a background task with a next step when the window-control driver is unavailable', async () => {
    const { runtime, requests } = holdingRuntime();
    const unavailable = {
      ...computer,
      permissions: async () => ({
        status: 'error' as const,
        accessibility: false,
        screenRecording: false,
        detail: "Cannot find package '@trycua/cua-driver'",
      }),
    };
    const { controller, keepAwake, threadId, status } = await macThread({
      runtime,
      computer: unavailable,
    });
    expect(controller.macBackgroundControl()).toBe(true);
    await controller.invoke('threads.send', { threadId, text: 'Tidy my desktop' });
    await vi.waitFor(() => expect(status()).toBe('failed'));
    expect(requests).toEqual([]);
    expect(controller.snapshot().timeline.at(-1)?.text).toBe(
      'Working in the background isn’t available on this Mac right now. Choose On my screen in Settings → Computer, then press Continue task.',
    );
    await vi.waitFor(() => expect(keepAwake.release).toHaveBeenCalledWith(threadId));

    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
    await controller.invoke('threads.retry', { threadId });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await controller.invoke('threads.cancel', { threadId });
    await controller.shutdown();
  });

  it('asks for missing permissions before a background task starts', async () => {
    const { runtime, requests } = holdingRuntime();
    const { controller, threadId, status } = await macThread({
      runtime,
      computer: {
        ...computer,
        permissions: async () => ({
          status: 'needs_permission' as const,
          accessibility: true,
          screenRecording: false,
        }),
      },
    });
    await controller.invoke('threads.send', { threadId, text: 'Tidy my desktop' });
    await vi.waitFor(() => expect(status()).toBe('failed'));
    expect(requests).toEqual([]);
    expect(controller.snapshot().timeline.at(-1)?.text).toBe(
      'To work in the background, Sia needs permission to see your screen (Screen Recording). Allow it in Settings → Computer, then press Continue task.',
    );
    await controller.shutdown();
  });
});
