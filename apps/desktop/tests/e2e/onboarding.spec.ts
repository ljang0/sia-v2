import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

test('guided setup resumes, creates one working agent, and finishes through the real composer', async () => {
  let sia = await launchIsolatedSia({ prefix: 'sia-onboarding-' });
  const testRoot = sia.testRoot;
  try {
    const page = sia.page;
    await page.setViewportSize({ width: 1220, height: 780 });
    await expect(page.getByRole('heading', { name: 'Create your first agent.' })).toBeVisible();
    await page.screenshot({
      path: 'test-results/onboarding-welcome.png',
      animations: 'disabled',
    });
    await page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    await page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await expect(page.getByLabel('Agent name')).toHaveValue('Sia');
    await page.getByRole('button', { name: 'Create my agent' }).click();
    await expect(page.getByRole('heading', { name: 'Give Sia access, once.' })).toBeVisible();
    const created = await page.evaluate(() => window.sia.bootstrap());
    expect(created.agents).toHaveLength(1);
    expect(created.preferences.onboarding?.step).toBe('voice');
    expect(created.preferences.onboarding?.agentId).toBe(created.activeAgentId);
    expect(created.agents[0]?.harnessPreference).toEqual({ mode: 'automatic' });
    expect(created.computer.trust).toBe('ask');
    await sia.close({ removeTestRoot: false });
    sia = await launchIsolatedSia({ testRoot });
    await expect(
      sia.page.getByRole('heading', { name: 'Give Sia access, once.' }),
    ).toBeVisible();
    const permissions = sia.page.getByRole('region', { name: 'Mac app permissions' });
    await expect(
      permissions.getByRole('button', { name: 'Allow all required access' }),
    ).toBeVisible();
    await permissions.getByRole('button', { name: 'Check access' }).click();
    await expect(
      permissions.getByText('Checking access without requesting permissions…'),
    ).toBeHidden();
    await sia.page.screenshot({
      path: 'test-results/onboarding-access.png',
      animations: 'disabled',
    });
    // The combined native request is covered with injected permission services in unit tests.
    // This desktop test must not request the host's real macOS access.
    await sia.page.getByRole('button', { name: 'Connect your apps' }).click();
    await expect(
      sia.page.getByRole('heading', { name: 'Bring your apps along.' }),
    ).toBeVisible();
    await expect(sia.page.getByRole('checkbox', { name: /Google Workspace/ })).toBeChecked();
    await expect(sia.page.getByRole('checkbox', { name: /Slack/ })).toBeChecked();
    await expect(
      sia.page.getByRole('button', { name: 'Connect selected apps' }),
    ).toBeDisabled();
    const configured = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(
      configured.connections.every((connection) => connection.status === 'disconnected'),
    ).toBe(true);
    expect(configured.computer.trust).toBe('ask');
    for (const width of [1220, 900]) {
      await sia.page.setViewportSize({ width, height: 780 });
      const setup = sia.page.getByRole('main', { name: 'Welcome to Sia' });
      expect(
        await setup.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await sia.page.screenshot({
        path: `test-results/onboarding-apps-${width}.png`,
        animations: 'disabled',
      });
    }
    await sia.page.setViewportSize({ width: 1220, height: 780 });
    await sia.page.getByRole('button', { name: 'Review and restart' }).click();
    // Exercise the real quit and persisted resume, but let the isolated harness launch
    // the replacement so it retains ownership of the test process and profile.
    await sia.application.evaluate(({ app }) => {
      app.relaunch = () => undefined;
    });
    const closed = sia.application.waitForEvent('close');
    await sia.page.getByRole('button', { name: 'Restart Sia and check access' }).click();
    await closed;
    sia = await launchIsolatedSia({ testRoot });
    await expect(
      sia.page.getByRole('heading', { name: 'Let’s check your connections.' }),
    ).toBeVisible();
    const resumed = await sia.page.evaluate(() => window.sia.bootstrap());
    expect(resumed.preferences.onboarding).toMatchObject({
      step: 'verify',
      restarted: true,
      restartPending: false,
    });
    expect(resumed.browser.status).toBe('detached');
    // Native browser access is covered by the controller/renderer fixtures. This
    // desktop run must not enumerate or attach the user's real Chrome windows.
    await expect(sia.page.getByRole('button', { name: 'Choose Chrome window' })).toBeVisible();
    await expect(sia.page.getByText(/Some access still needs setup/)).toBeVisible();
    await sia.page.screenshot({
      path: 'test-results/onboarding-verified.png',
      animations: 'disabled',
    });
    await sia.page
      .getByRole('button', { name: /Try your agent|Continue with available access/ })
      .click();
    await expect(sia.page.getByRole('region', { name: 'Try Sia' })).toBeVisible();
    await sia.page.getByRole('button', { name: 'Try a daily plan' }).click();
    const message = sia.page.getByRole('textbox', { name: 'Message' });
    await expect(message).toHaveValue(
      'Help me make a simple plan for my day. Ask me what I need to get done.',
    );
    await expect(message).toBeFocused();
    await sia.page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      sia.page.getByRole('heading', { name: 'Your first conversation is underway.' }),
    ).toBeVisible();
    await sia.page.getByRole('button', { name: 'Finish setup', exact: true }).click();
    await expect(sia.page.getByRole('region', { name: 'Try Sia' })).toBeHidden();
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
    await sia.page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await sia.page.getByRole('button', { name: 'Create my agent' }).click();
    await sia.page.getByRole('button', { name: 'Connect your apps' }).click();
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

test('Voice settings keeps the Fn controls readable and can replay setup with the existing agent', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-voice-layout-' });
  try {
    await sia.page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await sia.page.getByRole('button', { name: 'Create my agent' }).click();
    await expect(
      sia.page.getByRole('heading', { name: 'Give Sia access, once.' }),
    ).toBeVisible();
    await sia.page.getByRole('button', { name: 'Exit setup' }).click();
    await sia.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sia.page.getByRole('button', { name: 'Voice', exact: true }).click();
    for (const width of [1220, 900]) {
      await sia.page.setViewportSize({ width, height: 780 });
      const select = sia.page.getByLabel('Voice agent when Sia is in the background');
      await expect(select).toBeVisible();
      const bounds = await select.boundingBox();
      expect(bounds!.width).toBeGreaterThan(220);
      const label = sia.page.getByText('Hold Fn to talk to Sia', { exact: true });
      expect((await label.boundingBox())!.height).toBeLessThan(50);
      await sia.page.screenshot({
        path: `test-results/voice-settings-${width}.png`,
        animations: 'disabled',
      });
    }
    await sia.page.setViewportSize({ width: 960, height: 640 });
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1.25);
    });
    const zoomedSelect = sia.page.getByLabel('Voice agent when Sia is in the background');
    await zoomedSelect.scrollIntoViewIfNeeded();
    expect((await zoomedSelect.boundingBox())!.width).toBeGreaterThan(220);
    await sia.page.screenshot({
      path: 'test-results/voice-settings-zoom.png',
      animations: 'disabled',
    });
    await sia.application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1);
    });
    await sia.page.getByRole('button', { name: 'Walk me through setup' }).click();
    await expect(
      sia.page.getByRole('heading', { name: 'Make yourself at home.' }),
    ).toBeVisible();
    await sia.page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await expect(
      sia.page.getByRole('heading', { name: 'Give Sia access, once.' }),
    ).toBeVisible();
    expect((await sia.page.evaluate(() => window.sia.bootstrap())).agents).toHaveLength(1);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
