import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import {
  CODEX_SUPPORTED_VERSIONS,
  compareVersions,
  isVersionSupported,
  parseCliVersion,
  sanitizedEnvironment,
} from '@sia/runtime';

const exec = promisify(execFile);

/** Resolve once at startup so auth, model discovery and turns use the same binary.
 * Only installed, admitted versions are eligible; no installs or model turns. */
export async function discoverCodexInstallation(
  options: {
    environment?: NodeJS.ProcessEnv;
    bundledCommands?: readonly string[];
    managedCommand?: string;
    version?: (command: string) => Promise<string>;
  } = {},
): Promise<string | undefined> {
  const environment = sanitizedEnvironment(options.environment ?? process.env);
  const bundled =
    options.bundledCommands ??
    (process.platform === 'darwin'
      ? [
          '/Applications',
          ...(environment.HOME ? [join(environment.HOME, 'Applications')] : []),
        ].flatMap((directory) =>
          ['ChatGPT.app', 'Codex.app'].map((name) =>
            join(directory, name, 'Contents/Resources/codex'),
          ),
        )
      : []);
  const candidates = [
    ...new Set([
      ...(options.managedCommand ? [options.managedCommand] : []),
      ...(environment.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .map((dir) => join(dir, 'codex')),
      ...bundled,
    ]),
  ];
  const installed = (
    await Promise.all(
      candidates.map(async (command) => {
        try {
          await access(command, constants.X_OK);
          return command;
        } catch {
          return undefined;
        }
      }),
    )
  ).filter((command): command is string => Boolean(command));
  const versions = await Promise.all(
    installed.map(async (command) => {
      try {
        const output = options.version
          ? await options.version(command)
          : (
              await exec(command, ['--version'], {
                env: environment,
                timeout: 5000,
                killSignal: 'SIGKILL',
                maxBuffer: 4096,
              })
            ).stdout;
        const version = parseCliVersion(output);
        return version && isVersionSupported(version, CODEX_SUPPORTED_VERSIONS)
          ? { command, version }
          : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  const supported = versions.filter((entry): entry is { command: string; version: string } =>
    Boolean(entry),
  );
  supported.sort((a, b) => compareVersions(b.version, a.version));
  // Retain an unsupported installation for the normal, actionable compatibility error.
  return supported[0]?.command ?? installed[0];
}
