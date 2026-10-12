import { mkdtemp, mkdir, writeFile, symlink, link, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { Attachments } from './attachments.js';
import { inspectResultFile } from './result-files.js';
import { createHarness } from './test-support.js';
import { presentMacResponse } from '../actions/mac-execution.js';
import type { RuntimeTurnInput } from '../providers/runtime-coordinator.js';
import type { ThreadEventEnvelope } from '@sia/protocol';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'sia-results-'));
  directories.push(path);
  return path;
}

it('validates result scope, document type, symlinks, and hard links', async () => {
  const root = await directory();
  const outside = await directory();
  await writeFile(join(root, 'Family résumé.csv'), 'category,total\nfood,25\n');
  expect(
    (await inspectResultFile(join(root, 'Family résumé.csv'), [root])).bytes,
  ).toBeGreaterThan(0);
  await writeFile(join(outside, 'private.txt'), 'private');
  await expect(inspectResultFile(join(outside, 'private.txt'), [root])).rejects.toThrow(
    'conversation',
  );
  await symlink(join(outside, 'private.txt'), join(root, 'linked.txt'));
  await expect(inspectResultFile(join(root, 'linked.txt'), [root])).rejects.toThrow();
  await link(join(outside, 'private.txt'), join(root, 'hard.txt'));
  await expect(inspectResultFile(join(root, 'hard.txt'), [root])).rejects.toThrow();
  await mkdir(join(root, '.private'));
  await writeFile(join(root, '.private', 'note.txt'), 'private');
  await expect(inspectResultFile(join(root, '.private', 'note.txt'), [root])).rejects.toThrow();
  await writeFile(join(root, 'launch.command'), 'echo unsafe');
  await expect(inspectResultFile(join(root, 'launch.command'), [root])).rejects.toThrow();
});

it('accepts an authorized root alias without permitting nested symlink traversal', async () => {
  const parent = await directory();
  const root = join(parent, 'workspace');
  const alias = join(parent, 'workspace-alias');
  await mkdir(root);
  await symlink(root, alias);
  await writeFile(join(root, 'report.json'), '{"sum":34}');
  const canonical = await realpath(join(root, 'report.json'));
  expect((await inspectResultFile(canonical, [alias])).path).toBe(canonical);
  expect((await inspectResultFile(join(alias, 'report.json'), [alias])).path).toBe(canonical);
  await expect(inspectResultFile(join(alias, 'report.json'), [root])).rejects.toThrow();
  await symlink(root, join(root, 'nested'));
  await expect(
    inspectResultFile(join(root, 'nested', 'report.json'), [root]),
  ).rejects.toThrow();
});

it('delivers a real result through the controller and reopens its grant after the manager reloads', async () => {
  const root = await directory();
  const opened = vi.fn(async () => {});
  const revealed = vi.fn(async () => {});
  const runtime = {
    async *runTurn(input: RuntimeTurnInput) {
      const path = join(input.thread.workspace, 'Family résumé.csv');
      await writeFile(path, 'category,total\nfood,25\n');
      const result = {
        type: 'action',
        success: true,
        response: 'Your report is ready.',
        steps: [],
        output_file: await realpath(path),
      };
      input.onMacResult?.(result);
      const base = {
        threadId: input.thread.id,
        turnId: input.turnId,
        provider: 'codex' as const,
        timestamp: new Date().toISOString(),
      };
      yield presentMacResponse({
        ...base,
        id: 'result-message',
        sequence: 1,
        type: 'message',
        payload: {
          role: 'assistant',
          messageId: 'message',
          parts: [{ kind: 'text', text: JSON.stringify(result) }],
        },
      } as ThreadEventEnvelope);
      yield {
        ...base,
        id: 'finished',
        sequence: 2,
        type: 'completion',
        payload: { status: 'completed' },
      } as ThreadEventEnvelope;
    },
    dispose: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  const { controller, repository } = await createHarness({
    fakeServices: false,
    runtime,
    defaultWorkspaceRoot: root,
    openPath: opened,
    revealDirectory: revealed,
  });
  try {
    const { agentId } = await controller.invoke('agents.save', {
      name: 'Reports',
      instructions: '',
      provider: 'codex',
      model: 'gpt-5.6-sol',
      workspace: '',
    });
    const { threadId } = await controller.invoke('threads.create', { agentId });
    await controller.invoke('threads.send', { threadId, text: 'Save the fixture report.' });
    await vi.waitFor(() =>
      expect(
        controller.snapshot().timeline.find((item) => item.id === 'result-message')
          ?.attachments,
      ).toHaveLength(1),
    );
    const message = controller
      .snapshot()
      .timeline.find((item) => item.id === 'result-message')!;
    expect(message.text).toBe('Your report is ready.');
    const attachment = message.attachments![0]!;
    expect(attachment).toMatchObject({ name: 'Family résumé.csv', generated: true });
    const thread = controller.snapshot().threads.find((item) => item.id === threadId)!;
    const restored = new Attachments({
      deps: {
        repository,
        openPath: opened,
        revealDirectory: revealed,
        chooseFiles: undefined,
        pastedAttachmentRoot: undefined,
      },
      requireThread: () => thread,
    });
    const input = { threadId, attachmentId: attachment.id };
    expect(await restored.previewAttachment(input)).toMatchObject({
      kind: 'text',
      content: 'category,total\nfood,25\n',
    });
    await restored.openAttachment(input);
    await restored.revealAttachment(input);
    expect(opened).toHaveBeenCalledWith(expect.stringContaining(attachment.name));
    expect(revealed).toHaveBeenCalledWith(expect.stringContaining(attachment.name));
    const downloaded = await restored.readGeneratedResult(threadId, attachment.id);
    expect(downloaded.name).toBe(attachment.name);
    expect(downloaded.data.toString()).toBe('category,total\nfood,25\n');
    await expect(
      restored.openAttachment({ ...input, threadId: 'other-thread' }),
    ).rejects.toThrow('grant');
    await rm(join(thread.workspace, attachment.name));
    await symlink(join(root, 'outside.csv'), join(thread.workspace, attachment.name));
    await expect(restored.openAttachment(input)).rejects.toThrow();
    expect(opened).toHaveBeenCalledTimes(1);
    restored.forgetThread(threadId);
    expect(repository.list('result-files')).toEqual([]);
  } finally {
    await controller.shutdown();
  }
});
