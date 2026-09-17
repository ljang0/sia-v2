import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { devIdentity, signDevelopment } from './dev-signing.mjs';

if (process.platform === 'darwin') {
  const root = resolve(import.meta.dirname, '..');
  const source = join(root, 'native/voice');
  const output = join(root, 'build/native');
  const files = (await readdir(source)).filter((name) => /\.(swift|plist)$/.test(name)).sort();
  const hash = createHash('sha256');
  hash.update(await readFile(new URL(import.meta.url)));
  hash.update(execFileSync('/usr/bin/xcrun', ['swiftc', '--version']));
  for (const file of files) hash.update(await readFile(join(source, file)));
  const digest = hash.digest('hex');
  const previous = await readFile(join(output, 'source.sha256'), 'utf8').catch(() => '');
  const exists = await readFile(join(output, 'SiaVoiceHelper')).then(
    () => true,
    () => false,
  );
  const rebuilt = previous !== digest || !exists;
  if (rebuilt) {
    await mkdir(output, { recursive: true });
    for (const arch of ['arm64', 'x86_64']) {
      execFileSync(
        '/usr/bin/xcrun',
        [
          'swiftc',
          '-swift-version',
          '5',
          '-O',
          '-target',
          `${arch}-apple-macosx14.0`,
          ...files.filter((name) => name.endsWith('.swift')).map((name) => join(source, name)),
          '-Xlinker',
          '-sectcreate',
          '-Xlinker',
          '__TEXT',
          '-Xlinker',
          '__info_plist',
          '-Xlinker',
          join(source, 'Info.plist'),
          '-o',
          join(output, `voice-${arch}`),
        ],
        { stdio: 'inherit' },
      );
    }
    execFileSync(
      '/usr/bin/lipo',
      [
        '-create',
        join(output, 'voice-arm64'),
        join(output, 'voice-x86_64'),
        '-output',
        join(output, 'SiaVoiceHelper'),
      ],
      { stdio: 'inherit' },
    );
    await writeFile(join(output, 'source.sha256'), digest);
  }
  const identity = devIdentity({ required: false });
  const signed = join(output, 'signing.sha256');
  const key = digest + ':' + (identity?.hash ?? 'adhoc');
  if (rebuilt || (await readFile(signed, 'utf8').catch(() => '')) !== key) {
    if (identity)
      signDevelopment(join(output, 'SiaVoiceHelper'), identity, 'ai.sia.desktop.voice');
    else
      execFileSync(
        '/usr/bin/codesign',
        ['--force', '--sign', '-', join(output, 'SiaVoiceHelper')],
        { stdio: 'inherit' },
      );
    await writeFile(signed, key);
  }
}
