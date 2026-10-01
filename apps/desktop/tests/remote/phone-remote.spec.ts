import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DesktopSnapshot } from '../../src/shared/bridge';
import type { DesktopController } from '../../src/main/controller/desktop-controller';
import type { RecordRepository } from '../../src/main/persistence';
import { PhoneRemote } from '../../src/main/phone-remote';

const agentId = '8f944e7b-c72c-4e4e-8a76-7a681a98e32f';
const test = base.extend<{
  remote: { url: string; state: DesktopSnapshot; sends: string[]; service: PhoneRemote };
}>({
  remote: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'sia-phone-browser-'));
    const saved = new Map<string, unknown>();
    const state = {
      agents: [{ id: agentId, name: 'Sia', workspace: root }],
      threads: [],
      timeline: [],
      computer: { accessMode: 'mac', trust: 'auto' },
      activeAgentId: agentId,
    } as unknown as DesktopSnapshot;
    const sends: string[] = [];
    const timers: NodeJS.Timeout[] = [];
    const invoke = async (method: string, input: { threadId: string; text: string }) => {
      if (method === 'threads.create') {
        const threadId = randomUUID();
        state.threads.push({
          id: threadId,
          agentId,
          status: 'idle',
        } as DesktopSnapshot['threads'][number]);
        state.activeThreadId = threadId;
        return { threadId, snapshot: state };
      }
      if (method === 'threads.send') {
        const thread = state.threads.find((entry) => entry.id === input.threadId)!;
        const turnId = randomUUID();
        sends.push(input.text);
        const append = (kind: 'user' | 'assistant' | 'activity' | 'notice', text: string) =>
          state.timeline.push({
            id: randomUUID(),
            threadId: thread.id,
            turnId,
            sequence: state.timeline.length + 1,
            timestamp: new Date().toISOString(),
            kind,
            text,
            ...(kind === 'activity'
              ? { toolName: 'computer_snapshot', status: 'running' }
              : {}),
          });
        append('user', input.text);
        thread.status = 'running';
        append('activity', '');
        const finish = () => {
          if (thread.status !== 'running') return;
          append(
            'assistant',
            input.text.toLowerCase().includes('report')
              ? `Your report is ready.\n\n[Open result](<${join(root, 'report.txt')}>)`
              : 'The answer is **42**.',
          );
          thread.status = 'idle';
        };
        if (input.text.toLowerCase().includes('quick')) finish();
        else timers.push(setTimeout(finish, input.text.includes('keep working') ? 30000 : 900));
        return { turnId, snapshot: state };
      }
      if (method === 'threads.cancel') {
        state.threads.find((entry) => entry.id === input.threadId)!.status = 'idle';
        state.timeline.push({
          id: randomUUID(),
          threadId: input.threadId,
          sequence: state.timeline.length + 1,
          kind: 'notice',
          title: 'Task cancelled',
          timestamp: '',
        });
        return state;
      }
      if (method === 'assistant.library')
        return {
          memories: [
            {
              id: 'brief',
              agentId,
              title: 'Keep it brief',
              text: 'Prefer short answers about [[Work]].',
              enabled: true,
            },
          ],
          workflows: [],
          skills: [
            {
              id: 'skill',
              agentId,
              title: 'Morning summary',
              description: 'Read the daily summary.',
              source: '#!/bin/bash\necho summary',
            },
          ],
          journal: [
            {
              agentId,
              timestamp: '2026-09-10',
              title: 'A useful lesson',
              text: 'Verify the result.',
            },
          ],
          context: true,
        };
      return state;
    };
    await writeFile(join(root, 'report.txt'), 'A test report from Sia.');
    const service = new PhoneRemote({
      controller: {
        snapshot: () => structuredClone(state),
        invoke: invoke as DesktopController['invoke'],
        remoteAccessAllowed: () => true,
      },
      repository: {
        get: (_scope: string, id: string) => saved.get(id),
        put: (_scope: string, id: string, value: unknown) => saved.set(id, value),
      } as unknown as RecordRepository,
      assets: resolve('out/remote'),
      outbox: root,
      qr: async () => '',
      network: () => ({ address: '127.0.0.1', netmask: '255.0.0.0' }),
      port: 0,
    });
    await service.initialize();
    const configured = await service.configure({ operation: 'enable', agentId });
    try {
      await use({ url: configured.url!, state, sends, service });
    } finally {
      timers.forEach(clearTimeout);
      service.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
});

