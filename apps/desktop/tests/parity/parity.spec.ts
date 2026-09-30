import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectRendererErrors,
  createAgentAndThread,
  launchIsolatedSia,
  reopenClosedWindow,
} from '../support/electron-harness.js';
import { allParityBridgePaths, allParityTestIds, parityContract } from './parity-contract.js';
import type { ParityFeature } from './parity-contract.js';

const execFileAsync = promisify(execFile);
const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/renderer');
// Strict by default: a missing bridge path or stable test id fails instead of silently skipping.
// Set SIA_PARITY_ALLOW_INCOMPLETE=1 only while a contract is intentionally in progress.
const requireComplete =
  process.env.SIA_PARITY_REQUIRE_COMPLETE === '1' ||
  process.env.SIA_PARITY_ALLOW_INCOMPLETE !== '1';
const availableBridgePaths = new Set<string>();
const availableTestIds = new Set<string>();

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const discovery = await launchIsolatedSia({ prefix: 'sia-parity-discovery-' });
  try {
    const available = await discoverBridgePaths(discovery.page, allParityBridgePaths());
    for (const path of available) availableBridgePaths.add(path);
    for (const id of await discoverDeclaredTestIds(rendererRoot)) availableTestIds.add(id);
  } finally {
    await discovery.close();
  }
});

