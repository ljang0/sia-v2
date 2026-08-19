import type { ToolDescriptor } from '@sia/protocol';

export interface ToolCapability {
  readonly id: string;
  readonly sessionId: string;
  readonly expiresAt: number;
  readonly allowedTools: readonly string[];
}

export interface CapabilityChannel {
  invoke(
    request: {
      readonly capabilityId: string;
      readonly sessionId: string;
      readonly toolName: string;
      readonly arguments: Readonly<Record<string, unknown>>;
    },
    signal?: AbortSignal,
  ): Promise<unknown>;
  close?(): Promise<void>;
}

export interface ToolCapabilityClient {
  listTools(): readonly ToolDescriptor[];
  invoke(
    name: string,
    argumentsValue: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Memory-only client for a host-minted local capability. The host transport owns
 * the actual bearer credential (normally over a private Unix socket); it is never
 * read from an environment variable or exposed through MCP.
 */
export class ShortLivedCapabilityClient implements ToolCapabilityClient {
  readonly #capability: ToolCapability;
  readonly #channel: CapabilityChannel;
  readonly #tools: readonly ToolDescriptor[];
  readonly #now: () => number;
  #closed = false;

  constructor(options: {
    readonly capability: ToolCapability;
    readonly channel: CapabilityChannel;
    readonly tools: readonly ToolDescriptor[];
    readonly now?: () => number;
  }) {
    this.#capability = Object.freeze({
      ...options.capability,
      allowedTools: [...options.capability.allowedTools],
    });
    this.#channel = options.channel;
    this.#now = options.now ?? Date.now;
    const allowed = new Set(this.#capability.allowedTools);
    this.#tools = Object.freeze(
      options.tools
        .filter((tool) => allowed.has(tool.name))
        .map((tool) => Object.freeze({ ...tool })),
    );
  }

  listTools(): readonly ToolDescriptor[] {
    this.#assertUsable();
    return this.#tools;
  }

  async invoke(
    name: string,
    argumentsValue: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    this.#assertUsable();
    if (!this.#tools.some((tool) => tool.name === name))
      throw new Error(`Tool ${name} is outside this session capability`);
    return await this.#channel.invoke(
      {
        capabilityId: this.#capability.id,
        sessionId: this.#capability.sessionId,
        toolName: name,
        arguments: argumentsValue,
      },
      signal,
    );
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#channel.close?.();
  }

  #assertUsable(): void {
    if (this.#closed) throw new Error('Tool capability is closed');
    if (this.#capability.expiresAt <= this.#now()) throw new Error('Tool capability expired');
  }
}
