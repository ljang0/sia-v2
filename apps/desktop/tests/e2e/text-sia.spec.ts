import { expect, test, type Page } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

async function openPhoneRemote(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  if (await nav.getByRole('button', { name: 'Phone remote', exact: true }).isVisible()) {
    await nav.getByRole('button', { name: 'Phone remote', exact: true }).click();
  } else {
    await nav.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Phone remote', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Text Sia from anywhere' })).toBeVisible();
}

test('Text Sia settings save numbers, trusted people and preferences across relaunch', async () => {
  test.setTimeout(90_000);
  let sia = await launchIsolatedSia({ prefix: 'sia-text-sia-' });
  const testRoot = sia.testRoot;
  try {
    await sia.page.setViewportSize({ width: 1220, height: 900 });
    await sia.page.getByRole('checkbox', { name: /Prepare everyday apps now/ }).uncheck();
    let page = await sia.completeSetup();
    await openPhoneRemote(page);

    await page.getByLabel('Your phone number or iCloud email').fill('(555) 123-4567');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Your numbers' })).toContainText(
      '+15551234567',
    );

    await page.getByLabel('Their name').fill('Alex');
    await page.getByLabel('Their phone number or iCloud email').fill('555-765-4321');
    await page.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByRole('list', { name: 'Trusted people list' })).toContainText(
      'Alex+15557654321',
    );
    // Toggles update when Sia on the Mac confirms the change.
    await page.getByRole('checkbox', { name: 'Pause connections' }).click();
    await expect(page.getByRole('checkbox', { name: 'Pause connections' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Approve steps by replying YES or NO' }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Approve steps by replying YES or NO' }),
    ).not.toBeChecked();

    // Your own number cannot also be a trusted person.
    await page.getByLabel('Their name').fill('Me');
    await page.getByLabel('Their phone number or iCloud email').fill('555 123 4567');
    await page.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByRole('alert')).toContainText('That is one of your own numbers.');

    // Simulated services have no Messages database or bot transport, and say so plainly.
    await page.getByRole('button', { name: 'Paste Telegram token' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Telegram is unavailable in this build.',
    );
    await page.getByRole('button', { name: 'Turn on texting' }).click();
    await expect(page.getByRole('alert')).toContainText('Full Disk Access');

    const saved = await page.evaluate(() => window.sia.messagesRelay({ operation: 'status' }));
    expect(saved).toMatchObject({
      enabled: false,
      trusted: [{ handle: '+15551234567' }],
      people: [{ handle: '+15557654321', name: 'Alex' }],
      peoplePaused: true,
      textApprovals: false,
      proactive: true,
      bots: [],
    });

    await sia.close({ removeTestRoot: false });
    sia = await launchIsolatedSia({ testRoot });
    page = sia.page;
    await openPhoneRemote(page);
    await expect(page.getByRole('list', { name: 'Your numbers' })).toContainText(
      '+15551234567',
    );
    await expect(page.getByRole('list', { name: 'Trusted people list' })).toContainText('Alex');
    await expect(page.getByRole('checkbox', { name: 'Pause connections' })).toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Approve steps by replying YES or NO' }),
    ).not.toBeChecked();

    await page.getByRole('button', { name: 'Remove Alex' }).click();
    await page.getByRole('button', { name: 'Remove +15551234567' }).click();
    await expect(page.getByRole('list', { name: 'Your numbers' })).not.toContainText('+1555');
    await expect(page.getByRole('list', { name: 'Trusted people list' })).not.toContainText(
      'Alex',
    );
  } finally {
    await sia.close();
  }
});
