import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.SIA_RELIABILITY_REAL_CUA !== '1' || process.platform !== 'darwin')
  throw new Error('This disposable Mac task lab requires SIA_RELIABILITY_REAL_CUA=1.');
const [operation, flag, argument] = process.argv.slice(2);
if (!['start', 'stop'].includes(operation) || flag !== '--config' || !argument)
  throw new Error('Usage: background-task-lab.mjs start|stop --config /tmp/lab.json');
const configFile = resolve(argument);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
if (!isAbsolute(argument) || configFile.startsWith(repository + '/'))
  throw new Error('Use an absolute configuration path outside the repository.');

if (operation === 'stop') {
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const ready = JSON.parse(await readFile(config.readyFile, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${ready.port}/__control`, {
    headers: { 'x-sia-lab': config.token },
    signal: AbortSignal.timeout(5000),
  });
  const state = await response.json();
  if (!response.ok || state.pid !== config.pid || ready.pid !== config.pid)
    throw new Error(
      'The configuration no longer identifies the task lab; nothing was stopped.',
    );
  process.kill(config.pid, 'SIGTERM');
  await rm(configFile);
  console.log(
    'Stopped the disposable task lab. Its isolated profile remains in the temporary folder.',
  );
} else {
  if (
    await readFile(configFile).then(
      () => true,
      () => false,
    )
  )
    throw new Error('This lab configuration exists. Stop that lab or choose a fresh path.');
  const root = await mkdtemp(join(tmpdir(), 'sia-background-task-lab-'));
  const readyFile = join(root, 'ready.json');
  const token = randomBytes(24).toString('hex');
  const environment = {
    ...process.env,
    SIA_LAB_USER_DATA: join(root, 'profile'),
    SIA_LAB_READY_FILE: readyFile,
    SIA_LAB_TOKEN: token,
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const log = await open(join(root, 'app.log'), 'a');
  const executable = createRequire(import.meta.url)('electron');
  const child = spawn(
    executable,
    [fileURLToPath(new URL('../tests/fixtures/reliability/lab.cjs', import.meta.url))],
    { env: environment, stdio: ['ignore', log.fd, log.fd], detached: true },
  );
  child.unref();
  await log.close();
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (
        await readFile(readyFile).then(
          () => true,
          () => false,
        )
      ) {
        await writeFile(
          configFile,
          JSON.stringify({ root, readyFile, pid: child.pid, token }),
          { mode: 0o600, flag: 'wx' },
        );
        console.log(`Background task lab ready. Configuration: ${configFile}`);
        process.exit(0);
      }
      if (child.exitCode !== null) throw new Error('Task lab exited before it was ready.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Task lab did not start. Inspect ${join(root, 'app.log')}.`);
  } catch (error) {
    if (child.pid && child.exitCode === null) child.kill('SIGTERM');
    throw error;
  }
}
