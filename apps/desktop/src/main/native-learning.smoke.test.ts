import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway, DefaultActionAuthorizationPolicy } from '@sia/action-gateway';
import { DesktopController } from './controller/desktop-controller.js';
import { DesktopActionBackend } from './actions/desktop-action-backend.js';
import { CloudClient } from './cloud-client.js';
import { EphemeralPayloadCipher, SqliteRecordRepository } from './persistence.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';
import { NativeSkills } from './native-skills.js';
import { NotchVault } from './notch/vault.js';
import { discoverCodexInstallation } from './codex-installation.js';
import { probeProviders } from './provider-probe.js';

// Opt-in real model test. No GUI driver, screen capture, account content or network
// task is provided. Synthetic files and encrypted state live in a disposable folder.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_NATIVE_LEARNING_SMOKE === '1'
    ? it
    : it.skip;
live(
  'runs native commands, learns/reuses a skill and memory after restart, and consolidates without GUI access',
  async () => {
    const codexCommand = await discoverCodexInstallation();
    const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-5.6-sol';
    const root = await mkdtemp(join(tmpdir(), 'sia-native-live-'));
    const cipher = new EphemeralPayloadCipher();
    const db = join(root, 'state.sqlite');
    const code = `JUNIPER-${randomUUID().slice(0, 8)}`;
    let controller: DesktopController | undefined;
    let guiCalls = 0;
    const denyGui = async (): Promise<never> => {
      guiCalls++;
      throw new Error('GUI actions are excluded from this local validation.');
    };
    const start = async () => {
      const repository = new SqliteRecordRepository(db, cipher);
      const cloud = new CloudClient(undefined, { read: async () => undefined });
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
      const host = new DesktopController({
        providerProbe: (only) =>
          probeProviders(
            only,
            process.env,
            undefined,
            codexCommand ? { codex: codexCommand } : {},
          ),
        repository,
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
        assistantAction: (request) =>
          host.assistantAction(request, (name, args, signal) =>
            gateway.invoke({ name, arguments: args, context: { ...request.context, signal } }),
          ),
        macBrowserAccess: () => host.computerAccessMode() === 'mac',
      });
      const policy = new DefaultActionAuthorizationPolicy({
        trustLocalActions: () => host.computerTrust() === 'auto',
      });
      gateway = new ActionGateway({
        backend,
        approvals: host.approvalBroker(),
        policy: {
          evaluate: (request) =>
            host.allowsReviewAction(request.context.threadId, request.name)
              ? policy.evaluate(request)
              : { decision: 'deny', reason: 'Review tools only.' },
        },
        onInvocation: host.actionInvocationObserver(),
        onResult: host.actionResultObserver(),
        isToolAvailable: (name) => host.actionToolAvailable(name),
      });
      const runtime = new RuntimeCoordinator(gateway, {
        ...(codexCommand ? { codexCommand } : {}),
        macContext: async () =>
          'Local shell-only validation. No screen context or screenshot tool is supplied. Do not capture or control the desktop.',
      });
      host.attachRuntime(runtime);
      await host.initialize();
      return host;
    };
    const waitForThread = async (threadId: string, expectedFailure = false) => {
      const deadline = Date.now() + 240_000;
      while (Date.now() < deadline) {
        const state = controller!.snapshot();
        const thread = state.threads.find((entry) => entry.id === threadId)!;
        if (!['running', 'queued', 'waiting'].includes(thread.status)) {
          const history = state.timeline.filter((entry) => entry.threadId === threadId);
          const resumed = history.findLastIndex(
            (entry) => entry.kind === 'notice' && entry.title === 'Continuing task',
          );
          const items = resumed < 0 ? history : history.slice(resumed + 1);
          const errors = items
            .filter((entry) => entry.kind === 'error')
            .map((entry) => entry.text);
          if (!expectedFailure && (errors.length || thread.status === 'failed'))
            throw new Error(`Live task failed: ${errors.join('; ')}`);
          if (expectedFailure) {
            console.info(
              'Native live test: blocked task response:',
              items
                .filter((entry) => entry.kind === 'assistant')
                .map((entry) => entry.text)
                .join('\n'),
            );
            expect(thread.status).toBe('failed');
            expect(errors.join(' ')).toMatch(/missing|not exist|not found/i);
          }
          return items
            .filter((entry) => entry.kind === 'assistant')
            .map((entry) => entry.text ?? '')
            .join('\n');
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await controller!.invoke('threads.cancel', { threadId });
      throw new Error('Live task exceeded four minutes.');
    };
    const task = async (
      agentId: string,
      title: string,
      text: string,
      expectedFailure = false,
    ) => {
      const { threadId } = await controller!.invoke('threads.create', { agentId, title });
      console.info(`Native live test: ${title} started`);
      await controller!.invoke('threads.send', { threadId, text });
      const response = await waitForThread(threadId, expectedFailure);
      console.info(`Native live test: ${title} response: ${response.slice(-1600)}`);
      return { threadId, response };
    };
    try {
      controller = await start();
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
      await controller.invoke('computer.setTrust', { trust: 'auto' });
      const { agentId } = await controller.invoke('agents.save', {
        name: 'Native live validation',
        provider: 'codex',
        model,
        instructions:
          'This is a temporary validation agent. Use only synthetic files in your own workspace. Do not open/control apps, use screenshots, browse the network, or read unrelated files. For shell-only work verify using stdout and file readback. Keep replies brief.',
      });
      const workspace = controller
        .snapshot()
        .agents.find((entry) => entry.id === agentId)!.workspace;
      await writeFile(join(workspace, 'numbers.txt'), '3\n7\n11\n13\n');
      await writeFile(join(workspace, 'other-numbers.txt'), '2\n5\n9\n');
      await controller.invoke('assistant.library', {
        operation: 'learning',
        agentId,
        enabled: true,
      });
      // Exercise explicit task learning first, then run exactly one consolidation
      // after the restart. Do not let the idle scheduler race this validation.
      await controller.invoke('assistant.library', {
        operation: 'backgroundReview',
        agentId,
        enabled: false,
      });
      await task(
        agentId,
        'Native shell and memory',
        `Use native shell commands to calculate the SHA-256 of numbers.txt and write that checksum to checksum.txt, then read it back to verify. For this validation agent, remember my report label is ${code} and I prefer concise reports. This is shell-only; do not capture the screen or open apps.`,
      );
      const expected = createHash('sha256').update('3\n7\n11\n13\n').digest('hex');
      expect(await readFile(join(workspace, 'checksum.txt'), 'utf8')).toContain(expected);
      let library = await controller.invoke('assistant.library', { operation: 'list' });
      const vault = new NotchVault(workspace, agentId);
      expect(JSON.stringify(vault.list())).toContain(code);
      console.info('Native live test: checksum and durable memory verified');

      await task(
        agentId,
        'Learn a native skill',
        'Create a reusable native Bash skill named summarize-numbers. It accepts one path argument, reads a plain text file containing one integer per line, and prints the count and sum. Save it in the native skill directory with the usual metadata. Run it once on numbers.txt and verify the expected count 4 and sum 34. Remember that I prefer one-sentence reports. No GUI or screenshots.',
      );
      const registry = new NativeSkills(workspace, agentId);
      console.info(
        'Native live test: discovered scripts:',
        JSON.stringify(registry.list().map(({ title, path }) => ({ title, path }))),
      );
      const skill = registry
        .list()
        .find((entry) => entry.path?.endsWith('/summarize-numbers.sh'));
      expect(skill).toBeDefined();
      expect(skill!.source).toContain('# skill:');
      const revision = skill!.revision;
      await controller.shutdown();
      controller = await start();
      const reused = await task(
        agentId,
        'Reuse after restart',
        'Use your saved native skill to summarize other-numbers.txt. Read the saved source, run it, and write the result to reuse.txt without rewriting the skill. Include my remembered report label in your reply. Use only shell commands inside this workspace; no GUI or screenshots.',
      );
      expect(reused.response).toContain(code);
      expect(await readFile(join(workspace, 'reuse.txt'), 'utf8')).toMatch(
        /3[\s\S]*16|16[\s\S]*3/,
      );
      expect(registry.list().find((entry) => entry.id === skill!.id)?.revision).toBe(revision);
      console.info(
        'Native live test: cross-conversation memory and unchanged skill reuse verified after controller restart',
      );

      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: true,
      });
      // Prevent a periodic review from racing the explicit consolidation below.
      vault.markConsolidation();
      const background = await task(
        agentId,
        'Recall native memory in background',
        'Read my saved report-label preference from the memory vault and include the label in your reply. Read the linked notes needed to confirm it. Then save a note bg-preference.md that I prefer the report heading Amber summary, and link it from MOC.md. No apps, GUI, network or workspace reports are needed.',
      );
      expect(background.response).toContain(code);
      expect(vault.read('bg-preference.md').text).toContain('Amber summary');
      expect(vault.read('MOC.md').text).toContain('[[bg-preference]]');
      expect(registry.list().find((entry) => entry.id === skill!.id)?.revision).toBe(revision);
      await controller.shutdown();
      controller = await start();
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: false });
      const fromBackground = await task(
        agentId,
        'Recall background memory on screen',
        'What report heading did I last ask you to remember? Read the relevant saved note and answer without changing files or opening apps.',
      );
      expect(fromBackground.response).toContain('Amber summary');
      console.info(
        'Native live test: bidirectional memory recall verified across modes and restart',
      );

      const missing = await task(
        agentId,
        'Observed missing-file failure',
        'First append one line checkpoint-complete to recovery-receipt.txt. Then calculate and report the SHA-256 checksum of missing-validation-input.txt in this workspace. Do not create the missing input or search anywhere else. If it is missing, stop and explain that the requested checksum cannot be calculated. No GUI or screenshots.',
        true,
      );
      // The terminal provider event can be visible before the journal flush ends.
      await expect
        .poll(
          async () =>
            (
              await controller!.invoke('assistant.library', { operation: 'list' })
            ).journal?.some(
              (entry) => entry.threadId === missing.threadId && entry.outcome === 'failed',
            ),
          { timeout: 10000 },
        )
        .toBe(true);
      library = await controller.invoke('assistant.library', { operation: 'list' });
      const missingJournal = library.journal?.filter(
        (entry) => entry.threadId === missing.threadId && entry.kind === 'task',
      );
      console.info('Native live test: missing-file journal:', JSON.stringify(missingJournal));
      expect(missingJournal?.some((entry) => entry.outcome === 'failed')).toBe(true);
      console.info('Native live test: missing-file blocker retained in the journal');
      expect((await readFile(join(workspace, 'recovery-receipt.txt'), 'utf8')).trim()).toBe(
        'checkpoint-complete',
      );
      await writeFile(join(workspace, 'missing-validation-input.txt'), 'Recovered input\n');
      await controller.shutdown();
      controller = await start();
      await controller.invoke('threads.retry', { threadId: missing.threadId });
      const recovered = await waitForThread(missing.threadId);
      expect(recovered).toContain(
        createHash('sha256').update('Recovered input\n').digest('hex'),
      );
      expect((await readFile(join(workspace, 'recovery-receipt.txt'), 'utf8')).trim()).toBe(
        'checkpoint-complete',
      );
      console.info(
        'Native live test: resumed after restart without duplicating the completed append',
      );

      await controller.invoke('assistant.library', {
        operation: 'nativeLearning',
        agentId,
        enabled: true,
      });
      await controller.invoke('computer.setAccessMode', { mode: 'mac', background: true });
      const review = await controller.invoke('assistant.library', {
        operation: 'review',
        agentId,
      });
      console.info('Native live test: isolated automatic consolidation started');
      const summary = await waitForThread(review.threadId!);
      library = await controller.invoke('assistant.library', { operation: 'list' });
      console.info(`Native live test: consolidation response: ${summary.slice(-1600)}`);
      console.info(
        `Native live test: resulting learned memories=${library.memories.length}, native skills=${registry.list().length}, pending suggestions=${library.suggestions?.length ?? 0}`,
      );
      const reviewItems = controller
        .snapshot()
        .timeline.filter((entry) => entry.threadId === review.threadId);
      expect(reviewItems.some((entry) => entry.toolName?.includes('memory_vault'))).toBe(true);
      expect(
        reviewItems.some((entry) =>
          /command|image|computer_|browser_/i.test(entry.toolName ?? ''),
        ),
      ).toBe(false);
      expect(vault.read('failures.log').text.trim()).toBe('');
      expect(vault.read('lessons.md').text).toMatch(/^- /m);
      expect(vault.read('MOC.md').text).toContain('[[');
      expect(guiCalls).toBe(0);
      console.info(
        'Native live test: PASS — real Codex flow, synthetic files only, no GUI calls',
      );
    } catch (error) {
      console.info(
        'Native live test: disposable fixture files:',
        JSON.stringify(await readdir(root, { recursive: true })),
      );
      console.info(
        'Native live test: command evidence:',
        JSON.stringify(
          controller
            ?.snapshot()
            .timeline.filter((entry) => entry.kind === 'activity')
            .map(({ title, detail, toolName, status }) => ({
              title,
              detail,
              toolName,
              status,
            })),
        ),
      );
      console.info(
        'Native live test: final task messages:',
        JSON.stringify(
          controller
            ?.snapshot()
            .timeline.filter((entry) => ['assistant', 'error'].includes(entry.kind))
            .map(({ threadId, text }) => ({ threadId, text })),
        ),
      );
      throw error;
    } finally {
      await controller?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  },
  1_200_000,
);
