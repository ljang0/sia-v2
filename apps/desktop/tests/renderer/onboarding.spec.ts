import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: setup teaches Fn with real states, visible controls, and reduced motion`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = fileURLToPath(new URL('./fixtures/onboarding-preview.ts', import.meta.url));
    await page.route('**/onboarding-preview.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<html><head><title>Sia setup preview</title></head><body><div id="root"></div><script type="module" src="/@fs${fixture}"></script></body></html>`,
      }),
    );
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1000, height: 780 });
    await page.goto('/onboarding-preview.html');
    await expect(page.locator('[data-sia-startup]')).toHaveCount(0);
    const finish = page.getByRole('button', { name: 'Start using Sia' });
    await expect(page.getByRole('heading', { name: 'A little less typing.' })).toBeFocused();
    await expect(finish).toBeDisabled();
    const practice = page.locator('[data-phase="idle"]');
    await expect(practice).toBeVisible();
    await page.screenshot({ path: info.outputPath(`fn-ready-${colorScheme}.png`) });
    await page.evaluate(() => window.onboardingPreview.voice('listening'));
    await expect(page.getByRole('status')).toContainText('Release Fn');
    const wave = page.locator('[data-phase="listening"] [class*="keyWave"]').first();
    await expect(wave).toHaveCSS('animation-play-state', 'running');
    const first = await wave.evaluate((el) => getComputedStyle(el).transform);
    await expect
      .poll(() => wave.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe(first);
    await expect
      .poll(() =>
        page
          .locator('[class*="keyWater"]')
          .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42),
      )
      .toBeLessThan(45);
    await page.screenshot({ path: info.outputPath(`fn-listening-${colorScheme}.png`) });
    await page.evaluate(() => window.onboardingPreview.voice('transcribing'));
    await expect(finish).toBeDisabled();
    await page.evaluate(() => window.onboardingPreview.voice('idle', 'Help me plan my day.'));
    await expect(finish).toBeEnabled();
    await expect(page.getByRole('status')).toContainText('You’re ready');
    await page.screenshot({ path: info.outputPath(`fn-complete-${colorScheme}.png`) });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 900, height: 680 });
    await page.evaluate(() => window.onboardingPreview.voice('listening'));
    await expect(wave).toHaveCSS('animation-name', 'none');
    await expect(page.getByRole('button', { name: 'Skip voice practice' })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`fn-compact-${colorScheme}.png`) });
    await page.evaluate(() => window.onboardingPreview.step('welcome'));
    await expect(page.getByRole('button', { name: 'Set up Sia' })).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`welcome-${colorScheme}.png`) });
    await page.evaluate(() => window.onboardingPreview.step('verify'));
    // Use my Mac lists every permission it asks for, not a collapsed subset.
    await expect(page.getByRole('list', { name: 'Needed permissions' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
