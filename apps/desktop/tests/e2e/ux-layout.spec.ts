import { expect, test } from '@playwright/test';
import { createAgentAndThread, launchIsolatedSia } from '../support/electron-harness';

test('minimum viewport keeps dialogs, thread tools, and Activity within bounds', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-ux-layout-' });

  try {
    await sia.page.setViewportSize({ width: 960, height: 640 });

    await sia.page.getByRole('button', { name: 'Create agent' }).click();
    const dialog = sia.page.getByRole('dialog', { name: 'New agent' });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1');
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
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);

    await createAgentAndThread(sia.page, { name: 'UX helper' });
    const tools = sia.page.getByRole('navigation', { name: 'Thread tools' });
    const message = sia.page.getByRole('textbox', { name: 'Message' });
    await expect(tools).toBeVisible();
    await expect(tools.getByRole('button')).toHaveCount(1);
    const toolsButton = tools.getByRole('button', { name: 'Tools', exact: true });
    await expect(sia.page.getByRole('menuitem')).toHaveCount(0);
    await toolsButton.focus();
    await sia.page.keyboard.press('ArrowDown');
    const toolMenu = sia.page.getByRole('menu', { name: 'Tools', exact: true });
    await expect(toolMenu).toBeInViewport({ ratio: 1 });
    // Command stays hidden until Developer tools is on.
    await expect(toolMenu.getByRole('menuitem')).toHaveCount(3);
    await expect(toolMenu.getByRole('menuitem', { name: 'Command', exact: true })).toHaveCount(
      0,
    );
    await expect(toolMenu.getByRole('menuitem', { name: 'Goal', exact: true })).toBeFocused();
    await sia.page.keyboard.press('Enter');
    await expect(sia.page.getByRole('complementary', { name: 'Thread tool' })).toBeFocused();
    await sia.page.keyboard.press('Escape');
    await expect(toolsButton).toBeFocused();
    await toolsButton.click();
    await sia.page.keyboard.press('Escape');
    await expect(toolsButton).toBeFocused();
    const [toolBounds, messageBounds] = await Promise.all([
      tools.boundingBox(),
      message.boundingBox(),
    ]);
    expect(toolBounds).not.toBeNull();
    expect(messageBounds).not.toBeNull();
    expect(toolBounds!.y + toolBounds!.height).toBeLessThanOrEqual(messageBounds!.y);

    // The minimum window still has room for the actual conversation.
    const header = await sia.page.locator('[data-companion-room-header]').boundingBox();
    expect(header!.height).toBeLessThanOrEqual(64);
    const conversation = await sia.page
      .getByLabel('Conversation', { exact: true })
      .boundingBox();
    expect(conversation!.height).toBeGreaterThan(360);
    await expect(message).toBeInViewport({ ratio: 1 });
    expect(
      await sia.page
        .getByLabel('Conversation', { exact: true })
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
    await expect(sia.page.locator('[data-companion-thread-empty] [data-size]')).toBeInViewport({
      ratio: 1,
    });

    await sia.page.getByTestId('activity-center-toggle').click();
    await expect(sia.page.getByRole('heading', { name: 'Activity', level: 1 })).toBeVisible();
    expect(
      await sia.page
        .getByRole('main')
        .evaluate((main) =>
          [main, ...main.querySelectorAll<HTMLElement>('*')]
            .filter((element) => element.clientWidth > 0)
            .every((element) => element.scrollWidth <= element.clientWidth + 1),
        ),
    ).toBe(true);

    await expect(
      sia.page
        .getByRole('complementary', { name: 'Agent navigation' })
        .getByRole('button', { name: 'Archived', exact: true }),
    ).toHaveCount(0);
    await expect(sia.page.getByRole('region', { name: 'Archived' })).toBeVisible();
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('Sia presence follows the real task lifecycle and respects reduced motion', async () => {
  const sia = await launchIsolatedSia({
    prefix: 'sia-presence-',
    environment: { SIA_TEST_FAKE_TURN_DELAY_MS: '1500' },
  });

  try {
    await createAgentAndThread(sia.page, { name: 'Presence helper' });
    const presence = sia.page.locator('[data-sia-presence]');
    await expect(presence).toHaveAttribute('data-state', 'idle');

    await sia.page.getByRole('textbox', { name: 'Message' }).fill('Show the working state');
    await sia.page.getByRole('button', { name: 'Send message' }).click();
    await expect(presence).toHaveAttribute('data-state', 'working');
    await expect(
      sia.page.locator('[data-companion-room-header] [data-state="working"]'),
    ).toBeVisible();
    await expect(presence).toHaveAttribute('data-state', 'complete', { timeout: 5_000 });
    await expect(presence).toHaveAttribute('data-state', 'idle', { timeout: 3_000 });

    await sia.page.emulateMedia({ reducedMotion: 'reduce' });
    await sia.page.getByRole('textbox', { name: 'Message' }).fill('Respect reduced motion');
    await sia.page.getByRole('button', { name: 'Send message' }).click();
    await expect(presence).toHaveAttribute('data-state', 'working');
    expect(await presence.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'none',
    );
    await expect(presence).toHaveAttribute('data-state', 'complete', { timeout: 5_000 });
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
