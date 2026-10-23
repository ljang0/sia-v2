import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: current activity stays compact and technical details remain available`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const fixture = fileURLToPath(
      new URL('./fixtures/task-progress-preview.ts', import.meta.url),
    );
    await page.route('**/task-progress-preview.html', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<html><head><title>Sia task preview</title></head><body><div id="root"></div><script type="module" src="/@fs${fixture}"></script></body></html>`,
      }),
    );
    await page.emulateMedia({ colorScheme });
    await page.goto('/task-progress-preview.html');
    const history = page.getByRole('button', { name: /Activity · 6 steps/ });
    await expect(history).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Reading the page', { exact: true })).toBeVisible();
    await expect(page.getByText('Ran a step on your Mac', { exact: true })).toHaveCount(0);
    await expect(
      page.getByText('fixture-command --private-detail', { exact: true }),
    ).toHaveCount(0);
    await history.click();
    await page
      .getByRole('button', { name: /Ran a step on your Mac/ })
      .first()
      .click();
    await expect(
      page.getByText('fixture-command --private-detail', { exact: true }),
    ).toBeVisible();
    await history.click();
    await page.evaluate(() => window.taskProgressPreview.advance());
    await expect(page.getByRole('button', { name: /Activity · 7 steps/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(page.getByText('Checking the app window', { exact: true })).toBeVisible();
    await expect(page.getByText('Reading the page', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`task-progress-${colorScheme}.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.taskProgressPreview.finish());
    await expect(page.getByTestId('turn-running')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Worked.*7 steps/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(errors).toEqual([]);
  });
}
