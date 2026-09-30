// Adapted from romirthedev/notch RemoteControlServer.swift (6c74c30).
// Same LAN /t/<token>/ HTTP flow; Sia owns dispatch, encrypted pairing and asset serving.
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces, homedir } from 'node:os';
import { constants } from 'node:fs';
import { open, readFile, realpath } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { DesktopController } from './controller.js';
import type { RecordRepository } from './persistence.js';
import {
  phoneAssistantBlocker,
  type PhoneRemoteCommand,
  type PhoneRemoteSettings,
} from '../shared/phone-remote.js';
import { remoteState, remoteVault } from './phone-remote-state.js';
import { nativeRemoteSkills } from './phone-remote-files.js';

const commandSchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().trim().min(1).max(8000),
    session: z.string().max(100).nullable(),
  })
  .strict();
const sessionSchema = z.object({ session: z.string().max(100).nullable() }).strict();
interface Config {
  enabled: boolean;
  token: string;
  agentId?: string;
}
export interface RemoteNetwork {
  address: string;
  netmask: string;
}
interface Dependencies {
  controller: Pick<DesktopController, 'snapshot' | 'invoke' | 'remoteAccessAllowed'>;
  repository: RecordRepository;
  assets: string;
  qr: (url: string) => Promise<string>;
  advertise?: (port: number) => () => void;
  copy?: (url: string) => void;
  network?: () => RemoteNetwork | undefined;
  port?: number;
  outbox?: string;
}
const ipv4 = (address: string) =>
  address.split('.').reduce((result, part) => (result << 8) | Number(part), 0) >>> 0;
function lanNetwork(): RemoteNetwork | undefined {
  const entries = Object.entries(networkInterfaces()).sort(([a], [b]) =>
    a === 'en0' ? -1 : b === 'en0' ? 1 : a.localeCompare(b),
  );
  for (const [name, addresses] of entries) {
    if (!/^en\d+$/.test(name)) continue;
    const address = addresses?.find(
      (entry) =>
        entry.family === 'IPv4' &&
        !entry.internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address),
    );
    if (address) return { address: address.address, netmask: address.netmask };
  }
  return undefined;
}

