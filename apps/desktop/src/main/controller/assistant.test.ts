import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActionToolDescriptor } from '@sia/action-gateway';
import { expect, it, vi } from 'vitest';
import { AssistantLibrary } from '../assistant-library.js';
import { NotchVault } from '../notch/vault.js';
import type { RuntimeTurnInput } from '../runtime-coordinator.js';
import { createController, createHarness } from './test-support.js';

it('runs a saved workflow through the canonical turn queue and persists editable memory separately', async () => {
  const { controller, repository } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  await controller.invoke('computer.setTrust', { trust: 'ask' });
  try {
    const created = await controller.invoke('agents.save', {
      name: 'Workflow agent',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const agentId = created.agentId;
    const memory = await controller.invoke('assistant.library', {
      operation: 'saveMemory',
      entry: { agentId, title: 'Style', text: 'Keep it concise.', enabled: true },
    });
    expect(repository.get('assistant', 'library')).toMatchObject({
      memories: [{ text: 'Keep it concise.' }],
    });
    const workflows = await controller.invoke('assistant.library', {
      operation: 'saveWorkflow',
      entry: {
        agentId,
        title: 'Plan',
        parameters: ['topic'],
        steps: [
          { instruction: 'Make a plan for {{topic}}', expected: 'A concise plan is shown.' },
        ],
      },
    });
    const result = await controller.invoke('assistant.library', {
      operation: 'run',
      id: workflows.workflows[0]!.id,
      values: { topic: 'my day' },
    });
    expect(result.threadId).toBeTruthy();
    const snapshot = controller.snapshot();
    expect(snapshot.threads.find((thread) => thread.id === result.threadId)).toMatchObject({
      agentId,
      title: 'Plan',
    });
    expect(
      snapshot.timeline.find(
        (item) => item.threadId === result.threadId && item.kind === 'user',
      )?.text,
    ).toContain('"topic":"my day"');
    expect(snapshot.computer.trust).toBe('ask');
    await controller.invoke('assistant.library', {
      operation: 'deleteMemory',
      id: memory.memories[0]!.id,
    });
    expect(
      (await controller.invoke('assistant.library', { operation: 'list' })).memories,
    ).toEqual([]);
  } finally {
    await controller.shutdown();
  }
});

it('learns only for the active opted-in agent and consolidates after the task completes', async () => {
  const { controller } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Learning agent',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Use short paragraphs.',
    });
    const request = {
      name: 'memory_learn' as const,
      arguments: { title: 'Writing style', lesson: 'Use short paragraphs.' },
      descriptor: getActionToolDescriptor('memory_learn')!,
      context: {
        sessionId: 'test-session',
        threadId,
        turnId,
        provider: 'codex' as const,
        workspace: '/tmp/Sia/Agents',
      },
    };
    await expect(controller.assistantAction(request, vi.fn())).rejects.toThrow(
      'Enable automatic memory',
    );
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    expect((await controller.assistantAction(request, vi.fn())).outcome).toBe('verified');
    await expect(
      controller.assistantAction(
        { ...request, context: { ...request.context, turnId: 'old-turn' } },
        vi.fn(),
      ),
    ).rejects.toThrow('active turn');
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find((entry) => entry.id === threadId)?.status).toBe(
        'idle',
      ),
    );
    const view = await controller.invoke('assistant.library', {
      operation: 'consolidate',
      agentId,
    });
    expect(view.memories).toEqual([
      expect.objectContaining({ agentId, text: 'Use short paragraphs.', learned: true }),
    ]);
    expect(view.journal?.some((entry) => entry.kind === 'task')).toBe(true);
    await expect(controller.assistantAction(request, vi.fn())).rejects.toThrow('active turn');
  } finally {
    await controller.shutdown();
  }
});

it('shows the exact skill source for approval even in trusted mode', async () => {
  const controller = await createController();
  try {
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Skills',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Save this routine.',
    });
    const source = "sia_action computer_list '{}'";
    const decision = controller.approvalBroker().requestApproval({
      id: 'skill-approval',
      sessionId: 'test-session',
      threadId,
      turnId,
      tool: getActionToolDescriptor('skill_save')!,
      arguments: { title: 'Apps', description: 'List apps', source },
      targetDigest: 'exact-skill',
      reason: 'Review this Bash source.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.status).toBe('pending');
    expect(approval.dataLeaving).toContain(source);
    await controller.invoke('approvals.resolve', { approvalId: approval.id, decision: 'deny' });
    await expect(decision).resolves.toEqual({ approved: false });
  } finally {
    await controller.shutdown();
  }
});