test('phone layout, send, immediate completion, persistence and result download', async ({
  page,
  remote,
}, testInfo) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Mac, within reach.' })).toBeVisible();
  await expect(page.getByRole('textbox')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({
    path: testInfo.outputPath('phone-home.png'),
    animations: 'disabled',
  });
  await page.getByRole('textbox').fill('A quick answer please');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('The answer is', { exact: false })).toBeVisible();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Task result' })).toContainText(
    'The answer is',
  );
  expect(remote.sends).toEqual(['A quick answer please']);
  await page.reload();
  await expect(page.getByText('A quick answer please', { exact: true })).toBeVisible();
  await page.getByRole('textbox').fill('Make a report');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('link', { name: /report.txt/ })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Task result' })
      .last()
      .getByRole('link', { name: /report.txt/ }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /report.txt/ }).click();
  expect((await download).suggestedFilename()).toBe('report.txt');
  await page.screenshot({ path: testInfo.outputPath('phone-conversation.png') });
  expect(errors).toEqual([]);
});

test('an unavailable Mac model keeps the phone draft and explains how to fix it', async ({
  page,
  remote,
}) => {
  remote.state.agents[0]!.provider = 'codex';
  remote.state.agents[0]!.model = 'retired-model';
  remote.state.providers = [
    {
      id: 'codex',
      label: 'Codex',
      status: 'ready',
      model: 'gpt-6-astra',
      detail: 'Connected',
      billing: '',
      models: [
        {
          id: 'gpt-6-astra',
          label: 'GPT-6 Astra',
          description: '',
          reasoningEfforts: [],
        },
      ],
    },
  ];
  await page.goto(remote.url);
  await page.getByRole('textbox').fill('How are you?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('choose an available model');
  await expect(page.getByRole('textbox')).toHaveValue('How are you?');
  expect(remote.state.threads).toHaveLength(0);
  expect(remote.sends).toHaveLength(0);
});

test('Home Screen and phone branding load the supplied logo through the paired link', async ({
  page,
  remote,
}, info) => {
  for (const route of ['', 'graph']) {
    await page.goto(new URL(route, remote.url).href);
    await expect(page).toHaveTitle('Sia');
    if (!route) {
      for (const location of ['.phone-brand', '.hero-presence']) {
        const logo = page.locator(`${location} .sia-logo`);
        await expect(logo).toBeVisible();
        await expect
          .poll(() => logo.evaluate((el) => (el as HTMLImageElement).naturalWidth))
          .toBe(256);
      }
      await page.screenshot({ path: info.outputPath('phone-logo.png') });
    }
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      'Sia',
    );
    const icon = page.locator('link[rel="apple-touch-icon"]');
    const url = new URL((await icon.getAttribute('href'))!, page.url());
    expect(url.pathname.startsWith(new URL(remote.url).pathname)).toBe(true);
    const response = await page.request.get(url.href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(await response.body()).toEqual(
      await readFile(resolve('src/renderer/assets/sia-logo.png')),
    );
    const image = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }, url.href);
    expect(image).toEqual({ width: 256, height: 256 });
    expect(
      (
        await page.request.get(new URL(`/assets/${url.pathname.split('/').at(-1)}`, url).href)
      ).status(),
    ).toBe(404);
  }
  expect(remote.sends).toHaveLength(0);
});

test('lost acknowledgement is retryable without duplicating the command', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  let dropped = false;
  await page.route('**/command', async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('textbox').fill('A quick answer with a dropped connection');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('alert')).toContainText('safely retry');
  await expect(page.getByRole('textbox')).toHaveValue(
    'A quick answer with a dropped connection',
  );
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(remote.sends).toHaveLength(1);
});

test('stops the current task and starts a new conversation without deleting the old one', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('textbox').fill('Read the current page and keep working');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop task' }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Task result' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /^New chat Start fresh/ }).click();
  await expect(page.getByRole('heading', { name: 'Your Mac, within reach.' })).toBeVisible();
  expect(remote.state.timeline.some((item) => item.kind === 'user')).toBe(true);
});

