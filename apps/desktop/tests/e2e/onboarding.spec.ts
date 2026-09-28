import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

test('one-click setup opens a working conversation and stays complete across relaunch', async () => {
  let sia = await launchIsolatedSia({ prefix: 'sia-onboarding-' });
  const testRoot = sia.testRoot;
  try {
    let page = sia.page;
    await page.setViewportSize({ width: 1220, height: 780 });
    await expect(page.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();
    await expect(page.getByLabel('Agent name')).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Set up Sia', exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: 'test-results/onboarding-welcome.png',
      animations: 'disabled',
    });
    // Exercise setup without the optional app-specific permission pass.
    await page.getByRole('checkbox', { name: /Prepare everyday apps now/ }).uncheck();
    // SIA_FAKE_SERVICES simulates permission APIs; this cannot prompt the host OS.
    page = await sia.completeSetup();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    const created = await page.evaluate(() => window.sia.bootstrap());
    expect(created.agents).toHaveLength(1);
    expect(created.agents[0]?.name).toBe('Sia');
    expect(created.preferences.onboarding?.step).toBe('complete');
    expect(created.preferences.onboarding?.agentId).toBe(created.activeAgentId);
    expect(created.computer.trust).toBe('auto');
    expect(created.computer.accessMode).toBe('mac');
    // First run must not request app-specific grants or open their host apps.
    expect(Object.values(created.computer.automation ?? {})).toEqual(
      Array(7).fill('needs_permission'),
    );
    expect(
      created.connections.every((connection) => connection.status === 'disconnected'),
    ).toBe(true);
    for (const width of [1220, 900]) {
      await page.setViewportSize({ width, height: 780 });
      await expect(
        page.getByRole('textbox', { name: 'Message', exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: `test-results/onboarding-ready-${width}.png`,
        animations: 'disabled',
      });
    }
    await sia.close({ removeTestRoot: false });
    sia = await launchIsolatedSia({ testRoot });
    const message = sia.page.getByRole('textbox', { name: 'Message' });
    await expect(message).toBeVisible();
    await message.fill('Help me make a simple plan for my day.');
    await sia.page.getByRole('button', { name: 'Send message' }).click();
    await expect
      .poll(async () => {
        const snapshot = await sia.page.evaluate(() => window.sia.bootstrap());
        return snapshot.threads.find((thread) => thread.id === snapshot.activeThreadId)?.status;
      })
      .toBe('idle');
    await sia.page.reload();
    await expect(sia.page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    const finished = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(finished.agents).toHaveLength(1);
    expect(finished.preferences.onboarding?.step).toBe('complete');
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('one checklist action connects the selected accounts and keeps connected accounts checked', async () => {
  const sia = await launchIsolatedSia({
    prefix: 'sia-onboarding-connectors-',
    environment: {
      SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
      SIA_COGNITO_REGION: 'us-east-1',
      SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
      SIA_DEV_ID_TOKEN: 'deterministic-development-token',
    },
  });
  try {
    await sia.completeSetup();
    await expect(sia.page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await sia.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sia.page.getByRole('button', { name: 'More settings' }).click();
    await sia.page.getByRole('menuitem', { name: 'Connections' }).click();
    const google = sia.page.getByRole('checkbox', { name: /Google Workspace/ });
    const slack = sia.page.getByRole('checkbox', { name: /Slack/ });
    await expect(google).toBeChecked();
    await expect(slack).toBeChecked();
    await slack.uncheck();
    await sia.page.getByRole('button', { name: 'Connect selected apps' }).click();
    await expect(google).toBeDisabled();
    await expect(slack).not.toBeChecked();
    const partial = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(partial.connections.find((app) => app.id === 'slack')?.status).toBe('disconnected');
    await slack.check();
    await sia.page.getByRole('button', { name: 'Connect selected apps' }).click();
    await expect(
      sia.page.getByRole('button', { name: 'Connect selected apps' }),
    ).toBeDisabled();
    const connected = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(connected.connections.every((app) => app.status === 'connected')).toBe(true);
    expect(connected.connections.find((app) => app.id === 'gmail')?.connectionId).toBe(
      partial.connections.find((app) => app.id === 'gmail')?.connectionId,
    );
    await sia.page.screenshot({
      path: 'test-results/onboarding-connectors.png',
      animations: 'disabled',
    });
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('Voice settings hides unavailable Fn controls and can replay setup with the existing agent', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-voice-layout-' });
  try {
    await sia.completeSetup();
    await expect(sia.page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await sia.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sia.page.getByRole('button', { name: 'Voice', exact: true }).click();
    for (const width of [1220, 900]) {
      await sia.page.setViewportSize({ width, height: 780 });
      await expect(
        sia.page.getByLabel('Voice agent when Sia is in the background'),
      ).toHaveCount(0);
      await expect(sia.page.getByRole('checkbox', { name: /Completion sound/ })).toBeVisible();
      await sia.page.screenshot({
        path: `test-results/voice-settings-${width}.png`,
        animations: 'disabled',
      });
    }
    await sia.page.setViewportSize({ width: 960, height: 640 });
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1.25);
    });
    await expect(sia.page.getByRole('checkbox', { name: /Completion sound/ })).toBeVisible();
    await sia.page.screenshot({
      path: 'test-results/voice-settings-zoom.png',
      animations: 'disabled',
    });
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1);
    });
    await sia.page.getByRole('button', { name: 'Walk me through setup' }).click();
    await expect(sia.page.getByRole('heading', { name: 'Let’s set up Sia.' })).toBeVisible();
    await sia.completeSetup();
    await expect(sia.page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    expect((await sia.page.evaluate(() => window.sia.bootstrap())).agents).toHaveLength(1);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
