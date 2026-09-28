import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import { discoverCodexInstallation } from './codex-installation.js';
import type { MacTaskResult } from './mac-execution.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';

// A real model replays the recorded dictation/observation failure against an
// in-memory browser. No real browser, calendar, account or host action is exposed.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_BACKGROUND_RECOVERY_SMOKE === '1'
    ? it
    : it.skip;

// Negating a login claim must not fail the same check as making one. Remove only
// this narrow negated clause; a separate instruction to sign in still fails.
function withoutNegatedLoginClaim(text: string): string {
  return text.replace(
    /\b(?:no|not) (?:evidence|proof|indication)(?: that)? (?:you )?need to (?:sign[ -]?in|log[ -]?in)\b/gi,
    '',
  );
}
const loginRequest =
  /(?:please|must|need(?:s)?(?: you)? to|requires?(?: you)? to|complete(?: the)?)\s+(?:sign[ -]?in|log[ -]?in|authenticat)/i;

it('distinguishes a denied login inference from a real request to sign in', () => {
  expect(
    withoutNegatedLoginClaim('This is not evidence that you need to sign in.'),
  ).not.toMatch(loginRequest);
  for (const text of [
    'You need to sign in.',
    'Please log in.',
    'No evidence that you need to sign in. Please sign in anyway.',
  ])
    expect(withoutNegatedLoginClaim(text)).toMatch(loginRequest);
});

live(
  'finds a dictated organization through the full account picker instead of guessed account slots',
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-account-discovery-'));
    let page = 'personal';
    let revision = 0;
    const visited = new Set<string>();
    const guessedUrls: string[] = [];
    let calls = 0;
    const observe = () => {
      visited.add(page);
      const elements =
        page === 'personal'
          ? [
              {
                role: 'AXStaticText',
                value:
                  'Personal account: person@example.test. My calendars: Person, Birthdays, Tasks.',
              },
              {
                role: 'AXButton',
                label: 'Google Account: Person',
                element_ref: 'account-picker',
              },
            ]
          : page === 'accounts'
            ? [
                {
                  role: 'AXStaticText',
                  value:
                    'Accounts 1–4 of 8: Personal, University, Alumni, Project. More accounts below in this scroll area.',
                },
                {
                  role: 'AXScrollArea',
                  label: 'Google accounts',
                  element_ref: 'account-scroll',
                },
              ]
            : page === 'more-accounts'
              ? [
                  {
                    role: 'AXStaticText',
                    value:
                      'Accounts 5–8 of 8: Old project, Club, Volunteer, Bespoke Labs. End of account list.',
                  },
                  {
                    role: 'AXButton',
                    label: 'Bespoke Labs — person@bespoke.example.test',
                    element_ref: 'bespoke-account',
                  },
                ]
              : [
                  {
                    role: 'AXStaticText',
                    value:
                      'Google Account: Person (person@bespoke.example.test). Organization: Bespoke Labs. My calendars expanded: Person (primary, writable), Birthdays, Tasks. Other calendars expanded: Holidays. Complete calendar list.',
                  },
                ];
      return {
        outcome: 'verified' as const,
        summary: 'Fresh calendar UI state.',
        data: {
          app_id: 'app:fixture',
          window_id: 'window:fixture',
          snapshot_id: `state:${++revision}`,
          source_url:
            page === 'work'
              ? 'https://calendar.google.com/calendar/u/7/r'
              : 'https://calendar.google.com/calendar/u/0/r',
          elements,
          pixel_actions_available: false,
        },
      };
    };
    const gateway = new ActionGateway({
      policy: { evaluate: () => ({ decision: 'allow' }) },
      backend: {
        async invoke(request) {
          if (++calls > 20) throw new Error('Account fixture exceeded 20 calls.');
          const args = request.arguments;
          if (request.name === 'assistant_library')
            return {
              outcome: 'verified',
              summary: 'Saved workplace: Bespoke Labs. Calendar selection has not been saved.',
            };
          if (request.name === 'computer_list')
            return {
              outcome: 'verified',
              summary: 'One Google Calendar window.',
              data: {
                apps: [{ app_id: 'app:fixture', name: 'Safari' }],
                windows: [
                  {
                    app_id: 'app:fixture',
                    window_id: 'window:fixture',
                    title: 'Google Calendar',
                  },
                ],
              },
            };
          if (request.name === 'computer_snapshot') return observe();
          if (request.name === 'computer_open_url') {
            guessedUrls.push(String(args.url));
            return {
              outcome: 'refused',
              summary: 'No navigation outside the observed UI fixture.',
            };
          }
          if (request.name === 'computer_action') {
            if (args.snapshot_id !== `state:${revision}`)
              return { outcome: 'stale', summary: 'Observe current state first.' };
            if (
              page === 'personal' &&
              args.action === 'click' &&
              args.element_ref === 'account-picker'
            )
              page = 'accounts';
            else if (
              page === 'accounts' &&
              args.action === 'scroll' &&
              args.direction === 'down'
            )
              page = 'more-accounts';
            else if (
              page === 'more-accounts' &&
              args.action === 'click' &&
              args.element_ref === 'bespoke-account'
            )
              page = 'work';
            else
              return {
                outcome: 'refused',
                summary: 'Only observed read-only account navigation is available.',
              };
            return observe();
          }
          return {
            outcome: 'refused',
            summary: 'No calendar writes or other apps exist in this fixture.',
          };
        },
      },
    });
    const codexCommand = await discoverCodexInstallation();
    const runtime = new RuntimeCoordinator(gateway, codexCommand ? { codexCommand } : {});
    let result: MacTaskResult | undefined;
    try {
      const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-6-astra';
      const offered = (await runtime.listModels('codex')).find((entry) => entry.id === model);
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
              'Read-only validation: all tools operate an in-memory browser UI, not real accounts. No images or host actions exist. Saved profile: the person works at Bespoke Labs. The current calendar identity still needs to be verified in the UI.',
          },
          turnId: randomUUID(),
          ...(offered!.defaultReasoningEffort
            ? { reasoningEffort: offered!.defaultReasoningEffort }
            : {}),
          text: 'Find my book labs Google calendar so I can add office hours there. Tell me which account and calendar that is. Do not create or change events.',
          onMacResult: (value) => {
            result = value;
          },
        },
        signal,
      ))
        if (event.type === 'error') throw new Error(JSON.stringify(event.payload));
      console.info(
        'Account discovery fixture:',
        JSON.stringify({ model, calls, visited: [...visited], guessedUrls, result }),
      );
      expect(signal.aborted).toBe(false);
      expect([...visited]).toEqual(
        expect.arrayContaining(['accounts', 'more-accounts', 'work']),
      );
      expect(guessedUrls).toEqual([]);
      expect(result?.success).toBe(true);
      expect(result?.response).toMatch(/Bespoke Labs/i);
      expect(result?.response).toMatch(/person@bespoke\.example\.test/i);
      expect(result?.response).toMatch(/Person/);
    } finally {
      await runtime.dispose();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  210_000,
);

