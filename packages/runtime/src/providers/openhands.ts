import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAccount, ProviderId, ProviderSessionOptions } from '@sia/protocol';
import type { CommandRunner, SupportedVersionRange } from '../discovery.js';
import type { ProcessSupervisor } from '../supervisor.js';
import { AcpAdapter, type AcpMcpServer } from './acp.js';

/** The versions whose ACP session, settings isolation and confirmation flow were checked. */
const DEFAULT_SUPPORTED_VERSIONS: SupportedVersionRange = {
  minimum: '1.16.0',
  maximumExclusive: '1.17.0',
};

/** A loopback Chat Completions endpoint holding a model-scoped capability, not a real key. */
export interface OpenHandsModelEndpoint {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export interface OpenHandsAdapterOptions {
  readonly providerId: ProviderId;
  readonly accountOverride: ProviderAccount;
  readonly modelEndpoint: (session: ProviderSessionOptions) => Promise<OpenHandsModelEndpoint>;
  readonly command?: string;
  readonly supportedVersions?: SupportedVersionRange;
  readonly commandRunner?: CommandRunner;
  readonly supervisor?: ProcessSupervisor;
  readonly mcpServerFactory?: (session: ProviderSessionOptions) => readonly AcpMcpServer[];
  readonly requestTimeoutMs?: number;
}

/**
 * OpenHands' agent settings for one Sia session. LiteLLM's `openai/` prefix sends Chat
 * Completions to the loopback proxy; OpenHands adds its own default tools at runtime.
 */
export function openHandsAgentSettings(endpoint: OpenHandsModelEndpoint, model: string) {
  return {
    kind: 'Agent',
    llm: {
      model: `openai/${model}`,
      base_url: endpoint.baseUrl,
      api_key: endpoint.apiKey,
      usage_id: 'agent',
    },
    tools: [],
  };
}

/**
 * OpenHands over ACP for an included model. Each session runs in its own process with a private
 * HOME and OpenHands persistence directory holding only Sia's settings, so the person's
 * OpenHands login, settings, skills and history are never loaded. OpenHands' own terminal and
 * file tools stay in its default "always ask" confirmation mode: every such action becomes a
 * Sia approval request, and Sia never chooses OpenHands' "always proceed" option.
 */
export function createOpenHandsAdapter(options: OpenHandsAdapterOptions): AcpAdapter {
  return new AcpAdapter({
    provider: options.providerId,
    // Release admission is the harness registry's decision; the adapter itself is complete.
    productionEnabled: true,
    accountOverride: options.accountOverride,
    command: options.command ?? 'openhands',
    commandArgs: ['acp'],
    supportedVersions: options.supportedVersions ?? DEFAULT_SUPPORTED_VERSIONS,
    ...(options.commandRunner ? { commandRunner: options.commandRunner } : {}),
    ...(options.supervisor ? { supervisor: options.supervisor } : {}),
    ...(options.mcpServerFactory ? { mcpServerFactory: options.mcpServerFactory } : {}),
    ...(options.requestTimeoutMs ? { requestTimeoutMs: options.requestTimeoutMs } : {}),
    sessionProcess: async (session) => {
      const endpoint = await options.modelEndpoint(session);
      const home = await mkdtemp(join(tmpdir(), 'sia-openhands-'));
      await chmod(home, 0o700);
      const persistence = join(home, '.openhands');
      await mkdir(persistence, { mode: 0o700 });
      await writeFile(
        join(persistence, 'agent_settings.json'),
        `${JSON.stringify(openHandsAgentSettings(endpoint, session.model))}\n`,
        { encoding: 'utf8', mode: 0o600, flag: 'wx' },
      );
      return {
        env: {
          HOME: home,
          OPENHANDS_PERSISTENCE_DIR: persistence,
          OPENHANDS_SUPPRESS_BANNER: '1',
        },
        dispose: () => rm(home, { recursive: true, force: true }),
      };
    },
  });
}
