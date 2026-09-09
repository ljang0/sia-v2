import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runExecutableSkill } from './executable-skills.js';

describe.skipIf(process.platform !== 'darwin')('executable skill sandbox', () => {
  it('runs real Bash and round-trips brokered action results without evaluating input', async () => {
    const invoke = vi.fn(async () => ({
      outcome: 'verified' as const,
      summary: 'Listed apps.',
      data: { apps: ['Notes'] },
    }));
    const result = await runExecutableSkill({
      source: `printf '%s\\n' "$SIA_INPUT" >&2\nsia_action computer_list '{}'\nprintf '%s\\n' "$SIA_RESULT" >&2`,
      input: { topic: '$(touch /tmp/should-not-run)' },
      invoke,
    });
    expect(result.outcome, JSON.stringify(result)).toBe('verified');
    expect(invoke).toHaveBeenCalledWith('computer_list', {}, expect.any(AbortSignal));
    expect(JSON.stringify(result.data)).toContain('Notes');
    expect(JSON.stringify(result.data)).toContain('$(touch');
  });
  it('cannot read an ungranted file or inherited provider credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sia-skill-secret-test-'));
    try {
      const path = join(directory, 'secret');
      await writeFile(path, 'DO_NOT_EXPOSE');
      const result = await runExecutableSkill({
        source: `/bin/cat '${path}'`,
        input: {},
        invoke: vi.fn(),
      });
      expect(result.outcome).toBe('refused');
      expect(JSON.stringify(result)).not.toContain('DO_NOT_EXPOSE');
      const env = await runExecutableSkill({
        source: '/usr/bin/env',
        input: {},
        invoke: vi.fn(),
      });
      expect(JSON.stringify(env)).not.toMatch(
        /OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|CODEX_HOME/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('refuses nested skills and stops after an uncertain write without replaying it', async () => {
    const invoke = vi.fn(async () => ({
      outcome: 'accepted_unverified' as const,
      summary: 'Delivered.',
    }));
    const result = await runExecutableSkill({
      source: `sia_action computer_action '{}'\nsia_action computer_action '{}'`,
      input: {},
      invoke,
    });
    expect(result.outcome).toBe('refused');
    expect(result.summary).toContain('accepted_unverified');
    expect(invoke).toHaveBeenCalledTimes(1);
    const nested = await runExecutableSkill({
      source: `sia_action skill_run '{}'`,
      input: {},
      invoke,
    });
    expect(nested.summary).toContain('recursive');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('kills runaway processes and aborts outstanding action approval on timeout', async () => {
    const spin = await runExecutableSkill({
      source: 'while true; do :; done',
      input: {},
      invoke: vi.fn(),
      timeoutMs: 200,
    });
    expect(spin.summary).toContain('timed out');
    let signal: AbortSignal | undefined;
    const pending = await runExecutableSkill({
      source: `sia_action computer_list '{}'`,
      input: {},
      timeoutMs: 400,
      invoke: async (_name, _args, nextSignal) => {
        signal = nextSignal;
        return new Promise((resolve) =>
          nextSignal.addEventListener(
            'abort',
            () => resolve({ outcome: 'refused', summary: 'Cancelled.' }),
            { once: true },
          ),
        );
      },
    });
    expect(pending.outcome).toBe('refused');
    expect(signal?.aborted).toBe(true);
  });
});

it.skipIf(process.platform !== 'darwin')(
  'supports JSON extraction with system utilities and catches synchronous capability revocation',
  async () => {
    const result = await runExecutableSkill({
      source: `/usr/bin/plutil -extract topic raw -o - - <<< "$SIA_INPUT"`,
      input: { topic: 'A useful routine' },
      invoke: vi.fn(),
    });
    expect(result.outcome, JSON.stringify(result)).toBe('verified');
    expect(JSON.stringify(result.data)).toContain('A useful routine');
    const revoked = await runExecutableSkill({
      source: `sia_action computer_list '{}'`,
      input: {},
      invoke: () => {
        throw new Error('Revoked');
      },
    });
    expect(revoked.outcome).toBe('refused');
    expect(revoked.summary).toContain('Skill action failed');
  },
);

it.skipIf(process.platform !== 'darwin')(
  'denies network connections even to a disposable local server',
  async () => {
    const { createServer } = await import('node:http');
    let connections = 0;
    const server = createServer((_request, response) => {
      connections++;
      response.end('unreachable');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Test server missing address');
      const result = await runExecutableSkill({
        source: `/usr/bin/curl --noproxy '*' --max-time 1 -s http://127.0.0.1:${address.port}`,
        input: {},
        invoke: vi.fn(),
      });
      expect(result.outcome).toBe('refused');
      expect(connections).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