it('resolves a saved skill by hash for exact-source approval without model-supplied code', async () => {
  const controller = await createController();
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Saved skill',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const source = "printf 'a saved script\\n'";
    const library = await controller.invoke('assistant.library', {
      operation: 'saveSkill',
      entry: { agentId, title: 'Saved', description: 'Example', source },
    });
    const skill = library.skills![0]!;
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Run the saved routine.',
    });
    const decision = controller.approvalBroker().requestApproval({
      id: 'run-approval',
      sessionId: 'test-session',
      threadId,
      turnId,
      tool: getActionToolDescriptor('skill_run')!,
      arguments: { id: skill.id, revision: skill.revision, input: { label: 'Example' } },
      targetDigest: 'id-revision-input',
      reason: 'Review the saved source.',
    });
    const approval = controller.snapshot().approvals.at(-1)!;
    expect(approval.dataLeaving).toContain(source);
    expect(approval.dataLeaving).toContain('Example');
    await controller.invoke('approvals.resolve', { approvalId: approval.id, decision: 'deny' });
    await expect(decision).resolves.toEqual({ approved: false });
  } finally {
    await controller.shutdown();
  }
});

it('memory reviews pin the owning agent and restrict host actions, including trusted mode', async () => {
  const notify = vi.fn();
  const { controller } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
    notify,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Reviewer',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    await controller.invoke('computer.setTrust', { trust: 'auto' });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    await expect(
      controller.invoke('assistant.library', { operation: 'review', agentId }),
    ).rejects.toThrow('Enable learning');
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    const review = await controller.invoke('assistant.library', {
      operation: 'review',
      agentId,
    });
    const threadId = review.threadId!;
    expect(
      controller.snapshot().threads.find((thread) => thread.id === threadId),
    ).toMatchObject({ agentId, model: 'gpt-5.6-sol' });
    expect(controller.allowsReviewAction(threadId, 'assistant_library')).toBe(true);
    expect(controller.allowsReviewAction(threadId, 'memory_suggest')).toBe(true);
    for (const tool of [
      'memory_learn',
      'skill_save',
      'skill_run',
      'mac_automation',
      'computer_list',
      'browser_tabs',
      'mail_search',
    ])
      expect(controller.allowsReviewAction(threadId, tool)).toBe(false);
    await expect(
      controller.invoke('assistant.library', { operation: 'review', agentId }),
    ).rejects.toThrow('current tasks');
    await vi.waitFor(() =>
      expect(
        controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
      ).toBe('idle'),
    );
    // Sia's own housekeeping neither marks the review unread nor notifies.
    expect(controller.snapshot().threads.find((thread) => thread.id === threadId)?.unread).toBe(
      false,
    );
    expect(notify).not.toHaveBeenCalled();
    expect(
      (await controller.invoke('assistant.library', { operation: 'list' })).journal,
    ).toEqual([]);
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    expect(controller.allowsReviewAction(threadId, 'memory_suggest')).toBe(false);
  } finally {
    await controller.shutdown();
  }
});

it('lets a person’s message preempt a memory review, which stays quiet', async () => {
  const reviewTurns: string[] = [];
  const userTurns: string[] = [];
  let reviewThreadId = '';
  const runtime = {
    async *runTurn(input: RuntimeTurnInput, signal: AbortSignal) {
      const base = {
        id: randomUUID(),
        threadId: input.thread.id,
        turnId: input.turnId,
        provider: 'codex' as const,
        sequence: 1,
        timestamp: new Date().toISOString(),
      };
      if ((input.thread as { nativeTools?: string }).nativeTools === 'disabled') {
        reviewTurns.push(input.turnId);
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('stopped')), { once: true }),
        );
      }
      userTurns.push(input.text);
      yield { ...base, type: 'completion' as const, payload: { status: 'completed' as const } };
    },
    dispose: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    respondToRequest: vi.fn(async () => undefined),
  };
  const notify = vi.fn();
  const { controller } = await createHarness({ fakeServices: false, runtime, notify });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Reviewer',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    const originalSelect = controller.snapshot().activeThreadId;
    const review = controller.invoke('assistant.library', { operation: 'review', agentId });
    await vi.waitFor(() => {
      reviewThreadId =
        controller.snapshot().threads.find(({ title }) => title === 'Memory and skill review')
          ?.id ?? '';
      expect(reviewThreadId).not.toBe('');
    });
    await review;
    await vi.waitFor(() => expect(reviewTurns).toHaveLength(1));
    expect(originalSelect).toBeDefined();

    await controller.invoke('threads.send', { threadId, text: 'Book my flight' });
    await vi.waitFor(() =>
      expect(userTurns.some((text) => text.includes('Book my flight'))).toBe(true),
    );
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
        'idle',
      ),
    );
    const reviewThread = controller.snapshot().threads.find(({ id }) => id === reviewThreadId)!;
    expect(reviewThread.status).toBe('idle');
    expect(reviewThread.unread).toBe(false);
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ threadId: reviewThreadId }),
    );
  } finally {
    await controller.shutdown();
  }
});

