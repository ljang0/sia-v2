import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

test('existing browser-blocked conversations offer inline recovery without opening Chrome or replaying work', async () => {
  let sia = await launchIsolatedSia({ prefix: 'sia-browser-recovery-' });
  const testRoot = sia.testRoot;
  try {
    await sia.page.getByText('Customize setup', { exact: true }).click();
    await sia.page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    await sia.completeSetup();
    // This fixture exercises gateway tools and confirmation-mode behavior.
    await expect(sia.page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    const threadId = await sia.page.evaluate(
      async () => (await window.sia.bootstrap()).activeThreadId!,
    );
    await sia.page.evaluate(
      async (threadId) =>
        window.sia.threads.send({ threadId, text: 'Find my finals on Canvas' }),
      threadId,
    );
    await expect
      .poll(
        async () =>
          (await sia.page.evaluate(() => window.sia.bootstrap())).threads.find(
            (thread) => thread.id === threadId,
          )?.status,
      )
      .toBe('idle');
    const dataPath = join(sia.userData, 'sia.sqlite');
    await sia.close({ removeTestRoot: false });
    // Only the isolated plaintext test profile is seeded; no native browser calls are made.
    const database = new DatabaseSync(dataPath);
    try {
      const row = database
        .prepare("SELECT payload FROM records WHERE scope = 'desktop' AND id = 'state'")
        .get() as { payload: Uint8Array };
      const state = JSON.parse(Buffer.from(row.payload).toString('utf8'));
      const user = state.timeline.findLast(
        (item: { threadId: string; kind: string }) =>
          item.threadId === threadId && item.kind === 'user',
      );
      const sequence = Math.max(
        ...state.timeline.map((item: { sequence: number }) => item.sequence),
      );
      state.timeline.push({
        id: randomUUID(),
        threadId,
        turnId: user.turnId,
        sequence: sequence + 1,
        timestamp: new Date().toISOString(),
        kind: 'activity',
        title: 'Finding browser tabs',
        toolName: 'browser_tabs',
        status: 'complete',
      });
      state.timeline.push({
        id: randomUUID(),
        threadId,
        turnId: user.turnId,
        sequence: sequence + 2,
        timestamp: new Date().toISOString(),
        kind: 'assistant',
        text: 'Chrome needs to be connected to continue.',
        status: 'complete',
      });
      database
        .prepare("UPDATE records SET payload = ? WHERE scope = 'desktop' AND id = 'state'")
        .run(Buffer.from(JSON.stringify(state)));
    } finally {
      database.close();
    }
    sia = await launchIsolatedSia({ testRoot });
    const recovery = sia.page.getByRole('region', { name: 'Continue with Chrome' });
    await expect(
      recovery.getByRole('button', { name: 'Connect Chrome & continue' }),
    ).toBeVisible();
    for (const width of [1180, 900]) {
      await sia.page.setViewportSize({ width, height: 780 });
      await recovery.scrollIntoViewIfNeeded();
      expect(
        await recovery.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await sia.page.screenshot({
        path: `test-results/browser-recovery-${width}.png`,
        animations: 'disabled',
      });
    }
    const before = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(before.browser.status).toBe('detached');
    expect(before.timeline.filter((item) => item.kind === 'user')).toHaveLength(1);
    const stale = await sia.page.evaluate(async (threadId) => {
      try {
        await window.sia.browser.connectAndContinue({
          threadId,
          userMessageId: '00000000-0000-4000-8000-000000000001',
        });
        return false;
      } catch {
        return true;
      }
    }, threadId);
    expect(stale).toBe(true);
    await sia.page.evaluate(
      async (threadId) =>
        window.sia.threads.send({ threadId, text: 'Write a short poem instead' }),
      threadId,
    );
    await expect(recovery).toHaveCount(0);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('Use my Mac is a persistent access choice independent of action confirmations', async () => {
  let sia = await launchIsolatedSia({ prefix: 'sia-mac-mode-' });
  const testRoot = sia.testRoot;
  try {
    await sia.page.getByText('Customize setup', { exact: true }).click();
    await sia.page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    await sia.completeSetup();
    // This fixture exercises gateway tools and confirmation-mode behavior.
    await expect(sia.page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await sia.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sia.page.getByRole('button', { name: 'Computer', exact: true }).click();
    const mode = sia.page.getByRole('combobox', { name: 'App access mode' });
    await mode.selectOption('mac');
    await expect(mode).toHaveValue('mac');
    await expect(mode).toBeEnabled();
    expect(
      await sia.page
        .getByText('How Sia uses your apps', { exact: true })
        .locator('..')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThan(220);
    await expect(
      sia.page.getByText('Authenticated Chrome (optional)', { exact: true }),
    ).toBeVisible();
    const state = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(state.computer.accessMode).toBe('mac');
    expect(state.computer.trust).toBe('ask');
    expect(state.browser.status).toBe('detached');
    await sia.page.screenshot({ path: 'test-results/use-my-mac.png', animations: 'disabled' });
    await sia.close({ removeTestRoot: false });
    sia = await launchIsolatedSia({ testRoot });
    const restored = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(restored.computer.accessMode).toBe('mac');
    expect(restored.computer.trust).toBe('ask');
    expect(restored.browser.status).toBe('detached');
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