live(
  'resolves a spoken campus abbreviation and does not invent a login blocker',
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-background-recovery-'));
    const opened: string[] = [];
    let inspected = 0;
    let calls = 0;
    const windows = {
      apps: [{ app_id: 'app:fixture', name: 'Safari' }],
      windows: [
        { app_id: 'app:fixture', window_id: 'window:fixture', title: 'Untitled document' },
      ],
    };
    const gateway = new ActionGateway({
      policy: { evaluate: () => ({ decision: 'allow' }) },
      backend: {
        async invoke(request) {
          if (++calls > 20) throw new Error('Recovery fixture exceeded 20 calls.');
          if (request.name === 'assistant_library')
            return {
              outcome: 'verified',
              summary: 'Saved account location; not current course evidence.',
              data: {
                memories: [
                  {
                    title: 'Institution',
                    text: 'The user attends Carnegie Mellon University (CMU). Their Canvas is https://canvas.cmu.edu.',
                  },
                ],
              },
            };
          if (request.name === 'computer_list')
            return { outcome: 'verified', summary: 'Available window.', data: windows };
          if (request.name === 'computer_open_url') {
            opened.push(String(request.arguments.url));
            return {
              outcome: 'accepted_unverified',
              summary: 'Opening requested; inspect the resulting window.',
              data: windows,
            };
          }
          if (request.name === 'computer_snapshot') {
            inspected++;
            return {
              outcome: 'refused',
              summary:
                'This specific browser window could not be identified or observed. This is not evidence of a login screen.',
              data: {
                app_id: 'app:fixture',
                window_id: 'window:fixture',
                blocker_code: 'window_unavailable',
                blocker_detail: 'ambiguous',
              },
            };
          }
          return {
            outcome: 'refused',
            summary:
              'Only library reads, browser inventory, opening a URL and window observations exist in this fixture.',
          };
        },
      },
    });
    const codexCommand = await discoverCodexInstallation();
    const runtime = new RuntimeCoordinator(gateway, codexCommand ? { codexCommand } : {});
    let result: MacTaskResult | undefined;
    try {
      const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-6-astra';
      const offered = (await runtime.listModels('codex')).find((entry) => entry.id === model);
      expect(offered, `Model ${model} must be available`).toBeDefined();
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
              'Validation environment: computer tools operate an in-memory browser. There are no images, alternative apps or host actions. The assistant library contains the user’s established institution and account location. Treat current course facts as unverified until actually observed.',
          },
          turnId: randomUUID(),
          ...(offered!.defaultReasoningEffort
            ? { reasoningEffort: offered!.defaultReasoningEffort }
            : {}),
          text: 'Open my CU canvas and find the 15 122 TAs office hours as well as Professor Iliano’s office hours. Do not change my calendar yet.',
          onMacResult: (value) => {
            result = value;
          },
        },
        signal,
      )) {
        if (event.type === 'error') throw new Error(JSON.stringify(event.payload));
      }
      console.info(
        'Background recovery fixture:',
        JSON.stringify({ model, calls, opened, inspected, result }),
      );
      expect(signal.aborted).toBe(false);
      expect(opened.length).toBeGreaterThan(0);
      expect(opened.every((url) => new URL(url).hostname === 'canvas.cmu.edu')).toBe(true);
      expect(inspected).toBeGreaterThan(0);
      expect(result?.success).toBe(false);
      expect(result?.response).toMatch(/(?:window|observ|identif|ambigu|access)/i);
      expect(withoutNegatedLoginClaim(result!.response)).not.toMatch(loginRequest);
      expect(result?.response).not.toMatch(
        /(?:you(?:’re| are)|Canvas is)\s+(?:signed|logged) out/i,
      );
    } finally {
      await runtime.dispose();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  210_000,
);