it('background reviews wait for unlocked idle time and preserve the active conversation', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { controller, repository } = await createHarness({
    defaultWorkspaceRoot: '/tmp/Sia/Agents',
    createDirectory: async () => undefined,
  });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'connected' });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Background reviewer',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    await controller.invoke('assistant.library', {
      operation: 'backgroundReview',
      agentId,
      enabled: true,
    });
    new AssistantLibrary(repository).record({
      agentId,
      threadId,
      turnId: 'completed-test-task',
      kind: 'task',
      title: 'Task finished',
      text: 'complete',
    });
    const before = controller.snapshot().threads.length;
    controller.suspendVoice(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before);
    controller.suspendVoice(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before + 1);
    expect(controller.snapshot().activeThreadId).toBe(threadId);
    await controller.invoke('assistant.library', {
      operation: 'backgroundReview',
      agentId,
      enabled: false,
    });
    await vi.waitFor(() =>
      expect(controller.snapshot().threads.some((thread) => thread.status === 'running')).toBe(
        false,
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(controller.snapshot().threads).toHaveLength(before + 1);
  } finally {
    await controller.shutdown();
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'consolidates the shared vault without executing scripts (background: %s)',
  async (background) => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-native-learning-'));
    const { controller, repository } = await createHarness({ defaultWorkspaceRoot: directory });
    try {
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background });
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Native learning',
        instructions: '',
        model: 'gpt-5.6-sol',
      });
      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: true,
      });
      const library = new AssistantLibrary(repository);
      for (let i = 0; i < 2; i++)
        library.recordMacTask({
          agentId,
          threadId: randomUUID(),
          turnId: randomUUID(),
          request: 'Inspect Finder',
          outcome: 'complete',
          result: {
            success: true,
            response: 'Read the Finder folder.',
            steps: ['Read Finder with its AppleScript dictionary'],
          },
        });
      const review = await controller.invoke('assistant.library', {
        operation: 'review',
        agentId,
      });
      const threadId = review.threadId!;
      const turnId = controller
        .snapshot()
        .timeline.find(
          (entry) => entry.threadId === threadId && entry.kind === 'user',
        )!.turnId!;
      const invoke = vi.fn();
      const result = await controller.assistantAction(
        {
          name: 'memory_vault',
          descriptor: getActionToolDescriptor('memory_vault')!,
          context: {
            sessionId: 'review',
            threadId,
            turnId,
            provider: 'codex',
            workspace: directory,
          },
          arguments: {
            operation: 'write',
            name: 'skills/finder-folder.sh',
            revision: '',
            text: '#!/bin/bash\n# skill: Finder folder\n# description: Read the current Finder folder\nprintf never-executed\n',
          },
        },
        invoke,
      );
      expect(result.summary).toContain('Saved and read back');
      expect(invoke).not.toHaveBeenCalled();
      const view = await controller.invoke('assistant.library', { operation: 'list' });
      expect(view.suggestions).toEqual([]);
      expect(view.skills).toEqual([
        expect.objectContaining({
          agentId,
          execution: 'native',
          title: 'Finder folder',
          source: expect.stringContaining('# description:'),
        }),
      ]);
      expect(library.view().skills).toEqual([]);
      const skill = view.skills![0]!;
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((entry) => entry.id === threadId)?.status,
        ).toBe('idle'),
      );
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
      await expect(
        controller.invoke('assistant.library', {
          operation: 'runSkill',
          id: skill.id,
          input: {},
        }),
      ).rejects.toThrow('On my screen');
      await controller.invoke('assistant.library', { operation: 'deleteSkill', id: skill.id });
      expect(
        (await controller.invoke('assistant.library', { operation: 'list' })).skills,
      ).toEqual([]);
      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: false,
      });
      expect(library.view().reviewAgents).toEqual([]);
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('shares native notes with background tasks, isolates agents, and keeps paused learning read-only', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sia-shared-memory-'));
  const { controller } = await createHarness({ defaultWorkspaceRoot: directory });
  try {
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Shared memory',
      instructions: '',
      model: 'gpt-5.6-sol',
    });
    const workspace = controller
      .snapshot()
      .agents.find((agent) => agent.id === agentId)!.workspace;
    const vault = new NotchVault(workspace, agentId);
    vault.write('campus.md', 'Institution: CMU. Verify current courses in Canvas.', '');
    const other = new NotchVault(workspace, randomUUID());
    other.write('campus.md', 'Different agent.', '');
    const { threadId } = await controller.invoke('threads.create', { agentId });
    const { turnId } = await controller.invoke('threads.send', {
      threadId,
      text: 'Read my campus note.',
    });
    const action = (operation: string, name: string, text = '', revision = '') =>
      controller.assistantAction(
        {
          name: 'memory_vault',
          descriptor: getActionToolDescriptor('memory_vault')!,
          context: { sessionId: 'background', threadId, turnId, provider: 'codex', workspace },
          arguments: { operation, name, text, revision },
        },
        vi.fn(),
      );
    expect((await action('read', 'campus.md')).data).toMatchObject({
      text: expect.stringContaining('CMU'),
    });
    const saved = await action('write', 'calendar.md', 'Use the observed campus calendar.');
    expect(saved.outcome).toBe('verified');
    expect(vault.read('calendar.md').text).toContain('campus calendar');
    expect(other.read('calendar.md').revision).toBe('');
    await expect(action('write', 'calendar.md', 'Stale replacement')).rejects.toThrow();
    await expect(action('read', '../campus.md')).rejects.toThrow();
    await expect(action('write', 'skills/direct.sh', '#!/bin/bash\necho no')).rejects.toThrow(
      'skill_save',
    );
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: false,
    });
    expect((await action('read', 'campus.md')).outcome).toBe('verified');
    await expect(action('write', 'paused.md', 'Must not persist.')).rejects.toThrow('paused');
    expect(vault.read('paused.md').revision).toBe('');
  } finally {
    await controller.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

it('retains background task results and failures across conversations and native mode without injecting scripts into background turns', async () => {
  const turns: RuntimeTurnInput[] = [];
  const runtime = {
    async *runTurn(input: RuntimeTurnInput) {
      turns.push(input);
      input.onMacResult?.({
        success: turns.length > 1,
        response:
          turns.length === 1 ? 'The document needs foreground access.' : 'Read the document.',
        steps: ['Observed the target document window'],
      });
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
  };
  const { controller, repository } = await createHarness({ fakeServices: false, runtime });
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Background journal',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '/tmp/sia-workspace',
    });
    await controller.invoke('assistant.library', {
      operation: 'learning',
      agentId,
      enabled: true,
    });
    await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
    const library = new AssistantLibrary(repository);
    for (let i = 0; i < 3; i++) {
      if (i === 2)
        await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      await controller.invoke('threads.send', {
        threadId,
        text: 'Read the document in its window.',
      });
      await vi.waitFor(() =>
        expect(library.view().journal?.filter((entry) => entry.kind === 'task')).toHaveLength(
          i + 1,
        ),
      );
      expect(controller.snapshot().threads.find((entry) => entry.id === threadId)?.status).toBe(
        i === 0 ? 'failed' : 'idle',
      );
      if (i === 0)
        expect(controller.snapshot().timeline).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              threadId,
              kind: 'error',
              title: 'Task needs attention',
              text: 'The document needs foreground access.',
            }),
          ]),
        );
    }
    expect(library.view().journal?.filter((entry) => entry.kind === 'task')).toEqual([
      expect.objectContaining({
        outcome: 'failed',
        text: expect.stringContaining('foreground access'),
      }),
      expect.objectContaining({
        outcome: 'complete',
        text: expect.stringContaining('Read the document'),
      }),
      expect.objectContaining({ outcome: 'complete' }),
    ]);
    expect(turns[0]!.thread.macBackgroundControl).toBe(true);
    expect(turns[1]!.text).toContain('<failures');
    expect(turns[1]!.text).toContain('foreground access');
    expect(turns[1]!.text).toContain('Observed the target document window');
    expect(turns[1]!.text).not.toContain('Native executable skills live in');
    expect(turns[1]!.text).toContain('skill_run');
    expect(turns[2]!.thread.macBackgroundControl).toBe(false);
    expect(turns[2]!.text).toContain('<memory_graph');
    expect(turns[2]!.text).toContain('<skills>');
    expect(new NotchVault('/tmp/sia-workspace', agentId).read('failures.log').text).toContain(
      'foreground access',
    );
  } finally {
    await controller.shutdown();
  }
});