test('memory graph and note reading, plus accessible list view', async ({
  page,
  remote,
}, testInfo) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: /^Memory graph Explore/ }).click();
  await expect(page.getByText('4 memories · 1 link')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-memory.png') });
  await page.getByRole('button', { name: 'Show memory list' }).click();
  await page.getByRole('button', { name: /Keep it brief/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep it brief' })).toBeVisible();
  await expect(page.getByText('Prefer short answers about [[Work]].')).toBeVisible();
  await page.getByRole('button', { name: 'Close memory' }).click();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('textbox')).toBeVisible();
});

test('revoked pairing shows a useful reconnect message and removes old task content', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  // Change the token in place from the browser's perspective; port=0 allocates a new test listener.
  const rotated = await remote.service.configure({ operation: 'rotate' });
  await page.route('**/state', async (route) => {
    const stale = new URL(new URL(remote.url).pathname + 'state', rotated.url);
    const response = await route.fetch({ url: stale.href });
    await route.fulfill({ response });
  });
  await expect(
    page.getByText('Remote unavailable. Scan the current QR code in Sia on your Mac.'),
  ).toBeVisible();
  await page.getByRole('textbox').fill('Do not send');
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled();
});

test('keeps the composer usable on compact phones, landscape and dark appearance', async ({
  page,
  remote,
}, testInfo) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 390, height: 390 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('textbox')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Dictate message' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('phone-dark.png') });
  const surface = await page
    .locator('.phone-shell')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(surface).toBe('rgb(25, 30, 27)');
});

test('suggestions stay editable and drafts survive navigation', async ({ page, remote }) => {
  await page.goto(remote.url);
  await page.getByRole('button', { name: /Plan my week/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/Help me plan my week/);
  expect(remote.sends).toHaveLength(0);
  await page.getByRole('textbox').fill('My unsent draft');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Room for your next idea.' })).toBeVisible();
  await page.getByRole('button', { name: 'With files 0' }).click();
  await expect(page.getByRole('heading', { name: 'Good things take shape.' })).toBeVisible();
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.getByText('4 memories · 1 link')).toBeVisible();
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(page.getByRole('textbox')).toHaveValue('My unsent draft');
  expect(remote.sends).toHaveLength(0);
});

