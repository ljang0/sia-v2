import { expect, test } from '@playwright/test';

import { launchIsolatedSia } from '../support/electron-harness.js';

const realCodex = process.env.SIA_REAL_CODEX_E2E === '1' ? test : test.skip;
const realBrowserAttach = process.env.SIA_REAL_BROWSER_ATTACH_E2E === '1' ? test : test.skip;
const realCua = process.env.SIA_REAL_CUA_E2E === '1' ? test : test.skip;

test.describe.configure({ timeout: 120_000 });

realCodex('real Codex probe is authenticated without starting a model turn', async () => {
  const harness = await launchIsolatedSia({
    fakeServices: false,
    prefix: 'sia-real-codex-no-turn-',
  });
  try {
    const snapshot = await harness.page.evaluate(
      async () => await window.sia.providers.probe('codex'),
    );
    const codex = snapshot.providers.find(({ id }) => id === 'codex');
    expect(codex).toMatchObject({ id: 'codex', status: 'ready' });
    expect(codex?.account).toBeTruthy();
    expect(snapshot.threads).toHaveLength(0);
    expect(snapshot.timeline).toHaveLength(0);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});

realBrowserAttach(
  'real Chrome picker attaches one selected window and exposes only HTTP(S) origins',
  async () => {
    const harness = await launchIsolatedSia({
      fakeServices: false,
      prefix: 'sia-real-browser-no-turn-',
    });
    try {
      let snapshot = await harness.page.evaluate(async () => await window.sia.browser.attach());
      const windowMatch = process.env.SIA_REAL_BROWSER_WINDOW_MATCH?.trim().toLowerCase();
      if (
        snapshot.browser.status !== 'attached' &&
        windowMatch &&
        snapshot.browser.availableWindows?.length
      ) {
        const matches = snapshot.browser.availableWindows.filter((window) =>
          `${window.label} ${window.detail ?? ''}`.toLowerCase().includes(windowMatch),
        );
        expect(
          matches,
          `Expected one Chrome window matching ${JSON.stringify(windowMatch)}. Available: ${JSON.stringify(snapshot.browser.availableWindows)}`,
        ).toHaveLength(1);
        const selected = matches[0]!;
        await harness.page.getByRole('button', { name: 'Settings' }).click();
        await harness.page.getByRole('button', { name: 'Computer' }).click();
        await harness.page
          .getByRole('button', {
            name: `Use ${selected.label}${selected.detail ? `: ${selected.detail}` : ''}`,
          })
          .click();
        await expect
          .poll(
            async () => {
              const current = await harness.page.evaluate(
                async () => await window.sia.bootstrap(),
              );
              return current.browser.status;
            },
            { timeout: 60_000 },
          )
          .toBe('attached');
        snapshot = await harness.page.evaluate(async () => await window.sia.bootstrap());
      }
      test.skip(
        snapshot.browser.status !== 'attached',
        snapshot.browser.detail ??
          'Choose a Chrome window or set SIA_REAL_BROWSER_WINDOW_MATCH for this test.',
      );
      expect(snapshot.browser.status, snapshot.browser.detail).toBe('attached');
      if (snapshot.browser.grantedOrigins.length === 0) {
        expect(snapshot.browser.detail).toMatch(/no HTTP or HTTPS tab/i);
      }
      for (const origin of snapshot.browser.grantedOrigins) {
        expect(new URL(origin).protocol).toMatch(/^https?:$/);
      }
      expect(snapshot.threads).toHaveLength(0);
      expect(snapshot.timeline).toHaveLength(0);
      expect(harness.rendererErrors).toEqual([]);
    } finally {
      await harness.page
        .evaluate(async () => await window.sia.browser.detach())
        .catch(() => undefined);
      await harness.close();
    }
  },
);

realCua('real CUA reports macOS permissions without starting a model turn', async () => {
  test.skip(process.platform !== 'darwin', 'The real CUA smoke is macOS-specific.');
  const harness = await launchIsolatedSia({
    fakeServices: false,
    prefix: 'sia-real-cua-no-turn-',
  });
  try {
    const snapshot = await harness.page.evaluate(
      async () => await window.sia.computer.permissions(),
    );
    expect(snapshot.computer).toMatchObject({
      status: 'ready',
      accessibility: true,
      screenRecording: true,
    });
    expect(snapshot.threads).toHaveLength(0);
    expect(snapshot.timeline).toHaveLength(0);
    expect(harness.rendererErrors).toEqual([]);
  } finally {
    await harness.close();
  }
});