test('parity contract inventory is machine-readable and optionally strict', async ({}, testInfo) => {
  const expectedBridgePaths = allParityBridgePaths();
  const expectedTestIds = allParityTestIds();
  expect(new Set(expectedBridgePaths).size).toBe(expectedBridgePaths.length);
  expect(new Set(expectedTestIds).size).toBe(expectedTestIds.length);

  const missingBridgePaths = expectedBridgePaths.filter(
    (path) => !availableBridgePaths.has(path),
  );
  const missingTestIds = expectedTestIds.filter((id) => !availableTestIds.has(id));
  await testInfo.attach('parity-contract-inventory.json', {
    body: JSON.stringify(
      {
        strict: requireComplete,
        expectedBridgePaths,
        availableBridgePaths: [...availableBridgePaths].sort(),
        missingBridgePaths,
        expectedTestIds,
        declaredTestIds: [...availableTestIds].sort(),
        missingTestIds,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });

  if (requireComplete) {
    expect(
      missingBridgePaths,
      'The strict parity gate requires every bridge contract.',
    ).toEqual([]);
    expect(missingTestIds, 'The strict parity gate requires every stable test id.').toEqual([]);
  }
});

test('attachments persist in the transcript without changing their contents', async ({}, testInfo) => {
  requireFeature('attachments', testInfo);
  const harness = await launchParityFixture('attachments');
  try {
    await createAgentAndThread(harness.page);
    const attachmentPath = join(harness.workspace, 'parity-note.txt');
    const attachmentContents = 'Deterministic attachment payload.\n';
    await writeFile(attachmentPath, attachmentContents, 'utf8');

    await harness.page.getByTestId(parityContract.attachments.testIds[0]).click();
    await expect(harness.page.getByTestId(parityContract.attachments.testIds[1])).toContainText(
      'parity-note.txt',
    );
    await harness.page
      .getByRole('textbox', { name: 'Message' })
      .fill('Read the attached note.');
    await harness.page.getByTestId(parityContract.attachments.testIds[2]).click();

    await expect(harness.page.getByText('parity-note.txt', { exact: true })).toBeVisible();
    await harness.page.reload();
    await expect.poll(() => harness.page.evaluate(() => Boolean(window.sia))).toBe(true);
    await expect(harness.page.getByText('parity-note.txt', { exact: true })).toBeVisible();
    expect(await readFile(attachmentPath, 'utf8')).toBe(attachmentContents);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('model and reasoning controls belong to one thread and survive reload', async ({}, testInfo) => {
  requireFeature('threadConfiguration', testInfo);
  const harness = await launchParityFixture('threadConfiguration');
  try {
    await createAgentAndThread(harness.page);
    await harness.page.getByText('Model for this conversation', { exact: true }).click();
    await harness.page
      .getByTestId(parityContract.threadConfiguration.testIds[0])
      .selectOption('gpt-5.6-terra');
    await harness.page
      .getByTestId(parityContract.threadConfiguration.testIds[1])
      .selectOption('high');

    await harness.page.reload();
    await expect.poll(() => harness.page.evaluate(() => Boolean(window.sia))).toBe(true);
    await harness.page.getByText('Model for this conversation', { exact: true }).click();
    await expect(
      harness.page.getByTestId(parityContract.threadConfiguration.testIds[0]),
    ).toHaveValue('gpt-5.6-terra');
    await expect(
      harness.page.getByTestId(parityContract.threadConfiguration.testIds[1]),
    ).toHaveValue('high');
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('archive, transcript search, and fork preserve source context', async ({}, testInfo) => {
  requireFeature('threadLibrary', testInfo);
  const harness = await launchParityFixture('threadLibrary');
  try {
    await createAgentAndThread(harness.page);
    const token = 'PARITY-ARCHIVE-4F92';
    await harness.page.getByRole('textbox', { name: 'Message' }).fill(`Remember ${token}.`);
    await harness.page.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(
      harness.page.getByLabel('Conversation').getByText(/deterministic local runtime/i),
    ).toBeVisible();

    await harness.page.getByTestId(parityContract.threadLibrary.testIds[0]).click();
    await harness.page.getByTestId(parityContract.threadLibrary.testIds[1]).click();
    await harness.page.getByTestId(parityContract.threadLibrary.testIds[2]).click();
    await harness.page.getByTestId(parityContract.threadLibrary.testIds[3]).fill(token);
    const results = harness.page.getByTestId(parityContract.threadLibrary.testIds[4]);
    await expect(results).toContainText(token);
    await results
      .getByTestId(parityContract.threadLibrary.testIds[5])
      .filter({ hasText: token })
      .click();

    await harness.page.getByTestId(parityContract.threadLibrary.testIds[0]).click();
    await harness.page.getByTestId(parityContract.threadLibrary.testIds[6]).click();
    await harness.page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(
      harness.page.getByTestId(parityContract.threadLibrary.testIds[7]),
    ).toContainText('Copied from');
    await expect(
      harness.page.getByLabel('Conversation').getByText(token, { exact: false }),
    ).toBeVisible();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('background Activity remains visible after the window closes and reopens', async ({}, testInfo) => {
  requireFeature('backgroundActivity', testInfo);
  test.slow();
  const harness = await launchParityFixture('backgroundActivity');
  try {
    await createAgentAndThread(harness.page);
    await harness.page
      .getByRole('textbox', { name: 'Message' })
      .fill('PARITY_BACKGROUND: finish after renderer reopen');
    await harness.page.getByRole('textbox', { name: 'Message' }).press('Enter');
    await harness.page.getByTestId(parityContract.backgroundActivity.testIds[0]).click();
    const task = harness.page
      .getByTestId(parityContract.backgroundActivity.testIds[1])
      .filter({ hasText: 'PARITY_BACKGROUND' });
    await expect(task).toBeVisible();
    // The fake turn outlasts the window close, so this proves work continues without a renderer.
    await expect(task.getByTestId(parityContract.backgroundActivity.testIds[2])).toHaveText(
      /running/i,
    );

    await harness.page.close();
    harness.page = await reopenClosedWindow(harness.application);
    const reopenedErrors = collectRendererErrors(harness.page);
    await harness.page.getByTestId(parityContract.backgroundActivity.testIds[0]).click();
    const restoredTask = harness.page
      .getByTestId(parityContract.backgroundActivity.testIds[1])
      .filter({ hasText: 'PARITY_BACKGROUND' });
    await expect(
      restoredTask.getByTestId(parityContract.backgroundActivity.testIds[2]),
    ).toHaveText(/complete/i, { timeout: 20_000 });
    expect(reopenedErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('an interrupted turn is recovered without duplicating its user message', async ({}, testInfo) => {
  requireFeature('interruptedTurnRecovery', testInfo);
  const first = await launchParityFixture('interruptedTurnRecovery');
  let recovered: Awaited<ReturnType<typeof launchIsolatedSia>> | undefined;
  const prompt = 'PARITY_INTERRUPT: recover exactly once';
  try {
    await createAgentAndThread(first.page);
    await first.page.getByRole('textbox', { name: 'Message' }).fill(prompt);
    await first.page.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(
      first.page.getByTestId(parityContract.interruptedTurnRecovery.testIds[0]),
    ).toBeVisible();

    const processClosed = first.application.waitForEvent('close');
    first.application.process().kill('SIGKILL');
    await processClosed;

    recovered = await launchIsolatedSia({
      prefix: 'sia-parity-interrupted-',
      testRoot: first.testRoot,
      environment: fixtureEnvironment('interruptedTurnRecovery'),
    });
    await expect(
      recovered.page.getByTestId(parityContract.interruptedTurnRecovery.testIds[1]),
    ).toContainText(/interrupted.*safe to retry/i);
    const recoveredPrompt = recovered.page
      .getByLabel('Conversation')
      .getByText(prompt, { exact: true });
    await expect(recoveredPrompt).toHaveCount(1);
    await recovered.page.getByTestId(parityContract.interruptedTurnRecovery.testIds[2]).click();
    await expect(recoveredPrompt).toHaveCount(1);
    await expect(recovered.page.getByText(/deterministic local runtime/i)).toBeVisible();
    expect(recovered.rendererErrors).toEqual([]);
  } finally {
    await recovered?.close({ removeTestRoot: false });
    await rm(first.testRoot, { recursive: true, force: true });
  }
});

test('goals and schedules persist with a deterministic next-run time', async ({}, testInfo) => {
  requireFeature('goalsAndSchedules', testInfo);
  const harness = await launchParityFixture('goalsAndSchedules', {
    TZ: 'UTC',
  });
  try {
    await createAgentAndThread(harness.page);
    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByRole('menuitem', { name: 'Goal', exact: true }).click();
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[0])
      .fill('Publish parity report');
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[1]).click();

    await harness.page.getByRole('button', { name: 'Close thread tool' }).click();
    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByRole('menuitem', { name: 'Schedules', exact: true }).click();
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[2]).click();
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[3])
      .fill('Run the one-time parity check.');
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[4])
      .selectOption('once');
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[5])
      .fill('2030-01-01T09:00');
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[6]).click();
    await expect(
      harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[7]),
    ).toContainText(/Jan 1.*9:00/i);

    // Weekday schedules take a time of day; the list names the cadence plainly.
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[2]).click();
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[3])
      .fill('Run the weekday parity check.');
    await harness.page
      .getByTestId(parityContract.goalsAndSchedules.testIds[4])
      .selectOption('weekdays');
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[8]).fill('09:00');
    await harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[6]).click();
    await expect(
      harness.page.getByTestId(parityContract.goalsAndSchedules.testIds[9]),
    ).toContainText([/^Once$/, /Weekdays at 9:00/]);

    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('Changes review stages and restores a real temporary git change', async ({}, testInfo) => {
  requireFeature('gitChanges', testInfo);
  const harness = await launchParityFixture('gitChanges');
  try {
    const { workspace } = await createAgentAndThread(harness.page);
    await initializeGitWorkspace(workspace);
    const changedFile = join(workspace, 'notes.txt');
    await writeFile(changedFile, 'changed by parity fixture\n', 'utf8');

    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByTestId(parityContract.gitChanges.testIds[0]).click();
    const row = harness.page
      .getByTestId(parityContract.gitChanges.testIds[1])
      .filter({ hasText: 'notes.txt' });
    await expect(row).toBeVisible();
    await harness.page.getByTestId(parityContract.gitChanges.testIds[2]).click();
    await expect(harness.page.getByTestId(parityContract.gitChanges.testIds[3])).toContainText(
      'notes.txt',
    );
    expect((await git(workspace, ['diff', '--cached', '--name-only'])).stdout).toContain(
      'notes.txt',
    );

    await harness.page.getByTestId(parityContract.gitChanges.testIds[4]).click();
    await harness.page.getByRole('button', { name: 'Restore file' }).click();
    await expect.poll(async () => await readFile(changedFile, 'utf8')).toBe('baseline\n');
    await expect
      .poll(async () => (await git(workspace, ['status', '--porcelain'])).stdout)
      .toBe('');
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('terminal commands remain scoped to the granted workspace', async ({}, testInfo) => {
  requireFeature('scopedTerminal', testInfo);
  const harness = await launchParityFixture('scopedTerminal');
  try {
    const { workspace } = await createAgentAndThread(harness.page);
    await enableDeveloperTools(harness.page);
    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByTestId(parityContract.scopedTerminal.testIds[0]).click();
    const command = harness.page.getByTestId(parityContract.scopedTerminal.testIds[1]);
    await command.fill('pwd');
    await harness.page.getByTestId(parityContract.scopedTerminal.testIds[2]).click();
    await expect(
      harness.page.getByTestId(parityContract.scopedTerminal.testIds[3]),
    ).toContainText(workspace);

    await command.fill('printf %s "${SIA_PARITY_EPHEMERAL-unset}"');
    await harness.page.getByTestId(parityContract.scopedTerminal.testIds[2]).click();
    await expect(
      harness.page.getByTestId(parityContract.scopedTerminal.testIds[3]),
    ).toContainText('unset');
    await expect(
      harness.page.getByTestId(parityContract.scopedTerminal.testIds[4]),
    ).toContainText(/exit 0/i);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('background terminals accept input and stop without blocking the thread', async ({}, testInfo) => {
  requireFeature('backgroundTerminal', testInfo);
  const harness = await launchParityFixture('backgroundTerminal');
  try {
    await createAgentAndThread(harness.page);
    await enableDeveloperTools(harness.page);
    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByTestId(parityContract.backgroundTerminal.testIds[0]).click();
    await harness.page
      .getByTestId(parityContract.backgroundTerminal.testIds[1])
      .fill(`read line; printf 'received:%s' "$line"; sleep 30`);
    await harness.page.getByTestId(parityContract.backgroundTerminal.testIds[2]).click();

    const process = harness.page.getByTestId(parityContract.backgroundTerminal.testIds[3]);
    await expect(process).toBeVisible();
    await expect(process.getByTestId(parityContract.backgroundTerminal.testIds[4])).toHaveText(
      'running',
    );
    await process.getByTestId(parityContract.backgroundTerminal.testIds[6]).fill('hello');
    await process.getByRole('button', { name: 'Send' }).click();
    await expect(
      process.getByTestId(parityContract.backgroundTerminal.testIds[5]),
    ).toContainText('received:hello');
    await process.getByTestId(parityContract.backgroundTerminal.testIds[7]).click();
    await expect(process.getByTestId(parityContract.backgroundTerminal.testIds[4])).toHaveText(
      'stopped',
    );
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('workspace snapshots preserve and restore tracked changes without hiding the working tree', async ({}, testInfo) => {
  requireFeature('workspaceSnapshots', testInfo);
  const harness = await launchParityFixture('workspaceSnapshots');
  try {
    const { workspace } = await createAgentAndThread(harness.page);
    await initializeGitWorkspace(workspace);
    const changedFile = join(workspace, 'notes.txt');
    await writeFile(changedFile, 'saved workspace state\n', 'utf8');

    await harness.page.getByRole('button', { name: 'Tools', exact: true }).click();
    await harness.page.getByTestId(parityContract.workspaceSnapshots.testIds[0]).click();
    await harness.page.getByTestId(parityContract.workspaceSnapshots.testIds[1]).click();
    const snapshots = harness.page.getByTestId(parityContract.workspaceSnapshots.testIds[2]);
    await expect(snapshots).toContainText('1 saved snapshot');
    expect(await readFile(changedFile, 'utf8')).toBe('saved workspace state\n');

    await harness.page.getByTestId('git-restore').click();
    await harness.page.getByRole('button', { name: 'Restore file' }).click();
    await expect.poll(async () => await readFile(changedFile, 'utf8')).toBe('baseline\n');

    await snapshots.locator('summary').click();
    await snapshots.getByTestId(parityContract.workspaceSnapshots.testIds[3]).click();
    await expect
      .poll(async () => await readFile(changedFile, 'utf8'))
      .toBe('saved workspace state\n');
    await snapshots.getByTestId(parityContract.workspaceSnapshots.testIds[4]).click();
    await expect(
      harness.page.getByTestId(parityContract.workspaceSnapshots.testIds[2]),
    ).toHaveCount(0);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('two worktrees can run independent deterministic tasks concurrently', async ({}, testInfo) => {
  test.slow();
  requireFeature('worktreeParallelism', testInfo);
  const harness = await launchParityFixture('worktreeParallelism');
  try {
    const { threadId: sourceThreadId, workspace } = await createAgentAndThread(harness.page);
    await initializeGitWorkspace(workspace);
    // The worktree option is a developer tool.
    await enableDeveloperTools(harness.page);
    for (const name of ['parity-alpha', 'parity-beta']) {
      if (name === 'parity-beta') {
        await harness.page.evaluate((id) => window.sia.threads.select(id), sourceThreadId);
      }
      await harness.page
        .getByRole('button', { name: 'Conversation actions for New conversation', exact: true })
        .click();
      await harness.page.getByTestId(parityContract.worktreeParallelism.testIds[0]).click();
      await harness.page.getByTestId(parityContract.worktreeParallelism.testIds[1]).check();
      await harness.page.getByLabel('Name', { exact: true }).fill(name);
      await harness.page.getByRole('button', { name: 'Duplicate', exact: true }).click();
      await harness.page
        .getByRole('textbox', { name: 'Message' })
        .fill(`PARITY_WORKTREE: ${name}`);
      await harness.page.getByRole('textbox', { name: 'Message' }).press('Enter');
    }
    await harness.page.getByTestId(parityContract.worktreeParallelism.testIds[2]).click();
    const rows = harness.page.getByTestId(parityContract.worktreeParallelism.testIds[3]);
    await expect(
      rows
        .getByTestId(parityContract.worktreeParallelism.testIds[4])
        .filter({ hasText: /running/i }),
    ).toHaveCount(2);
    await expect(
      rows
        .getByTestId(parityContract.worktreeParallelism.testIds[4])
        .filter({ hasText: /complete/i }),
    ).toHaveCount(2, { timeout: 25_000 });
    const worktrees = (await git(workspace, ['worktree', 'list', '--porcelain'])).stdout;
    expect(worktrees).toContain('parity-alpha');
    expect(worktrees).toContain('parity-beta');
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('a clean linked worktree can hand off to main and be removed explicitly', async ({}, testInfo) => {
  requireFeature('worktreeLifecycle', testInfo);
  const harness = await launchParityFixture('worktreeLifecycle');
  try {
    const { threadId, workspace } = await createAgentAndThread(harness.page);
    await initializeGitWorkspace(workspace);
    const fork = await harness.page.evaluate(
      async ({ sourceThreadId }) =>
        await window.sia.threads.fork(sourceThreadId, true, 'Lifecycle worktree'),
      { sourceThreadId: threadId },
    );
    const linked = fork.snapshot.threads.find(({ id }) => id === fork.threadId);
    expect(linked?.worktree?.kind).toBe('linked');
    const linkedPath = linked!.workspace;
    expect((await stat(linkedPath)).isDirectory()).toBe(true);

    const handoff = await harness.page.evaluate(
      async ({ linkedThreadId }) =>
        await window.sia.threads.handoff(linkedThreadId, 'primary', 'Continue in main'),
      { linkedThreadId: fork.threadId },
    );
    const primary = handoff.snapshot.threads.find(({ id }) => id === handoff.threadId);
    expect(primary).toMatchObject({
      workspace,
      sourceThreadId: fork.threadId,
      worktree: { kind: 'primary' },
    });

    await harness.page.evaluate(
      async ({ linkedThreadId }) => await window.sia.worktrees.cleanup(linkedThreadId),
      { linkedThreadId: fork.threadId },
    );
    await expect(stat(linkedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

function requireFeature(feature: ParityFeature, testInfo: TestInfo): void {
  const missingBridge = parityContract[feature].bridge.filter(
    (path) => !availableBridgePaths.has(path),
  );
  const missingTestIds = parityContract[feature].testIds.filter(
    (id) => !availableTestIds.has(id),
  );
  const missing = [...missingBridge, ...missingTestIds.map((id) => `[data-testid=${id}]`)];
  testInfo.annotations.push({
    type: 'parity-contract',
    description: `${feature}: ${missing.length === 0 ? 'ready' : `missing ${missing.join(', ')}`}`,
  });
  if (requireComplete) {
    expect(missing, `${feature} bridge contract is incomplete.`).toEqual([]);
  } else {
    test.skip(missing.length > 0, `Waiting for bridge contract: ${missing.join(', ')}`);
  }
}

/** The Command tool is opt-in; main rejects terminal requests until this is on. */
async function enableDeveloperTools(page: Page): Promise<void> {
  await page.evaluate(() => window.sia.settings.setDeveloperTools(true));
}

async function launchParityFixture(
  feature: ParityFeature,
  environment: Readonly<Record<string, string>> = {},
) {
  return await launchIsolatedSia({
    prefix: `sia-parity-${feature}-`,
    environment: { ...fixtureEnvironment(feature), ...environment },
    ...(feature === 'attachments' ? { attachmentNames: ['parity-note.txt'] } : {}),
  });
}

function fixtureEnvironment(feature: ParityFeature): Record<string, string> {
  if (feature === 'interruptedTurnRecovery') return { SIA_TEST_FAKE_TURN_DELAY_MS: '10000' };
  if (feature === 'backgroundActivity') return { SIA_TEST_FAKE_TURN_DELAY_MS: '8000' };
  if (feature === 'worktreeParallelism') return { SIA_TEST_FAKE_TURN_DELAY_MS: '15000' };
  return {};
}

async function discoverBridgePaths(page: Page, paths: readonly string[]): Promise<string[]> {
  return await page.evaluate((candidates) => {
    const root: unknown = window.sia;
    return candidates.filter((candidate) => {
      let value = root;
      for (const segment of candidate.split('.')) {
        if (typeof value !== 'object' || value === null || !(segment in value)) return false;
        value = (value as Record<string, unknown>)[segment];
      }
      return typeof value === 'function';
    });
  }, paths);
}

async function discoverDeclaredTestIds(directory: string): Promise<string[]> {
  const found = new Set<string>();
  for (const path of await rendererSourceFiles(directory)) {
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/data-testid=["']([^"']+)["']/g)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found].sort();
}

async function rendererSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await rendererSourceFiles(path)));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

async function initializeGitWorkspace(workspace: string): Promise<void> {
  await git(workspace, ['init', '-b', 'main']);
  await writeFile(join(workspace, 'notes.txt'), 'baseline\n', 'utf8');
  await git(workspace, ['add', 'notes.txt']);
  await git(workspace, [
    '-c',
    'user.name=Sia Parity',
    '-c',
    'user.email=sia-parity@example.invalid',
    'commit',
    '-m',
    'parity baseline',
  ]);
}

async function git(cwd: string, argumentsValue: readonly string[]) {
  return await execFileAsync('git', [...argumentsValue], { cwd, encoding: 'utf8' });
}
