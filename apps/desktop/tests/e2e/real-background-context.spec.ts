import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchIsolatedSia, type IsolatedSia } from '../support/electron-harness.js';
import { startBackgroundCampus } from '../support/background-campus.js';

// Explicitly opt in: real model turns + real Mac CUA, fictional accounts only.
const real = process.env.SIA_REAL_BACKGROUND_CONTEXT_E2E === '1' ? test : test.skip;

real(
  'reuses existing sessions for background research and writes with permitted foreground recovery',
  async () => {
    test.setTimeout(1_500_000);
    test.skip(process.platform !== 'darwin');
    const portal = await startBackgroundCampus();
    const executablePath =
      process.env.SIA_REAL_ELECTRON_PATH ??
      join(
        homedir(),
        'Library/Application Support/Sia Development/Sia Development.app/Contents/MacOS/Electron',
      );
    expect(
      existsSync(executablePath),
      'Prepare the signed development runtime before this explicit real probe',
    ).toBe(true);
    const windows: string[] = [];
    let harness: IsolatedSia | undefined;
    let preserveFailedProfile = false;
    const foregroundAllowedThreads = new Set<string>();
    const openWindow = (url: string) => {
      const id = execFileSync(
        'osascript',
        [
          '-e',
          `tell application "Safari"\nmake new document with properties {URL:"${url}"}\nreturn id of front window\nend tell`,
        ],
        { encoding: 'utf8' },
      ).trim();
      if (!/^\d+$/.test(id)) throw new Error('Invalid disposable Safari window');
      windows.push(id);
    };
    const environment = {
      SIA_API_BASE_URL: '',
      SIA_COGNITO_REGION: '',
      SIA_COGNITO_CLIENT_ID: '',
    };
    try {
      // Normal browser navigation creates a disposable session in Safari. Sia is
      // never given the cookie/token or a browser-attachment grant.
      openWindow(portal.origin + '/prepare');
      await expect.poll(() => portal.visited.includes('/work'), { timeout: 30_000 }).toBe(true);
      openWindow(portal.origin + '/personal');
      await expect
        .poll(() => portal.visited.includes('/personal'), { timeout: 30_000 })
        .toBe(true);
      harness = await launchIsolatedSia({
        fakeServices: false,
        executablePath,
        environment,
        prefix: 'sia-background-context-',
      });
      const initial = await harness.page.evaluate(async (requestedModel) => {
        const probed = await window.sia.providers.probe('codex');
        const provider = probed.providers.find(({ id }) => id === 'codex');
        if (provider?.status !== 'ready') throw new Error('Codex is not ready');
        if (requestedModel && !provider.models?.some(({ id }) => id === requestedModel))
          throw new Error('The requested test model is not in the live account catalog');
        const permissions = await window.sia.computer.permissions();
        if (permissions.computer.status !== 'ready')
          throw new Error('Mac Accessibility and Screen Recording are required');
        await window.sia.computer.setAccessMode('mac', true, 'pause');
        await window.sia.computer.setTrust('auto');
        await window.sia.settings.setAppearance('calm');
        return { model: requestedModel || provider.model };
      }, process.env.SIA_REAL_BACKGROUND_MODEL);
      const { agentId, snapshot } = await harness.page.evaluate(
        async ({ origin, model }) => {
          const created = await window.sia.agents.save({
            name: 'Background session verifier',
            provider: 'codex',
            model,
            instructions: `Disposable real computer-use test. Only inspect Safari windows whose URL starts ${origin}/ and titles end Sia Background Lab. Never inspect another origin or app content. Start browsing in background with provided computer tools and respect the current foreground policy. Use brief foreground recovery only when that policy explicitly permits it. Save requested JSON through workspace tools. The two fixture accounts are fictional. Do not sign in, read credentials, copy session state, or use public search. Change web data only when the task explicitly requests it. Verify full scope from the live pages; memory only identifies where to look.`,
          });
          await window.sia.assistantLibrary({
            operation: 'nativeLearning',
            agentId: created.agentId,
            enabled: false,
          });
          await window.sia.assistantLibrary({
            operation: 'learning',
            agentId: created.agentId,
            enabled: false,
          });
          await window.sia.assistantLibrary({
            operation: 'saveVaultNote',
            agentId: created.agentId,
            name: 'campus.md',
            revision: '',
            text: `# Campus\nMy institution is Alder University. My campus coursework is in the Student work account at ${origin}/work. The Personal account is Meadow Club and is unrelated. This is a navigation hint; inspect the live account header and course pages for current facts.`,
          });
          const library = await window.sia.assistantLibrary({ operation: 'list' });
          const index = library.vaults
            ?.find(({ agentId }) => agentId === created.agentId)
            ?.notes.find(({ name }) => name === 'MOC.md');
          if (!index) throw new Error('The new agent has no memory index');
          await window.sia.assistantLibrary({
            operation: 'saveVaultNote',
            agentId: created.agentId,
            name: 'MOC.md',
            revision: index.revision,
            text:
              index.text +
              '\n- [[campus]] — my institution, campus accounts, courses and professors\n',
          });
          return created;
        },
        { origin: portal.origin, model: initial.model },
      );
      const workspace = snapshot.agents.find(({ id }) => id === agentId)!.workspace;
      const task = async (title: string, prompt: string, allowForeground = false) => {
        const { threadId } = await harness!.page.evaluate(
          ({ agentId, title }) => window.sia.threads.create({ agentId, title }),
          { agentId, title },
        );
        if (allowForeground) foregroundAllowedThreads.add(threadId);
        await harness!.application.evaluate(({ BrowserWindow }) => {
          const window = BrowserWindow.getAllWindows()[0]!;
          window.show();
          window.focus();
        });
        const began = Date.now();
        await harness!.page.evaluate(
          ({ threadId, text }) => window.sia.threads.send({ threadId, text }),
          { threadId, text: prompt },
        );
        await expect
          .poll(
            async () => {
              const state = await harness!.page.evaluate(() => window.sia.bootstrap());
              const status = state.threads.find(({ id }) => id === threadId)?.status;
              return status === 'idle' || status === 'failed' || status === 'waiting';
            },
            { timeout: 600_000, intervals: [1000] },
          )
          .toBe(true);
        const result = await harness!.page.evaluate(async (threadId) => {
          const state = await window.sia.bootstrap();
          return {
            timeline: state.timeline.filter((item) => item.threadId === threadId),
            status: state.threads.find(({ id }) => id === threadId)?.status,
            capture: state.capture.status,
            browser: state.browser.status,
          };
        }, threadId);
        if (result.status !== 'idle') {
          preserveFailedProfile = true;
          // Local diagnostics only: no tool arguments, inventory or screenshots.
          console.info(
            'Background task failure:',
            JSON.stringify({
              title,
              status: result.status,
              profile: harness!.testRoot,
              errors: result.timeline
                .filter(({ kind }) => kind === 'error')
                .map(({ text, detail }) => ({ text, detail })),
            }),
          );
        }
        expect(result.status).toBe('idle');
        expect(result.timeline.filter(({ kind }) => kind === 'error')).toEqual([]);
        expect(result.capture).toBe('not_consented');
        expect(result.browser).not.toBe('attached');
        const tools = result.timeline.flatMap(({ toolName }) => (toolName ? [toolName] : []));
        expect(tools).toContain('computer_snapshot');
        expect(tools).not.toEqual(expect.arrayContaining(['exec_command']));
        expect(
          tools.some((name) =>
            /web_search|browser_prepare|browser_navigate|view_image/.test(name),
          ),
        ).toBe(false);
        console.info(
          'Real background context result:',
          JSON.stringify({
            title,
            model: initial.model,
            seconds: Math.round((Date.now() - began) / 1000),
            actions: tools.filter((name) => name === 'computer_action').length,
          }),
        );
      };
      if (process.env.SIA_REAL_BACKGROUND_SCENARIO !== 'write') {
        await task(
          'Instructors across accounts',
          'Find my professors for every current campus course this semester. Check the actual course pages, exclude TAs and older terms, and save instructors.json as {"courses":[{"course":"COURSE-CODE","names":["Full Name"]}]}. Include all co-instructors. Verify the saved file.',
        );
        const instructorAnswer = JSON.parse(
          await readFile(join(workspace, 'instructors.json'), 'utf8'),
        );
        expect(instructorAnswer.courses).toHaveLength(portal.instructors.length);
        // An honorific is presentation, not a different person. Preserve strict
        // course/name sets and cardinality; no fuzzy matching or omitted people.
        const canonical = (names: string[]) =>
          names.map((name) => name.replace(/^Dr\.\s+/i, '')).sort();
        for (const expected of portal.instructors) {
          const actual = instructorAnswer.courses.filter(
            (course: { course: string }) => course.course === expected.course,
          );
          expect(actual).toHaveLength(1);
          expect(canonical(actual[0].names)).toEqual(canonical(expected.names));
        }
        expect(portal.visited).toEqual(
          expect.arrayContaining([
            '/work/courses/comp-141/people',
            '/work/courses/stat-208/syllabus',
          ]),
        );
        const root = harness.testRoot;
        await harness.close({ removeTestRoot: false });
        harness = await launchIsolatedSia({
          fakeServices: false,
          executablePath,
          environment,
          testRoot: root,
        });
        // A new conversation after process restart has no previous task transcript.
        await task(
          'Complete weekly coursework after restart',
          `Find all my campus assignments due ${portal.week.first} through ${portal.week.last}, including submitted work. Check each course beyond the overview/calendar, follow its organization, and inspect each item's actual details. Save assignments.json as {"assignments":[{"course":"COURSE-CODE","title":"...","due":"YYYY-MM-DD","status":"Submitted or Not submitted"}]}. Verify completeness and the saved file.`,
        );
        const assignmentAnswer = JSON.parse(
          await readFile(join(workspace, 'assignments.json'), 'utf8'),
        );
        expect(assignmentAnswer.assignments).toHaveLength(portal.assignments.length);
        for (const expected of portal.assignments)
          expect(assignmentAnswer.assignments).toContainEqual(expected);
        expect(portal.visited).toEqual(
          expect.arrayContaining([
            '/work/items/0',
            '/work/items/1',
            '/work/items/2',
            '/work/courses/stat-208/modules',
          ]),
        );
      }
      if (process.env.SIA_REAL_BACKGROUND_SCENARIO !== 'read') {
        // Explicit test-user consent. Multiple Safari windows intentionally
        // make PID keyboard delivery ambiguous; do not weaken the driver's guard.
        await harness.page.evaluate(() =>
          window.sia.computer.setAccessMode('mac', true, 'foreground'),
        );
        await task(
          'Verified calendar write',
          `Create exactly one event titled "Graph lab study" on ${portal.week.last} at 15:00 UTC for 30 minutes in my campus Student work calendar. Inspect the destination account and existing events first, avoid duplicates, and verify the saved event. Do not create an event in Personal.`,
          true,
        );
        expect(portal.events).toEqual([
          {
            title: 'Graph lab study',
            date: portal.week.last,
            time: '15:00',
            minutes: 30,
            account: 'Student work',
          },
        ]);
      }
      // Persisted trajectory is checked locally; never attach global inventory or
      // screenshots to test reports (they may contain unrelated window titles).
      const trajectoryRoot = join(harness.userData, 'trajectories');
      const { readdir } = await import('node:fs/promises');
      let delivered = 0;
      let foreground = 0;
      for (const directory of await readdir(trajectoryRoot)) {
        if (directory === 'app-lifecycle') continue;
        const events = (await readFile(join(trajectoryRoot, directory, 'events.jsonl'), 'utf8'))
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        for (const event of events) {
          if (event.type !== 'action_result') continue;
          if (event.data?.source_url)
            expect(event.data.source_url.startsWith(portal.origin + '/')).toBe(true);
          if (event.name === 'computer_action' && event.data?.delivery) {
            const mode = event.data.delivery.delivery_mode;
            if (foregroundAllowedThreads.has(event.threadId))
              expect(['background', 'foreground']).toContain(mode);
            else expect(mode).toBe('background');
            if (mode === 'background') delivered++;
            if (mode === 'foreground') foreground++;
          }
        }
      }
      expect(delivered).toBeGreaterThan(0);
      console.info(
        'Verified input delivery:',
        JSON.stringify({ background: delivered, foreground }),
      );
    } finally {
      if (harness) await harness.close({ removeTestRoot: !preserveFailedProfile });
      if (windows.length) {
        try {
          execFileSync('osascript', [
            '-e',
            `tell application "Safari" to set URL of current tab of window id ${windows[0]} to "${portal.origin}/cleanup"`,
          ]);
        } catch {
          /* Already closed. */
        }
        for (const id of windows)
          try {
            execFileSync('osascript', [
              '-e',
              `tell application "Safari" to close window id ${id}`,
            ]);
          } catch {
            /* Already closed. */
          }
      }
      await portal.close();
    }
  },
);
