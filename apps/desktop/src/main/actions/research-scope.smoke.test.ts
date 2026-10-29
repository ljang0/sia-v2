import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import { RuntimeCoordinator } from '../providers/runtime-coordinator.js';
import { discoverCodexInstallation } from '../providers/codex-installation.js';
import type { MacTaskResult } from './mac-execution.js';

// Real model, fictional public resources. No OS input, network or real accounts.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_RESEARCH_SCOPE_SMOKE === '1'
    ? it
    : it.skip;
const cases = [
  { scope: 'one verified option', compare: false, hours: true, complete: true },
  { scope: 'two explicitly named places', compare: true, hours: true, complete: false },
  {
    scope: 'required opening hours unavailable',
    compare: false,
    hours: false,
    complete: false,
  },
];
live.each(cases)(
  'respects the requested research scope: $scope',
  async ({ compare, hours, complete }) => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-research-scope-'));
    const origin = 'https://city.example';
    let page = 'center';
    let revision = 0;
    let calls = 0;
    let observed = false;
    const observe = () => {
      if (page === 'county')
        return {
          outcome: 'refused' as const,
          summary: 'This county resource is protected. No contents read or input granted.',
          data: { blocker_code: 'protected_window' },
        };
      observed = true;
      return {
        outcome: 'verified' as const,
        summary: 'Observed official current public program information.',
        data: {
          app_id: 'app:fixture',
          window_id: 'window:fixture',
          snapshot_id: `state:${++revision}`,
          source_url: origin + '/alpha-center',
          pixel_actions_available: false,
          visible_text: `Alpha Center, 10 Campus Way, next to Example University. Free public household battery recycling. Accepts alkaline AA/AAA/C/D/9V and small undamaged rechargeable batteries; no car batteries or swollen batteries. ${hours ? 'Open daily10am-4pm.' : 'Opening hours are not published; an opening time cannot be verified.'} This official current program page is complete. A separate county program directory may list additional centers; its Beta Center entry is unavailable because that source is protected. No other information about Beta Center is known.`,
          elements: [
            { role: 'AXLink', label: 'County directory / Beta Center', element_ref: 'county' },
          ],
        },
      };
    };
    const gateway = new ActionGateway({
      policy: { evaluate: () => ({ decision: 'allow' }) },
      backend: {
        async invoke(request) {
          if (++calls > 25) throw new Error('Fictional research budget exceeded.');
          if (['memory_vault', 'assistant_library'].includes(request.name))
            return { outcome: 'verified', summary: 'No saved notes.' };
          if (request.name === 'computer_list')
            return {
              outcome: 'verified',
              summary: 'One fictional Safari window.',
              data: {
                apps: [{ app_id: 'app:fixture', name: 'Safari', active: false }],
                windows: [
                  {
                    app_id: 'app:fixture',
                    window_id: 'window:fixture',
                    title: 'Alpha Center battery recycling',
                    source_url: origin + '/alpha-center',
                  },
                ],
              },
            };
          if (request.name === 'computer_snapshot') return observe();
          if (
            request.name === 'computer_action' &&
            request.arguments.action === 'click' &&
            request.arguments.element_ref === 'county'
          ) {
            page = 'county';
            return observe();
          }
          return {
            outcome: 'refused',
            summary:
              'No other apps, source facts, account actions or host commands exist in this fictional fixture.',
          };
        },
      },
    });
    const codexCommand = await discoverCodexInstallation();
    const runtime = new RuntimeCoordinator(gateway, codexCommand ? { codexCommand } : {});
    let result: MacTaskResult | undefined;
    try {
      const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-6-astra';
      const offered = (await runtime.listModels('codex')).find((x) => x.id === model);
      expect(offered).toBeDefined();
      const signal = AbortSignal.timeout(180_000);
      for await (const event of runtime.runTurn(
        {
          thread: {
            id: randomUUID(),
            provider: 'codex',
            model,
            workspace,
            computerAccessMode: 'mac',
            computerTrust: 'auto',
            macBackgroundControl: true,
            macBackgroundFallback: 'pause',
            instructions:
              'Validation environment: computer tools expose only this fictional public program UI. No real apps, accounts, network or commands exist. Verify current text using the supplied computer tools. This context is not an answer.',
          },
          turnId: randomUUID(),
          ...(offered!.defaultReasoningEffort
            ? { reasoningEffort: offered!.defaultReasoningEffort }
            : {}),
          text:
            (compare
              ? 'Compare the opening hours and accepted household battery types at Alpha Center and Beta Center near my campus.'
              : 'Where can I recycle used household batteries near my campus? Check the opening hours, accepted types and restrictions.') +
            ' Use official information and include sources. No reservations or account changes. Leave protected sources untouched and do not wait for me.',
          onMacResult: (value) => {
            result = value;
          },
        },
        signal,
      ))
        if (event.type === 'error') throw new Error(JSON.stringify(event.payload));
      console.info('Research scope probe', { compare, hours, complete, calls, result });
      expect(signal.aborted).toBe(false);
      expect(observed).toBe(true);
      expect(result?.success).toBe(complete);
      expect(result?.response).toContain('Alpha');
      if (complete) {
        expect(result?.response).toMatch(/10|ten/i);
        expect(result?.response).toContain(origin);
      } else
        expect(result?.response).toMatch(compare ? /Beta|comparison/i : /hours|opening|time/i);
    } finally {
      await runtime.dispose();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  240_000,
);
