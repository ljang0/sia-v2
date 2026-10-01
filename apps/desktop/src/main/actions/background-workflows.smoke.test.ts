import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway, DefaultActionAuthorizationPolicy } from '@sia/action-gateway';
import { DesktopController } from '../controller/desktop-controller.js';
import { DesktopActionBackend } from './desktop-action-backend.js';
import { CloudClient } from '../cloud-client.js';
import { EphemeralPayloadCipher, SqliteRecordRepository } from '../persistence.js';
import { RuntimeCoordinator } from '../runtime-coordinator.js';
import { discoverCodexInstallation } from '../codex-installation.js';
import { probeProviders } from '../provider-probe.js';

// Real Codex and real sandboxed Bash/files, but deliberately no GUI access. This is
// not evidence for any application's background input support. Never runs on launch.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_BACKGROUND_WORKFLOWS_SMOKE === '1'
    ? it
    : it.skip;

live(
  'creates reports and reuses a background skill after restart with native tools disabled',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'sia-background-live-'));
    const cipher = new EphemeralPayloadCipher();
    const codexCommand = await discoverCodexInstallation();
    let controller: DesktopController | undefined;
    let passed = false;
    let guiCalls = 0;
    const calls: string[] = [];
    const denyGui = async (): Promise<never> => {
      guiCalls++;
      throw new Error('No GUI access in this disposable test.');
    };
    const start = async () => {
      const computer = {
        permissions: async () => ({
          status: 'ready' as const,
          accessibility: true,
          screenRecording: true,
        }),
        requestPermissions: denyGui,
        call: denyGui,
        shutdown: async () => undefined,
      };
      const cloud = new CloudClient(undefined, { read: async () => undefined });
      const host = new DesktopController({
        providerProbe: (only) =>
          probeProviders(
            only,
            process.env,
            undefined,
            codexCommand ? { codex: codexCommand } : {},
          ),
        repository: new SqliteRecordRepository(join(root, 'state.sqlite'), cipher),
        cloud,
        computer,
        fakeServices: false,
        identity: {
          initialize: async () => ({ state: 'unconfigured' }),
          status: () => ({ state: 'unconfigured' }),
          startEmailSignIn: denyGui,
          completeEmailSignIn: denyGui,
          signOut: async () => ({ state: 'unconfigured' }),
        },
        defaultWorkspaceRoot: join(root, 'agents'),
        chooseDirectory: async () => null,
        openExternal: denyGui,
        openPath: denyGui,
        exportJson: async () => null,
      });
      let gateway: ActionGateway;
      const backend = new DesktopActionBackend({
        cua: computer,
        cloud,
        macBrowserAccess: () => host.computerAccessMode() === 'mac',
        macBackgroundControl: () => host.macBackgroundControl(),
        assistantAction: (request) =>
          host.assistantAction(request, (name, args, signal) =>
            gateway.invoke({ name, arguments: args, context: { ...request.context, signal } }),
          ),
      });
      const observer = host.actionInvocationObserver();
      gateway = new ActionGateway({
        backend,
        approvals: host.approvalBroker(),
        policy: new DefaultActionAuthorizationPolicy({
          trustLocalActions: () => host.computerTrust() === 'auto',
        }),
        isToolAvailable: (name) => host.actionToolAvailable(name),
        onInvocation: async (invocation) => {
          expect(invocation.context.backgroundOnly).toBe(true);
          calls.push(invocation.name);
          console.info('Background workflow tool:', invocation.name);
          await observer(invocation);
        },
        onResult: async (notice) => {
          console.info(
            'Background workflow result:',
            notice.name,
            notice.result.outcome,
            notice.result.summary,
          );
          if (notice.name === 'skill_run')
            console.info('Background skill output:', JSON.stringify(notice.result.data));
          await host.actionResultObserver()(notice);
        },
      });
      host.attachRuntime(new RuntimeCoordinator(gateway, codexCommand ? { codexCommand } : {}));
      await host.initialize();
      return host;
    };
    const task = async (agentId: string, title: string, text: string) => {
      const { threadId } = await controller!.invoke('threads.create', { agentId, title });
      const started = Date.now();
      const configured = controller!.snapshot().threads.find((item) => item.id === threadId)!;
      console.info(
        `Background workflow: ${title} started; model ${configured.model}, effort ${configured.reasoningEffort}`,
      );
      await controller!.invoke('threads.send', { threadId, text });
      const resolved = new Set<string>();
      while (Date.now() - started < 240000) {
        const state = controller!.snapshot();
        // Only this disposable, GUI-denied fixture approves its generated skill code.
        // Production still displays the exact source/revision for the person's approval.
        for (const approval of state.approvals.filter(
          (item) => item.threadId === threadId && !resolved.has(item.id),
        )) {
          resolved.add(approval.id);
          await controller!.invoke('approvals.resolve', {
            approvalId: approval.id,
            decision: 'approve',
          });
        }
        const thread = state.threads.find((item) => item.id === threadId)!;
        if (!['running', 'queued', 'waiting'].includes(thread.status)) {
          const items = state.timeline.filter((item) => item.threadId === threadId);
          const errors = items.filter((item) => item.kind === 'error').map((item) => item.text);
          if (errors.length)
            console.info(
              'Background workflow failure evidence:',
              JSON.stringify(
                items.map(({ kind, title, toolName, status, text }) => ({
                  kind,
                  title,
                  toolName,
                  status,
                  text,
                })),
              ),
            );
          expect(errors, JSON.stringify(errors)).toEqual([]);
          expect(thread.status).toBe('idle');
          console.info(
            'Background workflow final:',
            items
              .filter((item) => item.kind === 'assistant')
              .map((item) => item.text)
              .join('\n'),
          );
          expect(items.some((item) => item.kind === 'assistant' && item.text)).toBe(true);
          expect(
            items
              .filter((item) => item.toolName)
              .some((item) => /exec_command|view_image/.test(item.toolName!)),
          ).toBe(false);
          console.info(`Background workflow: ${title} completed in ${Date.now() - started} ms`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await controller!.invoke('threads.cancel', { threadId });
      throw new Error(`Background workflow timed out: ${title}`);
    };
    try {
      controller = await start();
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
      await controller.invoke('computer.setTrust', { trust: 'auto' });
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Background validation',
        provider: 'codex',
        model: process.env.SIA_SMOKE_MODEL ?? 'gpt-5.6-sol',
        instructions:
          'Temporary validation: use only provided workspace file tools and sandboxed gateway skills. No app, browser, screen capture, network or unrelated files. Verify files from their actual readback. Keep replies brief.',
      });
      const workspace = controller
        .snapshot()
        .agents.find((agent) => agent.id === agentId)!.workspace;
      await writeFile(join(workspace, 'numbers.txt'), '3\n7\n11\n13\n');
      await writeFile(join(workspace, 'other-numbers.txt'), '2\n5\n9\n');
      await task(
        agentId,
        'Background report',
        'Read numbers.txt and create totals.json containing numeric keys count and sum, calculated from that file. Verify the saved file.',
      );
      expect(JSON.parse(await readFile(join(workspace, 'totals.json'), 'utf8'))).toEqual({
        count: 4,
        sum: 34,
      });
      await task(
        agentId,
        'Save and run skill',
        'Save a reusable background gateway Bash skill named Summarize numbers. Input has filename and output filename. Read the input through computer_read_file, calculate count and sum with Bash/system utilities, and create JSON with numeric count and sum through computer_write_file. Use SIA_INPUT and SIA_RESULT JSON safely with the provided JSON helpers. Save then run it once on numbers.txt to create first-skill.json, and verify it.',
      );
      expect(JSON.parse(await readFile(join(workspace, 'first-skill.json'), 'utf8'))).toEqual({
        count: 4,
        sum: 34,
      });
      const skills = (
        await controller.invoke('assistant.library', { operation: 'list' })
      ).skills!.filter((skill) => skill.agentId === agentId);
      expect(skills).toHaveLength(1);
      const skill = skills[0]!;
      expect(calls).toContain('skill_save');
      expect(calls).toContain('skill_run');
      await controller.shutdown();
      controller = await start();
      const before = calls.length;
      await task(
        agentId,
        'Reuse after restart',
        'Run your saved Summarize numbers background skill on other-numbers.txt to create reused.json. Read the saved source and reuse it unchanged; do not create a new skill. Verify the output.',
      );
      expect(JSON.parse(await readFile(join(workspace, 'reused.json'), 'utf8'))).toEqual({
        count: 3,
        sum: 16,
      });
      expect(calls.slice(before)).toContain('skill_run');
      expect(calls.slice(before)).not.toContain('skill_save');
      expect(
        (await controller.invoke('assistant.library', { operation: 'list' })).skills!.find(
          (item) => item.id === skill.id,
        )?.revision,
      ).toBe(skill.revision);
      expect(guiCalls).toBe(0);
      await writeFile(join(workspace, 'repair.json'), '{"count":0,"sum":0}');
      await task(
        agentId,
        'Repair existing report',
        'The existing repair.json has incorrect totals. Read numbers.txt and repair that same file to contain the correct numeric count and sum. Verify the edited file. Do not create another output file.',
      );
      expect(JSON.parse(await readFile(join(workspace, 'repair.json'), 'utf8'))).toEqual({
        count: 4,
        sum: 34,
      });
      expect(guiCalls).toBe(0);
      console.info(
        'Background workflow PASS: reports, sandboxed skill, restart, unchanged reuse and report repair; no GUI calls.',
      );
      passed = true;
    } finally {
      if (!passed && controller) {
        // Only generated code from this disposable, GUI-denied fixture; never a
        // user's profile, credentials or existing scripts. Retained on failure.
        console.info(
          'Background workflow saved skill evidence:',
          JSON.stringify(
            (
              await controller
                .invoke('assistant.library', { operation: 'list' })
                .catch(() => ({ skills: undefined }))
            ).skills,
          ),
        );
      }
      await controller?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  },
  900000,
);
