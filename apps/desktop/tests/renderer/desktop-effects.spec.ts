import { expect, test, type Page } from '@playwright/test';

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'More settings' }).click();
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
}

test('personal welcome opens existing work and finished replies retain their controls', async ({
  page,
}, info) => {
  await page.goto('/#demo');
  await page.getByTitle('New conversation', { exact: true }).first().click();
  await expect(
    page.getByText(/Good (morning|afternoon|evening) · Research partner is ready/),
  ).toBeVisible();
  const recents = page.getByRole('region', { name: 'Pick up where you left off' });
  await expect(recents).toBeVisible();
  await page.screenshot({ path: info.outputPath('personal-welcome.png') });
  await recents.getByRole('button', { name: /Weekly research update/ }).click();
  await expect(page.getByRole('button', { name: /Stop current turn/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Task result' })).toHaveCount(0);
  const nav = page.getByRole('complementary', { name: 'Agent navigation' });
  await nav.getByRole('button', { name: 'Triage today’s inbox', exact: true }).click();
  const result = page.getByRole('region', { name: 'Task result' });
  await expect(result).toContainText('I grouped the unread messages');
  await expect(result.getByRole('button', { name: 'Copy message' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop-result-card.png') });
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`view transitions preserve drafts with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      const original = Element.prototype.animate;
      Object.assign(window, { viewMotionCalls: [] as string[] });
      Element.prototype.animate = function (...args) {
        // Page changes animate the workspace (header and body); others animate the body.
        const view =
          this.getAttribute('data-workspace-view') ??
          this.querySelector('[data-workspace-view]')?.getAttribute('data-workspace-view');
        if (view)
          (window as unknown as { viewMotionCalls: string[] }).viewMotionCalls.push(view);
        return original.apply(this, args);
      };
    });
    await page.goto('/#demo');
    await page.getByTitle('New conversation', { exact: true }).first().click();
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    await field.fill('Keep my unfinished thought');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await openAppearance(page);
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await expect(field).toHaveValue('Keep my unfinished thought');
    const motions = await page.evaluate(
      () => (window as unknown as { viewMotionCalls: string[] }).viewMotionCalls,
    );
    if (reducedMotion === 'reduce') expect(motions).toEqual([]);
    else expect(motions).toContain('settings:providers');
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`startup reveals the real workspace with ${reducedMotion} motion`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion });
    await page.goto('/?startup-delay=2200#demo');
    const startup = page.locator('[data-sia-startup]');
    const loading = page.getByRole('status', { name: 'Loading Sia' });
    await expect(loading).toBeVisible();
    const blob = startup.locator(':scope > div').first();
    if (reducedMotion === 'reduce') {
      await expect(blob).toHaveCSS('animation-name', 'none');
    } else {
      await expect
        .poll(() =>
          blob.evaluate((el) => {
            const transform = getComputedStyle(el).transform;
            return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
          }),
        )
        .toBeLessThan(0.5);
      await page.screenshot({ path: info.outputPath('startup-left.png') });
    }
    await expect(page.getByRole('button', { name: 'Access' })).toBeVisible();
    await expect(startup).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(startup).toHaveCount(0);
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: welcome, composer, and existing controls stay usable`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme });
    await page.goto('/#demo');
    await page.getByTitle('New conversation', { exact: true }).first().click();
    const heading = page.getByRole('heading', { name: 'What would you like to do?' });
    const field = page.getByRole('textbox', { name: 'Message', exact: true });
    const send = page.getByRole('button', { name: 'Send message', exact: true });
    await expect(heading).toBeVisible();
    await expect(send).toBeDisabled();
    await expect(page.locator('.sia-aurora')).toHaveAttribute('data-renderer', 'dither');
    await expect
      .poll(() => heading.evaluate((el) => getComputedStyle(el).backgroundPosition))
      .not.toBe('0% 50%');

    // Focus must not move the content or remove the field behind it.
    await expect(page.locator('[data-workspace-view]')).toHaveCSS('transform', 'none');
    const before = await field.boundingBox();
    await field.click();
    await expect(field).toBeFocused();
    expect(await field.boundingBox()).toEqual(before);
    await expect(page.locator('.dither-aurora-field canvas')).toBeVisible();
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
  await page.getByTitle('New conversation', { exact: true }).first().click();
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
  await page.getByTitle('New conversation', { exact: true }).first().click();
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

test('navigation stays stable, previews do not select, and the compact rail keeps every route', async ({
  page,
}, info) => {
  await page.goto('/#demo');
  const nav = page.getByRole('complementary', { name: 'Agent navigation' });
  const logo = nav.getByRole('img', { name: 'Sia', exact: true }).locator('img');
  await expect(logo).toBeVisible();
  await expect
    .poll(() => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(256);
  const task = nav.getByRole('button', { name: 'Weekly research update', exact: true });
  await task.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText('Latest reply');
  await expect(task).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: info.outputPath('task-preview.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const groups = () =>
    nav.locator('section').evaluateAll((elements) => elements.map((el) => el.textContent));
  const before = await groups();
  const personal = nav.getByRole('button', { name: 'Personal admin', exact: true });
  const inbox = nav.getByRole('button', { name: 'Triage today’s inbox', exact: true });
  await personal.click();
  await expect(personal).toHaveAttribute('aria-expanded', 'false');
  await expect(inbox).toBeHidden();
  await personal.press('Enter');
  await expect(personal).toHaveAttribute('aria-expanded', 'true');
  await expect(inbox).toBeVisible();
  await expect(task).toHaveAttribute('aria-current', 'page');
  await inbox.click();
  await expect(inbox).toHaveAttribute('aria-current', 'page');
  expect(await groups()).toEqual(before);
  await page.screenshot({ path: info.outputPath('collapsible-menu.png') });

  // Long titles must not squeeze the actions or make uneven, wrapped rows.
  // The same actions remain reachable by keyboard when hidden at rest.
  await inbox.focus();
  await inbox.press('Tab');
  const actions = nav.getByRole('button', {
    name: 'Conversation actions for Triage today’s inbox',
  });
  await expect(actions).toBeFocused();
  await expect(actions).toHaveCSS('opacity', '1');
  await actions.press('Enter');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const longTitle = 'Find all my CMU assignments for this week and check every course page';
  const rename = page.getByRole('textbox', { name: 'Rename Triage today’s inbox' });
  await rename.fill(longTitle);
  await rename.press('Enter');
  const renamed = nav.getByRole('button', { name: longTitle, exact: true });
  await expect(renamed).toBeVisible();
  for (const width of [1280, 900]) {
    await nav.getByRole('searchbox', { name: 'Find a conversation' }).hover();
    await page.setViewportSize({ width, height: 760 });
    await expect(nav).toHaveCSS('flex-basis', width === 900 ? '252px' : '272px');
    const title = renamed.getByText(longTitle, { exact: true });
    await expect(title).toHaveCSS('white-space', 'nowrap');
    expect((await title.boundingBox())!.width).toBeGreaterThan(
      (await nav.boundingBox())!.width * 0.65,
    );
    expect((await renamed.boundingBox())!.height).toBe((await task.boundingBox())!.height);
    const beforeHover = await title.boundingBox();
    await renamed.hover();
    await expect(page.getByRole('tooltip')).toContainText(longTitle);
    await expect(page.getByRole('tooltip').locator('time')).toBeVisible();
    expect(await title.boundingBox()).toEqual(beforeHover);
    expect(await nav.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: info.outputPath(`sidebar-${width}.png`) });
  }
  await nav.getByRole('button', { name: 'Research partner', exact: true }).click();
  await expect(task).toBeHidden();
  await nav.getByRole('searchbox', { name: 'Find a conversation' }).fill('Weekly');
  await expect(task).toBeVisible();
  await expect(nav.getByRole('button', { name: longTitle, exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Collapse sidebar' }).click();
  for (const name of [
    'New conversation',
    'Search conversations',
    'Create agent',
    'Activity',
    'Scheduled',
    'Open settings',
  ]) {
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await nav.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Activity', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(nav.getByRole('button', { name: 'Activity', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await nav.getByRole('button', { name: 'Scheduled', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Scheduled', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('main', { name: 'Scheduled' })).toBeVisible();
});

test('Connections stays optional in Use my Mac and primary in Connected apps', async ({
  page,
}) => {
  await page.goto('/#demo');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(nav.getByRole('button', { name: 'Connections', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Computer', exact: true }).click();
  await page.getByRole('combobox', { name: 'App access mode' }).selectOption('mac');
  await expect(nav.getByRole('button', { name: 'Connections', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connections', exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'More settings' }).click();
  await page.getByRole('menuitem', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Computer', exact: true }).click();
  await page.getByRole('combobox', { name: 'App access mode' }).selectOption('connected');
  await nav.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
});

test('the launcher follows the saved text size and still fits its taller panel', async ({
  page,
}) => {
  // Main grows the 208px panel by the Larger scale (1.22).
  await page.setViewportSize({ width: 560, height: 254 });
  await page.addInitScript(() => {
    Object.assign(window, {
      siaLauncher: {
        state: async () => ({ textSize: 'larger', agents: [{ id: 'work', name: 'Work' }] }),
        onState: () => () => {},
      },
    });
  });
  await page.goto('/#launcher');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(page.getByRole('button', { name: 'Send request' })).toBeVisible();
  expect(await page.locator('main').evaluate((el) => el.scrollHeight)).toBeLessThanOrEqual(254);
});

test('text size scales Sia and keeps primary actions on screen at 960x640', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto('/#demo');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await openAppearance(page);
  const body = page.locator('body');
  await expect(body).toHaveCSS('font-size', '14px');
  await page.getByRole('radio', { name: 'Larger', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(body).toHaveCSS('font-size', '17.08px');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  const send = page.getByRole('button', { name: 'Send message' });
  await expect(send).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ControlOrMeta+,');
  await openAppearance(page);
  await page.getByRole('radio', { name: 'Default', exact: true }).check();
  await expect(body).toHaveCSS('font-size', '14px');
});

test('appearance stops and restores decorative graphics across settings and conversation', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.goto('/#demo');
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await openAppearance(page);
  const calm = page.getByRole('radio', { name: /Calm/ });
  const expressive = page.getByRole('radio', { name: /Expressive/ });
  await expect(expressive).toBeChecked();
  await calm.check();
  await expect(calm).toBeChecked();
  await page.screenshot({ path: info.outputPath('appearance.png') });
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page.locator('.sia-aurora')).toHaveAttribute('data-renderer', 'still');
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toHaveCSS(
    'animation-name',
    'none',
  );
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this draft');
  const surface = page.getByRole('button', { name: 'Send message' }).locator('.metal-surface');
  await expect(surface.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await openAppearance(page);
  await expect(calm).toBeChecked();
  await expressive.check();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect(page.locator('.sia-aurora')).toHaveAttribute('data-renderer', 'dither');
  await expect(surface).toHaveAttribute('data-metal', 'ready');
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue(
    'Keep this draft',
  );
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`launcher handoff is recoverable with ${reducedMotion} motion`, async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 340 });
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      Object.assign(window, {
        openAttempts: [] as unknown[],
        siaLauncher: {
          state: async () => ({
            agents: [{ id: 'work', name: 'Work' }],
            task: {
              sessionId: 'existing-task',
              agentId: 'work',
              title: 'Verified course list',
              status: 'idle',
              progress: 'Ready',
              response: 'Three courses verified',
              truncated: false,
            },
          }),
          onState: () => () => {},
          openSia: async (id: string) => {
            (window as unknown as { openAttempts: string[] }).openAttempts.push(id);
            throw new Error('Could not open Sia. Try again.');
          },
        },
      });
    });
    await page.goto('/#launcher');
    const open = page.getByRole('button', { name: 'Open conversation' });
    await open.click();
    await expect(page.getByText('Could not open Sia. Try again.')).toBeVisible();
    await expect(open).toBeEnabled();
    await expect(page.locator('main')).toHaveCSS('opacity', '1');
    expect(
      await page.evaluate(() => (window as unknown as { openAttempts: string[] }).openAttempts),
    ).toEqual(['existing-task']);
  });
}

test('navigation reveals a distant selected task without scrolling the app window', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 900, height: 680 });
  await page.goto('/#demo');
  const nav = page.getByRole('complementary', { name: 'Agent navigation' });
  for (let index = 0; index < 4; index++) {
    // New rows are also titled "New conversation"; use the ⌘N button.
    await nav.locator('button[aria-keyshortcuts="Meta+N"]').click();
  }
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search conversations and actions' }).fill('Triage');
  await page.getByRole('option', { name: /Triage today’s inbox/ }).click();
  const selected = nav.getByRole('button', { name: 'Triage today’s inbox', exact: true });
  await expect(selected).toHaveAttribute('aria-current', 'page');
  const bounds = await selected.boundingBox();
  expect(bounds!.y).toBeGreaterThan(180);
  expect(bounds!.y + bounds!.height).toBeLessThan(580);
  expect(
    await page.evaluate(() => ({
      document: document.documentElement.scrollTop,
      body: document.body.scrollTop,
    })),
  ).toEqual({ document: 0, body: 0 });
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
});
