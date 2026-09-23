import { describe, expect, it } from 'vitest';
import { CodexAppServerAdapter } from './providers/codex.js';

const realSmoke = process.env.SIA_CODEX_REAL_SMOKE === '1' ? it : it.skip;

describe('Codex isolation smoke', () => {
  realSmoke.each([undefined, 'disabled', 'mac', 'mac-background'] as const)(
    'retains ChatGPT auth while creating a verified ephemeral session (native tools: %s)',
    async (nativeTools) => {
      const candidate = process.env.SIA_CODEX_CANDIDATE_COMMAND;
      const adapter = new CodexAppServerAdapter({
        sessionEphemeral: true,
        ...(candidate
          ? {
              command: candidate,
              supportedVersions: { minimum: '0.155.0', maximumExclusive: '0.156.0' },
            }
          : {}),
      });
      try {
        const probe = await adapter.probe();
        expect(probe).toMatchObject({
          available: true,
          supported: true,
        });
        if (candidate) expect(probe.version).toBe('0.155.0-alpha.9');
        else
          expect(probe.version).toMatch(
            /^0\.(?:147|148|149|150|151|152|153)\.\d+$|^0\.155\.0-alpha\.9$/,
          );
        expect(await adapter.account()).toMatchObject({
          state: 'authenticated',
          billing: 'subscription',
        });
        const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-5.6-terra';
        if (candidate) {
          expect(
            (await adapter.listModels()).some((entry) => entry.id === model),
            `Candidate must offer ${model}`,
          ).toBe(true);
          console.info(
            `Candidate ${probe.version}: ${model} offered; testing ${nativeTools ?? 'connected'} session isolation.`,
          );
        }
        const session = await adapter.createSession({
          threadId: 'codex-isolation-smoke',
          model,
          workspace: process.cwd(),
          instructions: 'Isolation smoke only. Do not start a turn.',
          tools: [],
          ...(nativeTools ? { nativeTools } : {}),
          ...(nativeTools === 'mac' || nativeTools === 'mac-background'
            ? {
                nativeApproval: 'auto' as const,
                baseInstructions: 'You are Sia. This is a no-turn configuration test.',
              }
            : {}),
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
