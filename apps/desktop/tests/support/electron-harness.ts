import { _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface IsolatedSiaOptions {
  readonly fakeServices?: boolean;
  readonly environment?: Readonly<Record<string, string>>;
  readonly attachmentNames?: readonly string[];
  readonly prefix?: string;
  readonly testRoot?: string;
}

export interface IsolatedSia {
  application: ElectronApplication;
  page: Page;
  readonly testRoot: string;
  readonly userData: string;
  readonly workspace: string;
  readonly rendererErrors: string[];
  completeSetup(): Promise<Page>;
  close(options?: { removeTestRoot?: boolean }): Promise<void>;
}

export async function launchIsolatedSia(
  options: IsolatedSiaOptions = {},
): Promise<IsolatedSia> {
  const testRoot =
    options.testRoot ?? (await mkdtemp(join(tmpdir(), options.prefix ?? 'sia-electron-test-')));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([
    mkdir(userData, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ]);

  const application = await electron.launch({
    args: [desktopRoot],
    env: {
      ...process.env,
      SIA_FAKE_SERVICES: options.fakeServices === false ? '0' : '1',
      SIA_TEST_PLAINTEXT_STORAGE: '1',
      SIA_TEST_USER_DATA: userData,
      SIA_TEST_WORKSPACE: workspace,
      ...(options.attachmentNames?.length
        ? {
            SIA_TEST_ATTACHMENTS: JSON.stringify(
              options.attachmentNames.map((name) => join(workspace, name)),
            ),
          }
        : {}),
      ...options.environment,
    },
  });
  if (options.fakeServices !== false) {
    // Deterministic fixtures must keep rendering when another app or the lock
    // screen occludes them. Real-app probes retain production visibility behavior.
    await application.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.setBackgroundThrottling(false);
      app.on('browser-window-created', (_event, window) =>
        window.webContents.setBackgroundThrottling(false),
      );
    });
  }
  const page = await readyPage(application);
  const rendererErrors = collectRendererErrors(page);

  return {
    application,
    page,
    testRoot,
    userData,
    workspace,
    rendererErrors,
    async completeSetup(this: IsolatedSia) {
      if (options.fakeServices === false)
        throw new Error('Automatic setup is restricted to deterministic permission fixtures.');
      const connected = await this.page
        .getByRole('radio', { name: /Connected apps only/, includeHidden: true })
        .isChecked({ timeout: 1000 })
        .catch(() => false);
      // Setup finishes in place: the fixtures grant access immediately, so no relaunch is offered.
      await this.page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
      if (connected) {
        await expect(
          this.page.getByRole('heading', { name: 'Connect the apps you use.' }),
        ).toBeVisible();
        await expect(
          this.page.getByRole('region', { name: 'Guided Mac permissions' }),
        ).toHaveCount(0);
        await this.page.getByRole('button', { name: 'Start using Sia' }).click();
      }
      await expect(
        this.page.getByRole('textbox', { name: 'Message', exact: true }),
      ).toBeVisible();
      const finished = await this.page.evaluate(() => window.sia.bootstrap());
      expect(finished.preferences.onboarding?.restarted).not.toBe(true);
      expect(finished.preferences.onboarding?.step).toBe('complete');
      return this.page;
    },
    async close(this: IsolatedSia, closeOptions: { removeTestRoot?: boolean } = {}) {
      if (!this.page.isClosed())
        await Promise.race([
          this.page.close({ runBeforeUnload: false }).catch(() => undefined),
          delay(500, () => this.page.isClosed()),
        ]);
      await closeElectronApplication(this.application);
      if (closeOptions.removeTestRoot !== false) {
        await rm(testRoot, { recursive: true, force: true });
      }
    },
  };
}

async function closeElectronApplication(application: ElectronApplication): Promise<void> {
  const child = application.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await delay(2_000, () => child.exitCode !== null || child.signalCode !== null);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await delay(1_000, () => child.exitCode !== null || child.signalCode !== null);
}

async function delay(maximumMs: number, done: () => boolean): Promise<void> {
  const started = Date.now();
  while (!done() && Date.now() - started < maximumMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function readyPage(application: ElectronApplication): Promise<Page> {
  const page = await application.firstWindow();
  await expect.poll(() => page.evaluate(() => Boolean(window.sia))).toBe(true);
  return page;
}

export function collectRendererErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

export async function exitFirstRunSetup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exit setup', exact: true }).click();
  await expect(page.getByRole('main', { name: 'Welcome to Sia' })).toBeHidden();
}

export async function createAgentAndThread(
  page: Page,
  options: { name?: string; instructions?: string } = {},
): Promise<{ agentId: string; threadId: string; workspace: string }> {
  const name = options.name ?? 'Parity helper';
  await page
    .getByRole('complementary', { name: 'Agent navigation' })
    .getByRole('button', { name: 'Create agent' })
    .click();
  await page
    .getByRole('dialog', { name: 'New agent' })
    .getByLabel('Name', { exact: true })
    .fill(name);
  await page
    .getByLabel('Instructions')
    .fill(options.instructions ?? 'Run deterministic parity fixtures without external access.');
  await page
    .getByRole('dialog', { name: 'New agent' })
    .getByRole('button', { name: 'Create agent' })
    .click();
  // Submission starts async IPC; a completed click does not mean creation finished.
  await expect(page.getByRole('dialog', { name: 'New agent' })).toBeHidden();
  const snapshot = await page.evaluate(async () => await window.sia.bootstrap());
  if (!snapshot.activeAgentId || !snapshot.activeThreadId) {
    throw new Error('The deterministic fixture did not create an active agent and thread.');
  }
  const thread = snapshot.threads.find(({ id }) => id === snapshot.activeThreadId);
  if (!thread) throw new Error('The deterministic fixture did not expose its workspace.');
  return {
    agentId: snapshot.activeAgentId,
    threadId: snapshot.activeThreadId,
    workspace: thread.workspace,
  };
}

export async function reopenClosedWindow(application: ElectronApplication): Promise<Page> {
  const reopened = application.waitForEvent('window');
  await application.evaluate(({ app }) => {
    app.emit('second-instance', {} as never, [], '', {});
  });
  const page = await reopened;
  await expect.poll(() => page.evaluate(() => Boolean(window.sia))).toBe(true);
  return page;
}
