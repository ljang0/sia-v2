import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';

test('background skills use gateway execution and native titles survive restart', async () => {
  let sia = await launchIsolatedSia({ prefix: 'sia-skill-modes-' });
  const testRoot = sia.testRoot;
  try {
    let page = sia.page;
    page = await sia.completeSetup();
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Skills/ })
      .click();
    await page.getByRole('button', { name: 'New skill', exact: true }).click();
    await page.getByLabel('Skill name', { exact: true }).fill('Inspect Finder');
    await page
      .getByLabel('When to use it', { exact: true })
      .fill('Read the visible Finder folder.');
    await page.getByRole('button', { name: 'Save skill', exact: true }).click();
    const native = page.getByRole('article').filter({ hasText: 'Inspect Finder' });
    await expect(native.getByRole('button', { name: 'Run skill' })).toBeEnabled();

    await page.evaluate(() => window.sia.computer.setAccessMode('mac', true, 'pause'));
    await expect(native.getByRole('button', { name: 'Run skill' })).toBeDisabled();
    await page.getByRole('button', { name: 'New skill', exact: true }).click();
    await expect(page.getByLabel('Bash source')).toHaveValue(/sia_action/);
    await page.getByLabel('Skill name', { exact: true }).fill('List background apps');
    await page.getByLabel('When to use it', { exact: true }).fill('Find available apps.');
    await page.getByRole('button', { name: 'Save skill', exact: true }).click();
    const gateway = page.getByRole('article').filter({ hasText: 'List background apps' });
    await expect(gateway.getByRole('button', { name: 'Run skill' })).toBeEnabled();
    const denied = await page.evaluate(async () => {
      const library = await window.sia.assistantLibrary({ operation: 'list' });
      const skill = library.skills!.find((entry) => entry.execution === 'native')!;
      try {
        await window.sia.assistantLibrary({ operation: 'runSkill', id: skill.id, input: {} });
        return '';
      } catch (error) {
        return String(error);
      }
    });
    expect(denied).toContain('On my screen');
    await gateway.getByRole('button', { name: 'Run skill' }).click();
    await page.getByRole('button', { name: 'Review run in a new conversation' }).click();
    await expect(
      page.getByText(/This development turn used the deterministic local runtime/),
    ).toBeVisible();
    expect(sia.rendererErrors).toEqual([]);
    await sia.close({ removeTestRoot: false });
    sia = await launchIsolatedSia({ testRoot });
    const restored = await sia.page.evaluate(async () => ({
      snapshot: await window.sia.bootstrap(),
      library: await window.sia.assistantLibrary({ operation: 'list' }),
    }));
    expect(restored.snapshot.computer).toMatchObject({
      accessMode: 'mac',
      backgroundControl: true,
    });
    expect(restored.library.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Inspect Finder', execution: 'native' }),
        expect.objectContaining({ title: 'List background apps', execution: 'gateway' }),
      ]),
    );
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('personal library saves memory, edits workflow parameters and runs through a real conversation', async () => {
  test.slow();
  const sia = await launchIsolatedSia({ prefix: 'sia-assistant-library-' });
  try {
    let page = sia.page;
    await page.setViewportSize({ width: 1220, height: 780 });
    await page.getByText('Customize setup', { exact: true }).click();
    await page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    page = await sia.completeSetup();
    // This fixture exercises gateway tools and confirmation-mode behavior.
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible();
    const context = page.getByRole('checkbox', { name: /Use context when I hold Fn/ });
    await expect(context).not.toBeChecked();
    await context.check();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    await page.getByRole('button', { name: 'Add memory', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Writing style');
    await page
      .getByLabel('What should Sia remember?')
      .fill('Keep updates to three short paragraphs.');
    await page.getByRole('button', { name: 'Save memory' }).click();
    await expect(page.getByText('Used for new requests')).toBeVisible();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Workflows/ })
      .click();
    await page.getByRole('button', { name: 'Use morning briefing template' }).click();
    await page.getByLabel('Input names, separated by commas').fill('focus, timeframe');
    await page
      .getByLabel('Step 1', { exact: true })
      .fill('Find information about {{focus}} from {{timeframe}}.');
    await page.getByRole('button', { name: 'Save workflow' }).click();
    await expect(page.getByText('2 steps · 2 inputs')).toBeVisible();
    await page.screenshot({
      path: 'test-results/assistant-library.png',
      animations: 'disabled',
    });
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await expect(context).toBeChecked();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    await expect(page.getByText('Writing style', { exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Workflows/ })
      .click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByLabel('focus', { exact: true }).fill('design');
    await page.getByLabel('timeframe', { exact: true }).fill('this week');
    await page.getByRole('button', { name: 'Start in a new conversation' }).click();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(
      page.getByText(/This development turn used the deterministic local runtime/),
    ).toBeVisible();
    const state = await page.evaluate(() => window.sia.bootstrap());
    expect(state.computer.trust).toBe('ask');
    expect(
      state.timeline.some(
        (item) => item.kind === 'user' && item.text?.includes('"timeframe":"this week"'),
      ),
    ).toBe(true);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});

test('automatic learning and executable skills persist and dispatch through the owning agent', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-executable-skills-' });
  try {
    let page = sia.page;
    await page.getByText('Customize setup', { exact: true }).click();
    await page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    page = await sia.completeSetup();
    // This fixture exercises gateway tools and confirmation-mode behavior.
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    const learning = page.getByRole('checkbox', { name: /Learn from completed tasks/ });
    await expect(learning).not.toBeChecked();
    await learning.check();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Skills/ })
      .click();
    await page.getByRole('button', { name: 'New skill', exact: true }).click();
    await page.getByLabel('Skill name', { exact: true }).fill('List my apps');
    await page
      .getByLabel('When to use it', { exact: true })
      .fill('Find available apps before a task.');
    await page.getByRole('button', { name: 'Save skill', exact: true }).click();
    await expect(page.getByText('List my apps', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    await expect(learning).toBeChecked();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Skills/ })
      .click();
    await page.getByRole('button', { name: 'Run skill', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/executable-skills.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Run skill', exact: true }).click();
    await page.getByLabel('Input JSON', { exact: true }).fill('{"topic":"Notes"}');
    await page.getByRole('button', { name: 'Review run in a new conversation' }).click();
    await expect(
      page.getByText(/This development turn used the deterministic local runtime/),
    ).toBeVisible();
    const state = await page.evaluate(() => window.sia.bootstrap());
    expect(
      state.timeline.some(
        (entry) =>
          entry.kind === 'user' &&
          entry.text?.includes('Run my saved skill') &&
          entry.text?.includes('Notes'),
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'More settings' }).click();
    await page.getByRole('menuitem', { name: 'Assistant', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Memory/ })
      .click();
    await expect(page.getByText('Task journal (1)', { exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Skills/ })
      .click();
    await page.getByRole('button', { name: 'Delete skill', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(
      page.getByRole('article').filter({ hasText: 'Find available apps before a task.' }),
    ).toHaveCount(0);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
