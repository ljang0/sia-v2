import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActionToolDescriptor, type TaskCheckpointState } from '@sia/action-gateway';
import { expect, it, vi } from 'vitest';
import { NotchVault } from '../notch/vault.js';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import { createHarness } from './test-support.js';

for (const background of [false, true]) {
  it(`preserves context and prevents premature completion through Continue in ${background ? 'background' : 'on-screen'} mode`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-task-integration-'));
    const engine = vi
      .spyOn(NotchVault.prototype, 'engine')
      .mockImplementation(async (_helper, input) =>
        input.operation === 'prepare' ? { prompt: String(input.request) } : { recorded: true },
      );
    const finishes = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const requests: RuntimeTurnInput[] = [];
    const runtime = {
      async *runTurn(input: RuntimeTurnInput) {
        const index = requests.push(input) - 1;
        await finishes[index]!.promise;
        const result = input.onMacResult?.({
          success: true,
          response: 'Everything is done.',
          steps: [],
        });
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 1,
          timestamp: new Date().toISOString(),
          type: 'message' as const,
          payload: {
            messageId: `final-${index}`,
            role: 'assistant' as const,
            parts: [{ kind: 'text' as const, text: result?.response ?? 'Done' }],
          },
        };
        yield {
          id: randomUUID(),
          threadId: input.thread.id,
          turnId: input.turnId,
          provider: 'codex' as const,
          sequence: 2,
          timestamp: new Date().toISOString(),
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      releaseSession: vi.fn(async () => undefined),
    };
    const { controller, repository } = await createHarness({
      fakeServices: false,
      runtime,
      defaultWorkspaceRoot: directory,
    });
    try {
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background });
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Research',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
      });
      const { threadId } = await controller.invoke('threads.create', { agentId });
      const { turnId } = await controller.invoke('threads.send', {
        threadId,
        text: 'Find all my assignments this week through CMU Canvas, using my school account',
      });
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      const checkpoint: TaskCheckpointState = {
        summary: 'Inspect current CMU courses and this week’s assignments',
        constraints: ['Use only Canvas'],
        associations: [
          { name: 'Institution', value: 'Carnegie Mellon', source: 'User request' },
        ],
        scope_complete: true,
        coverage: [
          { source: 'Course assignments', status: 'checked', finding: 'Read the current list' },
          { source: 'Course syllabus', status: 'pending', finding: '' },
        ],
        actions: [
          { description: 'Create requested calendar entry', status: 'uncertain', evidence: '' },
        ],
        next_steps: [],
      };
      const action = (args: Record<string, unknown>, ownerTurn = turnId) =>
        controller.assistantAction(
          {
            name: 'task_checkpoint',
            descriptor: getActionToolDescriptor('task_checkpoint')!,
            arguments: args,
            context: {
              sessionId: 'test',
              threadId,
              turnId: ownerTurn,
              provider: 'codex',
              workspace: requests[0]!.thread.workspace,
            },
          },
          vi.fn(),
        );
      await action({ operation: 'update', expected_revision: 0, state: checkpoint });
      await expect(action({ operation: 'read' }, 'stale-turn')).rejects.toThrow('active turn');
      finishes[0]!.resolve();
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
        ).toBe('failed'),
      );
      expect(
        controller
          .snapshot()
          .timeline.some(
            (item) =>
              item.turnId === turnId &&
              item.kind === 'assistant' &&
              item.text?.includes('incomplete'),
          ),
      ).toBe(true);
      expect(
        controller
          .snapshot()
          .timeline.some(
            (item) => item.kind === 'assistant' && item.text === 'Everything is done.',
          ),
      ).toBe(false);
      await vi.waitFor(() =>
        expect(
          repository.get<{ records: { status: string }[] }>('task-context', threadId)
            ?.records[0]?.status,
        ).toBe('paused'),
      );
      await controller.invoke('threads.retry', { threadId });
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]!.text).toContain('Carnegie Mellon');
      expect(requests[1]!.text).toContain('Course syllabus');
      expect(requests[1]!.text).toContain('uncertain');
      expect(requests[1]!.thread.instructions).toContain('The host refuses completion');
      const resolved = structuredClone(checkpoint);
      resolved.coverage[1] = {
        source: 'Course syllabus',
        status: 'checked',
        finding: 'Verified the syllabus for additional assignments',
      };
      resolved.actions[0] = {
        description: 'Create requested calendar entry',
        status: 'verified',
        evidence: 'Found the existing event in the correct calendar; did not repeat the write',
      };
      await action({ operation: 'update', expected_revision: 1, state: resolved });
      finishes[1]!.resolve();
      await vi.waitFor(() =>
        expect(
          controller.snapshot().threads.find((thread) => thread.id === threadId)?.status,
        ).toBe('idle'),
      );
      await vi.waitFor(() =>
        expect(
          repository.get<{ records: { status: string }[] }>('task-context', threadId)
            ?.records[0]?.status,
        ).toBe('complete'),
      );
      expect(JSON.stringify(controller.snapshot())).not.toContain('"associations"');
      await controller.invoke('threads.delete', { threadId });
      expect(repository.get('task-context', threadId)).toBeUndefined();
    } finally {
      for (const finish of finishes) finish.resolve();
      await controller.shutdown();
      engine.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
