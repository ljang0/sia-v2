import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { configureMetaCloudAvailability, probeProviders } from './provider-probe.js';

describe('probeProviders', () => {
  it('keeps provider policy visible when binaries are absent', async () => {
    const providers = await probeProviders(undefined, { PATH: '' });

    expect(providers.find(({ id }) => id === 'codex')?.status).toBe('needs_install');
    expect(providers.find(({ id }) => id === 'grok')).toMatchObject({
      status: 'disabled',
      detail: expect.stringContaining('protocol testing'),
      restriction: expect.stringContaining('inherited plugins, skills, and MCP'),
    });
    expect(providers.find(({ id }) => id === 'claude')?.status).toBe('disabled');
    expect(providers.find(({ id }) => id === 'gemini')?.restriction).toContain(
      'standard ACP model configuration',
    );
    expect(providers.find(({ id }) => id === 'meta')).toMatchObject({
      status: 'unavailable',
      detail: 'Meta requires a release build configured for Sia cloud.',
      billing: 'Included for invited Sia alpha accounts; shared preview limits apply.',
    });
  });

  it('uses the validated cloud-configuration result instead of a mutable environment URL', async () => {
    configureMetaCloudAvailability(false);

    const [meta] = await probeProviders('meta', {
      SIA_API_BASE_URL: 'https://attacker.example',
    });

    expect(meta?.status).toBe('unavailable');
  });

  it('pins Codex compatibility, checks auth, and passes only the minimal safe environment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-provider-probe-'));
    const executable = join(directory, 'codex');
    await writeFile(executable, '');
    await chmod(executable, 0o700);
    const run = vi.fn(
      async (_executable: string, args: readonly string[], environment: NodeJS.ProcessEnv) => ({
        code: 0,
        stdout: args[0] === '--version' ? 'codex-cli 0.147.0' : 'Logged in using ChatGPT',
        stderr: '',
        environment,
      }),
    );
    try {
      const [codex] = await probeProviders(
        'codex',
        {
          PATH: directory,
          HOME: '/Users/person',
          CODEX_HOME: '/Users/person/.codex',
          DATABASE_URL: 'postgres://private',
          API_TOKEN: 'private-token',
        },
        { run },
      );
      expect(codex).toMatchObject({
        status: 'ready',
        version: '0.147.0',
        account: 'Authenticated with ChatGPT',
      });
      expect(run).toHaveBeenCalledTimes(2);
      for (const call of run.mock.calls) {
        expect(call[2]).toEqual({
          PATH: directory,
          HOME: '/Users/person',
          CODEX_HOME: '/Users/person/.codex',
        });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed for unsupported Codex and unpinned Gemini releases', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-provider-compat-'));
    await Promise.all(
      ['codex', 'gemini'].map(async (name) => {
        const executable = join(directory, name);
        await writeFile(executable, '');
        await chmod(executable, 0o700);
      }),
    );
    const runner = {
      run: vi.fn(async (executable: string) => ({
        code: 0,
        stdout: executable.endsWith('codex') ? 'codex-cli 0.149.0' : 'gemini 1.2.3',
        stderr: '',
      })),
    };
    try {
      const [codex] = await probeProviders('codex', { PATH: directory }, runner);
      const [gemini] = await probeProviders('gemini', { PATH: directory }, runner);
      expect(codex).toMatchObject({ status: 'incompatible', version: '0.149.0' });
      expect(gemini).toMatchObject({
        status: 'incompatible',
        detail: expect.stringContaining('standard ACP'),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not infer Codex authentication from an unrecognized API-key message', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-provider-auth-'));
    const executable = join(directory, 'codex');
    await writeFile(executable, '');
    await chmod(executable, 0o700);
    const runner = {
      run: vi.fn(async (_executable: string, args: readonly string[]) => ({
        code: 0,
        stdout:
          args[0] === '--version'
            ? 'codex-cli 0.147.0'
            : 'API key not found; authentication is required.',
        stderr: '',
      })),
    };
    try {
      const [codex] = await probeProviders('codex', { PATH: directory }, runner);
      expect(codex).toMatchObject({ status: 'needs_login', version: '0.147.0' });
      expect(codex?.account).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
