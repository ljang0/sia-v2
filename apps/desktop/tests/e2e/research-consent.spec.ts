import { expect, test } from '@playwright/test';

import { exitFirstRunSetup, launchIsolatedSia } from '../support/electron-harness';

const cloudEnvironment = {
  SIA_API_BASE_URL: 'https://cloud.example.test/alpha',
  SIA_COGNITO_REGION: 'us-east-1',
  SIA_COGNITO_CLIENT_ID: 'deterministicclientid',
  SIA_DEV_ID_TOKEN: 'deterministic-development-token',
};

test('signed-in users can opt into research from Privacy without an onboarding gate', async () => {
  let harness = await launchIsolatedSia({
    prefix: 'sia-research-consent-',
    environment: cloudEnvironment,
  });
  const testRoot = harness.testRoot;

  try {
    await exitFirstRunSetup(harness.page);
    await expect(
      harness.page.getByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toHaveCount(0);
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'Privacy' }).click();
    await harness.page.getByRole('button', { name: 'Review & enable' }).click();

    const dialog = harness.page.getByRole('alertdialog', {
      name: 'Join the Sia research release?',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Use without sharing' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join research release' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Join research release' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return {
          status: snapshot.capture.status,
          pendingCount: snapshot.capture.pendingCount,
          consentVersion: snapshot.capture.consentVersion,
          promptReviewedVersion: snapshot.capture.promptReviewedVersion,
          accepted: Boolean(snapshot.capture.consentAcceptedAt),
        };
      })
      .toEqual({
        status: 'recording',
        pendingCount: 0,
        consentVersion: 'alpha-research-v3-raw',
        promptReviewedVersion: 'alpha-research-v3-raw',
        accepted: true,
      });
    expect(harness.rendererErrors).toEqual([]);

    await harness.close({ removeTestRoot: false });
    harness = await launchIsolatedSia({ testRoot, environment: cloudEnvironment });
    await expect(harness.page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(harness.page.getByRole('main', { name: 'Welcome to Sia' })).toBeHidden();
    expect(
      (await harness.page.evaluate(() => window.sia.bootstrap())).preferences.onboarding?.step,
    ).toBe('complete');

    await expect(
      harness.page.getByRole('alertdialog', { name: 'Join the Sia research release?' }),
    ).toBeHidden();
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
