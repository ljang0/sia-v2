import { expect, test, type Page } from '@playwright/test';

import { createAgentAndThread, launchIsolatedSia } from '../support/electron-harness';

test.describe.configure({ timeout: 60_000 });

// GPU/font rasterization differs slightly between local Macs and GitHub's hosted
// macOS images. Keep the allowance proportional (and below one percent) so the
// gate still catches layout, spacing, and palette regressions at both viewports.
const stableScreenshot = { animations: 'disabled' as const, maxDiffPixelRatio: 0.006 };

async function stabilizeTranscriptTimes(page: Page) {
  await page.locator('time').evaluateAll((elements) => {
    elements.forEach((element) => {
      element.textContent = '9:41 AM';
    });
  });
}

test('core surfaces retain the visual-system and motion contract', async () => {
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
    // The bridge can report the completed turn before React has committed the
    // corresponding event list. Wait for a released, event-derived control so
    // every visual baseline captures the same post-turn UI.
    await expect(sia.page.getByRole('button', { name: 'Thread outline' })).toBeVisible();
    await expect(sia.page.locator('[data-sia-presence]')).toHaveAttribute('data-state', 'idle');

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
      canvas: '#f4f6f2',
      shell: '#173a34',
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

    await stabilizeTranscriptTimes(sia.page);

    await expect(sia.page).toHaveScreenshot('workspace-light.png', stableScreenshot);

    await sia.page.keyboard.press('Meta+K');
    const switcher = sia.page.getByRole('dialog', { name: 'Move through Sia' });
    await expect(switcher).toBeVisible();
    const switcherSearch = switcher.getByRole('combobox', {
      name: 'Search conversations and actions',
    });
    await expect(switcherSearch).toBeFocused();
    await stabilizeTranscriptTimes(sia.page);
    await expect(sia.page).toHaveScreenshot('quick-switcher-light.png', stableScreenshot);
    await switcherSearch.fill('settings');
    await switcherSearch.press('Enter');

    await expect(sia.page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await sia.page.waitForTimeout(300);
    await expect(sia.page).toHaveScreenshot('providers-light.png', stableScreenshot);

    await sia.page.getByRole('button', { name: 'More settings' }).click();
    await sia.page.getByRole('menuitem', { name: 'Connections', exact: true }).click();
    await sia.page.waitForTimeout(300);
    await expect(sia.page).toHaveScreenshot('apps-light.png', stableScreenshot);

    await sia.page.getByRole('button', { name: 'Close settings' }).click();
    await sia.page.getByRole('button', { name: 'Create agent' }).click();
    await expect(sia.page.getByRole('dialog', { name: 'New agent' })).toBeVisible();
    await expect(sia.page).toHaveScreenshot('agent-dialog-light.png', stableScreenshot);
    await sia.page
      .getByRole('dialog', { name: 'New agent' })
      .getByRole('button', { name: 'Close' })
      .click();

    await sia.page.getByTestId('activity-center-toggle').click();
    await expect(sia.page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    await sia.page.waitForTimeout(300);
    await expect(sia.page).toHaveScreenshot('activity-light.png', stableScreenshot);
    await sia.page.getByRole('button', { name: 'Close activity' }).click();

    await sia.page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
    await sia.page.setViewportSize({ width: 960, height: 640 });
    await sia.page.waitForTimeout(300);
    await stabilizeTranscriptTimes(sia.page);
    await expect(sia.page).toHaveScreenshot('workspace-dark-compact.png', stableScreenshot);
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

test('first-run account surface stays composed', async () => {
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
    await expect(sia.page.getByRole('textbox', { name: 'Email' })).toBeFocused();
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
    await expect(sia.page).toHaveScreenshot('sign-in-light-compact.png', stableScreenshot);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
