import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, rename, rm, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import {
  CODEX_SUPPORTED_VERSIONS,
  isVersionSupported,
  parseCliVersion,
  sanitizedEnvironment,
} from '@sia/runtime';

const exec = promisify(execFile);
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_FILE_BYTES = 350 * 1024 * 1024;
const VERSION = '0.153.0';
const FILES = [
  'bin/codex',
  'bin/codex-code-mode-host',
  'codex-path/rg',
  'codex-resources/zsh/bin/zsh',
  'codex-package.json',
] as const;

// Official @openai/codex platform packages. Pins change only with Sia's verified
// admission policy, never from renderer input or a remote "latest" response.
const RELEASES = {
  arm64: {
    target: 'aarch64-apple-darwin',
    integrity:
      'C9F3HVEYekVJC3WhiGSztcxItWBwd7Y6hTWoDqa9Z9aLWsYywzqChABB59n7G5F5jCil9wxW3+u2L6uiVUydmw==',
  },
  x64: {
    target: 'x86_64-apple-darwin',
    integrity:
      'DO5u+X/eL8pObrV0WDErOjS9DeuDvVuOL5oHR5y5Yklp0NGoGj3oOHsmaSXjGesiIiu3IX8l4pzS6dbeQXJAvQ==',
  },
} as const;

export function managedCodexCommand(root: string): string {
  return join(root, 'current', 'bin', 'codex');
}

export async function installManagedCodex(root: string): Promise<void> {
  if (process.platform !== 'darwin' || !(process.arch in RELEASES)) {
    throw new Error('Automatic Codex setup requires an Apple silicon or Intel Mac.');
  }
  const arch = process.arch as keyof typeof RELEASES;
  await installCodexRelease(root, {
    ...RELEASES[arch],
    version: VERSION,
    url: `https://registry.npmjs.org/@openai/codex/-/codex-${VERSION}-darwin-${arch}.tgz`,
  });
}

/** Trusted main-process/test seam. No release fields cross the renderer bridge. */
export async function installCodexRelease(
  root: string,
  release: { version: string; target: string; integrity: string; url: string },
  download: typeof fetch = fetch,
): Promise<void> {
  if (!isVersionSupported(release.version, CODEX_SUPPORTED_VERSIONS)) {
    throw new Error('This Codex download has not been verified for Sia.');
  }
  if (await hasVersion(managedCodexCommand(root), release.version)) return;
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(join(root, '.install-'));
  const link = join(root, `.current-${randomUUID()}`);
  const archive = join(stage, 'download.tgz');
  const payload = join(stage, 'release');
  let published: string | undefined;
  try {
    const response = await download(release.url, {
      redirect: 'error',
      credentials: 'omit',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) throw new Error('Codex download failed. Try again.');
    const file = await open(archive, 'wx', 0o600);
    const hash = createHash('sha512');
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > MAX_ARCHIVE_BYTES)
          throw new Error('Codex download exceeded its size limit.');
        hash.update(chunk);
        await file.writeFile(chunk);
      }
    } finally {
      await file.close();
    }
    if (hash.digest('base64') !== release.integrity) {
      throw new Error('Codex download could not be verified. Try again.');
    }
    // Extract fixed members to stdout; archive paths/links never choose output paths.
    for (const name of FILES) {
      const destination = join(payload, name);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await extractMember(archive, `package/vendor/${release.target}/${name}`, destination);
      await chmod(destination, name.endsWith('.json') ? 0o600 : 0o700);
    }
    if (!(await hasVersion(join(payload, 'bin/codex'), release.version))) {
      throw new Error(
        'The downloaded Codex could not start. Your previous installation was kept.',
      );
    }
    published = join(root, `release-${randomUUID()}`);
    await rename(payload, published);
    await symlink(basename(published), link);
    await rename(link, join(root, 'current'));
    // Leave old releases intact: another Sia process may still be using one.
    published = undefined;
  } finally {
    await rm(stage, { recursive: true, force: true });
    await rm(link, { force: true });
    if (published) await rm(published, { recursive: true, force: true });
  }
}

async function hasVersion(command: string, expected: string): Promise<boolean> {
  try {
    const { stdout } = await exec(command, ['--version'], {
      env: sanitizedEnvironment(process.env),
      timeout: 5000,
      killSignal: 'SIGKILL',
      maxBuffer: 4096,
    });
    return parseCliVersion(stdout) === expected;
  } catch {
    return false;
  }
}

async function extractMember(
  archive: string,
  member: string,
  destination: string,
): Promise<void> {
  const child = spawn('/usr/bin/tar', ['-xOzf', archive, member], {
    env: { PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
  let bytes = 0;
  const completed = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Codex unpacking failed. Try again.')),
    );
  });
  try {
    await Promise.all([
      completed,
      pipeline(
        child.stdout,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            callback(
              bytes > MAX_FILE_BYTES ? new Error('Codex file exceeded its size limit.') : null,
              chunk,
            );
          },
        }),
        createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
      ),
    ]);
    if (!bytes) throw new Error('The Codex download is incomplete. Try again.');
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
  }
}
