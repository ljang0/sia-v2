import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { WebSocketServer, type WebSocket as ServerSocket } from 'ws';
import type { DesktopSnapshot } from '../../src/shared/bridge';
import type { DesktopController } from '../../src/main/controller/desktop-controller';
import type { RecordRepository } from '../../src/main/storage/persistence';
import { PhoneRemote } from '../../src/main/remote/phone-remote';
import type { RelaySocket } from '../../src/main/remote/cloud-remote';

/**
 * The phone page over the encrypted relay, in real Chromium and WebKit: the built page is served
 * from a separate origin (like the Sia site), the relay is the real cloud RemoteRelayService
 * behind a local WebSocket server, and the Mac side is the real PhoneRemote in relay mode.
 */
interface RelayService {
  handle(event: { routeKey: string; connectionId: string; body?: string }): Promise<void>;
}
const cloudSource = new URL('../../../cloud/src', import.meta.url).href;

const agentId = '0d8f4a6e-91b2-4c1d-8e7f-3a2b1c0d9e8f';

async function startRelay() {
  const { RemoteRelayService } = (await import(
    /* @vite-ignore */ `${cloudSource}/services/remote-relay.ts`
  )) as { RemoteRelayService: new (deps: unknown) => RelayService };
  const { MemoryRemoteRelayStore } = (await import(
    /* @vite-ignore */ `${cloudSource}/memory.ts`
  )) as { MemoryRemoteRelayStore: new () => unknown };
  const sockets = new Map<string, ServerSocket>();
  const frames: string[] = [];
  const relay = new RemoteRelayService({
    store: new MemoryRemoteRelayStore(),
    pusher: {
      send: async (connectionId: string, frame: Record<string, unknown>) => {
        const socket = sockets.get(connectionId);
        if (!socket || socket.readyState !== socket.OPEN) return false;
        const data = JSON.stringify(frame);
        frames.push(data);
        socket.send(data);
        return true;
      },
      close: async (connectionId: string) => sockets.get(connectionId)?.close(),
    },
    idTokens: {
      verify: async (token: string) => {
        if (token !== 'mac-id-token') throw new Error('invalid');
        return { subject: 'user-1' };
      },
    },
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
  });
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (socket) => {
    const connectionId = randomUUID();
    sockets.set(connectionId, socket);
    // Queue each connection's frames so the relay sees them in order, as API Gateway does.
    let queue = relay.handle({ routeKey: '$connect', connectionId });
    socket.on('message', (data) => {
      const body = String(data);
      frames.push(body);
      queue = queue.then(() => relay.handle({ routeKey: '$default', connectionId, body }));
    });
    socket.on('close', () => {
      queue = queue.then(() => relay.handle({ routeKey: '$disconnect', connectionId }));
    });
  });
  await new Promise<void>((done) => server.once('listening', () => done()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('relay did not bind');
  return { url: `ws://127.0.0.1:${address.port}`, server, frames };
}

async function startSite() {
  const root = resolve('out/remote');
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://site.invalid').pathname;
    const file = path === '/remote/' ? 'index.html' : path.replace(/^\/remote\//, '');
    if (!/^[a-zA-Z0-9_./-]+$/.test(file) || file.includes('..')) {
      response.writeHead(404).end();
      return;
    }
    void readFile(join(root, file))
      .then((data) => {
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'text/plain' });
        response.end(data);
      })
      .catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('site did not bind');
  return { url: `http://127.0.0.1:${address.port}/remote/`, server };
}

