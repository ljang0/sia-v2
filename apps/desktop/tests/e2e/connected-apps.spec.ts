import { expect, test } from '@playwright/test';
import { rm } from 'node:fs/promises';

import { exitFirstRunSetup, launchIsolatedSia } from '../support/electron-harness';

test('configured first run requires Sia sign-in before setup', async () => {
  const harness = await launchIsolatedSia({
    prefix: 'sia-account-first-run-',
    environment: {
      SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
      SIA_COGNITO_REGION: 'us-east-1',
      SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
    },
  });

  try {
    await expect(harness.page.getByRole('dialog', { name: 'Sign in to Sia' })).toBeVisible();
    await expect(harness.page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(harness.page.getByRole('button', { name: 'Start in local mode' })).toHaveCount(
      0,
    );
    await expect(harness.page.getByText(/Enter your email/)).toBeVisible();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('a signed-out relaunch locks persisted agents and every app surface', async () => {
  const releaseEnvironment = {
    SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
    SIA_COGNITO_REGION: 'us-east-1',
    SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
  };
  const signedIn = await launchIsolatedSia({
    prefix: 'sia-account-relaunch-lock-',
    environment: {
      ...releaseEnvironment,
      SIA_DEV_ID_TOKEN: 'deterministic-development-token',
    },
  });
  let signedInClosed = false;
  let signedOut: Awaited<ReturnType<typeof launchIsolatedSia>> | undefined;

  try {
    await signedIn.page.evaluate(async () => {
      await window.sia.agents.save({
        name: 'Persisted private agent',
        instructions: 'Remain inaccessible until Sia email sign-in succeeds.',
        provider: 'codex',
        model: 'gpt-5.6-sol',
      });
    });
    await expect(
      signedIn.page.getByRole('button', { name: 'Agent actions for Persisted private agent' }),
    ).toBeVisible();
    await signedIn.close({ removeTestRoot: false });
    signedInClosed = true;

    signedOut = await launchIsolatedSia({
      testRoot: signedIn.testRoot,
      environment: releaseEnvironment,
    });

    await expect(signedOut.page.getByRole('dialog', { name: 'Sign in to Sia' })).toBeVisible();
    await expect(signedOut.page.getByRole('button', { name: 'Access' })).toHaveCount(0);
    await expect(
      signedOut.page.getByRole('button', { name: 'Agent actions for Persisted private agent' }),
    ).toHaveCount(0);
    const locked = await signedOut.page.evaluate(async () => await window.sia.bootstrap());
    expect(locked).toMatchObject({
      agents: [],
      threads: [],
      timeline: [],
      providers: [],
      schedules: [],
      cloud: { auth: 'signed_out' },
    });
    await expect(
      signedOut.page.evaluate(async () => await window.sia.computer.permissions()),
    ).rejects.toThrow('Sign in to Sia to continue.');
    expect(signedOut.rendererErrors).toEqual([]);
  } finally {
    if (!signedInClosed) await signedIn.close({ removeTestRoot: false });
    await signedOut?.close({ removeTestRoot: false });
    await rm(signedIn.testRoot, { recursive: true, force: true });
  }
});

test('core Sia opens first and optional setup connects every work app later', async () => {
  const harness = await launchIsolatedSia({
    prefix: 'sia-connected-apps-',
    environment: {
      SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
      SIA_COGNITO_REGION: 'us-east-1',
      SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
      SIA_DEV_ID_TOKEN: 'deterministic-development-token',
    },
  });

  try {
    await exitFirstRunSetup(harness.page);
    await expect(
      harness.page.getByRole('dialog', { name: 'Connect your work apps' }),
    ).toHaveCount(0);
    await expect(
      harness.page.getByRole('heading', { name: 'Create your first agent.' }),
    ).toBeVisible();
    await expect(
      harness.page.getByRole('button', { name: 'Connect work apps later' }),
    ).toBeVisible();

    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'More settings' }).click();
    await harness.page.getByRole('menuitem', { name: 'Connections' }).click();
    await expect(harness.page.getByText(/Every connection is optional/)).toBeVisible();
    await expect(harness.page.getByText('Work apps', { exact: true })).toBeVisible();
    for (const width of [1220, 900]) {
      await harness.page.setViewportSize({ width, height: 780 });
      const checklist = harness.page.getByRole('group', { name: 'Choose your connections' });
      await expect(checklist).toBeVisible();
      expect(
        await checklist.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await harness.page.screenshot({
        path: `test-results/settings-connections-${width}.png`,
        animations: 'disabled',
      });
    }
    await harness.page
      .getByRole('button', { name: 'Connect selected apps', exact: true })
      .click();

    await expect(harness.page.getByText('Available to agents')).toBeVisible();
    await expect(harness.page.getByText(/of 6 ready/)).toHaveCount(0);
    await expect(
      harness.page.getByRole('button', { name: 'Connect Google', exact: true }),
    ).toHaveCount(0);
    await expect(
      harness.page.getByRole('button', { name: 'Connect Slack', exact: true }),
    ).toHaveCount(0);
    await expect(
      harness.page.getByRole('button', { name: 'Disconnect Google Workspace' }),
    ).toBeVisible();
    await expect(harness.page.getByRole('button', { name: 'Disconnect Slack' })).toBeVisible();
    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.connections.map(({ id, status, enabled }) => ({
          id,
          status,
          enabled: enabled !== false,
        }));
      })
      .toEqual([
        { id: 'gmail', status: 'connected', enabled: true },
        { id: 'calendar', status: 'connected', enabled: true },
        { id: 'drive', status: 'connected', enabled: true },
        { id: 'docs', status: 'connected', enabled: true },
        { id: 'sheets', status: 'connected', enabled: true },
        { id: 'slides', status: 'connected', enabled: true },
        { id: 'tasks', status: 'connected', enabled: true },
        { id: 'slack', status: 'connected', enabled: true },
        { id: 'outlook', status: 'disconnected', enabled: true },
        { id: 'notion', status: 'disconnected', enabled: true },
        { id: 'github', status: 'disconnected', enabled: true },
      ]);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('a user can connect only a selected set of work apps later', async () => {
  const harness = await launchIsolatedSia({
    prefix: 'sia-selected-apps-',
    environment: {
      SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
      SIA_COGNITO_REGION: 'us-east-1',
      SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
      SIA_DEV_ID_TOKEN: 'deterministic-development-token',
    },
  });

  try {
    await exitFirstRunSetup(harness.page);
    await expect(
      harness.page.getByRole('dialog', { name: 'Connect your work apps' }),
    ).toHaveCount(0);
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'More settings' }).click();
    await harness.page.getByRole('menuitem', { name: 'Connections' }).click();
    await harness.page.getByRole('checkbox', { name: /Slack/ }).uncheck();
    await harness.page.getByRole('button', { name: 'Connect selected apps' }).click();
    for (const appName of ['Gmail', 'Google Drive', 'Google Sheets', 'Google Slides']) {
      await harness.page.getByRole('button', { name: `Disable ${appName}` }).click();
    }
    await harness.page.getByRole('checkbox', { name: /Slack/ }).check();
    await harness.page.getByRole('button', { name: 'Connect selected apps' }).click();

    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.connections.map(({ id, status, enabled }) => ({
          id,
          status,
          enabled: enabled !== false,
        }));
      })
      .toEqual([
        { id: 'gmail', status: 'connected', enabled: false },
        { id: 'calendar', status: 'connected', enabled: true },
        { id: 'drive', status: 'connected', enabled: false },
        { id: 'docs', status: 'connected', enabled: true },
        { id: 'sheets', status: 'connected', enabled: false },
        { id: 'slides', status: 'connected', enabled: false },
        { id: 'tasks', status: 'connected', enabled: true },
        { id: 'slack', status: 'connected', enabled: true },
        { id: 'outlook', status: 'disconnected', enabled: true },
        { id: 'notion', status: 'disconnected', enabled: true },
        { id: 'github', status: 'disconnected', enabled: true },
      ]);
    await expect(harness.page.getByRole('button', { name: 'Enable Gmail' })).toBeVisible();
    await expect(
      harness.page.getByRole('button', { name: 'Disable Google Docs' }),
    ).toBeVisible();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
