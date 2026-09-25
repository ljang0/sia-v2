import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DesktopSnapshot } from '../../src/shared/bridge';
import type { DesktopController } from '../../src/main/controller';
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
  expect(remote.sends).toEqual(['A quick answer please']);
  await page.reload();
  await expect(page.getByText('A quick answer please', { exact: true })).toBeVisible();
  await page.getByRole('textbox').fill('Make a report');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('link', { name: /report.txt/ })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /report.txt/ }).click();
  expect((await download).suggestedFilename()).toBe('report.txt');
  await page.screenshot({ path: testInfo.outputPath('phone-conversation.png') });
  expect(errors).toEqual([]);
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
  await expect(panel.getByText('Full bypass is on')).toBeVisible();
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
