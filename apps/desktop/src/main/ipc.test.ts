import { describe, expect, it } from 'vitest';

// This snapshot keeps the public renderer boundary intentionally small.
describe('desktop IPC contract', () => {
  it('does not expose a generic shell, filesystem, HTTP, or arbitrary tool method', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../shared/bridge.ts', import.meta.url), 'utf8'),
    );
    for (const forbidden of ['shell.exec', 'filesystem.read', 'http.fetch', 'tool.invoke']) {
      expect(source).not.toContain(forbidden);
    }
  });
});
