import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import { TrajectoryRecorder } from '../research/trajectory-recorder.js';
import { createHarness } from './test-support.js';

describe('unfinished file changes', () => {
  it.each(['cancelled', 'completed'] as const)(
    'does not report an unconfirmed write as applied when the turn is %s',
    async (outcome) => {
      const release = Promise.withResolvers<void>();
      const runtime = {
        async *runTurn(input: RuntimeTurnInput) {
          const base = {
            threadId: input.thread.id,
            turnId: input.turnId,
            provider: 'codex' as const,
            timestamp: new Date().toISOString(),
          };
          for (const [index, phase] of ['completed', 'started'].entries()) {
            yield {
              ...base,
              id: randomUUID(),
              sequence: index + 1,
              type: 'tool' as const,
              payload: {
                callId: `file-${index}`,
                name: 'fileChange',
                phase: phase as 'completed' | 'started',
                native: true,
                arguments: {},
                presentation: {
                  kind: 'file_change' as const,
                  files: [{ path: `/tmp/file-${index}.txt`, change: 'add', diff: 'test' }],
                },
              },
            };
          }
          await release.promise;
          yield {
            ...base,
            id: randomUUID(),
            sequence: 3,
            type: 'completion' as const,
            payload: { status: outcome },
          };
        },
        cancel: vi.fn(async () => release.resolve()),
        dispose: vi.fn(async () => release.resolve()),
      };
      const notify = vi.fn();
      const root = await mkdtemp(join(tmpdir(), 'sia-cancel-trajectory-'));
      const trajectory = new TrajectoryRecorder({ rootDirectory: root, enabled: () => true });
      const record = vi.spyOn(trajectory, 'record');
      const { controller } = await createHarness({
        fakeServices: false,
        runtime,
        notify,
        trajectory,
      });
      try {
        await controller.invoke('computer.setAccessMode', { mode: 'connected' });
        const { agentId } = await controller.invoke('agents.save', {
          name: 'File cancellation',
          instructions: '',
          provider: 'codex',
          model: 'gpt-5.6-sol',
          workspace: '/tmp/sia-workspace',
        });
        const { threadId } = await controller.invoke('threads.create', { agentId });
        await controller.invoke('threads.send', { threadId, text: 'Create the test files' });
        const changes = () =>
          controller.snapshot().timeline.filter((item) => item.toolName === 'fileChange');
        await vi.waitFor(() =>
          expect(changes().map((item) => item.status)).toEqual(['complete', 'running']),
        );
        if (outcome === 'cancelled') await controller.invoke('threads.cancel', { threadId });
        else release.resolve();
        await vi.waitFor(() =>
          expect(changes().map((item) => item.status)).toEqual(['complete', 'failed']),
        );
        if (outcome === 'cancelled') {
          await vi.waitFor(() =>
            expect(record).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'turn_finished',
                outcome: 'cancelled',
              }),
            ),
          );
          expect(notify).not.toHaveBeenCalled();
          expect(record).not.toHaveBeenCalledWith(
            expect.objectContaining({
              type: 'turn_finished',
              outcome: 'complete',
            }),
          );
        }
      } finally {
        release.resolve();
        await controller.shutdown();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
