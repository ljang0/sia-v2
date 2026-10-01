import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ActionGateway } from '@sia/action-gateway';
import { RuntimeCoordinator } from '../runtime-coordinator.js';
import type { MacTaskResult } from './mac-execution.js';
import { discoverCodexInstallation } from '../codex-installation.js';

// Opt-in real-model regression. Every app action ends in this in-memory fixture.
// Native commands, web search and image tools are disabled by mac-background isolation.
const live =
  process.env.SIA_CODEX_REAL_SMOKE === '1' && process.env.SIA_COURSE_INVESTIGATION_SMOKE === '1'
    ? it
    : it.skip;

type Page = { title: string; text: string; links?: Record<string, string> };
const origin = 'https://canvas.example.edu';
function coursePages(blocked: boolean): Record<string, Page> {
  const nav = { Dashboard: '/', 'All Courses': '/courses', Calendar: '/calendar' };
  const a = {
    ...nav,
    Home: '/courses/a',
    Assignments: '/courses/a/assignments',
    Modules: '/courses/a/modules',
    Syllabus: '/courses/a/syllabus',
    Announcements: '/courses/a/announcements',
  };
  const b = {
    ...nav,
    Home: '/courses/b',
    Assignments: '/courses/b/assignments',
    Modules: '/courses/b/modules',
    Syllabus: '/courses/b/syllabus',
    Announcements: '/courses/b/announcements',
  };
  return {
    '/': {
      title: 'Dashboard',
      text: 'Favorite courses: Geometry. To Do: no upcoming work.',
      links: { ...nav, Geometry: '/courses/a' },
    },
    '/calendar': {
      title: 'Calendar',
      text: 'September 14–20, 2026. Both course calendars enabled. No assignments or events displayed.',
      links: nav,
    },
    '/courses': {
      title: 'All Courses',
      text: 'Current enrollment, Fall 2026: Geometry section 1 and Field Studies section 1. This is the complete current enrollment list. No past courses.',
      links: { ...nav, Geometry: '/courses/a', 'Field Studies': '/courses/b' },
    },
    '/courses/a': {
      title: 'Geometry — Home',
      text: 'Fall 2026 section 1. Coursework and the course schedule are linked in the navigation.',
      links: a,
    },
    '/courses/a/assignments': {
      title: 'Geometry — Assignments',
      text: 'All assignment groups expanded. No pagination. No dated assignments listed.',
      links: a,
    },
    '/courses/a/modules': {
      title: 'Geometry — Modules',
      text: 'Week of September 14. All modules expanded.',
      links: { ...a, 'Vector worksheet': '/courses/a/items/vector' },
    },
    '/courses/a/items/vector': {
      title: 'Vector worksheet',
      text: 'Geometry, Fall 2026 section 1. Due Tuesday September 15, 2026 at 11:59 PM America/New_York. Available September 1 through September 22. Status: submitted. No individual override.',
      links: a,
    },
    '/courses/a/syllabus': {
      title: 'Geometry — Syllabus',
      text: 'Current syllabus. Schedule for September 14–20: Symmetry journal due Thursday September 17 at 5 PM America/New_York. No other work this week. No separate Quizzes or Discussions.',
      links: a,
    },
    '/courses/a/announcements': {
      title: 'Geometry — Announcements',
      text: 'All announcements. Instructor update posted September 10, 2026: Symmetry journal deadline moved from September 17 to Friday September 18 at 5 PM America/New_York. This explicitly supersedes the syllabus. No other updates.',
      links: a,
    },
    '/courses/b': blocked
      ? {
          title: 'Field Studies — unavailable',
          text: 'Fall 2026 section 1 is in your enrollment, but its course content is inaccessible. No course pages or linked materials can be read with the current access.',
          links: nav,
        }
      : {
          title: 'Field Studies — Home',
          text: 'Fall 2026 section 1. Weekly coursework is listed in Modules. No separate Quizzes or Discussions.',
          links: b,
        },
    ...(!blocked
      ? {
          '/courses/b/assignments': {
            title: 'Field Studies — Assignments',
            text: 'All groups expanded. No assignments listed. No pagination.',
            links: b,
          },
          '/courses/b/modules': {
            title: 'Field Studies — Modules',
            text: 'All modules expanded. Week of September 14 coursework:',
            links: { ...b, 'Habitat sketch': '/courses/b/items/habitat' },
          },
          '/courses/b/items/habitat': {
            title: 'Habitat sketch',
            text: 'Field Studies, Fall 2026 section 1. Due Sunday September 20, 2026 at 8 PM America/New_York. Not submitted. No individual override.',
            links: b,
          },
          '/courses/b/syllabus': {
            title: 'Field Studies — Syllabus',
            text: 'The current weekly schedule points to Modules for all due work. No additional requirements or outside platforms.',
            links: b,
          },
          '/courses/b/announcements': {
            title: 'Field Studies — Announcements',
            text: 'All recent announcements loaded. No deadline changes or additional requirements.',
            links: b,
          },
        }
      : {}),
  };
}

