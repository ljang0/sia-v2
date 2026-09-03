import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';
import { isVersionSupported, parseCliVersion, sanitizedEnvironment } from '@sia/runtime';

import type { ProviderId, ProviderView } from '../shared/bridge.js';

interface ProviderCommand {
  executable: string;
  versionArgs: string[];
  model: string;
  label: string;
  billing: string;
  detail: string;
  restriction?: string;
  disabled?: boolean;
  minimumVersion?: string;
  maximumExclusiveVersion?: string;
  compatibleReleasePinned?: boolean;
}

const PROVIDERS: Record<ProviderId, ProviderCommand> = {
  codex: {
    executable: 'codex',
    versionArgs: ['--version'],
    model: 'gpt-5.6-sol',
    label: 'Codex',
    billing: 'Uses your existing ChatGPT Codex subscription.',
    detail: 'Official app server; Sia verifies ChatGPT sign-in without importing credentials.',
    minimumVersion: '0.147.0',
    maximumExclusiveVersion: '0.151.0',
  },
  meta: {
    executable: '',
    versionArgs: [],
    model: 'super_nova_ext',
    label: 'Included models',
    billing: 'Model-lab access is included with your Sia account; lab limits may apply.',
    detail:
      'Included Meta access runs through the Codex harness. Lab API keys never enter the desktop app.',
  },
  grok: {
    executable: 'grok',
    versionArgs: ['--version'],
    model: 'grok-code-fast',
    label: 'Grok',
    billing: 'Uses your eligible xAI subscription or API account.',
    detail: 'Adapter retained for protocol testing; runtime startup is blocked in this alpha.',
    restriction:
      'Not in the external alpha: Grok Build cannot yet exclude inherited plugins, skills, and MCP without replacing its authenticated profile.',
    disabled: true,
  },
  gemini: {
    executable: 'gemini',
    versionArgs: ['--version'],
    model: 'gemini-2.5-pro',
    label: 'Gemini',
    billing: 'Not available as a user-connected plan.',
    detail: 'Legacy adapter retained so existing threads remain readable.',
    restriction: 'Connect Codex or Claude, or use a model included with Sia.',
    disabled: true,
  },
  claude: {
    executable: 'claude',
    versionArgs: ['--version'],
    model: 'sonnet',
    label: 'Claude',
    billing: 'Uses your existing Claude Code subscription.',
    detail:
      'Official Claude Code CLI with isolated Sia tools and non-persistent provider sessions.',
    minimumVersion: '2.1.238',
    maximumExclusiveVersion: '2.2.0',
  },
};

let metaCloudAvailable: boolean | undefined;

export interface ProviderProbeRunner {
  run(
    executable: string,
    args: readonly string[],
    environment: NodeJS.ProcessEnv,
    allowNonZero?: boolean,
  ): Promise<ProbeCommandResult>;
}

/** Pins hosted-lab availability to the validated desktop configuration. */
export function configureMetaCloudAvailability(available: boolean): void {
  metaCloudAvailable = available;
}

export async function probeProviders(
  only?: ProviderId,
  environment: NodeJS.ProcessEnv = process.env,
  runner: ProviderProbeRunner = { run: runCommand },
): Promise<ProviderView[]> {
  const ids = only ? [only] : (Object.keys(PROVIDERS) as ProviderId[]);
  const safeEnvironment = sanitizedEnvironment(environment);
  return Promise.all(ids.map((id) => probeProvider(id, safeEnvironment, runner)));
}

