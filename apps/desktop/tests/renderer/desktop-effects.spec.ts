import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: welcome, composer, and existing controls stay usable`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme });
    await page.goto('/#demo');
    await page.getByTitle('New thread', { exact: true }).first().click();
    const heading = page.getByRole('heading', { name: 'What would you like to do?' });
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    await expect(heading).toBeVisible();
    await expect(send).toBeDisabled();
    await expect(page.locator('.sia-aurora')).toHaveAttribute('data-renderer', 'waves');
    await expect
      .poll(() => heading.evaluate((el) => getComputedStyle(el).backgroundPosition))
      .not.toBe('0% 50%');

    // Focus must not move the content or remove the field behind it.
    const before = await field.boundingBox();
    await field.click();
    await expect(field).toBeFocused();
    expect(await field.boundingBox()).toEqual(before);
    await expect(page.locator('.aurora-waves')).toHaveCSS('opacity', '1');
    await field.fill('Find my assignments for this week');
    await expect(send).toBeEnabled();
    await expect(send.locator('.metal-surface')).toHaveAttribute('data-metal', 'ready');
    const end = await send.boundingBox();
    expect(end!.y + end!.height).toBeLessThan(900);
    await page.screenshot({ path: info.outputPath(`desktop-${colorScheme}.png`) });

    // The visual component must retain the real composer keyboard and cancellation paths.
    await field.press('Enter');
    const transcript = page
      .getByRole('main')
      .getByText('Find my assignments for this week', { exact: true });
    await expect(transcript).toHaveCount(1);
    await page.getByRole('button', { name: 'Stop current turn' }).click();
    await expect(send).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('compact desktop keeps content reachable with reduced motion and no graphics', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 900, height: 680 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#demo');
  await page.getByTitle('New thread', { exact: true }).first().click();
  const heading = page.getByRole('heading', { name: 'What would you like to do?' });
  await expect(page.locator('.sia-aurora')).toHaveAttribute('data-renderer', 'still');
  await expect(heading).toHaveCSS('animation-name', 'none');
  const field = page.getByRole('textbox', { name: 'Message', exact: true });
  await field.fill('A keyboard-only request');
  const send = page.getByRole('button', { name: 'Send message' });
  const bounds = await send.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(680);
  await page.screenshot({ path: info.outputPath('desktop-compact.png') });
  await field.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop current turn' })).toBeVisible();

  await page.emulateMedia({ forcedColors: 'active' });
  await page.getByTitle('New thread', { exact: true }).first().click();
  await expect(heading).not.toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
  await expect(heading).toHaveCSS('background-image', 'none');
});

test('launcher retains native form submission, dismiss, and agent selection', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 560, height: 208 });
  await page.addInitScript(() => {
    const probe = { sends: [] as unknown[], dismissals: 0 };
    Object.assign(window, {
      launcherProbe: probe,
      siaLauncher: {
        state: async () => ({
          agents: [
            { id: 'work', name: 'Work' },
            { id: 'personal', name: 'Personal' },
          ],
        }),
        onState: () => () => {},
        send: async (request: unknown) => {
          probe.sends.push(request);
        },
        dismiss: async () => {
          probe.dismissals++;
        },
      },
    });
  });
  await page.goto('/#launcher');
  const field = page.getByRole('textbox', { name: 'Your request' });
  await expect(field).toBeFocused();
  await page.getByRole('combobox', { name: 'Agent' }).selectOption('personal');
  await field.fill('Organize my downloads');
  const send = page.getByRole('button', { name: 'Send request' });
  await expect(send.locator('.metal-surface')).toHaveAttribute('data-metal', 'ready');
  expect(await page.locator('main').evaluate((el) => el.scrollHeight)).toBeLessThanOrEqual(208);
  await page.screenshot({ path: info.outputPath('launcher.png') });
  await send.click();
  await expect(field).toHaveValue('');
  await field.press('Escape');
  const probe = await page.evaluate(
    () =>
      (
        window as unknown as {
          launcherProbe: { sends: unknown[]; dismissals: number };
        }
      ).launcherProbe,
  );
  expect(probe.sends).toEqual([
    { kind: 'new', agentId: 'personal', text: 'Organize my downloads' },
  ]);
  expect(probe.dismissals).toBe(1);
});
