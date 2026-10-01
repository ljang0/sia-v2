import { readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export interface InstalledApplication {
  id: string;
  name: string;
  path: string;
}

/** Fixed macOS application directories only. No model-supplied paths, URLs or launch arguments. */
export async function installedApplications(): Promise<InstalledApplication[]> {
  const apps: InstalledApplication[] = [];
  let visited = 0;
  async function scan(root: string, depth: number): Promise<void> {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.slice(0, 500)) {
      if (++visited > 2000) return;
      if (root === '/System/Library/CoreServices' && entry.name !== 'Finder.app') continue;
      const safariLink =
        entry.isSymbolicLink() && root === '/Applications' && entry.name === 'Safari.app';
      if (!entry.isDirectory() && !safariLink) continue;
      const path = join(root, entry.name);
      if (entry.name.endsWith('.app')) {
        try {
          const canonical = await realpath(path);
          if (
            canonical !== path &&
            !(
              safariLink &&
              canonical ===
                (await realpath('/System/Cryptexes/App/System/Applications/Safari.app'))
            )
          )
            continue;
          const { stdout } = await exec(
            '/usr/bin/plutil',
            [
              '-extract',
              'CFBundleIdentifier',
              'raw',
              '-o',
              '-',
              join(path, 'Contents/Info.plist'),
            ],
            { timeout: 2000, maxBuffer: 4096 },
          );
          const id = stdout.trim();
          if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,199}$/.test(id))
            apps.push({ id, name: entry.name.slice(0, -4), path });
        } catch {
          /* An unreadable or incomplete app is not launchable. */
        }
      } else if (depth > 0) await scan(path, depth - 1);
    }
  }
  await scan('/System/Library/CoreServices', 0);
  for (const root of ['/Applications', '/System/Applications', join(homedir(), 'Applications')])
    await scan(root, 1);
  return [...new Map(apps.map((app) => [app.id, app])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
export async function launchInstalledApplication(
  id: string,
  options: { background: boolean },
): Promise<void> {
  const app = (await installedApplications()).find((app) => app.id === id);
  if (!app) throw new Error('This app is no longer installed. Refresh the application list.');
  await exec('/usr/bin/open', [...(options.background ? ['-g'] : []), '-a', app.path], {
    timeout: 10000,
  });
}
