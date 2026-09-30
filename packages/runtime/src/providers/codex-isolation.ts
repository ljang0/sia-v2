import { stringAt } from '../events.js';
import type { JsonRpcPeer } from '../json-rpc.js';
import type { CodexCustomModelProvider } from './codex.js';

/**
 * Provider-native extension surfaces that Sia replaces with its own audited dynamic tools.
 * Keep this list explicit so a pinned Codex upgrade cannot silently expand the tool surface.
 */
export const SIA_CODEX_DISABLED_FEATURES = [
  'apps',
  'plugins',
  'hooks',
  'skill_search',
  'skill_mcp_dependency_install',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'in_app_browser',
  'computer_use',
  'image_generation',
  'terminal_visualization_instructions',
  'artifact',
] as const;

/** Native Codex tools that remain part of Sia's intentionally small provider surface. */
export const SIA_CODEX_ENABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'view_image',
  'multi_agent',
] as const;

const SIA_CODEX_CONFIG_OVERRIDES = [
  'skills.include_instructions=false',
  'skills.bundled.enabled=false',
  'orchestrator.skills.enabled=false',
  'orchestrator.mcp.enabled=false',
  'notify=[]',
  'web_search="live"',
] as const;

export function codexAppServerArgs(
  baseArgs: readonly string[] = ['app-server', '--listen', 'stdio://'],
): readonly string[] {
  return [
    ...baseArgs,
    ...SIA_CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
    ...SIA_CODEX_ENABLED_FEATURES.flatMap((feature) => ['--enable', feature]),
    ...SIA_CODEX_CONFIG_OVERRIDES.flatMap((override) => ['-c', override]),
    '--strict-config',
  ];
}

interface CodexIsolationInventory {
  readonly mcpServerNames: readonly string[];
  readonly skillPaths: readonly string[];
}

export function isolationFailure(detail: string): Error {
  return new Error(`Codex isolation failed closed: ${detail}`);
}

export function strictRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('expected an object');
  return value as Record<string, unknown>;
}

function strictArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('expected an array');
  return value;
}

function assertEmptyArray(value: unknown): void {
  if (!Array.isArray(value) || value.length !== 0) throw new Error('expected an empty array');
}

function assertEmptyCollection(value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length !== 0) throw new Error('expected an empty collection');
    return;
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value as Record<string, unknown>).length !== 0
  ) {
    throw new Error('expected an empty collection');
  }
}

function assertWorkspaceRow(row: Readonly<Record<string, unknown>>, workspace: string): void {
  if (row.cwd !== workspace)
    throw new Error('inventory did not resolve the requested workspace');
}