async function probeProvider(
  id: ProviderId,
  environment: NodeJS.ProcessEnv,
  runner: ProviderProbeRunner,
): Promise<ProviderView> {
  const definition = PROVIDERS[id];
  if (definition.disabled) return view(id, definition, 'disabled');

  if (id === 'meta') {
    const configured = metaCloudAvailable ?? Boolean(environment.SIA_API_BASE_URL);
    return view(
      id,
      definition,
      configured ? 'ready' : 'unavailable',
      undefined,
      configured
        ? undefined
        : 'Included models require a release build configured for Sia cloud.',
    );
  }

  const executable = await findExecutable(definition.executable, environment.PATH ?? '');
  if (!executable) return view(id, definition, 'needs_install');

  try {
    const versionResult = await runner.run(executable, definition.versionArgs, environment);
    const version = parseCliVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
    if (!version) {
      return view(
        id,
        definition,
        'incompatible',
        undefined,
        'The CLI version could not be verified.',
      );
    }
    if (definition.compatibleReleasePinned === false) {
      return view(
        id,
        definition,
        'incompatible',
        version,
        'No tested CLI release currently guarantees the required standard ACP model configuration.',
      );
    }
    if (
      definition.minimumVersion &&
      !isVersionSupported(version, {
        minimum: definition.minimumVersion,
        ...(definition.maximumExclusiveVersion
          ? { maximumExclusive: definition.maximumExclusiveVersion }
          : {}),
      })
    ) {
      const upper = definition.maximumExclusiveVersion
        ? ` and older than ${definition.maximumExclusiveVersion}`
        : '';
      return view(
        id,
        definition,
        'incompatible',
        version,
        `Update to a supported CLI (${definition.minimumVersion} or newer${upper}).`,
      );
    }
    if (id === 'codex') {
      const auth = await runner.run(executable, ['login', 'status'], environment, true);
      const normalized = `${auth.stdout}\n${auth.stderr}`.toLowerCase();
      const explicitlyLoggedOut =
        /\bnot logged in\b|\bnot authenticated\b|authentication (?:is )?required|sign[ -]?in required|api key not found/.test(
          normalized,
        );
      const chatGptSubscription = normalized.includes('chatgpt');
      const apiKeyAccount = /\bapi[ -]?key\b/.test(normalized);
      // The release supports only the provider-owned ChatGPT plan flow. Exit
      // status proves authentication; the output must additionally identify
      // ChatGPT so an API-billed login cannot be mistaken for a connected plan.
      if (auth.code !== 0 || explicitlyLoggedOut) {
        return view(
          id,
          definition,
          'needs_login',
          version,
          'Sign in with the Codex CLI, then check again.',
        );
      }
      if (!chatGptSubscription) {
        return view(
          id,
          definition,
          'needs_login',
          version,
          apiKeyAccount
            ? 'This Codex login uses API billing. Sign in with ChatGPT to connect your plan.'
            : 'Sia could not verify a ChatGPT subscription. Sign in with ChatGPT, then check again.',
        );
      }
      return view(id, definition, 'ready', version, undefined, 'Connected to ChatGPT');
    }
    if (id === 'claude') {
      const auth = await runner.run(
        executable,
        ['auth', 'status', '--json'],
        environment,
        true,
      );
      let status: Record<string, unknown> = {};
      try {
        const output = auth.stdout.trim() || auth.stderr.trim();
        let value: unknown;
        try {
          value = JSON.parse(output) as unknown;
        } catch {
          const start = output.indexOf('{');
          const end = output.lastIndexOf('}');
          value =
            start >= 0 && end > start
              ? (JSON.parse(output.slice(start, end + 1)) as unknown)
              : {};
        }
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          status = value as Record<string, unknown>;
        }
      } catch {
        // A successful auth command must still return the documented JSON shape.
      }
      if (auth.code !== 0 || status.loggedIn !== true) {
        return view(
          id,
          definition,
          'needs_login',
          version,
          'Sign in with the Claude CLI, then check again.',
        );
      }
      const subscription =
        typeof status.subscriptionType === 'string' ? status.subscriptionType.trim() : '';
      const authMethod =
        typeof status.authMethod === 'string' ? status.authMethod.trim().toLowerCase() : '';
      const apiProvider =
        typeof status.apiProvider === 'string' ? status.apiProvider.trim().toLowerCase() : '';
      const subscriptionLogin =
        Boolean(subscription) ||
        /claude\.ai|oauth|subscription/.test(`${authMethod} ${apiProvider}`);
      if (!subscriptionLogin) {
        return view(
          id,
          definition,
          'needs_login',
          version,
          'This Claude login is not a Claude.ai subscription. Sign in with a Claude plan, then check again.',
        );
      }
      const account = subscription
        ? `Authenticated with Claude ${subscription
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (character) => character.toUpperCase())}`
        : 'Connected to Claude';
      return view(id, definition, 'ready', version, undefined, account);
    }
    return view(id, definition, 'ready', version);
  } catch (error) {
    return view(
      id,
      definition,
      'incompatible',
      undefined,
      error instanceof Error ? error.message : 'The provider could not be started.',
    );
  }
}

function view(
  id: ProviderId,
  definition: ProviderCommand,
  status: ProviderView['status'],
  version?: string,
  detailOverride?: string,
  account?: string,
): ProviderView {
  return {
    id,
    label: definition.label,
    status,
    model: definition.model,
    detail: detailOverride ?? definition.detail,
    billing: definition.billing,
    ...(version ? { version } : {}),
    ...(account ? { account } : {}),
    ...(definition.restriction ? { restriction: definition.restriction } : {}),
  };
}

async function findExecutable(name: string, pathValue: string): Promise<string | undefined> {
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next explicit PATH entry. Never invoke a shell for discovery.
    }
  }
  return undefined;
}

interface ProbeCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCommand(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  allowNonZero = false,
): Promise<ProbeCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    // A provider probe must never be able to stall desktop startup. SIGKILL is
    // intentional here: this is a bounded, read-only child process with no
    // state that needs graceful shutdown.
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 5_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 4_096) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4_096) stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error('CLI probe timed out.'));
        return;
      }
      if (code === 0 || allowNonZero) resolve({ code, stdout, stderr });
      else reject(new Error(`CLI probe exited with ${String(code)}.`));
    });
  });
}