const test = base.extend<{
  relayed: {
    pairingUrl: string;
    sends: string[];
    frames: string[];
    resolved: { approvalId: string; decision: string }[];
  };
}>({
  relayed: async ({}, use) => {
    const relay = await startRelay();
    const site = await startSite();
    const saved = new Map<string, unknown>();
    const sends: string[] = [];
    const resolved: { approvalId: string; decision: string }[] = [];
    const state = {
      agents: [{ id: agentId, name: 'Sia', workspace: '/tmp' }],
      threads: [],
      timeline: [],
      computer: { accessMode: 'mac', trust: 'auto' },
      activeAgentId: agentId,
      approvals: [],
    } as unknown as DesktopSnapshot;
    const invoke = async (
      method: string,
      input: { threadId: string; text: string; approvalId: string; decision: string },
    ) => {
      if (method === 'approvals.resolve') {
        resolved.push({ approvalId: input.approvalId, decision: input.decision });
        const approval = state.approvals!.find(({ id }) => id === input.approvalId)!;
        approval.status = input.decision === 'deny' ? 'denied' : 'approved';
        const thread = state.threads.find(({ id }) => id === approval.threadId)!;
        thread.status = 'idle';
        state.timeline.push({
          id: randomUUID(),
          threadId: thread.id,
          turnId: state.timeline.at(-1)!.turnId,
          sequence: state.timeline.length + 1,
          timestamp: new Date().toISOString(),
          kind: 'assistant',
          text: 'Approved from the phone and done.',
        } as never);
        return state;
      }
      if (method === 'threads.create') {
        const threadId = randomUUID();
        state.threads.push({ id: threadId, agentId, status: 'idle' } as never);
        state.activeThreadId = threadId;
        return { threadId, snapshot: state };
      }
      if (method === 'threads.send') {
        const turnId = randomUUID();
        sends.push(input.text);
        if (input.text.includes('needs approval')) {
          // Confirmations are on: the task pauses on one exact step.
          state.timeline.push({
            id: randomUUID(),
            threadId: input.threadId,
            turnId,
            sequence: state.timeline.length + 1,
            timestamp: new Date().toISOString(),
            kind: 'user',
            text: input.text,
          } as never);
          state.threads.find(({ id }) => id === input.threadId)!.status = 'waiting';
          state.approvals!.push({
            id: randomUUID(),
            threadId: input.threadId,
            status: 'pending',
            title: 'Send the weekly report to Alex',
          } as never);
          return { turnId, snapshot: state };
        }
        for (const [kind, text] of [
          ['user', input.text],
          ['assistant', 'Sealed and delivered: **42**.'],
        ] as const) {
          state.timeline.push({
            id: randomUUID(),
            threadId: input.threadId,
            turnId,
            sequence: state.timeline.length + 1,
            timestamp: new Date().toISOString(),
            kind,
            text,
          } as never);
        }
        return { turnId, snapshot: state };
      }
      return state;
    };
    let pairingUrl = '';
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
      qr: async (url) => {
        pairingUrl = url;
        return 'data:image/png;base64,cXI=';
      },
      relay: {
        relayUrl: relay.url,
        pageUrl: site.url,
        idToken: async () => 'mac-id-token',
        connect: (url) => new WebSocket(url) as unknown as RelaySocket,
      },
    });
    await service.initialize();
    await service.configure({ operation: 'enable', agentId });
    await expect
      .poll(async () => (await service.configure({ operation: 'status' })).relay?.connected)
      .toBe(true);
    await service.configure({ operation: 'pair' });
    try {
      await use({ pairingUrl, sends, frames: relay.frames, resolved });
    } finally {
      service.dispose();
      relay.server.close();
      site.server.close();
    }
  },
});

test('a paired phone reaches the Mac through the relay, which never sees plaintext', async ({
  page,
  relayed,
}) => {
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(relayed.pairingUrl);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible({
    timeout: 15_000,
  });
  // The pairing secrets leave the address bar once saved on the phone.
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('textbox').fill('What is six times seven?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Sealed and delivered', { exact: false })).toBeVisible();
  expect(relayed.sends).toEqual(['What is six times seven?']);
  // A reload uses the pairing saved on this phone.
  await page.reload();
  await expect(page.getByText('What is six times seven?', { exact: true })).toBeVisible();
  const relayTraffic = relayed.frames.join('\n');
  expect(relayTraffic).not.toContain('six times seven');
  expect(relayTraffic).not.toContain('Sealed and delivered');
  expect(errors).toEqual([]);
});

test('the paired phone approves the exact step its task is waiting on', async ({
  page,
  relayed,
}) => {
  test.slow();
  await page.goto(relayed.pairingUrl);
  await expect(page.getByRole('status', { name: 'Connected to your Mac' })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('textbox').fill('Send the report, this needs approval');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Sia asks: Send the weekly report to Alex')).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved from the phone and done.')).toBeVisible();
  expect(relayed.resolved).toEqual([{ approvalId: expect.any(String), decision: 'approve' }]);
  expect(relayed.frames.join('\n')).not.toContain('weekly report');
});
