import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAccount, ProviderId, ProviderSessionOptions } from '@sia/protocol';
import type { CommandRunner, SupportedVersionRange } from '../discovery.js';
import type { ProcessSupervisor } from '../supervisor.js';
import { AcpAdapter, type AcpMcpServer } from './acp.js';

/** The versions whose ACP model selection, config isolation and tool lockdown were checked. */
const DEFAULT_SUPPORTED_VERSIONS: SupportedVersionRange = {
  minimum: '1.19.0',
  maximumExclusive: '1.20.0',
};

/** OpenCode's provider id for the one model route Sia configures. */
const SIA_PROVIDER = 'sia';

/** A loopback Responses endpoint holding a model-scoped capability, not a real key. */
export interface OpenCodeModelEndpoint {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export interface OpenCodeAdapterOptions {
  readonly providerId: ProviderId;
  readonly accountOverride: ProviderAccount;
  readonly modelEndpoint: (session: ProviderSessionOptions) => Promise<OpenCodeModelEndpoint>;
  readonly command?: string;
  readonly supportedVersions?: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly mcpServerFactory?: (session: ProviderSessionOptions) => readonly AcpMcpServer[];
  readonly requestTimeoutMs?: number;
}

/**
 * OpenCode's inline configuration for one Sia session: only the Sia provider and model exist,
 * OpenCode's own tools are off, and only the Sia MCP tools (which cross ActionGateway) are
 * allowed without an ACP permission prompt.
 */
export function openCodeConfig(endpoint: OpenCodeModelEndpoint, model: string) {
  const id = `${SIA_PROVIDER}/${model}`;
  return {
    $schema: 'https://opencode.ai/config.json',
    autoupdate: false,
    share: 'disabled',
    enabled_providers: [SIA_PROVIDER],
    provider: {
      [SIA_PROVIDER]: {
        // OpenAI Responses through Sia's loopback model proxy.
        npm: '@ai-sdk/openai',
        name: 'Sia',
        options: { baseURL: endpoint.baseUrl, apiKey: endpoint.apiKey },
        models: { [model]: { name: model } },
      },
    },
    model: id,
    small_model: id,
    tools: { '*': false, 'sia_*': true },
    permission: { '*': 'deny', 'sia_*': 'allow' },
  };
}

/**
 * OpenCode over ACP for an included model. Each session runs in its own process with a private
 * HOME and XDG directories, so the person's OpenCode login, global config, plugins and history
 * are never loaded, and everything OpenCode writes is deleted with the session.
 */
export function createOpenCodeAdapter(options: OpenCodeAdapterOptions): AcpAdapter {
  return new AcpAdapter({
    provider: options.providerId,
    // Release admission is the harness registry's decision; the adapter itself is complete.
    productionEnabled: true,
    accountOverride: options.accountOverride,
    command: options.command ?? 'opencode',
    commandArgs: ['acp'],
    supportedVersions: options.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS,
    ...(options.commandRunner ? { commandRunner: options.commandRunner } : {}),
    ...(options.supervisor ? { supervisor: options.supervisor } : {}),
    ...(options.mcpServerFactory ? { mcpServerFactory: options.mcpServerFactory } : {}),
    ...(options.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    sessionProcess: async (session) => {
      const endpoint = await options.modelEndpoint(session);
      const home = await mkdtemp(join(tmpdir(), 'sia-opencode-'));
      await chmod(home, 0o700);
      const directories = {
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_DATA_HOME: join(home, 'data'),
        XDG_CACHE_HOME: join(home, 'cache'),
        XDG_STATE_HOME: join(home, 'state'),
      };
      await Promise.all(Object.values(directories).map((path) => mkdir(path, { mode: 0o700 })));
      return {
        env: {
          HOME: home,
          ...directories,
          OPENCODE_CONFIG_CONTENT: JSON.stringify(openCodeConfig(endpoint, session.model)),
        },
        model: `${SIA_PROVIDER}/${session.model}`,
        dispose: () => rm(home, { recursive: true, force: true }),
      };
    },
  });
}
