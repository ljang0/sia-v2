import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { macProviderPath } from './provider-path.js';

describe('macProviderPath', () => {
  it('adds common shell-independent and version-manager CLI locations', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sia-provider-path-'));
    const nvm20 = join(home, '.nvm/versions/node/v20.19.0/bin');
    const nvm24 = join(home, '.nvm/versions/node/v24.11.1/bin');
    const fnm22 = join(home, '.local/share/fnm/node-versions/v22.18.0/installation/bin');
    await Promise.all([
      mkdir(nvm20, { recursive: true }),
      mkdir(nvm24, { recursive: true }),
      mkdir(fnm22, { recursive: true }),
    ]);

    try {
      const entries = (await macProviderPath(home, `/custom/bin${delimiter}/usr/bin`)).split(
        delimiter,
      );

      expect(entries).toContain(join(home, '.volta/bin'));
      expect(entries).toContain(join(home, '.asdf/shims'));
      expect(entries).toContain(join(home, '.local/share/mise/shims'));
      expect(entries).toContain(nvm20);
      expect(entries).toContain(nvm24);
      expect(entries).toContain(fnm22);
      expect(entries.indexOf(nvm24)).toBeLessThan(entries.indexOf(nvm20));
      expect(entries.slice(-2)).toEqual(['/custom/bin', '/usr/bin']);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('ignores missing version-manager roots and deduplicates inherited paths', async () => {
    const home = await mkdtemp(join(tmpdir(), 'sia-provider-path-empty-'));

    try {
      const entries = (await macProviderPath(home, '/usr/local/bin:/usr/local/bin')).split(
        delimiter,
      );
      expect(entries.filter((entry) => entry === '/usr/local/bin')).toHaveLength(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
