import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import { RuntimeCoordinator } from '../providers/runtime-coordinator.js';
import { discoverCodexInstallation } from '../providers/codex-installation.js';
import type { MacTaskResult } from './mac-execution.js';

// Real model, fictional UI only. No apps, native input or account access.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_SAFARI_RECOVERY_SMOKE === '1'
    ? it
    : it.skip;

live.each(['protected', 'start-page', 'native-pdf'] as const)(
  'uses available Safari navigation from %s and preserves the selected profile',
  async (initial) => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-safari-recovery-'));
    const origin = 'https://canvas.university.example';
    const ids = { app_id: 'app:fixture', window_id: 'window:fixture' };
    let page: 'protected' | 'ordinary' | 'new' | 'dashboard' | 'courses' =
      initial === 'protected' ? 'protected' : initial === 'native-pdf' ? 'ordinary' : 'new';
    let address = '';
    let revision = 0;
    let calls = 0;
    const history: string[] = [];
    const protectedInputs: string[] = [];
    const observe = (tabsOnly = false) => {
      if (tabsOnly && initial === 'start-page')
        return {
          outcome: 'refused' as const,
          summary: 'The native Safari tab bar could not be verified. No webpage was read.',
        };
      if (tabsOnly)
        return {
          outcome: 'verified' as const,
          summary: 'Read native tab labels only. No webpage content was read.',
          data: {
            ...ids,
            snapshot_id: `state:${++revision}`,
            browser_surface: 'safari-tabs',
            pixel_actions_available: false,
            background_input: {
              exact_window: { status: 'matched' },
              routes: [{ route: 'accessibility', status: 'available' }],
            },
            elements: [
              {
                role: 'AXRadioButton',
                label: 'Account settings',
                element_ref: 'protected-tab',
                selected: page === 'protected',
              },
              {
                role: 'AXRadioButton',
                label: 'University help',
                element_ref: 'ordinary-tab',
                selected: page === 'ordinary',
              },
            ],
          },
        };
      if (page === 'protected')
        return {
          outcome: 'refused' as const,
          summary: 'This specific account settings page is protected. No contents were read.',
          data: { ...ids, blocker_code: 'protected_window' },
        };
      return {
        outcome: 'verified' as const,
        summary: 'Read the selected tab in the existing Safari window.',
        data: {
          ...ids,
          title:
            page === 'new'
              ? 'Start Page'
              : initial === 'native-pdf' && page === 'ordinary'
                ? 'University calendar.pdf'
                : 'University course page',
          ...(initial === 'native-pdf' && page === 'ordinary'
            ? { browser_document_kind: 'native-pdf' }
            : {}),
          snapshot_id: `state:${++revision}`,
          pixel_actions_available: false,
          background_input: {
            exact_window: { status: 'matched' },
            routes: ['accessibility', 'pid_keyboard'].map((route) => ({
              route,
              status: 'available',
            })),
          },
          source_url:
            page === 'courses'
              ? origin + '/courses'
              : page === 'dashboard'
                ? origin + '/'
                : page === 'new'
                  ? 'about:blank'
                  : initial === 'native-pdf'
                    ? 'https://university.example/calendar.pdf'
                    : 'https://university.example/help',
          visible_text:
            page === 'courses'
              ? 'All Courses. Complete current Fall 2026 enrollment: 12-101 Field Studies section A; 23-202 Geometry section B. Enrolled as Student. No more current courses or pagination. No account display name is shown.'
              : page === 'dashboard'
                ? 'Dashboard. Favorites: Geometry. Favorites are not the complete current enrollment. Open All Courses for the complete inventory.'
                : page === 'new'
                  ? 'New Safari tab in the same window and profile.'
                  : 'Public university help page.',
          elements:
            page === 'new'
              ? [
                  {
                    role: 'AXTextField',
                    label: 'Address and search',
                    value: address,
                    element_ref: 'address',
                  },
                ]
              : page === 'dashboard'
                ? [{ role: 'AXLink', label: 'All Courses', element_ref: 'all-courses' }]
                : [],
        },
      };
    };
    const gateway = new ActionGateway({
      policy: { evaluate: () => ({ decision: 'allow' }) },
      backend: {
        async invoke(request) {
          if (++calls > 35) throw new Error('Fixture navigation budget exceeded.');
          const args = request.arguments;
          if (['memory_vault', 'assistant_library'].includes(request.name))
            return {
              outcome: 'verified',
              summary: 'Saved institution navigation hint; not enrollment evidence.',
              data: {
                text: `The owner uses this existing Safari profile for their university Canvas at ${origin}.`,
              },
            };
          if (request.name === 'computer_list')
            return {
              outcome: 'verified',
              summary: 'One existing Safari window.',
              data: {
                apps: [{ app_id: ids.app_id, name: 'Safari' }],
                windows: [
                  {
                    ...ids,
                    title:
                      initial === 'protected'
                        ? 'Account settings'
                        : initial === 'native-pdf'
                          ? 'University calendar.pdf'
                          : 'Start Page',
                    source_url:
                      initial === 'protected'
                        ? origin + '/profile'
                        : initial === 'native-pdf'
                          ? 'https://university.example/calendar.pdf'
                          : 'about:blank',
                  },
                ],
              },
            };
          if (request.name === 'computer_snapshot') return observe(args.tabs_only === true);
          if (request.name === 'computer_action') {
            if (args.action === 'click' && args.element_ref === 'ordinary-tab') {
              page = 'ordinary';
              history.push('select-ordinary-tab');
              return observe();
            }
            if (page === 'protected') {
              protectedInputs.push(String(args.action));
              return {
                outcome: 'refused',
                summary: 'No input may interact with the protected page.',
                data: { blocker_code: 'protected_window' },
              };
            }
            const cmd = Array.isArray(args.modifiers) && args.modifiers.includes('cmd');
            if (
              page === 'new' &&
              ((args.action === 'click' && args.element_ref === 'address') ||
                (args.action === 'key' && cmd && args.value === 'l'))
            )
              return observe();
            if (
              ['ordinary', 'new'].includes(page) &&
              args.action === 'key' &&
              cmd &&
              args.value === 't'
            ) {
              page = 'new';
              history.push('new-tab');
              return {
                outcome: 'accepted_unverified',
                summary:
                  'Delivered the new-tab shortcut. Observe its result; do not replay it.',
                data: { observation_pending: true },
              };
            }
            if (
              page === 'new' &&
              ['set', 'type'].includes(String(args.action)) &&
              (args.element_ref === 'address' || args.element_ref === undefined)
            ) {
              address = String(args.text ?? args.value ?? '');
              history.push('address');
              return observe();
            }
            if (
              page === 'new' &&
              args.action === 'key' &&
              ['return', 'enter'].includes(String(args.value).toLowerCase()) &&
              [origin, origin + '/', origin + '/courses'].includes(address)
            ) {
              page = address === origin + '/courses' ? 'courses' : 'dashboard';
              history.push(page);
              return observe();
            }
            if (
              page === 'dashboard' &&
              args.action === 'click' &&
              args.element_ref === 'all-courses'
            ) {
              page = 'courses';
              history.push('courses');
              return observe();
            }
          }
          return {
            outcome: 'refused',
            summary:
              'No other apps, native commands, URL opener or account changes are available. Use only observed controls in this fictional UI.',
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
              'Validation environment: all computer tools operate only this fictional Safari UI. No real apps or account access exist. Current term is Fall 2026. The owner just signed in to this Safari profile. This is context, not an answer.',
          },
          turnId: randomUUID(),
          ...(offered!.defaultReasoningEffort
            ? { reasoningEffort: offered!.defaultReasoningEffort }
            : {}),
          text:
            'What are all my university classes and sections this semester? Use my existing Safari Canvas session at ' +
            origin +
            ', which I just signed in to. Preserve my other tabs. Include the observed source. Course information only; no coursework or account changes.',
          onMacResult: (value) => {
            result = value;
          },
        },
        signal,
      ))
        if (event.type === 'error') throw new Error(JSON.stringify(event.payload));
      console.info('Safari navigation probe:', {
        model,
        calls,
        history,
        protectedInputs,
        result,
      });
      expect(signal.aborted).toBe(false);
      expect(result?.success).toBe(true);
      expect(protectedInputs).toEqual([]);
      if (initial === 'protected') {
        expect(history.slice(0, 2)).toEqual(['select-ordinary-tab', 'new-tab']);
        expect(history.filter((step) => step === 'new-tab')).toHaveLength(1);
      } else {
        expect(history).not.toContain('select-ordinary-tab');
        expect(history.filter((step) => step === 'new-tab').length).toBeLessThanOrEqual(1);
        if (initial === 'native-pdf') expect(history[0]).toBe('new-tab');
      }
      expect(history.at(-1)).toBe('courses');
      expect(result!.response).toContain('Field Studies');
      expect(result!.response).toContain('Geometry');
      expect(result!.response).toContain(origin);
    } finally {
      await runtime.dispose();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  240_000,
);
