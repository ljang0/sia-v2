import { expect, test } from '@playwright/test';

import { launchIsolatedSia } from '../support/electron-harness';

const cloudEnvironment = {
  SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
  SIA_COGNITO_REGION: 'us-east-1',
  SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
  SIA_DEV_ID_TOKEN: 'deterministic-development-token',
};

test('signed-in users review research consent once before capture can start', async () => {
  let harness = await launchIsolatedSia({
    prefix: 'sia-research-consent-',
    environment: cloudEnvironment,
  });
  const testRoot = harness.testRoot;

  try {
    const dialog = harness.page.getByRole('alertdialog', { name: 'Help improve Sia?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Use without sharing' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join research' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Use without sharing' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.capture;
      })
      .toEqual({
        status: 'not_consented',
        pendingCount: 0,
        promptReviewedVersion: 'alpha-research-v2',
      });
    expect(harness.rendererErrors).toEqual([]);

    await harness.close({ removeTestRoot: false });
    harness = await launchIsolatedSia({ testRoot, environment: cloudEnvironment });

    await expect(
      harness.page.getByRole('alertdialog', { name: 'Help improve Sia?' }),
    ).toBeHidden();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
