import { expect, test } from '@playwright/test';

import { launchIsolatedSia } from '../support/electron-harness';

test('configured first run offers Sia sign-in before local setup', async () => {
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
    await expect(harness.page.getByRole('textbox', { name: 'Invited email' })).toBeVisible();
    await harness.page.getByRole('button', { name: 'Continue locally' }).click();
    await expect(harness.page.getByRole('heading', { name: 'Choose an agent' })).toBeVisible();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('one guided action connects all work apps in deterministic development mode', async () => {
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
    await harness.page.getByRole('button', { name: 'Use without sharing' }).click();
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'Apps' }).click();

    await expect(harness.page.getByText('0 of 3 connected')).toBeVisible();
    await expect(harness.page.getByText(/Nothing is bulk copied into Sia/)).toBeVisible();
    await harness.page.getByRole('button', { name: 'Connect work apps' }).click();

    await expect(
      harness.page.getByRole('button', { name: 'Work apps connected' }),
    ).toBeVisible();
    await expect(harness.page.getByText('3 of 3 connected')).toBeVisible();
    await expect(harness.page.getByText('Connected', { exact: true })).toHaveCount(3);
    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.connections.map(({ id, status }) => ({ id, status }));
      })
      .toEqual([
        { id: 'gmail', status: 'connected' },
        { id: 'drive', status: 'connected' },
        { id: 'slack', status: 'connected' },
      ]);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