test('task cards lead back to replies and downloadable results', async ({
  page,
  remote,
}, testInfo) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  await page.getByRole('textbox').fill('Make a quick report');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('link', { name: /report.txt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All tasks 2' })).toBeVisible();
  await page.getByRole('button', { name: 'With files 1' }).click();
  await expect(page.getByRole('button', { name: /Finished A quick answer/ })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('phone-tasks.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /Finished Make a quick report/ }).click();
  await expect(page.getByRole('link', { name: /report.txt/ })).toBeInViewport();
  expect(remote.sends).toHaveLength(2);
});

test('a working task preserves the follow-up and a waiting task accepts it', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('textbox').fill('Please keep working');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Stop task' })).toBeVisible();
  await page.getByRole('textbox').fill('A quick follow-up');
  await page.getByRole('textbox').press('Enter');
  expect(remote.sends).toHaveLength(1);
  await expect(page.getByRole('textbox')).toHaveValue('A quick follow-up');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('button', { name: /Working Please keep working/ })).toBeVisible();
  remote.state.threads[0]!.status = 'waiting';
  await expect(
    page.getByRole('button', { name: /Needs you Please keep working/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Needs you Please keep working/ }).click();
  await expect(
    page.getByText('Reply below if Sia asked a question.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  expect(remote.sends).toEqual(['Please keep working', 'A quick follow-up']);
});

test('connection sheet traps focus, closes with Escape and restores focus', async ({
  page,
  remote,
}, testInfo) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('button', { name: 'Connection details' }).click();
  const panel = page.getByRole('dialog', { name: 'Your Mac, connected.' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Confirm actions on your Mac')).toBeVisible();
  await expect(panel.getByText('Keep Sia open and your Mac awake.')).toBeVisible();
  await panel.getByRole('button', { name: 'Close panel' }).press('Tab');
  await expect(panel.getByRole('button', { name: 'Close panel' })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('phone-connection.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  // WebKit does not focus tapped buttons, so explicitly focus the opener when testing keyboard return.
  await page.getByRole('button', { name: 'Connection details' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connection details' })).toBeFocused();
  expect(remote.sends).toHaveLength(0);
});

test('memory search filters notes and recovers from no results', async ({ page, remote }) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await page.getByRole('button', { name: 'Show memory list' }).click();
  await page.getByRole('textbox', { name: 'Search memories' }).fill('brief');
  await expect(page.getByRole('button', { name: /Morning summary/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Keep it brief/ }).click();
  await expect(page.getByRole('dialog', { name: 'Keep it brief' })).toBeVisible();
  await page.getByRole('button', { name: 'Close memory' }).click();
  await page.getByRole('textbox', { name: 'Search memories' }).fill('no matching memory');
  await expect(page.getByText(/No memories match/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Search memories' }).fill('');
  await expect(page.getByRole('button', { name: /Morning summary/ })).toBeVisible();
});

test('acknowledged commands survive a failed status refresh without claiming send failed', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  let loseUpdates = false;
  await page.route('**/state', (route) =>
    loseUpdates ? route.abort('failed') : route.continue(),
  );
  await page.route('**/command', async (route) => {
    const response = await route.fetch();
    loseUpdates = true;
    await route.fulfill({ response });
  });
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.getByRole('status', { name: 'Mac disconnected' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(remote.sends).toEqual(['A quick answer']);
  loseUpdates = false;
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
});

test('reduced motion keeps the home screen still without disabling navigation', async ({
  page,
  remote,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(remote.url);
  await expect(page.getByRole('heading', { name: 'Your Mac, within reach.' })).toBeVisible();
  const duration = await page
    .locator('.hero-presence')
    .evaluate((node) => getComputedStyle(node).animationDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
  const lights = await page
    .locator('.aurora-veil')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
  expect(lights).toEqual(['none', 'none', 'none']);
  await expect(page.locator('.phone-aurora')).toHaveAttribute('data-renderer', 'still');
  await expect(page.locator('.phone-aurora canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'More ideas' }).click();
  await expect(page.getByRole('button', { name: /Find that file/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little less to do.' })).toBeVisible();
});

test('starter cards remain fully reachable above the composer on shorter phones', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  for (const viewport of [
    { width: 390, height: 664 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const card = page.getByRole('button', { name: /Pick up where I left off/ });
    await expect(card).toBeInViewport({ ratio: 1 });
    const cardRect = await card.boundingBox();
    const composerRect = await page.locator('.phone-footer').boundingBox();
    expect(cardRect!.y + cardRect!.height).toBeLessThanOrEqual(composerRect!.y);
  }
});

test('revoking access also removes cached memories from the phone', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await page.getByRole('button', { name: 'Show memory list' }).click();
  await page.getByRole('button', { name: /Keep it brief/ }).click();
  await expect(page.getByRole('dialog', { name: 'Keep it brief' })).toBeVisible();
  await page.route('**/state', (route) =>
    route.fulfill({
      status: 404,
      json: { error: 'Remote unavailable. Scan the current QR code in Sia on your Mac.' },
    }),
  );
  await expect(page.getByText('Reconnect to your Mac to see your memories.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Prefer short answers about [[Work]].')).toHaveCount(0);
});

test('typing the next draft during an acknowledgement does not erase it', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  let release!: () => void;
  const acknowledgement = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/command', async (route) => {
    const response = await route.fetch();
    await acknowledgement;
    await route.fulfill({ response });
  });
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => remote.sends.length).toBe(1);
  await page.getByRole('textbox').fill('This is my next draft');
  release();
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
  await expect(page.getByRole('textbox')).toHaveValue('This is my next draft');
  expect(remote.sends).toEqual(['A quick answer']);
});

test('unsupported browser dictation guides users to the keyboard microphone', async ({
  page,
  remote,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });
  });
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('button', { name: 'Dictate message' }).click();
  await expect(
    page.getByText('Tap the microphone on your phone’s keyboard to dictate.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toBeFocused();
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Tap the microphone on your phone’s keyboard to dictate.'),
  ).toHaveCount(0);
});

test('a failure already explained in the reply is shown once and still needs attention', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  const detail = 'I could only verify part of the result. Please reopen the page to continue.';
  remote.state.timeline.find((item) => item.kind === 'assistant')!.text =
    `I checked the first source.\n\n${detail}`;
  remote.state.threads[0]!.status = 'failed';
  remote.state.timeline.push({
    id: randomUUID(),
    threadId: remote.state.activeThreadId!,
    sequence: remote.state.timeline.length + 1,
    timestamp: '',
    kind: 'error',
    text: detail,
  });
  await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
  await expect(page.getByText(detail, { exact: true })).toHaveCount(1);
});

type AuroraProbe = Window & { auroraProbe: { frames: number; pixels: number } };

test('phone Dither moves, pauses offscreen, and respects reduced motion', async ({
  page,
  remote,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(remote.url);
  const aurora = page.locator('.phone-aurora');
  const canvas = aurora.locator('.dither-container canvas');
  await expect(aurora).toHaveAttribute('data-renderer', 'dither');
  await expect(canvas).toBeVisible();
  const first = await canvas.screenshot();
  await expect.poll(async () => (await canvas.screenshot()).equals(first)).toBe(false);
  const dimensions = await canvas.evaluate((node) => ({
    width: (node as HTMLCanvasElement).width,
    height: (node as HTMLCanvasElement).height,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(600);
  expect(dimensions.height).toBeLessThanOrEqual(590);
  await page.getByRole('button', { name: /Plan my week/ }).click();
  await expect(page.getByRole('textbox')).toHaveValue(/Help me plan my week/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(aurora).toHaveAttribute('data-paused', 'true');
  await expect(canvas).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(canvas).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(aurora).toHaveAttribute('data-renderer', 'still');
  await expect(canvas).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(aurora).toHaveAttribute('data-renderer', 'dither');
  await expect(canvas).toBeVisible();
  expect(remote.sends).toHaveLength(0);
});

test('phone keeps its fallback aurora and working controls when graphics are unavailable', async ({
  page,
  remote,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (type: string, options: unknown) {
        return type === 'webgl' || type === 'webgl2'
          ? null
          : original.call(this, type, options);
      },
    });
  });
  await page.goto(remote.url);
  await expect(page.locator('.phone-aurora')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.phone-aurora .aurora-fallback')).toHaveCSS('opacity', '1');
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  expect(remote.sends).toEqual(['A quick answer']);
});

test('phone fallback remains visible in every view and both themes', async ({
  page,
  remote,
}, info) => {
  await page.goto(remote.url);
  const aurora = page.locator('.phone-aurora');
  await expect(aurora).toHaveAttribute('data-renderer', 'dither');
  await expect(aurora.locator('.dither-container canvas')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(aurora).toHaveAttribute('data-renderer', 'still');
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(aurora.locator('.aurora-fallback')).toHaveCSS('opacity', '1');
    for (const view of ['Chat', 'Tasks', 'Memory']) {
      await page
        .getByRole('navigation')
        .getByRole('button', { name: view, exact: true })
        .click();
      await expect(aurora).toBeVisible();
      await expect(aurora).toHaveCSS('opacity', view === 'Chat' ? '1' : '0.72');
      const clip = { x: 0, y: 80, width: 390, height: 240 };
      const painted = await page.screenshot({ clip, animations: 'disabled' });
      await aurora.evaluate((element) => {
        element.style.visibility = 'hidden';
      });
      const withoutAurora = await page.screenshot({ clip, animations: 'disabled' });
      expect(painted.equals(withoutAurora)).toBe(false);
      await aurora.evaluate((element) => {
        element.style.visibility = '';
      });
    }
    await page.getByRole('navigation').getByRole('button', { name: 'Chat' }).click();
    await page.screenshot({
      path: info.outputPath(`persistent-aurora-${colorScheme}.png`),
      animations: 'disabled',
    });
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(aurora).toHaveAttribute('data-paused', 'false');
  await expect(aurora).toHaveAttribute('data-renderer', 'dither');
  expect(remote.sends).toHaveLength(0);
});

test('graphics context loss falls back and recovers without losing the draft', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  const aurora = page.locator('.phone-aurora');
  const canvas = aurora.locator('.dither-container canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('textbox').fill('Keep this draft');
  await canvas.evaluate((node) => {
    node.dispatchEvent(new Event('webglcontextlost', { bubbles: true, cancelable: true }));
  });
  await expect(aurora).toHaveAttribute('data-renderer', 'fallback');
  await expect(aurora.locator('.aurora-fallback')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('textbox')).toHaveValue('Keep this draft');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect(aurora).toHaveAttribute('data-paused', 'true');
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(aurora).toHaveAttribute('data-paused', 'false');
  await expect(aurora).toHaveAttribute('data-renderer', 'dither');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A little less to do.' })).toBeVisible();
  expect(remote.sends).toHaveLength(0);
});

test('keyboard resize and Safari viewport pan keep the composer on the visible screen', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Message Sia' });
  const original = await page.evaluate(() => ({
    height: visualViewport!.height,
    top: visualViewport!.offsetTop,
  }));
  await input.fill('Keep my draft while the keyboard opens');
  await expect(input).toHaveCSS('font-size', '16px');
  // Mobile keyboards shrink and pan the visual viewport without resizing the layout viewport.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 380 });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 120 });
    visualViewport!.dispatchEvent(new Event('resize'));
    visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-phone-keyboard', 'open');
  await expect(page.getByRole('navigation')).toBeHidden();
  const shell = await page.locator('.phone-shell').boundingBox();
  const composer = await page.locator('.remote-composer').boundingBox();
  expect(shell!.y).toBeCloseTo(120, 0);
  expect(shell!.height).toBeCloseTo(380, 0);
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(500);
  expect(composer!.y).toBeGreaterThan(120);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Keep my draft while the keyboard opens');
  // Safari may pan again without a resize; don't lose the header above the visible viewport.
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 160 });
    visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await expect
    .poll(async () => (await page.locator('.phone-shell').boundingBox())!.y)
    .toBe(160);
  await input.blur();
  await page.evaluate(({ height, top }) => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: top });
    visualViewport!.dispatchEvent(new Event('resize'));
  }, original);
  await expect(page.locator('html')).toHaveAttribute('data-phone-keyboard', 'closed');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(input).toHaveValue('Keep my draft while the keyboard opens');
  expect(remote.sends).toHaveLength(0);
});

test('typing eases the welcome layout while preserving the Dither aurora and composer geometry', async ({
  page,
  remote,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(remote.url);
  await expect(page.locator('.remote-empty')).toHaveCSS('opacity', '1');
  await expect(page.locator('.phone-aurora')).toHaveAttribute('data-renderer', 'dither');
  const input = page.getByRole('textbox', { name: 'Message Sia' });
  await input.fill('A draft that stays right here');
  await expect(input).toBeFocused();
  const originalHeight = await page.evaluate(() => visualViewport!.height);
  const movement = await page.evaluate(async () => {
    const hero = document.querySelector('.hero-art')!;
    const canvas = document.querySelector<HTMLCanvasElement>('.dither-container canvas')!;
    const composer = document.querySelector('.remote-composer')!;
    const read = () => ({
      hero: parseFloat(getComputedStyle(hero).height),
      composer: composer.getBoundingClientRect().height,
      field: canvas.height,
    });
    const before = read();
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 380 });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 120 });
    visualViewport!.dispatchEvent(new Event('resize'));
    visualViewport!.dispatchEvent(new Event('scroll'));
    const samples: ReturnType<typeof read>[] = [];
    const start = performance.now();
    while (performance.now() - start < 600) {
      await new Promise(requestAnimationFrame);
      samples.push(read());
    }
    return {
      before,
      samples,
      sameCanvas: canvas === document.querySelector('.dither-container canvas'),
      keyboard: document.documentElement.dataset.phoneKeyboard,
      heroTransition: parseFloat(getComputedStyle(hero).transitionDuration),
    };
  });
  const end = movement.samples.at(-1)!;
  expect(movement.keyboard).toBe('open');
  expect(movement.heroTransition).toBeGreaterThan(0.3);
  expect(end.hero).toBeLessThan(movement.before.hero);
  expect(
    movement.samples.filter(
      (sample) => sample.hero < movement.before.hero && sample.hero > end.hero,
    ).length,
  ).toBeGreaterThan(0);
  expect(
    movement.samples.every(
      (sample) => Math.abs(sample.composer - movement.before.composer) < 1,
    ),
  ).toBe(true);
  expect(movement.samples.every((sample) => sample.field > 0 && sample.field <= 590)).toBe(
    true,
  );
  expect(movement.sameCanvas).toBe(true);
  await expect(page.locator('.hero-art')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('heading', { name: 'Your Mac, within reach.' })).toBeInViewport({
    ratio: 1,
  });
  await expect(page.locator('.phone-aurora .dither-aurora-field')).toHaveCSS('opacity', '0.47');
  await expect(page.locator('.phone-aurora')).toHaveAttribute('data-paused', 'false');
  await expect(page.locator('.welcome-suggestions')).toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: /Plan my week/ })).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('phone-typing-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('phone-typing-dark.png') });
  await input.blur();
  await page.evaluate((height) => {
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: height });
    visualViewport!.dispatchEvent(new Event('resize'));
  }, originalHeight);
  await expect(page.getByRole('button', { name: /Plan my week/ })).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.hero-art').evaluate((node) => parseFloat(getComputedStyle(node).height)),
    )
    .toBe(movement.before.hero);
  await expect(input).toHaveValue('A draft that stays right here');
  expect(remote.sends).toHaveLength(0);
});

test('headline and composer colors drift slowly, pause offscreen, and respect reduced motion', async ({
  page,
  remote,
}) => {
  await page.goto(remote.url);
  const surfaces = page.locator('.hero-copy h1 span, .remote-composer');
  const colors = () =>
    surfaces.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundPosition),
    );
  const speeds = await surfaces.evaluateAll((nodes) =>
    nodes.map((node) => parseFloat(getComputedStyle(node).animationDuration)),
  );
  expect(speeds.every((seconds) => seconds >= 15)).toBe(true);
  const before = await colors();
  await expect.poll(colors).not.toEqual(before);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.phone-aurora')).toHaveAttribute('data-paused', 'true');
  // WebKit commits a CSS animation pause on its next animation tick.
  // Measure only once the pause is applied, not while that final frame is pending.
  await surfaces.evaluateAll(async (nodes) => {
    await Promise.all(
      nodes.flatMap((node) => node.getAnimations().map((animation) => animation.ready)),
    );
  });
  const paused = await colors();
  await page.waitForTimeout(200);
  expect(await colors()).toEqual(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(colors).not.toEqual(paused);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await colors();
  await page.waitForTimeout(200);
  expect(await colors()).toEqual(still);
  await expect(page.getByRole('textbox')).toBeEditable();
  expect(remote.sends).toHaveLength(0);
});

test('pinch zoom is not treated as the phone keyboard opening', async ({ page, remote }) => {
  await page.goto(remote.url);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible();
  const before = await page.locator('.phone-shell').boundingBox();
  await page.evaluate(() => {
    Object.defineProperty(visualViewport!, 'scale', { configurable: true, value: 1.5 });
    Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 340 });
    Object.defineProperty(visualViewport!, 'offsetTop', { configurable: true, value: 80 });
    visualViewport!.dispatchEvent(new Event('resize'));
    visualViewport!.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  await expect(page.locator('html')).toHaveAttribute('data-phone-keyboard', 'closed');
  expect(await page.locator('.phone-shell').boundingBox()).toEqual(before);
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('liquid metal buttons animate, pause, keep disabled actions inert, and submit once', async ({
  page,
  remote,
}) => {
  await page.addInitScript(() => {
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    (window as unknown as AuroraProbe).auroraProbe = { frames: 0, pixels: 0 };
    WebGL2RenderingContext.prototype.drawArrays = function (mode, first, count) {
      draw.call(this, mode, first, count);
      (window as unknown as AuroraProbe).auroraProbe.frames++;
    };
  });
  const frames = () =>
    page.evaluate(() => (window as unknown as AuroraProbe).auroraProbe.frames);
  await page.goto(remote.url);
  const send = page.getByRole('button', { name: 'Send message' });
  await expect(send).toBeDisabled();
  await expect(send.locator('canvas')).toHaveCount(0);
  const metal = page
    .getByRole('button', { name: 'Connection details' })
    .locator('.metal-surface');
  await expect(metal).toHaveAttribute('data-metal', 'ready');
  const first = await frames();
  await expect.poll(frames).toBeGreaterThan(first);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const hidden = await frames();
  await page.waitForTimeout(200);
  expect(await frames()).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(frames).toBeGreaterThan(hidden);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const still = await frames();
  await page.waitForTimeout(200);
  expect(await frames()).toBe(still);
  await page.getByRole('textbox').fill('A quick answer');
  await send.press('Enter');
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  expect(remote.sends).toEqual(['A quick answer']);
  await expect(send).toBeDisabled();
});

test('metal fallback stays usable without WebGL2', async ({ page, remote }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (type: string, options: unknown) {
        return type === 'webgl2' ? null : getContext.call(this, type, options);
      },
    });
  });
  await page.goto(remote.url);
  await expect(
    page.getByRole('button', { name: 'Connection details' }).locator('.metal-surface'),
  ).toHaveAttribute('data-metal', 'fallback');
  await page.getByRole('textbox').fill('A quick answer');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Finished', { exact: true })).toBeVisible();
  expect(remote.sends).toEqual(['A quick answer']);
});
