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

test('one guided action connects Google Workspace and Slack in deterministic development mode', async () => {
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
    await harness.page.getByRole('button', { name: 'Join research release' }).click();
    const onboarding = harness.page.getByRole('dialog', {
      name: 'Connect your work apps',
    });
    await expect(onboarding).toBeVisible();
    await expect(onboarding.getByText('Research recording is on')).toBeVisible();
    await expect(onboarding.getByText('0 of 6 apps ready')).toBeVisible();
    await expect(
      onboarding.getByText('Browser approval only - no API key or plugin'),
    ).toBeVisible();
    await expect(onboarding.getByRole('button', { name: 'Choose apps' })).toBeVisible();
    await onboarding.getByRole('button', { name: 'Connect work apps' }).click();
    await expect(onboarding).toBeHidden();

    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('button', { name: 'Apps' }).click();

    await expect(harness.page.getByText(/nothing is bulk copied into Sia/)).toBeVisible();
    await expect(harness.page.getByText('6 of 6 ready')).toBeVisible();
    await expect(harness.page.getByRole('button', { name: 'Connect work apps' })).toHaveCount(
      0,
    );
    await expect(harness.page.getByRole('button', { name: /^Disconnect/ })).toHaveCount(6);
    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.connections.map(({ id, status }) => ({ id, status }));
      })
      .toEqual([
        { id: 'gmail', status: 'connected' },
        { id: 'drive', status: 'connected' },
        { id: 'docs', status: 'connected' },
        { id: 'sheets', status: 'connected' },
        { id: 'slides', status: 'connected' },
        { id: 'slack', status: 'connected' },
      ]);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

test('first run can connect only a selected set of work apps', async () => {
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
    await harness.page.getByRole('button', { name: 'Join research release' }).click();
    const onboarding = harness.page.getByRole('dialog', {
      name: 'Connect your work apps',
    });
    await onboarding.getByRole('button', { name: 'Choose apps' }).click();
    await onboarding.getByRole('button', { name: 'Clear selection' }).click();
    await onboarding.getByRole('checkbox', { name: 'Select Google Docs' }).click();
    await onboarding.getByRole('checkbox', { name: 'Select Slack' }).click();
    await onboarding.getByRole('button', { name: 'Connect selected' }).click();
    await expect(onboarding).toBeHidden();

    await expect
      .poll(async () => {
        const snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
        return snapshot.connections.map(({ id, status }) => ({ id, status }));
      })
      .toEqual([
        { id: 'gmail', status: 'disconnected' },
        { id: 'drive', status: 'disconnected' },
        { id: 'docs', status: 'connected' },
        { id: 'sheets', status: 'disconnected' },
        { id: 'slides', status: 'disconnected' },
        { id: 'slack', status: 'connected' },
      ]);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
