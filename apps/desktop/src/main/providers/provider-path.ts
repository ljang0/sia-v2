import { stat, readdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

const MAX_VERSION_DIRECTORIES_PER_MANAGER = 32;

interface VersionManagerLayout {
  readonly root: string;
  readonly binSuffix: readonly string[];
}

/**
 * Build the CLI search path used by Finder-launched Sia on macOS.
 *
 * Finder does not inherit a person's interactive shell initialization, so
 * version-manager bins that work in Terminal can otherwise be invisible to
 * the desktop app. Discovery is bounded to known per-user layouts and never
 * invokes a shell or evaluates shell configuration.
 */
export async function macProviderPath(
  homeDirectory: string,
  currentPath = '',
): Promise<string> {
  const fixedCandidates = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homeDirectory, '.local/bin'),
    join(homeDirectory, '.npm-global/bin'),
    join(homeDirectory, 'Library/pnpm'),
    join(homeDirectory, '.bun/bin'),
    join(homeDirectory, '.volta/bin'),
    join(homeDirectory, '.asdf/shims'),
    join(homeDirectory, '.nodenv/shims'),
    join(homeDirectory, '.mise/shims'),
    join(homeDirectory, '.local/share/mise/shims'),
    join(homeDirectory, '.local/share/rtx/shims'),
  ];
  const layouts: VersionManagerLayout[] = [
    {
      root: join(homeDirectory, '.nvm/versions/node'),
      binSuffix: ['bin'],
    },
    {
      root: join(homeDirectory, '.fnm/node-versions'),
      binSuffix: ['installation', 'bin'],
    },
    {
      root: join(homeDirectory, '.local/share/fnm/node-versions'),
      binSuffix: ['installation', 'bin'],
    },
    {
      root: join(homeDirectory, 'Library/Application Support/fnm/node-versions'),
      binSuffix: ['installation', 'bin'],
    },
  ];
  const discovered = (
    await Promise.all(layouts.map(async (layout) => await discoverVersionBins(layout)))
  ).flat();
  const inherited = currentPath.split(delimiter).filter(Boolean);
  return [...new Set([...fixedCandidates, ...discovered, ...inherited])].join(delimiter);
}

async function discoverVersionBins(layout: VersionManagerLayout): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(layout.root);
  } catch {
    return [];
  }
  const candidates = entries
    .filter((name) => name && !name.startsWith('.'))
    .sort(compareVersionNamesDescending)
    .slice(0, MAX_VERSION_DIRECTORIES_PER_MANAGER)
    .map((name) => join(layout.root, name, ...layout.binSuffix));
  const existing = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        return (await stat(candidate)).isDirectory() ? candidate : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return existing.filter((candidate): candidate is string => Boolean(candidate));
}

function compareVersionNamesDescending(left: string, right: string): number {
  const leftParts = left.match(/\d+/g)?.map(Number) ?? [];
  const rightParts = right.match(/\d+/g)?.map(Number) ?? [];
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return right.localeCompare(left);
}
