import { expect, test } from '@playwright/test';

import { createAgentAndThread, launchIsolatedSia } from '../support/electron-harness.js';

const realCapabilityTurn = process.env.SIA_REAL_CAPABILITY_TURN_E2E === '1' ? test : test.skip;

test.describe.configure({ timeout: 180_000 });

realCapabilityTurn(
  'real Codex can inspect the attached browser grant and computer inventory without acting',
  async () => {
    const windowMatch = process.env.SIA_REAL_BROWSER_WINDOW_MATCH?.trim().toLowerCase();
    test.skip(!windowMatch, 'Set SIA_REAL_BROWSER_WINDOW_MATCH to one intended Chrome window.');
    const harness = await launchIsolatedSia({
      fakeServices: false,
      prefix: 'sia-real-capability-turn-',
    });
    let originalOrigin: string | undefined;
    try {
      const probed = await harness.page.evaluate(
        async () => await window.sia.providers.probe('codex'),
      );
      expect(probed.providers.find(({ id }) => id === 'codex')).toMatchObject({
        status: 'ready',
      });

      let snapshot = await harness.page.evaluate(async () => await window.sia.browser.attach());
      if (snapshot.browser.status !== 'attached') {
        const matches = (snapshot.browser.availableWindows ?? []).filter((window) =>
          `${window.label} ${window.detail ?? ''}`.toLowerCase().includes(windowMatch!),
        );
        expect(
          matches,
          `Expected one intended Chrome window matching ${JSON.stringify(windowMatch)}.`,
        ).toHaveLength(1);
        snapshot = await harness.page.evaluate(
          async ({ windowId }) => await window.sia.browser.attach(windowId),
          { windowId: matches[0]!.id },
        );
      }
      expect(snapshot.browser.status, snapshot.browser.detail).toBe('attached');
      originalOrigin = snapshot.browser.grantedOrigins[0];
      if (!snapshot.browser.grantedOrigins.includes('https://mail.google.com')) {
        snapshot = await harness.page.evaluate(
          async () => await window.sia.browser.open('https://mail.google.com/'),
        );
      }
      expect(snapshot.browser.grantedOrigins).not.toHaveLength(0);

      const { threadId } = await createAgentAndThread(harness.page, {
        name: 'Capability verifier',
        instructions:
          'Follow the verification request exactly. Never inspect page content or perform an action.',
      });
      await harness.page.evaluate(
        async ({ activeThreadId }) =>
          await window.sia.threads.send({
            threadId: activeThreadId,
            text: [
              'Verification only: call browser_tabs exactly once and computer_list exactly once.',
              'Do not call browser_snapshot or any other tool. Do not navigate, click, type, upload, download, or modify anything.',
              'Reply briefly with the granted browser origin and whether the safe computer inventory call completed.',
            ].join(' '),
          }),
        { activeThreadId: threadId },
      );

      let result:
        | {
            status: string;
            tools: string[];
            assistant: string[];
            errors: string[];
          }
        | undefined;
      await expect
        .poll(
          async () => {
            result = await harness.page.evaluate(
              async ({ activeThreadId }) => {
                const current = await window.sia.bootstrap();
                const thread = current.threads.find(({ id }) => id === activeThreadId);
                const timeline = current.timeline.filter(
                  ({ threadId: itemThreadId }) => itemThreadId === activeThreadId,
                );
                return {
                  status: thread?.status ?? 'missing',
                  tools: timeline.flatMap((item) =>
                    item.kind === 'activity' && item.toolName ? [item.toolName] : [],
                  ),
                  assistant: timeline.flatMap((item) =>
                    item.kind === 'assistant' && item.text ? [item.text] : [],
                  ),
                  errors: timeline.flatMap((item) =>
                    item.kind === 'error' && item.text ? [item.text] : [],
                  ),
                };
              },
              { activeThreadId: threadId },
            );
            return result.status === 'idle' || result.status === 'failed';
          },
          { timeout: 150_000 },
        )
        .toBe(true);

      expect(result?.errors).toEqual([]);
      expect(result?.tools).toEqual(expect.arrayContaining(['browser_tabs', 'computer_list']));
      expect(result?.assistant.join(' ')).toMatch(/mail\.google\.com/i);
      expect(result?.assistant.join(' ')).toMatch(/computer|inventory/i);
      expect(harness.rendererErrors).toEqual([]);
    } finally {
      if (originalOrigin && originalOrigin !== 'https://mail.google.com') {
        await harness.page
          .evaluate(async ({ url }) => await window.sia.browser.open(url), {
            url: originalOrigin,
          })
          .catch(() => undefined);
      }
      await harness.page
        .evaluate(async () => await window.sia.browser.detach())
        .catch(() => undefined);
      await harness.close();
    }
  },
);
