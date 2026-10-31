import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

test('a result preview freezes covered animation and releases it on close', async ({
  page,
}) => {
  const fixture = fileURLToPath(new URL('./fixtures/attachment-preview.ts', import.meta.url));
  await page.route('**/attachment-preview.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body><div id="root"></div><script type="module" src="/@fs${fixture}"></script></body></html>`,
    }),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/attachment-preview.html');
  const runningCovered = () =>
    page.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          return (
            target instanceof Element &&
            target.closest('#root') &&
            animation.playState === 'running'
          );
        }).length,
    );
  await expect.poll(runningCovered).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Preview result: review.md' }).click();
  await expect(page.getByRole('heading', { name: 'Review brief', exact: true })).toBeVisible();
  await expect.poll(runningCovered).toBe(0);
  await page.getByRole('button', { name: 'Close preview' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(runningCovered).toBeGreaterThan(0);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Ready to continue');
});
