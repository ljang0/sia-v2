import { spawn } from 'node:child_process';
import type { ProviderProbeResult } from '@sia/protocol';

export interface CommandResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandRunner {
  run(command: string, args: readonly string[], signal?: AbortSignal): Promise<CommandResult>;
}

export class SpawnCommandRunner implements CommandRunner {
  async run(
    command: string,
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<CommandResult> {
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  }
}

export interface SupportedVersionRange {
  readonly minimum: string;
  readonly maximumExclusive?: string;
  /** Exact separately verified builds outside the normal stable release range. */
  readonly additionalVersions?: readonly string[];
}

export function parseCliVersion(text: string): string | undefined {
  return text.match(/(?:^|\s|v)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1];
}

function numericParts(version: string): readonly number[] {
  return version
    .split('-', 1)[0]!
    .split('.')
    .map((part) => Number.parseInt(part, 10));
}

export function compareVersions(left: string, right: string): number {
  const a = numericParts(left);
  const b = numericParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  const aPre = left.split('+', 1)[0]!.split('-').slice(1).join('-');
  const bPre = right.split('+', 1)[0]!.split('-').slice(1).join('-');
  if (!aPre || !bPre) return aPre ? -1 : bPre ? 1 : 0;
  const aIds = aPre.split('.');
  const bIds = bPre.split('.');
  for (let index = 0; index < Math.max(aIds.length, bIds.length); index += 1) {
    const aId = aIds[index];
    const bId = bIds[index];
    if (aId === bId) continue;
    if (aId === undefined) return -1;
    if (bId === undefined) return 1;
    const aNumeric = /^\d+$/.test(aId);
    const bNumeric = /^\d+$/.test(bId);
    if (aNumeric && bNumeric) return Math.sign(Number(aId) - Number(bId));
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return aId < bId ? -1 : 1;
  }
  return 0;
}

export function isVersionSupported(version: string, range: SupportedVersionRange): boolean {
  if (range.additionalVersions?.includes(version)) return true;
  // Prereleases need exact admission even when their numeric core is in range.
  if (version.includes('-')) return false;
  return (
    compareVersions(version, range.minimum) >= 0 &&
    (range.maximumExclusive === undefined ||
      compareVersions(version, range.maximumExclusive) < 0)
  );
}

export async function discoverCli(options: {
  readonly command: string;
  readonly versionArgs?: readonly string[];
  readonly range: SupportedVersionRange;
  readonly runner?: CommandRunner;
  readonly signal?: AbortSignal;
}): Promise<ProviderProbeResult> {
  try {
    const result = await (options.runner ?? new SpawnCommandRunner()).run(
      options.command,
      options.versionArgs ?? ['--version'],
      options.signal,
    );
    if (result.code !== 0) {
      return {
        available: false,
        supported: false,
        reason: result.stderr.trim() || 'Version probe failed',
      };
    }
    const version = parseCliVersion(`${result.stdout}\n${result.stderr}`);
    if (!version)
      return {
        available: true,
        supported: false,
        executable: options.command,
        reason: 'Could not parse CLI version',
      };
    const supported = isVersionSupported(version, options.range);
    return {
      available: true,
      supported,
      version,
      executable: options.command,
      ...(!supported
        ? {
            reason: `Unsupported version ${version}; expected >=${options.range.minimum}${options.range.maximumExclusive ? ` <${options.range.maximumExclusive}` : ''}`,
          }
        : {}),
    };
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException;
    return {
      available: false,
      supported: false,
      reason:
        candidate.code === 'ENOENT' ? `${options.command} is not installed` : candidate.message,
    };
  }
}
