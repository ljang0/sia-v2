import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Apply the pinned patch once and verify every subsequent source-cache use. */
export function prepareCuaPatch(source, patchPath) {
  const git = (...args) => {
    try {
      return execFileSync('git', args, {
        cwd: source,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      // A failed diff can contain local source bytes; never dump its buffers.
      throw new Error(
        `Native source git ${args[0]} failed. Inspect ${source} before rebuilding.`,
      );
    }
  };
  const expected = readFileSync(patchPath, 'utf8').trim();
  const paths = new Set(
    git('apply', '--numstat', '-z', patchPath)
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^(?:\d+|-)\t(?:\d+|-)\t(.+)$/);
        if (!match) throw new Error('The native patch contains an unsupported path or rename.');
        return match[1];
      }),
  );
  const registerNewFiles = () => {
    const untracked = git('ls-files', '--others', '--exclude-standard', '-z')
      .split('\0')
      .filter(Boolean);
    if (untracked.some((path) => !paths.has(path)))
      throw new Error(
        `The native source cache has unexpected untracked files. Inspect ${source} before rebuilding.`,
      );
    // Keep the existing sparse index intact. git apply --intent-to-add may drop
    // unrelated entries in a sparse checkout; add only the pin's new files afterward.
    if (untracked.length) git('add', '--intent-to-add', '--', ...untracked);
  };
  registerNewFiles();
  const diff = () =>
    git(
      'diff',
      'HEAD',
      '--binary',
      '--no-ext-diff',
      '--no-textconv',
      '--abbrev=7',
      '--src-prefix=a/',
      '--dst-prefix=b/',
    ).trim();
  if (!diff()) {
    git('apply', '--check', patchPath);
    git('apply', patchPath);
    registerNewFiles();
  }
  if (diff() !== expected)
    throw new Error(
      `The native source cache has a different patch. Inspect ${source} before rebuilding.`,
    );
}
