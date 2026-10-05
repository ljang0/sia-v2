import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createAgentAndThread, launchIsolatedSia } from '../support/electron-harness';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
}

async function openSettingsSection(page: Page, label: string) {
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  if (!(await nav.getByRole('button', { name: label, exact: true }).isVisible())) {
    await nav.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: label, exact: true }).click();
  } else {
    await nav.getByRole('button', { name: label, exact: true }).click();
  }
}

async function expectSettingsFit(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  for (const button of await nav.getByRole('button').all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
  }
  const content = page.locator('[class*="settingsContent"]');
  expect(
    await content.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
}

test('settings and personal-library surfaces remain readable at supported window sizes', async ({}, info) => {
  test.setTimeout(90_000);
  const sia = await launchIsolatedSia({ prefix: 'sia-ui-surfaces-' });
  let page = sia.page;
  try {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 960, height: 640 });
    await expect(page.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();
    await capture(page, info, 'setup-compact');
    const setup = await page
      .getByRole('button', { name: 'Set up Sia', exact: true })
      .boundingBox();
    const option = await page
      .getByRole('checkbox', { name: /Prepare everyday apps now/ })
      .locator('..')
      .boundingBox();
    expect(setup!.y - (option!.y + option!.height)).toBeGreaterThanOrEqual(16);
    await expect(
      page.getByRole('checkbox', { name: /Prepare everyday apps now/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Set up Sia', exact: true }),
    ).toBeInViewport();
    await page.getByText('Customize setup', { exact: true }).click();
    await page.getByLabel('Agent name').scrollIntoViewIfNeeded();
    await capture(page, info, 'setup-customize');
    await page.getByRole('radio', { name: /Connected apps only/ }).check();
    await page.getByRole('checkbox', { name: /Ask before each action/ }).check();
    page = await sia.completeSetup();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await capture(page, info, 'workspace-empty');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const more = page.getByRole('button', { name: 'More settings' });
    await expect(page.getByRole('button', { name: 'About', exact: true })).toHaveCount(0);
    await more.focus();
    await more.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'About', exact: true })).toBeVisible();
    // At the minimum window the tabs stay on one row; Scotty and Phone remote wait in More.
    await expect(
      page.getByRole('menuitem', { name: 'Phone remote', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Scotty', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();

    for (const viewport of [
      { width: 1220, height: 780, scheme: 'light' as const },
      { width: 960, height: 640, scheme: 'dark' as const },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: viewport.scheme });
      for (const label of [
        'Assistant',
        'AI',
        'Connections',
        'Computer',
        'Voice',
        'Scotty',
        'Phone remote',
        'Privacy',
        'About',
      ]) {
        await openSettingsSection(page, label);
        const content = page.locator('[class*="settingsContent"]');
        await content.evaluate((element) => {
          element.scrollTop = 0;
        });
        // Async library and helper status are resolved before recording their layout.
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
        if (label === 'Assistant')
          await expect(
            page.getByRole('combobox', { name: 'Agent', exact: true }),
          ).toBeEnabled();
        if (label === 'Scotty')
          await expect(
            page.getByRole('button', { name: 'Bring Scotty to my desktop' }),
          ).toBeInViewport({ ratio: 1 });
        if (label === 'Phone remote')
          await expect(page.getByRole('button', { name: 'Enable phone remote' })).toBeVisible();
        await expectSettingsFit(page);
        if (label === 'Computer') {
          const spacing = await page.locator('[class*="accessRow"]').evaluateAll((rows) =>
            rows.every((row) => {
              const bounds = row.getBoundingClientRect();
              return [...row.children].every((child) => {
                const childBounds = child.getBoundingClientRect();
                return (
                  childBounds.top - bounds.top >= 16 && bounds.bottom - childBounds.bottom >= 16
                );
              });
            }),
          );
          expect(spacing).toBe(true);
        }
        const name = `${viewport.width}-${label.toLowerCase().replaceAll(' ', '-')}`;
        await capture(page, info, name);
        await content.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await capture(page, info, `${name}-bottom`);
      }
    }
    await openSettingsSection(page, 'Assistant');
    for (const section of ['Memory', 'Workflows', 'Skills', 'Suggestions']) {
      await page
        .getByRole('navigation', { name: 'Assistant sections' })
        .getByRole('button', { name: new RegExp(`^${section}`) })
        .click();
      await page.locator('[class*="settingsContent"]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await capture(page, info, `assistant-${section.toLowerCase()}`);
    }
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    await page.getByRole('button', { name: 'Add memory', exact: true }).click();
    await page.getByLabel('What should Sia remember?').scrollIntoViewIfNeeded();
    await capture(page, info, 'memory-editor');
    // At 125% zoom, the settings pane is considerably narrower than the window.
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1.25);
    });
    for (const label of ['Computer', 'Phone remote', 'Privacy', 'About']) {
      await openSettingsSection(page, label);
      await expectSettingsFit(page);
      await capture(page, info, `zoom-${label.toLowerCase().replaceAll(' ', '-')}`);
    }
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(2);
    });
    await openSettingsSection(page, 'Phone remote');
    await capture(page, info, 'phone-200-percent');
    const settingsBounds = await page.locator('[class*="settingsContent"]').boundingBox();
    expect(settingsBounds!.height).toBeGreaterThanOrEqual(120);
    const enableRemote = page.getByRole('button', { name: 'Enable phone remote' });
    await enableRemote.scrollIntoViewIfNeeded();
    await expect(enableRemote).toBeInViewport({ ratio: 1 });
    await capture(page, info, 'phone-200-percent-action');
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('conversation tools, access panels and dialogs fit the minimum desktop window', async ({}, info) => {
  const sia = await launchIsolatedSia({ prefix: 'sia-ui-panels-' });
  const page = sia.page;
  try {
    await page.setViewportSize({ width: 960, height: 640 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    const { workspace } = await createAgentAndThread(page, { name: 'Personal assistant' });
    execFileSync('git', ['init', '-b', 'main'], { cwd: workspace });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=UI fixture',
        '-c',
        'user.email=ui@example.test',
        'commit',
        '--allow-empty',
        '-m',
        'UI fixture',
      ],
      { cwd: workspace },
    );
    const tools = page.getByRole('button', { name: 'Tools', exact: true });
    for (const label of ['Goal', 'Changes', 'Schedules']) {
      await tools.click();
      const menu = page.getByRole('menu', { name: 'Tools', exact: true });
      await expect(menu).toBeInViewport({ ratio: 1 });
      await menu.getByRole('menuitem', { name: label, exact: true }).click();
      const panel = page.getByRole('complementary', { name: 'Thread tool' });
      await expect(panel).toBeInViewport({ ratio: 1 });
      if (label === 'Schedules')
        await panel.getByRole('button', { name: 'New schedule' }).click();
      await capture(page, info, `tool-${label.toLowerCase()}`);
      expect(
        await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      await page.getByRole('button', { name: 'Close thread tool' }).click();
      await expect(tools).toBeFocused();
    }
    // Command runs unreviewed shell commands, so it appears only after Developer tools is on.
    await tools.click();
    await expect(page.getByRole('menu', { name: 'Tools', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Command', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.sia.settings.setDeveloperTools(true));
    await tools.click();
    await page.getByRole('menuitem', { name: 'Command', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Terminal' })).toBeInViewport({ ratio: 1 });
    await capture(page, info, 'terminal');
    await page.getByRole('button', { name: 'Close terminal' }).click();
    await expect(tools).toBeFocused();
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    const access = page.getByRole('dialog', { name: 'Access', exact: true });
    for (const label of ['Browser', 'Computer', 'Data']) {
      await access.getByRole('tab', { name: label, exact: true }).click();
      await expect(access).toBeInViewport({ ratio: 1 });
      await capture(page, info, `access-${label.toLowerCase()}`);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Send feedback', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await openSettingsSection(page, 'About');
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Send feedback' })).toBeInViewport({
      ratio: 1,
    });
    await capture(page, info, 'feedback');
    const feedbackMessage = await page
      .getByRole('textbox', { name: 'What should we improve?' })
      .boundingBox();
    const feedbackOptions = await page
      .getByRole('checkbox', { name: /Include basic diagnostics/ })
      .locator('..')
      .boundingBox();
    expect(
      feedbackOptions!.y - (feedbackMessage!.y + feedbackMessage!.height),
    ).toBeGreaterThanOrEqual(16);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.getByTestId('activity-center-toggle').click();
    await capture(page, info, 'activity-empty');
    await page.getByRole('button', { name: 'Close activity' }).click();
    await page.keyboard.press('Meta+K');
    await capture(page, info, 'quick-switcher');
    await page.keyboard.press('Escape');
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('cloud, admin and account settings fit without hiding categories', async ({}, info) => {
  const environment = {
    SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
    SIA_COGNITO_REGION: 'us-east-1',
    SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
    // Synthetic test identity, accepted only by the existing development harness.
    SIA_DEV_ID_TOKEN: `fixture.${Buffer.from(JSON.stringify({ 'cognito:groups': ['Admins'] })).toString('base64url')}.fixture`,
  };
  let sia = await launchIsolatedSia({ prefix: 'sia-ui-admin-', environment });
  try {
    // Enable the normally hidden archive only in this disposable plaintext fixture.
    const testRoot = sia.testRoot;
    const databasePath = join(sia.userData, 'sia.sqlite');
    await sia.close({ removeTestRoot: false });
    const database = new DatabaseSync(databasePath);
    try {
      const row = database
        .prepare("SELECT payload FROM records WHERE scope = 'desktop' AND id = 'state'")
        .get() as { payload: Uint8Array };
      const state = JSON.parse(Buffer.from(row.payload).toString('utf8'));
      state.cloudFeatures.researchArchive = true;
      database
        .prepare("UPDATE records SET payload = ? WHERE scope = 'desktop' AND id = 'state'")
        .run(Buffer.from(JSON.stringify(state)));
    } finally {
      database.close();
    }
    sia = await launchIsolatedSia({ testRoot, environment });
    const page = sia.page;
    await page.setViewportSize({ width: 960, height: 640 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Exit setup', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    for (const label of ['Connections', 'Phone remote', 'Release review', 'Research archive']) {
      await openSettingsSection(page, label);
      await expectSettingsFit(page);
      await capture(page, info, `admin-${label.toLowerCase().replaceAll(' ', '-')}`);
      await page.locator('[class*="settingsContent"]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await capture(page, info, `admin-${label.toLowerCase().replaceAll(' ', '-')}-bottom`);
    }
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('a saved agent closes its dialog even when animations are not advancing', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-agent-dialog-close-' });

  try {
    const page = sia.page;
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page
      .getByRole('complementary', { name: 'Agent navigation' })
      .getByRole('button', { name: 'Create agent' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'New agent' });
    await dialog.getByLabel('Name', { exact: true }).fill('Research partner');
    await dialog.getByLabel('Instructions').fill('Help organize research.');
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    // A macOS window that is not drawing (occluded, busy CI runner) stops CSS animations, so
    // a closing dialog that waits for `animationend` would stay mounted over the conversation.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.0001 });
    await dialog.getByRole('button', { name: 'Create agent' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 });
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