live.each([false, true])(
  'investigates beyond an empty calendar and reports coverage honestly (inaccessible course: %s)',
  async (blocked) => {
    const workspace = await mkdtemp(join(tmpdir(), 'sia-course-investigation-'));
    const pages = coursePages(blocked);
    const visited = new Set<string>();
    let current = '/calendar';
    let revision = 0;
    let calls = 0;
    const snapshot = () => {
      visited.add(current);
      const page = pages[current]!;
      console.info(`Course investigation: ${page.title}`);
      return {
        outcome: 'verified' as const,
        summary: `Observed ${page.title}.`,
        data: {
          app_id: 'app:fixture',
          window_id: 'window:fixture',
          snapshot_id: `snapshot:${++revision}`,
          title: page.title,
          source_url: origin + current,
          url: origin + current,
          pixel_actions_available: false,
          elements: [
            { role: 'AXStaticText', text: page.text, value: page.text },
            ...Object.entries(page.links ?? {}).map(([label, path]) => ({
              role: 'AXLink',
              label,
              element_ref: `link:${path}`,
              url: origin + path,
            })),
          ],
        },
      };
    };
    const gateway = new ActionGateway({
      // This policy can authorize only in-memory fixture navigation, never host actions.
      policy: { evaluate: () => ({ decision: 'allow' }) },
      backend: {
        async invoke(request) {
          if (++calls > 100) throw new Error('Fixture navigation exceeded 100 calls.');
          const args = request.arguments;
          if (request.name === 'assistant_library')
            return { outcome: 'verified', summary: 'No saved memory or workflows.' };
          if (request.name === 'computer_list')
            return {
              outcome: 'verified',
              summary: 'One synthetic signed-in Canvas window.',
              data: {
                apps: [{ app_id: 'app:fixture', name: 'Safari', active: true }],
                windows: [
                  {
                    app_id: 'app:fixture',
                    window_id: 'window:fixture',
                    title: pages[current]!.title,
                  },
                ],
              },
            };
          if (request.name === 'computer_snapshot') {
            if (args.app_id !== 'app:fixture' || args.window_id !== 'window:fixture')
              return { outcome: 'refused', summary: 'Unknown fixture window.' };
            if (args.expected_url && args.expected_url !== origin + current)
              return { outcome: 'stale', summary: 'Expected page does not match the fixture.' };
            return snapshot();
          }
          if (request.name === 'computer_action') {
            if (
              args.app_id !== 'app:fixture' ||
              args.window_id !== 'window:fixture' ||
              args.snapshot_id !== `snapshot:${revision}`
            )
              return { outcome: 'stale', summary: 'Use the current fixture snapshot.' };
            const target = String(args.element_ref ?? '').replace(/^link:/, '');
            if (
              args.action !== 'click' ||
              !Object.values(pages[current]!.links ?? {}).includes(target)
            )
              return {
                outcome: 'refused',
                summary: 'Only observed fixture links can be clicked.',
              };
            current = target;
            return snapshot();
          }
          if (request.name === 'computer_open_url') {
            const target = String(args.url).startsWith(origin)
              ? String(args.url).slice(origin.length) || '/'
              : '';
            if (pages[target]) {
              current = target;
              return snapshot();
            }
          }
          return {
            outcome: 'refused',
            summary: 'This tool cannot leave the synthetic fixture.',
          };
        },
      },
    });
    const codexCommand = await discoverCodexInstallation();
    const runtime = new RuntimeCoordinator(gateway, codexCommand ? { codexCommand } : {});
    let result: MacTaskResult | undefined;
    try {
      const model = process.env.SIA_SMOKE_MODEL ?? 'gpt-5.6-sol';
      const offered = (await runtime.listModels('codex')).find((entry) => entry.id === model);
      expect(offered, `Model ${model} must be available to this Codex account`).toBeDefined();
      // Match new desktop threads: pin the offered model's default effort rather
      // than inheriting an unrelated local Codex CLI reasoning configuration.
      const reasoningEffort = offered!.defaultReasoningEffort;
      const started = Date.now();
      const deadline = AbortSignal.timeout(240_000);
      console.info('Course investigation model:', model, 'reasoning:', reasoningEffort);
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
              'Validation environment: the provided computer tools operate an in-memory Canvas fixture, not a real browser. Read its accessibility text and follow its links normally. There are no images, saved workflows or other apps. Do not attempt to leave this environment. Local timezone is America/New_York. This environment information does not supply the answer.',
          },
          turnId: randomUUID(),
          ...(reasoningEffort ? { reasoningEffort } : {}),
          text: 'Go through my Canvas and tell me all assignments due the week of September 14–20, 2026.',
          onMacResult: (value) => {
            result = value;
          },
        },
        deadline,
      )) {
        if (event.type === 'error') throw new Error(JSON.stringify(event.payload));
      }
      console.info('Course investigation metrics:', {
        elapsedMs: Date.now() - started,
        calls,
        sources: visited.size,
        timedOut: deadline.aborted,
      });
      expect(deadline.aborted, 'Course investigation exceeded its four-minute budget').toBe(
        false,
      );
      console.info('Course investigation result:', JSON.stringify(result));
      expect(result).toBeDefined();
      for (const source of [
        '/courses',
        '/courses/a/assignments',
        '/courses/a/modules',
        '/courses/a/items/vector',
        '/courses/a/syllabus',
        '/courses/a/announcements',
        '/courses/b',
      ])
        expect(visited.has(source), `Missing source: ${source}`).toBe(true);
      expect(result!.response).toContain('Vector worksheet');
      expect(result!.response).toContain('Symmetry journal');
      expect(result!.response).toMatch(/(?:Sep(?:tember)?\.?\s*18|18\s*Sep(?:tember)?)/i);
      expect(result!.response).toContain(origin);
      expect(result!.success).toBe(!blocked);
      if (blocked) {
        expect(result!.response).toContain('Field Studies');
        expect(result!.response).toMatch(
          /inaccess|unavailable|could(?:n.t| not)|unchecked|unverified|incomplete|blocked/i,
        );
      } else {
        for (const source of [
          '/courses/b/assignments',
          '/courses/b/modules',
          '/courses/b/items/habitat',
          '/courses/b/syllabus',
          '/courses/b/announcements',
        ])
          expect(visited.has(source), `Missing source: ${source}`).toBe(true);
        expect(result!.response).toContain('Habitat sketch');
      }
    } finally {
      await runtime.dispose();
      await rm(workspace, { recursive: true, force: true });
    }
  },
  300_000,
);
