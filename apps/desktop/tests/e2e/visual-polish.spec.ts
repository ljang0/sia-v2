import { expect, test } from '@playwright/test';

import { createAgentAndThread, launchIsolatedSia } from '../support/electron-harness';

test.describe.configure({ timeout: 60_000 });

test('core surfaces retain the visual-system and motion contract', async ({}, testInfo) => {
  const sia = await launchIsolatedSia({ prefix: 'sia-visual-polish-' });

  try {
    await sia.page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await sia.page.setViewportSize({ width: 1220, height: 780 });
    const { threadId } = await createAgentAndThread(sia.page, {
      name: 'Research partner',
      instructions: 'Help organize research without external access.',
    });

    await sia.page
      .getByRole('textbox', { name: 'Message' })
      .fill('Summarize the next three steps for the alpha review.');
    await sia.page.getByRole('button', { name: 'Send message' }).click();
    await expect
      .poll(async () => {
        const snapshot = await sia.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.threads.find((thread) => thread.id === threadId)?.status;
      })
      .toBe('idle');
    await sia.page.waitForTimeout(300);

    const visualSystem = await sia.page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const controls = [
        ...document.querySelectorAll<HTMLElement>('button, input, textarea'),
      ].filter((element) => element.offsetParent !== null);
      const overflowing = [
        document.body,
        document.getElementById('root'),
        ...document.body.querySelectorAll<HTMLElement>('main, aside, section'),
      ]
        .filter((element): element is HTMLElement => Boolean(element))
        .filter((element) => element.clientWidth > 0)
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.getAttribute('aria-label') ?? element.className)
        .filter((value) => typeof value === 'string');
      return {
        displayFontLoaded: document.fonts.check("700 28px 'Bricolage Grotesque'"),
        colors: {
          canvas: root.getPropertyValue('--bg-canvas').trim(),
          shell: root.getPropertyValue('--shell-bg').trim(),
          accent: root.getPropertyValue('--bg-accent').trim(),
        },
        transitionedControls: controls.filter(
          (element) => getComputedStyle(element).transitionDuration !== '0s',
        ).length,
        visibleControls: controls.length,
        overflowing,
      };
    });

    expect(visualSystem.displayFontLoaded).toBe(true);
    expect(visualSystem.colors).toEqual({
      canvas: '#fafaf8',
      shell: '#f1f1ee',
      accent: '#33453e',
    });
    expect(visualSystem.transitionedControls).toBeGreaterThan(
      visualSystem.visibleControls * 0.7,
    );
    expect(visualSystem.overflowing).toEqual([]);

    const settingsButton = sia.page.getByRole('button', { name: 'Settings' });
    await settingsButton.focus();
    expect(
      await settingsButton.evaluate((element) => getComputedStyle(element).outlineWidth),
    ).not.toBe('0px');

    await sia.page.screenshot({
      path: testInfo.outputPath('workspace-light.png'),
      animations: 'disabled',
    });

    await settingsButton.click();
    await expect(sia.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await sia.page.waitForTimeout(300);
    await sia.page.screenshot({
      path: testInfo.outputPath('providers-light.png'),
      animations: 'disabled',
    });

    await sia.page.getByRole('button', { name: 'Apps' }).click();
    await sia.page.waitForTimeout(300);
    await sia.page.screenshot({
      path: testInfo.outputPath('apps-light.png'),
      animations: 'disabled',
    });

    await sia.page.getByRole('button', { name: 'Close settings' }).click();
    await sia.page.getByRole('button', { name: 'Create agent' }).click();
    await expect(sia.page.getByRole('dialog', { name: 'New agent' })).toBeVisible();
    await sia.page.screenshot({
      path: testInfo.outputPath('agent-dialog-light.png'),
      animations: 'disabled',
    });
    await sia.page
      .getByRole('dialog', { name: 'New agent' })
      .getByRole('button', { name: 'Close' })
      .click();

    await sia.page.getByTestId('activity-center-toggle').click();
    await expect(sia.page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    await sia.page.waitForTimeout(300);
    await sia.page.screenshot({
      path: testInfo.outputPath('activity-light.png'),
      animations: 'disabled',
    });
    await sia.page.getByRole('button', { name: 'Close activity' }).click();

    await sia.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
    await sia.page.setViewportSize({ width: 960, height: 640 });
    await sia.page.waitForTimeout(300);
    await sia.page.screenshot({
      path: testInfo.outputPath('workspace-dark-compact.png'),
      animations: 'disabled',
    });
    expect(
      await sia.page.evaluate(() =>
        [
          document.body,
          document.getElementById('root'),
          ...document.body.querySelectorAll<HTMLElement>('main, aside, section'),
        ]
          .filter((element): element is HTMLElement => Boolean(element))
          .filter((element) => element.clientWidth > 0)
          .every((element) => element.scrollWidth <= element.clientWidth + 1),
      ),
    ).toBe(true);

    await sia.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await sia.page.getByRole('button', { name: 'Settings' }).click();
    expect(
      await sia.page
        .locator('main')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('first-run account and local-choice surfaces stay composed', async ({}, testInfo) => {
  const sia = await launchIsolatedSia({
    prefix: 'sia-visual-onboarding-',
    environment: {
      SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
      SIA_COGNITO_REGION: 'us-east-1',
      SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
    },
  });

  try {
    await sia.page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    await sia.page.setViewportSize({ width: 960, height: 640 });
    const dialog = sia.page.getByRole('dialog', { name: 'Sign in to Sia' });
    await expect(dialog).toBeVisible();
    await expect(sia.page.getByRole('textbox', { name: 'Invited email' })).toBeFocused();
    expect(
      await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= window.innerWidth &&
          bounds.bottom <= window.innerHeight
        );
      }),
    ).toBe(true);
    await sia.page.screenshot({
      path: testInfo.outputPath('sign-in-light-compact.png'),
      animations: 'disabled',
    });

    await sia.page.getByRole('button', { name: 'Continue locally' }).click();
    await expect(sia.page.getByRole('heading', { name: 'Choose an agent' })).toBeVisible();
    await sia.page.waitForTimeout(300);
    await sia.page.screenshot({
      path: testInfo.outputPath('local-choice-light-compact.png'),
      animations: 'disabled',
    });
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
