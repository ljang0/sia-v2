import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assistantReply =
  'I am ready. This development turn used the deterministic local runtime, so no provider account or connected-app data was accessed.';

test('saved agents, threads, transcripts, and drafts survive a full app relaunch', async () => {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-electron-persistence-'));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);

  let electronApp: ElectronApplication | undefined;
  try {
    electronApp = await launchSia(userData, workspace);
    const firstPage = await readyPage(electronApp);
    const firstErrors = collectRendererErrors(firstPage);
    await expect(firstPage.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();

    await firstPage
      .getByRole('complementary', { name: 'Agent navigation' })
      .getByRole('button', { name: 'Create agent' })
      .click();
    await firstPage
      .getByRole('dialog', { name: 'New agent' })
      .getByLabel('Name', { exact: true })
      .fill('Persistent helper');
    await firstPage
      .getByLabel('Instructions')
      .fill('Keep the saved thread available after Sia restarts.');
    await firstPage
      .getByRole('dialog', { name: 'New agent' })
      .getByRole('button', {
        name: 'Create agent',
      })
      .click();
    const prompt = 'Remember this completed task after the app restarts.';
    await firstPage.getByRole('textbox', { name: 'Message' }).fill(prompt);
    await firstPage.getByRole('textbox', { name: 'Message' }).press('Enter');
    await expect(firstPage.getByText(assistantReply, { exact: true })).toBeVisible();
    const draft = 'Continue by turning the result into a short checklist.';
    await firstPage.getByRole('textbox', { name: 'Message' }).fill(draft);
    await expect(firstPage.getByText('Draft', { exact: true })).toBeVisible();
    expect(firstErrors).toEqual([]);

    await electronApp.close();
    electronApp = undefined;

    electronApp = await launchSia(userData, workspace);
    const restoredPage = await readyPage(electronApp);
    const restoredErrors = collectRendererErrors(restoredPage);

    await expect(
      restoredPage
        .getByRole('complementary', { name: 'Agent navigation' })
        .getByRole('button', { name: 'Agent actions for Persistent helper', exact: true }),
    ).toBeVisible();
    // The title repeats a short request in the header and sidebar; check the transcript itself.
    await expect(
      restoredPage
        .getByLabel('Conversation', { exact: true })
        .getByText(prompt, { exact: true }),
    ).toBeVisible();
    await expect(restoredPage.getByText(assistantReply, { exact: true })).toBeVisible();
    await expect(restoredPage.getByRole('textbox', { name: 'Message' })).toHaveValue(draft);
    await expect(restoredPage.getByText('Draft', { exact: true })).toBeVisible();
    expect(restoredErrors).toEqual([]);
  } finally {
    await electronApp?.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});

test('first-run actions and the Access surface remain usable by keyboard at 200% zoom', async () => {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-electron-accessibility-'));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);

  const electronApp = await launchSia(userData, workspace);
  try {
    const page = await readyPage(electronApp);
    const rendererErrors = collectRendererErrors(page);
    await expect(page.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });

    await expect(page.getByRole('button', { name: 'Set up Sia', exact: true })).toBeVisible();

    const accessButton = page.getByRole('button', { name: 'Access' });
    await accessButton.click();
    const accessDialog = page.getByRole('dialog', { name: 'Access' });
    await expect(accessDialog).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
      )
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(accessDialog).toBeHidden();
    await expect(accessButton).toBeFocused();

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.documentElement;
          return Math.max(root.scrollWidth, document.body.scrollWidth) <= root.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Computer' })).toBeVisible();
    // At 200% the tab row is narrow, so Voice waits in More with the other extras.
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Voice', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Voice' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable voice' })).toBeVisible();
    await expect(page.getByLabel('API key')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.documentElement;
          return Math.max(root.scrollWidth, document.body.scrollWidth) <= root.clientWidth + 1;
        }),
      )
      .toBe(true);
    expect(rendererErrors).toEqual([]);
  } finally {
    await electronApp.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});

test('theme and text size apply to the window at once and at the next launch', async () => {
  const testRoot = await mkdtemp(join(tmpdir(), 'sia-electron-appearance-'));
  const userData = join(testRoot, 'user-data');
  const workspace = join(testRoot, 'workspace');
  await Promise.all([mkdir(userData), mkdir(workspace)]);
  let electronApp: ElectronApplication | undefined;
  const themeSource = () => electronApp!.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
  try {
    electronApp = await launchSia(userData, workspace);
    let page = await readyPage(electronApp);
    // Playwright emulates a light scheme by default; let the window follow nativeTheme.
    await page.emulateMedia({ colorScheme: null });
    expect(await themeSource()).toBe('system');
    await page.evaluate(async () => {
      await window.sia.settings.setTheme('dark');
      await window.sia.settings.setTextSize('larger');
    });
    await expect.poll(themeSource).toBe('dark');
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.getBackgroundColor(),
      ),
    ).toBe('#0D1915');
    await expect
      .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
      .toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
    // ⌘− is View → Make Text Smaller: it steps the saved setting, not page zoom.
    await electronApp.evaluate(({ Menu }) => {
      const view = Menu.getApplicationMenu()!.items.find((item) => item.label === 'View')!;
      view.submenu!.items.find((item) => item.label === 'Make Text Smaller')!.click();
    });
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor(),
      ),
    ).toBe(1);
    await electronApp.close();
    electronApp = undefined;

    electronApp = await launchSia(userData, workspace);
    // launch() can resolve before app.whenReady() applies the saved theme. Wait for the
    // window whose initial background uses that theme, not merely the Electron process.
    await electronApp.firstWindow();
    expect(await themeSource()).toBe('dark');
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.getBackgroundColor(),
      ),
    ).toBe('#0D1915');
    page = await readyPage(electronApp);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
    await page.evaluate(() => window.sia.settings.setTheme('system'));
    await expect.poll(themeSource).toBe('system');
  } finally {
    await electronApp?.close();
    await rm(testRoot, { recursive: true, force: true });
  }
});

async function launchSia(userData: string, workspace: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [desktopRoot],
    env: {
      ...process.env,
      SIA_FAKE_SERVICES: '1',
      SIA_TEST_PLAINTEXT_STORAGE: '1',
      SIA_TEST_USER_DATA: userData,
      SIA_TEST_WORKSPACE: workspace,
    },
  });
}

async function readyPage(electronApp: ElectronApplication): Promise<Page> {
  const page = await electronApp.firstWindow();
  await expect.poll(() => page.evaluate(() => Boolean(window.sia))).toBe(true);
  return page;
}

function collectRendererErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
