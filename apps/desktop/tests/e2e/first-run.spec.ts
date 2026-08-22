import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('first run creates an agent, starts a thread, and completes a deterministic turn', async () => {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-electron-e2e-'));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);

  const electronApp = await electron.launch({
    args: [desktopRoot],
    env: {
      ...process.env,
      SIA_FAKE_SERVICES: '1',
      SIA_TEST_PLAINTEXT_STORAGE: '1',
      SIA_TEST_USER_DATA: userData,
      SIA_TEST_WORKSPACE: workspace,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    const rendererErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(message.text());
    });
    page.on('pageerror', (error) => rendererErrors.push(error.message));

    await expect.poll(() => page.evaluate(() => Boolean(window.sia))).toBe(true);
    await expect(page.getByRole('heading', { name: 'Choose an agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create agent' })).toBeVisible();

    await page.getByRole('button', { name: 'Create agent' }).click();
    await expect(page.getByRole('dialog', { name: 'New agent' })).toBeVisible();
    await page.getByLabel('Name').fill('Local helper');
    await page
      .getByLabel('Instructions')
      .fill('Work carefully inside the selected workspace and explain completed actions.');
    await page.getByRole('button', { name: 'Choose' }).click();
    await expect(page.getByRole('textbox', { name: 'Workspace', exact: true })).toHaveValue(
      workspace,
    );
    await page.getByRole('button', { name: 'Create agent' }).click();

    const researchDialog = page.getByRole('alertdialog', {
      name: 'Join the Sia research release?',
    });
    await expect(researchDialog).toBeVisible();
    await expect(researchDialog).toContainText('captures stay encrypted on this Mac');
    await researchDialog.getByRole('button', { name: 'Use without sharing' }).click();

    await expect(page.getByRole('heading', { name: 'Start with Local helper' })).toBeVisible();
    await page.getByRole('button', { name: 'New thread' }).click();
    await expect(page.getByRole('heading', { name: 'What should we work on?' })).toBeVisible();

    const prompt = 'Summarize this workspace without changing any files.';
    await page.getByRole('textbox', { name: 'Message' }).fill(prompt);
    await page.getByRole('textbox', { name: 'Message' }).press('Enter');

    await expect(
      page.getByRole('article').filter({ hasText: 'You' }).getByText(prompt, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'I am ready. This development turn used the deterministic local runtime, so no provider account or connected-app data was accessed.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(rendererErrors).toEqual([]);
  } finally {
    await electronApp.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});
