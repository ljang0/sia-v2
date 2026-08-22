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
  const page = await readyPage(application);
  const rendererErrors = collectRendererErrors(page);

  return {
    application,
    page,
    testRoot,
    userData,
    workspace,
    rendererErrors,
    async close(closeOptions = {}) {
      await application.close().catch(() => undefined);
      if (closeOptions.removeTestRoot !== false) {
        await rm(testRoot, { recursive: true, force: true });
      }
    },
  };
}

export async function readyPage(application: ElectronApplication): Promise<Page> {
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

export async function createAgentAndThread(
  page: Page,
  options: { name?: string; instructions?: string } = {},
): Promise<{ agentId: string; threadId: string }> {
  const name = options.name ?? 'Parity helper';
  await page
    .getByRole('complementary', { name: 'Agent navigation' })
    .getByRole('button', { name: 'Create agent' })
    .click();
  await page.getByLabel('Name').fill(name);
  await page
    .getByLabel('Instructions')
    .fill(options.instructions ?? 'Run deterministic parity fixtures without external access.');
  await page.getByRole('button', { name: 'Choose' }).click();
  await page
    .getByRole('dialog', { name: 'New agent' })
    .getByRole('button', { name: 'Create agent' })
    .click();
  const joinResearch = page.getByRole('button', { name: 'Join research release' });
  const localOnly = page.getByRole('button', { name: 'Use without sharing' });
  await Promise.race([
    joinResearch.waitFor({ state: 'visible', timeout: 3_000 }),
    localOnly.waitFor({ state: 'visible', timeout: 3_000 }),
  ]).catch(() => undefined);
  if (await joinResearch.isVisible().catch(() => false)) await joinResearch.click();
  else if (await localOnly.isVisible().catch(() => false)) await localOnly.click();
  await page.getByRole('button', { name: 'New thread' }).click();

  const snapshot = await page.evaluate(async () => await window.sia.bootstrap());
  if (!snapshot.activeAgentId || !snapshot.activeThreadId) {
    throw new Error('The deterministic fixture did not create an active agent and thread.');
  }
  return { agentId: snapshot.activeAgentId, threadId: snapshot.activeThreadId };
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