function assertProcessIsolationConfig(config: Readonly<Record<string, unknown>>): void {
  const features = strictRecord(config.features);
  for (const feature of SIA_CODEX_DISABLED_FEATURES) {
    if (features[feature] !== false) throw new Error('a required feature override is absent');
  }
  for (const feature of SIA_CODEX_ENABLED_FEATURES) {
    if (features[feature] !== true)
      throw new Error('a required native feature override is absent');
  }
  if (config.web_search !== 'live') throw new Error('public web search is unavailable');
  assertEmptyArray(config.notify);
  const skills = strictRecord(config.skills);
  if (skills.include_instructions !== false) throw new Error('skill instructions are enabled');
  if (strictRecord(skills.bundled).enabled !== false)
    throw new Error('bundled skills are enabled');
  const orchestrator = strictRecord(config.orchestrator);
  if (strictRecord(orchestrator.skills).enabled !== false)
    throw new Error('orchestrator skills are enabled');
  if (strictRecord(orchestrator.mcp).enabled !== false)
    throw new Error('orchestrator MCP is enabled');
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = uniqueSorted(left);
  const sortedRight = uniqueSorted(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

export async function readIsolationInventory(
  peer: JsonRpcPeer,
  timeoutMs: number,
  workspace: string,
  signal?: AbortSignal,
): Promise<CodexIsolationInventory> {
  try {
    const requestOptions = { ...(signal ? { signal } : {}), timeoutMs: timeoutMs };
    const [rawConfigResult, rawSkillsResult, rawHooksResult] = await Promise.all([
      peer.request('config/read', { cwd: workspace, includeLayers: false }, requestOptions),
      peer.request('skills/list', { cwds: [workspace], forceReload: true }, requestOptions),
      peer.request('hooks/list', { cwds: [workspace] }, requestOptions),
    ]);

    const configResult = strictRecord(rawConfigResult);
    const config = strictRecord(configResult.config);
    assertProcessIsolationConfig(config);

    const rawMcpServers = config.mcp_servers;
    const mcpServers = rawMcpServers === undefined ? {} : strictRecord(rawMcpServers);
    for (const value of Object.values(mcpServers)) strictRecord(value);

    const skillsResult = strictRecord(rawSkillsResult);
    const skillRows = strictArray(skillsResult.data);
    if (skillRows.length !== 1) throw new Error('unexpected skills inventory size');
    const skillRow = strictRecord(skillRows[0]);
    assertWorkspaceRow(skillRow, workspace);
    assertEmptyArray(skillRow.errors);
    const skillPaths = strictArray(skillRow.skills).map((rawSkill) => {
      const skill = strictRecord(rawSkill);
      const path = stringAt(skill, ['path']);
      if (!path) throw new Error('skill inventory omitted a path');
      return path;
    });

    const hooksResult = strictRecord(rawHooksResult);
    const hookRows = strictArray(hooksResult.data);
    if (hookRows.length !== 1) throw new Error('unexpected hooks inventory size');
    const hookRow = strictRecord(hookRows[0]);
    assertWorkspaceRow(hookRow, workspace);
    assertEmptyArray(hookRow.errors);
    assertEmptyArray(hookRow.warnings);
    for (const rawHook of strictArray(hookRow.hooks)) {
      if (strictRecord(rawHook).enabled !== false)
        throw new Error('an inherited hook remains enabled');
    }

    return {
      mcpServerNames: uniqueSorted(Object.keys(mcpServers)),
      skillPaths: uniqueSorted(skillPaths),
    };
  } catch {
    throw isolationFailure('Codex extension inventory could not be read safely.');
  }
}

export function codexIsolationConfig(
  inventory: CodexIsolationInventory,
  customProvider?: CodexCustomModelProvider,
  disableNative = false,
  mac = false,
): Readonly<Record<string, unknown>> {
  const features = Object.fromEntries([
    ...SIA_CODEX_DISABLED_FEATURES.map((feature) => [feature, false] as const),
    ...SIA_CODEX_ENABLED_FEATURES.map((feature) => [feature, true] as const),
  ]);
  // Codex serializes multi-agent as a namespaced Responses tool. Model-lab
  // providers use the portable function-tool subset, so keep that namespace
  // on the native Codex-plan path only.
  if (customProvider || mac) features.multi_agent = false;
  if (disableNative)
    for (const feature of SIA_CODEX_ENABLED_FEATURES) features[feature] = false;
  return {
    features,
    // Custom labs receive computer/browser/search through Sia's audited
    // dynamic tools; only the user's native Codex plan uses provider search.
    web_search: customProvider || disableNative || mac ? 'disabled' : 'live',
    ...(mac ? { project_doc_max_bytes: 0 } : {}),
    notify: [],
    orchestrator: {
      skills: { enabled: false },
      mcp: { enabled: false },
    },
    skills: {
      include_instructions: false,
      bundled: { enabled: false },
      config: inventory.skillPaths.map((path) => ({ path, enabled: false })),
    },
    mcp_servers: Object.fromEntries(
      inventory.mcpServerNames.map((name) => [name, { enabled: false }]),
    ),
    ...(customProvider
      ? {
          model_provider: customProvider.id,
          model_providers: {
            [customProvider.id]: {
              name: customProvider.name,
              base_url: customProvider.baseUrl,
              wire_api: 'responses',
              experimental_bearer_token: customProvider.bearerToken,
              supports_standalone_web_search: false,
            },
          },
        }
      : {}),
  };
}

export async function verifyIsolation(
  peer: JsonRpcPeer,
  timeoutMs: number,
  workspace: string,
  threadId: string,
  expectedInventory: CodexIsolationInventory,
  customProvider: boolean,
  disableNative: boolean,
  signal?: AbortSignal,
  mac = false,
): Promise<void> {
  const [features, apps, pluginsResult, mcpServers, currentInventory] = await Promise.all([
    pagedRequest(peer, timeoutMs, 'experimentalFeature/list', { threadId }, signal),
    pagedRequest(peer, timeoutMs, 'app/list', { threadId, forceRefetch: false }, signal),
    peer.request(
      'plugin/list',
      { cwds: [workspace], forceRefetch: false },
      { ...(signal ? { signal } : {}), timeoutMs: timeoutMs },
    ),
    pagedRequest(
      peer,
      timeoutMs,
      'mcpServerStatus/list',
      { threadId, detail: 'toolsAndAuthOnly' },
      signal,
    ),
    readIsolationInventory(peer, timeoutMs, workspace, signal),
  ]);

  const featureStates = new Map<string, unknown>();
  for (const rawFeature of features) {
    const feature = strictRecord(rawFeature);
    const name = stringAt(feature, ['name']);
    if (name) featureStates.set(name, feature.enabled);
  }
  const disabledFeatures = disableNative
    ? [
        ...SIA_CODEX_DISABLED_FEATURES,
        // Codex 0.150 normalizes unified_exec to true even when requested false.
        // Its add_shell_tools gate requires shell_tool as well; requiring that
        // tool gate false keeps exec_command/write_stdin absent. Keep requesting
        // both false, but verify the effective tool gate rather than the backend.
        ...SIA_CODEX_ENABLED_FEATURES.filter((feature) => feature !== 'unified_exec'),
      ]
    : customProvider || mac
      ? [...SIA_CODEX_DISABLED_FEATURES, 'multi_agent']
      : SIA_CODEX_DISABLED_FEATURES;
  const enabledFeatures = disableNative
    ? []
    : customProvider || mac
      ? SIA_CODEX_ENABLED_FEATURES.filter((feature) => feature !== 'multi_agent')
      : SIA_CODEX_ENABLED_FEATURES;
  if (disabledFeatures.some((feature) => featureStates.get(feature) !== false)) {
    throw new Error('a provider-native feature remains enabled');
  }
  if (enabledFeatures.some((feature) => featureStates.get(feature) !== true)) {
    throw new Error('a required native feature is unavailable');
  }
  if (apps.length !== 0) throw new Error('provider apps remain visible');

  const plugins = strictRecord(pluginsResult);
  assertEmptyArray(plugins.marketplaces);
  assertEmptyArray(plugins.marketplaceLoadErrors);

  const observedMcpNames: string[] = [];
  for (const rawServer of mcpServers) {
    const server = strictRecord(rawServer);
    const name = stringAt(server, ['name']);
    if (!name) throw new Error('MCP status omitted a server name');
    observedMcpNames.push(name);
    if (server.serverInfo !== null) throw new Error('an MCP server was started');
    assertEmptyCollection(server.tools);
    assertEmptyArray(server.resources);
    assertEmptyArray(server.resourceTemplates);
  }

  if (!sameStrings(observedMcpNames, expectedInventory.mcpServerNames))
    throw new Error('MCP inventory changed during session creation');
  if (
    !sameStrings(currentInventory.mcpServerNames, expectedInventory.mcpServerNames) ||
    !sameStrings(currentInventory.skillPaths, expectedInventory.skillPaths)
  ) {
    throw new Error('extension inventory changed during session creation');
  }
}

async function pagedRequest(
  peer: JsonRpcPeer,
  timeoutMs: number,
  method: string,
  params: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<readonly unknown[]> {
  const data: unknown[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  for (let page = 0; page < 100; page += 1) {
    const result = strictRecord(
      await peer.request(
        method,
        { ...params, cursor, limit: 100 },
        { ...(signal ? { signal } : {}), timeoutMs: timeoutMs },
      ),
    );
    data.push(...strictArray(result.data));
    if (result.nextCursor === null || result.nextCursor === undefined) return data;
    if (
      typeof result.nextCursor !== 'string' ||
      result.nextCursor.length === 0 ||
      seenCursors.has(result.nextCursor)
    ) {
      throw new Error('invalid inventory cursor');
    }
    cursor = result.nextCursor;
    seenCursors.add(cursor);
  }
  throw new Error('inventory pagination exceeded its safety limit');
}
