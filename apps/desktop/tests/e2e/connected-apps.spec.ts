import { expect, test } from '@playwright/test';

import { dismissFirstAgentPrompt, launchIsolatedSia } from '../support/electron-harness';

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
    await expect(harness.page.getByText(/Sia's included model/)).toBeVisible();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
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
    await dismissFirstAgentPrompt(harness.page);
    await expect(
      harness.page.getByRole('dialog', { name: 'Connect your work apps' }),
    ).toHaveCount(0);
    await expect(
      harness.page.getByRole('heading', { name: 'Make space for focused work.' }),
    ).toBeVisible();
    await expect(
      harness.page.getByRole('button', { name: 'Connect work apps later' }),
    ).toBeVisible();

    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'Connections' }).click();
    await expect(
      harness.page.getByText(/Connect work apps, your browser, and tools on this computer/),
    ).toBeVisible();
    await expect(harness.page.getByText('Work apps', { exact: true })).toBeVisible();
    await harness.page.getByRole('button', { name: 'Connect Google', exact: true }).click();
    await harness.page
      .getByRole('button', { name: 'Connect Slack', exact: true })
      .first()
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
        { id: 'drive', status: 'connected', enabled: true },
        { id: 'docs', status: 'connected', enabled: true },
        { id: 'sheets', status: 'connected', enabled: true },
        { id: 'slides', status: 'connected', enabled: true },
        { id: 'slack', status: 'connected', enabled: true },
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
    await dismissFirstAgentPrompt(harness.page);
    await expect(
      harness.page.getByRole('dialog', { name: 'Connect your work apps' }),
    ).toHaveCount(0);
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'Connections' }).click();
    await harness.page.getByRole('button', { name: 'Connect Google', exact: true }).click();
    for (const appName of ['Gmail', 'Google Drive', 'Google Sheets', 'Google Slides']) {
      await harness.page.getByRole('button', { name: `Disable ${appName}` }).click();
    }
    await harness.page
      .getByRole('button', { name: 'Connect Slack', exact: true })
      .first()
      .click();

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
        { id: 'drive', status: 'connected', enabled: false },
        { id: 'docs', status: 'connected', enabled: true },
        { id: 'sheets', status: 'connected', enabled: false },
        { id: 'slides', status: 'connected', enabled: false },
        { id: 'slack', status: 'connected', enabled: true },
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
