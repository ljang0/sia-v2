import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

test('launcher uses an isolated bridge, opens from the menu, and dispatches to the chosen agent', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-launcher-' });
  try {
    const page = sia.page;
    await page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await page.getByRole('button', { name: 'Exit setup' }).click();
    await expect(page.getByText('Ready when you are', { exact: true })).toBeVisible();
    await expect(page.getByText('Recent conversations', { exact: true })).toBeVisible();
    await expect(page.getByTestId('thread-model-select')).not.toBeVisible();
    const newConversation = page.getByRole('button', { name: 'Start a thread with Sia' });
    const bounds = await newConversation.boundingBox();
    expect(bounds!.width).toBeGreaterThan(140);
    expect(bounds!.height).toBeLessThan(55);
    await page.screenshot({
      path: 'test-results/conversation-clean.png',
      animations: 'disabled',
    });
    await page.getByText('Agent settings', { exact: true }).click();
    await expect(page.getByTestId('thread-model-select')).toBeVisible();
    await page.screenshot({
      path: 'test-results/conversation-agent-menu.png',
      animations: 'disabled',
    });
    await page.getByText('Agent settings', { exact: true }).click();
    await sia.application.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()!;
      const item = menu.items[0]!.submenu!.items.find((item) => item.label === 'Ask Sia')!;
      if (item.accelerator !== 'Command+E') throw new Error('Expected Cmd+E command shortcut.');
      item.click();
    });
    await expect.poll(() => sia.application.windows().length).toBe(2);
    const launcher = sia.application.windows().find((window) => window !== page)!;
    await expect(launcher.getByRole('textbox', { name: 'Your request' })).toBeVisible();
    await expect(launcher.getByText('⌘ E', { exact: true })).toBeVisible();
    expect(await launcher.evaluate(() => typeof window.sia)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.siaLauncher)).toBe('undefined');
    await launcher
      .getByRole('textbox', { name: 'Your request' })
      .fill('Plan my day from the launcher');
    await launcher.screenshot({
      path: 'test-results/command-launcher.png',
      animations: 'disabled',
    });
    await launcher.getByRole('textbox', { name: 'Your request' }).press('Enter');
    await expect(
      launcher.getByText(/This development turn used the deterministic local runtime/),
    ).toBeVisible();
    await expect(launcher.getByRole('button', { name: 'Open conversation' })).toBeVisible();
    const original = await launcher.evaluate(() => window.siaLauncher.state());
    await launcher.getByRole('textbox', { name: 'Your request' }).fill('Make that shorter');
    await launcher.getByRole('textbox', { name: 'Your request' }).press('Enter');
    await expect
      .poll(
        async () => (await launcher.evaluate(() => window.siaLauncher.state())).task?.sessionId,
      )
      .not.toBe(original.task!.sessionId);
    await expect
      .poll(
        async () => (await launcher.evaluate(() => window.siaLauncher.state())).task?.status,
      )
      .toBe('idle');
    const rejected = await launcher.evaluate(async (sessionId) => {
      try {
        await window.siaLauncher.cancel(sessionId);
        return false;
      } catch {
        return true;
      }
    }, original.task!.sessionId);
    expect(rejected).toBe(true);
    await launcher.screenshot({
      path: 'test-results/command-launcher-result.png',
      animations: 'disabled',
    });
    await launcher.emulateMedia({ colorScheme: 'dark' });
    await launcher.screenshot({
      path: 'test-results/command-launcher-dark.png',
      animations: 'disabled',
    });
    await launcher.getByRole('button', { name: 'Open conversation' }).click();
    const state = await page.evaluate(() => window.sia.bootstrap());
    expect(
      state.timeline.filter(
        (item) => item.kind === 'user' && item.text === 'Plan my day from the launcher',
      ),
    ).toHaveLength(1);
    const first = state.timeline.find(
      (item) => item.kind === 'user' && item.text === 'Plan my day from the launcher',
    )!;
    const followup = state.timeline.find(
      (item) => item.kind === 'user' && item.text === 'Make that shorter',
    )!;
    expect(followup.threadId).toBe(first.threadId);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
