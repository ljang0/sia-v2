import { test } from '@playwright/test';
const out = process.env.SHOT_DIR!;
const tag = process.env.SHOT_TAG ?? 'before';
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test('density shots', async ({ page }) => {
  await page.goto('/#demo');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${tag}-conversation.png` });
  await page.getByRole('button', { name: /New conversation/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${tag}-home.png` });
  await page.getByRole('button', { name: 'Settings' }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${tag}-settings.png` });
  await page.goto('/?setup=access#demo');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${tag}-setup.png` });
});
