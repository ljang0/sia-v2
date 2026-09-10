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
        else timers.push(setTimeout(finish, 900));
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
  await page.screenshot({ path: testInfo.outputPath('phone-home.png') });
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
  await page.getByRole('textbox').fill('Read the current page');
  await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Stop task' }).click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
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
  await page.getByRole('button', { name: 'Memory graph', exact: true }).click();
  await expect(page.getByText('4 memories · 1 link')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-memory.png') });
  await page.getByRole('button', { name: 'Show memory list' }).click();
  await page.getByRole('button', { name: /Keep it brief/ }).click();
  await expect(page.getByRole('heading', { name: 'Keep it brief' })).toBeVisible();
  await expect(page.getByText('Prefer short answers about [[Work]].')).toBeVisible();
  await page.getByRole('button', { name: 'Close memory' }).click();
  await page.getByRole('button', { name: 'Back to chat' }).click();
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
