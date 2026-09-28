import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { discoverCodexInstallation } from './codex-installation.js';

it('prefers the newest admitted installation and excludes future, broken and missing binaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sia-codex-discovery-'));
  const names = ['codex', 'bundled', 'future', 'broken', 'desktop', 'managed'];
  try {
    for (const name of names) {
      await writeFile(join(root, name), '');
      await chmod(join(root, name), 0o700);
    }
    const versions: Record<string, string> = {
      codex: '0.154.0',
      desktop: '0.155.0-alpha.9.2',
      managed: '0.153.0',
      bundled: '0.155.0-alpha.9',
      future: '0.155.0-alpha.10',
    };
    const options = {
      environment: { PATH: root },
      bundledCommands: names
        .slice(1)
        .map((name) => join(root, name))
        .concat(join(root, 'missing')),
      version: async (path: string) => {
        const name = names.find((name) => path === join(root, name))!;
        if (!versions[name]) throw new Error('Broken executable');
        return `codex-cli ${versions[name]}`;
      },
    };
    expect(await discoverCodexInstallation(options)).toBe(join(root, 'desktop'));
    await rm(join(root, 'desktop'));
    expect(await discoverCodexInstallation(options)).toBe(join(root, 'bundled'));
    await rm(join(root, 'bundled'));
    expect(
      await discoverCodexInstallation({
        ...options,
        bundledCommands: [],
        managedCommand: join(root, 'managed'),
      }),
    ).toBe(join(root, 'managed'));
    await rm(join(root, 'managed'));
    expect(await discoverCodexInstallation(options)).toBe(join(root, 'codex'));
    expect(
      await discoverCodexInstallation({ environment: { PATH: '' }, bundledCommands: [] }),
    ).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
