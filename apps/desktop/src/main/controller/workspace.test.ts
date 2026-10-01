import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from './test-support.js';

describe('DesktopController', () => {
  it('runs workspace commands only after Developer tools is turned on', async () => {
    const runTerminal = vi.fn(async () => ({
      command: 'pwd',
      cwd: '/tmp/sia-workspace',
      output: '/tmp/sia-workspace',
      exitCode: 0,
      timedOut: false,
    }));
    const startBackgroundTerminal = vi.fn();
    const writeBackgroundTerminal = vi.fn();
    const { controller, repository } = await createHarness({
      workspaceOperations: {
        runTerminal,
        startBackgroundTerminal,
        writeBackgroundTerminal,
      } as never,
    });
    try {
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Commands',
        instructions: '',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const threadId = controller
        .snapshot()
        .threads.find((thread) => thread.agentId === agentId)!.id;
      expect(controller.snapshot().preferences.developerTools).toBeUndefined();
      for (const request of [
        controller.invoke('terminal.run', { threadId, command: 'pwd' }),
        controller.invoke('terminal.start', { threadId, command: 'sleep 30' }),
        controller.invoke('terminal.write', { threadId, terminalId: 'term', input: 'y\n' }),
      ])
        await expect(request).rejects.toThrow('Turn on Developer tools');
      expect(runTerminal).not.toHaveBeenCalled();
      expect(startBackgroundTerminal).not.toHaveBeenCalled();
      expect(writeBackgroundTerminal).not.toHaveBeenCalled();

      await controller.invoke('settings.setDeveloperTools', { enabled: true });
      expect(
        repository.get<{ preferences: { developerTools?: boolean } }>('desktop', 'state')
          ?.preferences.developerTools,
      ).toBe(true);
      await controller.invoke('terminal.run', { threadId, command: 'pwd' });
      expect(runTerminal).toHaveBeenCalledWith('/tmp/sia-workspace', 'pwd');

      await controller.invoke('settings.setDeveloperTools', { enabled: false });
      await expect(
        controller.invoke('terminal.run', { threadId, command: 'pwd' }),
      ).rejects.toThrow('Turn on Developer tools');
      expect(runTerminal).toHaveBeenCalledOnce();
    } finally {
      await controller.shutdown();
    }
  });

  it('previews bounded text and code locally without treating markup as active content', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-attachment-preview-'));
    const path = join(directory, 'release-plan.md');
    await writeFile(path, '# Release plan\n\n<script>never execute</script>\n', 'utf8');
    const { controller } = await createHarness({ chooseFiles: async () => [path] });
    try {
      const agent = await controller.invoke('agents.save', {
        name: 'Release partner',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace: '/tmp/sia-workspace',
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: agent.agentId,
      });
      const picked = await controller.invoke('attachments.pick', { threadId });
      const attachment = picked.attachments[0]!;

      await expect(
        controller.invoke('attachments.preview', {
          threadId,
          attachmentId: attachment.id,
        }),
      ).resolves.toEqual({
        kind: 'text',
        format: 'text',
        content: '# Release plan\n\n<script>never execute</script>\n',
      });
    } finally {
      await controller.shutdown();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('undoes and redoes the files one reply changed, only once the task ends', async () => {
    // The harness grants only this folder; a unique file keeps the test independent.
    const workspace = '/tmp/sia-workspace';
    await mkdir(workspace, { recursive: true });
    const name = `undo-${randomUUID()}.md`;
    const notes = join(workspace, name);
    await writeFile(notes, 'after\n');
    let runtimeThreadId = '';
    const runtime = {
      async *runTurn(input: { turnId: string }) {
        const base = {
          threadId: runtimeThreadId,
          turnId: input.turnId,
          provider: 'codex' as const,
          timestamp: new Date().toISOString(),
        };
        yield {
          ...base,
          id: 'edit-notes',
          sequence: 1,
          type: 'tool' as const,
          payload: {
            callId: 'patch-1',
            name: 'fileChange',
            phase: 'completed' as const,
            native: true,
            presentation: {
              kind: 'file_change' as const,
              files: [
                { path: notes, change: 'update', diff: '@@ -1 +1 @@\n-before\n+after\n' },
              ],
            },
          },
        };
        yield {
          ...base,
          id: crypto.randomUUID(),
          sequence: 2,
          type: 'completion' as const,
          payload: { status: 'completed' as const },
        };
      },
      dispose: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      respondToRequest: vi.fn(async () => undefined),
    };
    const { controller } = await createHarness({ fakeServices: false, runtime });
    try {
      const created = await controller.invoke('agents.save', {
        name: 'Notes',
        instructions: '',
        provider: 'codex',
        model: 'gpt-5.6-sol',
        workspace,
      });
      const { threadId } = await controller.invoke('threads.create', {
        agentId: created.agentId,
      });
      runtimeThreadId = threadId;
      await controller.invoke('threads.send', { threadId, text: 'Tidy my notes' });
      await vi.waitFor(() =>
        expect(controller.snapshot().threads.find(({ id }) => id === threadId)?.status).toBe(
          'idle',
        ),
      );

      const eventId = 'edit-notes';
      await expect(
        controller.invoke('changes.turn.read', { threadId, eventId }),
      ).resolves.toEqual({
        state: 'ready',
        files: [{ path: name, change: 'edited' }],
        blocked: [],
      });
      await expect(
        controller.invoke('changes.turn.apply', { threadId, eventId, direction: 'undo' }),
      ).resolves.toMatchObject({ state: 'undone' });
      expect(await readFile(notes, 'utf8')).toBe('before\n');
      await expect(
        controller.invoke('changes.turn.apply', { threadId, eventId, direction: 'redo' }),
      ).resolves.toMatchObject({ state: 'ready' });
      expect(await readFile(notes, 'utf8')).toBe('after\n');
      await expect(
        controller.invoke('changes.turn.read', { threadId, eventId: 'missing' }),
      ).rejects.toThrow('no longer in the conversation');
    } finally {
      await controller.shutdown();
      await rm(notes, { force: true });
    }
  });
});
