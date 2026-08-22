import { describe, expect, it } from 'vitest';
import { CodexAppServerAdapter } from './providers/codex.js';

const realSmoke = process.env.SIA_CODEX_REAL_SMOKE === '1' ? it : it.skip;

describe('Codex isolation smoke', () => {
  realSmoke(
    'retains ChatGPT auth while creating a verified ephemeral session',
    async () => {
      const adapter = new CodexAppServerAdapter({ sessionEphemeral: true });
      try {
        const probe = await adapter.probe();
        expect(probe).toMatchObject({
          available: true,
          supported: true,
        });
        expect(probe.version).toMatch(/^0\.(?:147|148)\.\d+$/);
        expect(await adapter.account()).toMatchObject({
          state: 'authenticated',
          billing: 'subscription',
        });
        const session = await adapter.createSession({
          threadId: 'codex-isolation-smoke',
          model: 'gpt-5.6-terra',
          workspace: process.cwd(),
          instructions: 'Isolation smoke only. Do not start a turn.',
          tools: [],
        });
        expect(session).toMatchObject({
          id: 'codex-isolation-smoke',
          provider: 'codex',
          threadId: 'codex-isolation-smoke',
        });
        expect(session.nativeId.length).toBeGreaterThan(0);
      } finally {
        await adapter.dispose();
      }
    },
    120_000,
  );
});
