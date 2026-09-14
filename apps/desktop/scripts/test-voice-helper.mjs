import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
if (process.platform === 'darwin') {
  const source = resolve(import.meta.dirname, '../native/voice');
  const directory = await mkdtemp(join(tmpdir(), 'sia-fn-tests-'));
  try {
    const binary = join(directory, 'test-fn');
    execFileSync(
      '/usr/bin/xcrun',
      [
        'swiftc',
        '-swift-version',
        '5',
        join(source, 'PushToTalkMonitor.swift'),
        join(source, 'FnContext.swift'),
        join(source, 'BrowserWindow.swift'),
        join(source, 'WindowContext.swift'),
        join(source, 'ScreenContextProvider.swift'),
        join(source, 'MacScreenshot.swift'),
        join(source, 'tests/main.swift'),
        '-o',
        binary,
      ],
      { stdio: 'inherit' },
    );
    // Cold macOS executable validation can outlast the pure test itself on a busy Mac.
    execFileSync(binary, [], { stdio: 'inherit', timeout: 60_000 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
