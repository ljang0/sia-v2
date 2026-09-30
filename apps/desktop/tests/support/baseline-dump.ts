import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Scratch-only: print refreshed darwin baselines so they can be copied from the job log.
export default async function dumpBaselines(): Promise<void> {
  const snapshots = join(
    dirname(fileURLToPath(import.meta.url)),
    '../e2e/visual-polish.spec.ts-snapshots',
  );
  const names = (await readdir(snapshots))
    .filter((name) => name.endsWith('-darwin.png'))
    .sort();
  for (const name of names) {
    const encoded = (await readFile(join(snapshots, name))).toString('base64');
    const lines = [`BASELINE-BEGIN ${name}`];
    for (let index = 0; index < encoded.length; index += 3000) {
      lines.push(`BASELINE-DATA ${encoded.slice(index, index + 3000)}`);
    }
    lines.push(`BASELINE-END ${name}`);
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}