export class PhoneRemote {
  #deps: Dependencies;
  #config: Config;
  #server: Server | undefined;
  #network: RemoteNetwork | undefined;
  #url: string | undefined;
  #qr: string | undefined;
  #stopAdvertising: (() => void) | undefined;
  #suspended = false;
  #disposed = false;
  #detail = 'Scan once. Ask Sia from your phone on the same Wi-Fi.';
  #timer: NodeJS.Timeout | undefined;
  #queue: Promise<unknown> = Promise.resolve();
  #generation = 0;
  #sending = false;
  #ignoredThread: string | undefined;
  #requests = new Map<string, { input: string; task: Promise<unknown> }>();
  #failedAuth = new Map<string, { count: number; reset: number }>();
  constructor(deps: Dependencies) {
    this.#deps = deps;
    const saved = deps.repository.get<Config>('phone-remote', 'settings');
    this.#config =
      saved && /^[a-f0-9]{64}$/.test(saved.token)
        ? saved
        : { enabled: false, token: randomBytes(32).toString('hex') };
  }
  async initialize(): Promise<void> {
    await this.#serialize(() => this.#reconcile());
    this.#timer = setInterval(() => {
      void this.#serialize(() => this.#reconcile()).catch(() => undefined);
    }, 10000);
    this.#timer.unref();
  }
  async configure(command: PhoneRemoteCommand): Promise<PhoneRemoteSettings> {
    return this.#serialize(async () => {
      if (this.#disposed) throw new Error('Sia is closing.');
      if (!this.#deps.controller.remoteAccessAllowed())
        throw new Error('Sign in to Sia on your Mac first.');
      if (command.operation === 'enable') {
        if (
          !this.#deps.controller.snapshot().agents.some((entry) => entry.id === command.agentId)
        )
          throw new Error('Choose an existing agent.');
        if (this.#config.agentId !== command.agentId) {
          this.#config.token = randomBytes(32).toString('hex');
          this.#stop();
        }
        this.#config.agentId = command.agentId;
        this.#config.enabled = true;
      } else if (command.operation === 'disable') {
        this.#config.enabled = false;
        this.#stop();
      } else if (command.operation === 'rotate') {
        this.#config.token = randomBytes(32).toString('hex');
        this.#stop();
      }
      if (command.operation !== 'status' && command.operation !== 'copy')
        this.#deps.repository.put('phone-remote', 'settings', this.#config);
      await this.#reconcile();
      if (command.operation === 'copy') {
        if (!this.#url || !this.#deps.copy)
          throw new Error('No local remote link is available to copy.');
        this.#deps.copy(this.#url);
      }
      if (this.#url && !this.#qr) {
        const url = this.#url;
        try {
          const qr = await this.#deps.qr(url);
          if (this.#url === url && this.#available()) this.#qr = qr;
        } catch {
          this.#detail =
            'Remote is ready. QR is unavailable; copy the private link to your phone.';
        }
      }
      if (!this.#deps.controller.remoteAccessAllowed()) {
        this.#stop();
        throw new Error('Sign in to Sia on your Mac first.');
      }
      return {
        enabled: this.#config.enabled,
        running: Boolean(this.#server),
        detail: this.#detail,
        ...(this.#config.agentId ? { agentId: this.#config.agentId } : {}),
        ...(this.#url ? { url: this.#url } : {}),
        ...(this.#qr ? { qr: this.#qr } : {}),
      };
    });
  }
  suspend(suspended: boolean): void {
    this.#suspended = suspended;
    if (suspended) this.#stop();
    else void this.#serialize(() => this.#reconcile()).catch(() => undefined);
  }
  dispose(): void {
    this.#disposed = true;
    clearInterval(this.#timer);
    this.#stop();
  }
  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.#queue.then(operation);
    this.#queue = task.catch(() => undefined);
    return task;
  }
  #stop(): void {
    this.#generation++;
    this.#server?.close();
    this.#server?.closeAllConnections();
    this.#server = undefined;
    this.#url = undefined;
    this.#qr = undefined;
    this.#stopAdvertising?.();
    this.#stopAdvertising = undefined;
    this.#requests.clear();
  }
  #available(): boolean {
    return (
      !this.#disposed &&
      !this.#suspended &&
      this.#config.enabled &&
      this.#deps.controller.remoteAccessAllowed() &&
      this.#deps.controller.snapshot().agents.some((entry) => entry.id === this.#config.agentId)
    );
  }
  async #reconcile(): Promise<void> {
    if (!this.#available()) {
      if (this.#server) this.#stop();
      this.#detail = this.#suspended
        ? 'Paused while your Mac is locked or asleep.'
        : !this.#config.enabled
          ? 'Scan once. Ask Sia from your phone on the same Wi-Fi.'
          : !this.#deps.controller.remoteAccessAllowed()
            ? 'Sign in to Sia on your Mac to resume.'
            : 'Choose an agent to use from your phone.';
      return;
    }
    const network = (this.#deps.network ?? lanNetwork)();
    if (
      this.#server &&
      network?.address === this.#network?.address &&
      network?.netmask === this.#network?.netmask
    )
      return;
    this.#stop();
    if (!network) {
      this.#detail = 'Join Wi-Fi or a private Ethernet network to create your link.';
      return;
    }
    this.#network = network;
    const generation = this.#generation;
    const server = createServer((request, response) => {
      void this.#handle(request, response, generation).catch((error: unknown) => {
        if (response.destroyed || response.headersSent) {
          response.destroy();
          return;
        }
        this.#json(response, error instanceof z.ZodError ? 400 : 409, {
          error:
            error instanceof RemoteError
              ? error.message
              : 'The request could not be completed. Check Sia on your Mac and try again.',
        });
      });
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.keepAliveTimeout = 2000;
    server.maxConnections = 24;
    try {
      await new Promise<void>((done, reject) => {
        server.once('error', reject);
        server.listen(this.#deps.port ?? 8738, network.address, () => {
          server.off('error', reject);
          done();
        });
      });
      if (generation !== this.#generation || !this.#available()) {
        server.close();
        server.closeAllConnections();
        return;
      }
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No address');
      this.#server = server;
      this.#url = `http://${network.address}:${address.port}/t/${this.#config.token}/`;
      this.#detail = 'Ready on your local network. Scan with your phone’s camera.';
      server.on('error', () => {
        this.#stop();
        this.#detail = 'The local connection stopped. Turn remote off and on to retry.';
      });
      try {
        this.#stopAdvertising = this.#deps.advertise?.(address.port);
      } catch {
        /* Direct QR link still works without Bonjour discovery. */
      }
    } catch {
      server.close();
      this.#detail =
        'Could not open the local port. Check Local Network access for Sia in System Settings, or close another Sia remote using port 8738.';
    }
  }
  #json(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  }
  async #body(request: IncomingMessage): Promise<unknown> {
    if (request.headers['content-type']?.split(';')[0] !== 'application/json')
      throw new RemoteError('Send a JSON request.');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 40000) throw new RemoteError('This message is too long.');
      chunks.push(Buffer.from(chunk));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new RemoteError('This message could not be read.');
    }
  }
  #state() {
    return remoteState(
      this.#deps.controller.snapshot(),
      this.#config.agentId!,
      this.#deps.outbox ?? join(homedir(), 'SiaOutbox'),
      this.#ignoredThread,
    );
  }
  async #handle(
    request: IncomingMessage,
    response: ServerResponse,
    generation: number,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const unavailable = () => {
      this.#json(response, 404, {
        error: 'Remote unavailable. Scan the current QR code in Sia on your Mac.',
      });
    };
    const address = request.socket.remoteAddress ?? '';
    const network = this.#network;
    if (
      !network ||
      !/^\d+\.\d+\.\d+\.\d+$/.test(address) ||
      (ipv4(address) & ipv4(network.netmask)) !==
        (ipv4(network.address) & ipv4(network.netmask))
    ) {
      unavailable();
      return;
    }
    if (!this.#url || request.headers.host !== new URL(this.#url).host) {
      unavailable();
      return;
    }
    const parts = (request.url ?? '').split('?')[0]!.split('/');
    const token = parts[2] ?? '';
    const failure = this.#failedAuth.get(address);
    if (failure && failure.reset > Date.now() && failure.count >= 10) {
      unavailable();
      return;
    }
    if (
      parts[1] !== 't' ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.#config.token))
    ) {
      if (this.#failedAuth.size > 128) this.#failedAuth.clear();
      this.#failedAuth.set(address, {
        count: failure && failure.reset > Date.now() ? failure.count + 1 : 1,
        reset: failure && failure.reset > Date.now() ? failure.reset : Date.now() + 60000,
      });
      unavailable();
      return;
    }
    if (!this.#available() || generation !== this.#generation) {
      unavailable();
      return;
    }
    const origin = request.headers.origin;
    if (
      (origin && origin !== new URL(this.#url).origin) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      unavailable();
      return;
    }
    const route = parts.slice(3).join('/');
    if (request.method === 'GET') {
      if (route === 'state') {
        this.#json(response, 200, this.#state());
        return;
      }
      if (route === 'vault' || route === 'note') {
        const library = await this.#deps.controller.invoke('assistant.library', {
          operation: 'list',
        });
        if (!this.#available() || generation !== this.#generation) {
          unavailable();
          return;
        }
        const selected = this.#deps.controller
          .snapshot()
          .agents.find((entry) => entry.id === this.#config.agentId);
        const skills = selected?.workspace
          ? await nativeRemoteSkills(selected.workspace, selected.id)
          : [];
        if (!this.#available() || generation !== this.#generation) {
          unavailable();
          return;
        }
        const vault = remoteVault(library, this.#config.agentId!, skills);
        const note =
          route === 'note'
            ? vault.notes.find(
                (entry) => entry.id === new URL(request.url!, this.#url).searchParams.get('id'),
              )
            : undefined;
        this.#json(
          response,
          route === 'note' && !note ? 404 : 200,
          route === 'vault'
            ? vault.graph
            : (note ?? { error: 'This note is no longer available.' }),
        );
        return;
      }
      if (route.startsWith('outbox/')) {
        let name: string;
        try {
          name = decodeURIComponent(route.slice(7));
        } catch {
          unavailable();
          return;
        }
        if (
          !name ||
          name !== basename(name) ||
          /[\\\x00-\x1f]/.test(name) ||
          !this.#state().turns.some((turn) => turn.files.includes(name))
        ) {
          unavailable();
          return;
        }
        const root = await realpath(this.#deps.outbox ?? join(homedir(), 'SiaOutbox'));
        const file = await open(join(root, name), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
            throw new RemoteError(
              'This file is too large to download here. Open it on your Mac.',
            );
          const buffer = Buffer.alloc(stat.size + 1);
          const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
          if (bytesRead > stat.size)
            throw new RemoteError(
              'This file is still being written. Try again when Sia finishes.',
            );
          const data = buffer.subarray(0, bytesRead);
          if (!this.#available() || generation !== this.#generation) {
            unavailable();
            return;
          }
          response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
          response.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
          });
          response.end(data);
        } finally {
          await file.close();
        }
        return;
      }
      const path =
        route === '' || route === 'index.html' || route === 'graph'
          ? 'index.html'
          : /^assets\/[a-zA-Z0-9_.-]+\.(js|css|woff2|svg|png)$/.test(route)
            ? route
            : undefined;
      if (path) {
        const data = await readFile(resolve(this.#deps.assets, path));
        if (!this.#available() || generation !== this.#generation) {
          unavailable();
          return;
        }
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.woff2': 'font/woff2',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        };
        // Built assets are content-hashed, so phones can keep them; the page itself stays fresh.
        if (path !== 'index.html')
          response.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        response.writeHead(200, { 'Content-Type': types[extname(path)]! });
        response.end(data);
        return;
      }
    } else if (request.method === 'POST' && ['command', 'cancel', 'clear'].includes(route)) {
      const body = await this.#body(request);
      if (!this.#available() || generation !== this.#generation) {
        unavailable();
        return;
      }
      if (route === 'command') {
        const input = commandSchema.parse(body);
        const serialized = JSON.stringify(input);
        const previous = this.#requests.get(input.id);
        if (previous) {
          if (previous.input !== serialized)
            throw new RemoteError('This request was already used. Refresh before sending.');
          this.#json(response, 200, await previous.task);
          return;
        }
        if (this.#sending)
          throw new RemoteError('Sia is accepting another request. Try again in a moment.');
        if (input.session !== this.#state().session)
          throw new RemoteError(
            'The current task changed on your Mac. Review it before sending again.',
          );
        this.#sending = true;
        const task = this.#send(input.text, input.session, generation).finally(() => {
          this.#sending = false;
        });
        this.#requests.set(input.id, { input: serialized, task });
        // Keep a bounded deduplication ledger for this link, including failures. Do not evict live work.
        if (this.#requests.size > 200)
          this.#requests.delete(this.#requests.keys().next().value!);
        this.#json(response, 200, await task);
        return;
      }
      const input = sessionSchema.parse(body);
      if (input.session !== this.#state().session || this.#sending)
        throw new RemoteError('The current task changed. Review it and try again.');
      if (route === 'cancel') {
        if (!input.session) throw new RemoteError('There is no current task to stop.');
        await this.#deps.controller.invoke('threads.cancel', {
          threadId: input.session.split(':')[0]!,
        });
      } else {
        if (
          this.#state().turns.at(-1)?.status === 'working' ||
          this.#state().turns.at(-1)?.status === 'waiting'
        )
          throw new RemoteError('Stop the current task before starting a new chat.');
        this.#ignoredThread = this.#deps.controller.snapshot().activeThreadId;
      }
      this.#json(response, 200, { ok: true });
      return;
    }
    unavailable();
  }
  async #send(text: string, session: string | null, generation: number): Promise<unknown> {
    const state = this.#state();
    const last = state.turns.at(-1);
    if (last?.status === 'working')
      throw new RemoteError('Sia is working. Stop this task before sending another.');
    if (last?.approval)
      throw new RemoteError(
        'Sia is waiting for you to approve a step on your Mac. Approve or deny it there, or stop the task here.',
      );
    this.#requireReadyAssistant(session);
    let createdThreadId: string | undefined;
    const previousThreadId = this.#deps.controller.snapshot().activeThreadId;
    try {
      const threadId =
        session?.split(':')[0] ??
        (createdThreadId = (
          await this.#deps.controller.invoke('threads.create', {
            agentId: this.#config.agentId!,
            title: text.slice(0, 80),
          })
        ).threadId);
      if (!this.#available() || generation !== this.#generation)
        throw new RemoteError('The remote link changed. Scan the current QR code.');
      const result = await this.#deps.controller.invoke('threads.send', {
        threadId,
        text,
        fromPhone: true,
      });
      this.#ignoredThread = undefined;
      return { ok: true, turnId: result.turnId };
    } catch (error) {
      if (createdThreadId) {
        const snapshot = this.#deps.controller.snapshot();
        const empty =
          snapshot.threads.some(
            (thread) =>
              thread.id === createdThreadId && thread.status === 'idle' && !thread.draft,
          ) && !snapshot.timeline.some((item) => item.threadId === createdThreadId);
        if (empty) {
          await this.#deps.controller
            .invoke('threads.delete', { threadId: createdThreadId })
            .catch(() => undefined);
          if (
            previousThreadId &&
            snapshot.activeThreadId === createdThreadId &&
            this.#deps.controller
              .snapshot()
              .threads.some((thread) => thread.id === previousThreadId)
          )
            await this.#deps.controller
              .invoke('threads.select', { threadId: previousThreadId })
              .catch(() => undefined);
        }
      }
      throw remoteStartError(error);
    }
  }
  #requireReadyAssistant(session: string | null): void {
    const snapshot = this.#deps.controller.snapshot();
    const agent = snapshot.agents.find((entry) => entry.id === this.#config.agentId);
    // The desktop turn gate remains authoritative. This early check prevents a
    // failed send from creating an empty conversation for an outdated model.
    const blocker = phoneAssistantBlocker(agent, snapshot.providers);
    if (blocker) throw new RemoteError(blocker);
    if (session) {
      const thread = snapshot.threads.find((entry) => entry.id === session.split(':')[0]);
      if (
        thread &&
        phoneAssistantBlocker(
          {
            name: agent?.name ?? 'This conversation',
            provider: thread.provider,
            model: thread.model,
          },
          snapshot.providers,
        )
      )
        throw new RemoteError(
          'This conversation uses a model that is no longer available. Start a new chat on your phone to use the assistant’s current model.',
        );
    }
  }
}
class RemoteError extends Error {}

function remoteStartError(error: unknown): RemoteError {
  if (error instanceof RemoteError) return error;
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Codex setup is in progress')) return new RemoteError(message);
  if (message.startsWith('Sign in to Sia')) return new RemoteError(message);
  if (message.startsWith('Review and accept the current raw research consent'))
    return new RemoteError(message);
  if (message.startsWith('Raw research capture could not be stored'))
    return new RemoteError(message);
  return new RemoteError(
    'Sia could not start this request. Open Sia on your Mac and check the assistant’s model and sign-in, then try again.',
  );
}
