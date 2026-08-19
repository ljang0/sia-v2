import { createConnection, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import { toolDescriptorSchema, type ToolDescriptor } from '@sia/protocol';
import { JsonLinesTransport, JsonRpcPeer } from '@sia/runtime';
import { ShortLivedCapabilityClient, type CapabilityChannel } from './capability-client.js';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function connectSocket(
  path: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Socket> {
  if (!isAbsolute(path) || path.includes('\0')) {
    throw new Error('Capability socket path must be absolute');
  }
  return await new Promise<Socket>((resolve, reject) => {
    const socket = createConnection({ path });
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket.off('connect', onConnect);
      socket.off('error', onError);
    };
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        resolve(socket);
      }
    };
    const abort = (): void =>
      finish(signal?.reason ?? new Error('Capability socket connection aborted'));
    const onConnect = (): void => finish();
    const onError = (error: Error): void => finish(error);
    const timer = setTimeout(
      () => finish(new Error('Capability socket connection timed out')),
      timeoutMs,
    );
    socket.once('connect', onConnect);
    socket.once('error', onError);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

class UnixSocketCapabilityChannel implements CapabilityChannel {
  readonly #peer: JsonRpcPeer;
  readonly #socket: Socket;

  constructor(peer: JsonRpcPeer, socket: Socket) {
    this.#peer = peer;
    this.#socket = socket;
  }

  async invoke(
    request: {
      readonly capabilityId: string;
      readonly sessionId: string;
      readonly toolName: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return await this.#peer.request('capability/invoke', request, {
      ...(signal ? { signal } : {}),
      timeoutMs: 5 * 60_000,
    });
  }

  async close(): Promise<void> {
    await this.#peer.close();
    this.#socket.destroy();
  }
}

export interface UnixSocketCapabilityBootstrap {
  readonly socketPath: string;
  readonly capabilityId: string;
  readonly sessionId: string;
  readonly connectTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * Resolves descriptors and expiry from a private host Unix socket. The host must
 * validate peer identity as well as the opaque, expiring capability id.
 */
export async function connectUnixSocketCapability(
  options: UnixSocketCapabilityBootstrap,
): Promise<ShortLivedCapabilityClient> {
  const socket = await connectSocket(
    options.socketPath,
    options.connectTimeoutMs ?? 5_000,
    options.signal,
  );
  const peer = new JsonRpcPeer(new JsonLinesTransport(socket, socket));
  try {
    const raw = record(
      await peer.request(
        'capability/describe',
        { capabilityId: options.capabilityId, sessionId: options.sessionId },
        {
          ...(options.signal ? { signal: options.signal } : {}),
          timeoutMs: options.connectTimeoutMs ?? 5_000,
        },
      ),
    );
    if (typeof raw.expiresAt !== 'number' || !Number.isFinite(raw.expiresAt)) {
      throw new Error('Host returned an invalid capability expiry');
    }
    if (!Array.isArray(raw.tools))
      throw new Error('Host returned an invalid capability tool list');
    const tools: ToolDescriptor[] = raw.tools.map((tool) => toolDescriptorSchema.parse(tool));
    return new ShortLivedCapabilityClient({
      capability: {
        id: options.capabilityId,
        sessionId: options.sessionId,
        expiresAt: raw.expiresAt,
        allowedTools: tools.map((tool) => tool.name),
      },
      channel: new UnixSocketCapabilityChannel(peer, socket),
      tools,
    });
  } catch (error) {
    await peer.close();
    socket.destroy();
    throw error;
  }
}

export interface ToolBridgeLaunchSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: readonly { readonly name: 'ELECTRON_RUN_AS_NODE'; readonly value: '1' }[];
}

/** Build the absolute ACP MCP-server launch spec for a bridge bundled in Electron. */
export function createPackagedToolBridgeLaunchSpec(options: {
  readonly electronExecutable: string;
  readonly entryPath: string;
  readonly socketPath: string;
  readonly capabilityId: string;
  readonly sessionId: string;
}): ToolBridgeLaunchSpec {
  for (const [name, value] of Object.entries(options)) {
    if (!value || value.includes('\0')) throw new Error(`Invalid ${name}`);
  }
  if (
    !isAbsolute(options.electronExecutable) ||
    !isAbsolute(options.entryPath) ||
    !isAbsolute(options.socketPath)
  ) {
    throw new Error(
      'Packaged tool bridge executable, entry, and socket paths must be absolute',
    );
  }
  return {
    command: options.electronExecutable,
    args: [
      options.entryPath,
      '--socket',
      options.socketPath,
      '--capability',
      options.capabilityId,
      '--session',
      options.sessionId,
    ],
    env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
  };
}
