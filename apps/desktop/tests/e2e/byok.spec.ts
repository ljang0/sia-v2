import { expect, test } from '@playwright/test';
import { collectRendererErrors, launchIsolatedSia } from '../support/electron-harness';

const KEY = 'sk-e2e-0123456789abcdefghijkl';

test('your own API key is saved from Settings, never shown again, and can be removed', async ({}, info) => {
  test.setTimeout(90_000);
  const sia = await launchIsolatedSia({ prefix: 'sia-byok-' });
  try {
    const page = await sia.completeSetup();
    const errors = collectRendererErrors(page);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'AI access' })).toBeVisible();
    await page.getByRole('button', { name: 'Add key' }).click();
    await page.getByRole('textbox', { name: 'Model' }).fill('gpt-5');
    await page.getByRole('textbox', { name: 'API key' }).fill(KEY);
    await page.screenshot({ path: info.outputPath('byok-form.png') });
    await page.getByRole('button', { name: 'Save key' }).click();
    await expect(
      page.getByText('Uses gpt-5 at api.openai.com.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'API key' })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('byok-saved.png') });
    expect(await page.content()).not.toContain(KEY);
    expect(
      await page.evaluate(async () => JSON.stringify(await window.sia.bootstrap())),
    ).not.toContain(KEY);

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('button', { name: 'Add key' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await sia.close();
  }
});
