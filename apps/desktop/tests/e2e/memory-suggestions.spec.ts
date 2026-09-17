import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchIsolatedSia } from '../support/electron-harness';
import { AssistantLibrary } from '../../src/main/assistant-library';
import type { RecordRepository } from '../../src/main/persistence';

test('reviews exact memory changes and executable source before accepting', async () => {
  const sia = await launchIsolatedSia({ prefix: 'sia-suggestions-' });
  try {
    const page = sia.page;
    // This scenario reviews structured suggestions, not the automatic native memory vault.
    await page.getByRole('radio', { name: /Connected apps \+ confirmations/ }).check();
    await page.getByRole('button', { name: 'Set up Sia', exact: true }).click();
    await page.getByRole('button', { name: 'Create my agent' }).click();
    await page.getByRole('button', { name: 'Exit setup' }).click();
    const agentId = (await page.evaluate(() => window.sia.bootstrap())).agents[0]!.id;
    // Seed only this disposable plaintext fixture; use the real proposal validation path.
    const db = new DatabaseSync(join(sia.userData, 'sia.sqlite'));
    const repository = {
      get: (scope: string, id: string) => {
        const row = db
          .prepare('SELECT payload FROM records WHERE scope = ? AND id = ?')
          .get(scope, id);
        return row ? JSON.parse(Buffer.from(row.payload as Uint8Array).toString()) : undefined;
      },
      put: (scope: string, id: string, value: unknown) => {
        db.prepare(
          'INSERT OR REPLACE INTO records (scope,id,payload,updated_at) VALUES (?,?,?,?)',
        ).run(scope, id, Buffer.from(JSON.stringify(value)), Date.now());
      },
    } as unknown as RecordRepository;
    const library = new AssistantLibrary(repository);
    library.change({ operation: 'learning', agentId, enabled: true }, () => undefined);
    for (const text of ['Keep status updates short.', 'Prefer brief task summaries.'])
      library.change(
        {
          operation: 'saveMemory',
          entry: { agentId, title: 'Writing style', text, enabled: true },
        },
        () => undefined,
      );
    for (let i = 0; i < 2; i++) {
      const turnId = randomUUID();
      library.record({
        agentId,
        threadId: randomUUID(),
        turnId,
        kind: 'task',
        title: 'Task finished',
        text: 'complete',
      });
    }
    const evidence_ids = library.view().journal!.map((item) => item.id);
    library.suggest(agentId, {
      kind: 'merge',
      title: 'Concise progress reports',
      reason: 'Both preferences describe the same writing style.',
      memory_ids: library.view().memories.map((item) => item.id),
      evidence_ids,
      text: 'Keep task updates and summaries concise.',
      description: '',
      source: '',
    });
    library.suggest(agentId, {
      kind: 'skill',
      title: 'Inspect available apps',
      reason: 'A reusable first step for repeated app tasks.',
      memory_ids: [],
      evidence_ids,
      text: '',
      description: 'List apps before choosing a target.',
      source: "sia_action computer_list '{}'",
    });
    db.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Assistant', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Assistant sections' })
      .getByRole('button', { name: /^Suggestions/ })
      .click();
    await expect(
      page.getByRole('checkbox', { name: /Review memory in the background/ }),
    ).not.toBeChecked();
    await page.getByText('Evidence from 2 completed tasks').first().click();
    await page
      .getByRole('button', { name: 'Accept change', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/memory-suggestions.png',
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Accept change', exact: true }).click();
    const merged = await page.evaluate(() =>
      window.sia.assistantLibrary({ operation: 'list' }),
    );
    expect(merged.memories.map((item) => item.text)).toEqual([
      'Keep task updates and summaries concise.',
    ]);
    await expect(
      page.getByText("sia_action computer_list '{}'", { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Accept and save skill' }).click();
    const saved = await page.evaluate(() => window.sia.assistantLibrary({ operation: 'list' }));
    expect(saved.skills).toHaveLength(1);
    expect(saved.suggestions).toEqual([]);
    expect(
      (await page.evaluate(() => window.sia.bootstrap())).timeline.filter(
        (item) => item.kind === 'user',
      ),
    ).toEqual([]);
    expect(sia.rendererErrors).toEqual([]);
  } finally {
    await sia.close();
  }
});
