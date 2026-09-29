import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';

import type { ToolDescriptor } from '@sia/protocol';
import type { AcpMcpServer } from '@sia/runtime';
import { JsonLinesTransport, JsonRpcPeer } from '@sia/runtime';
import { createPackagedToolBridgeLaunchSpec } from '@sia/tool-bridge';

interface Capability {
  id: string;
  sessionId: string;
  expiresAt: number;
  tools: readonly ToolDescriptor[];
}

export interface CapabilityToolInvoker {
  invoke(
    sessionId: string,
    toolName: string,
    argumentsValue: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

/** Private, process-local host for ACP's short-lived Sia MCP bridge. */
export class CapabilitySocketHost {
  readonly #tools: () => readonly ToolDescriptor[];
  readonly #invoker: CapabilityToolInvoker;
  readonly #peers = new Set<JsonRpcPeer>();
  readonly #capabilities = new Map<string, Capability>();
  #server: Server | undefined;
  #directory: string | undefined;
  #socketPath: string | undefined;
  #electronExecutable: string | undefined;
  #entryPath: string | undefined;

  constructor(options: {
    tools: readonly ToolDescriptor[] | (() => readonly ToolDescriptor[]);
    invoker: CapabilityToolInvoker;
  }) {
    const tools = options.tools;
    this.#tools = typeof tools === 'function' ? tools : () => tools;
    this.#invoker = options.invoker;
  }

  async start(options: {
    temporaryDirectory: string;
    electronExecutable: string;
    entryPath: string;
  }): Promise<void> {
    if (this.#server) return;
    this.#directory = await mkdtemp(join(options.temporaryDirectory, 'sia-cap-'));
    await chmod(this.#directory, 0o700);
    this.#socketPath = join(this.#directory, 'bridge.sock');
    this.#electronExecutable = options.electronExecutable;
    this.#entryPath = options.entryPath;
    const server = createServer((socket) => this.#accept(socket));
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => {
        server.off('listening', ready);
        reject(error);
      };
      const ready = (): void => {
        server.off('error', fail);
        resolve();
      };
      server.once('error', fail);
      server.once('listening', ready);
      server.listen(this.#socketPath);
    });
    await chmod(this.#socketPath, 0o600);
  }

  /**
   * Issues the only live capability for a provider session. A thread's new provider session
   * replaces its old one, so earlier capabilities for the same session id are revoked.
   */
  mint(sessionId: string): AcpMcpServer {
    if (!this.#socketPath || !this.#electronExecutable || !this.#entryPath) {
      throw new Error('The ACP capability host is not running.');
    }
    this.#pruneExpired();
    this.revokeSession(sessionId);
    const capability: Capability = {
      id: randomUUID(),
      sessionId,
      expiresAt: Date.now() + 8 * 60 * 60_000,
      tools: this.#tools(),
    };
    this.#capabilities.set(capability.id, capability);
    const launch = createPackagedToolBridgeLaunchSpec({
      electronExecutable: this.#electronExecutable,
      entryPath: this.#entryPath,
      socketPath: this.#socketPath,
      capabilityId: capability.id,
      sessionId,
    });
    return {
      name: 'sia',
      command: launch.command,
      args: launch.args,
      env: launch.env,
    };
  }

  /** Ends every capability minted for a provider session that has been disposed. */
  revokeSession(sessionId: string): void {
    for (const [id, capability] of this.#capabilities)
      if (capability.sessionId === sessionId) this.#capabilities.delete(id);
  }

  /** Ends every capability, for example when all provider sessions are reset. */
  revokeAll(): void {
    this.#capabilities.clear();
  }

  get capabilityCount(): number {
    return this.#capabilities.size;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    this.#capabilities.clear();
    await Promise.allSettled([...this.#peers].map((peer) => peer.close()));
    this.#peers.clear();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const directory = this.#directory;
    this.#directory = undefined;
    this.#socketPath = undefined;
    if (directory) await rm(directory, { recursive: true, force: true });
  }

  #accept(socket: Socket): void {
    const peer = new JsonRpcPeer(new JsonLinesTransport(socket, socket));
    this.#peers.add(peer);
    socket.once('close', () => this.#peers.delete(peer));
    peer.onRequest(async (method, params) => {
      const request = record(params);
      const capability = this.#requireCapability(request.capabilityId, request.sessionId);
      if (method === 'capability/describe') {
        return { expiresAt: capability.expiresAt, tools: capability.tools };
      }
      if (method === 'capability/invoke') {
        const toolName = requiredString(request.toolName, 'toolName');
        if (!capability.tools.some((tool) => tool.name === toolName)) {
          throw Object.assign(new Error('Tool is outside this capability.'), { code: -32601 });
        }
        return await this.#invoker.invoke(
          capability.sessionId,
          toolName,
          record(request.arguments),
        );
      }
      throw Object.assign(new Error('Method not found.'), { code: -32601 });
    });
  }

  #requireCapability(idValue: unknown, sessionValue: unknown): Capability {
    const id = requiredString(idValue, 'capabilityId');
    const sessionId = requiredString(sessionValue, 'sessionId');
    const capability = this.#capabilities.get(id);
    // A caller naming the wrong session must not be able to revoke someone else's capability.
    if (capability && capability.expiresAt <= Date.now()) this.#capabilities.delete(id);
    if (
      !capability ||
      capability.sessionId !== sessionId ||
      capability.expiresAt <= Date.now()
    ) {
      throw Object.assign(
        new Error('Capability is missing, expired, or belongs to another session.'),
        {
          code: -32001,
        },
      );
    }
    return capability;
  }

  #pruneExpired(): void {
    const now = Date.now();
    for (const [id, capability] of this.#capabilities)
      if (capability.expiresAt <= now) this.#capabilities.delete(id);
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw Object.assign(new Error(`${label} is invalid.`), { code: -32602 });
  }
  return value;
}
