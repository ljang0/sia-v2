import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, access, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildCuaLicenses, cuaBuildRecipe } from './cua-driver-licenses.mjs';

const desktop = resolve(import.meta.dirname, '..');
const root = resolve(desktop, '../..');
const pin = JSON.parse(await readFile(join(desktop, 'native/cua/upstream.json'), 'utf8'));
const patch = await readFile(join(root, pin.patch));
const requested =
  process.argv.find((arg) => arg.startsWith('--arch='))?.slice(7) ?? process.arch;
const testConsent = process.argv.includes('--test');
if (!['arm64', 'x64', 'universal'].includes(requested))
  throw new Error(`Unsupported architecture: ${requested}`);
if (process.platform !== 'darwin')
  throw new Error('The Sia native driver must be built on macOS.');
const arches = requested === 'universal' ? ['arm64', 'x64'] : [requested];
const cache = join(desktop, 'build/native/cua');
const source = join(cache, 'source');
const workspace = join(source, 'libs/cua-driver/rust');
const patchSha256 = sha256(patch);
const { inputs: licenseInputs, recipeSha256 } = await cuaBuildRecipe(desktop);

function run(command, args, cwd = root, extraEnv = {}, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout?.trim() ?? '';
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const pending = [];
for (const arch of arches) {
  const destination = join(root, `packages/cua-driver-darwin-${arch}`);
  const upstream = join(root, `node_modules/@sia/cua-upstream-darwin-${arch}`);
  const manifest = JSON.parse(await readFile(join(upstream, 'package.json'), 'utf8'));
  if (
    manifest.name !== `@trycua/cua-driver-darwin-${arch}` ||
    manifest.version !== pin.version
  ) {
    throw new Error(`Unexpected upstream Node runtime for ${arch}`);
  }
  const runtimeSha256 = sha256(await readFile(join(upstream, 'cua_driver_node_runtime.node')));
  const expected = {
    sourceCommit: pin.commit,
    patchSha256,
    recipeSha256,
    rustToolchain: pin.rustToolchain,
    minimumMacOS: pin.minimumMacOS,
    architecture: arch,
    runtimeSha256,
  };
  let cached;
  try {
    cached = JSON.parse(await readFile(join(destination, 'build-provenance.json'), 'utf8'));
  } catch {
    /* first build */
  }
  if (
    cached &&
    Object.entries(expected).every(([key, value]) => cached[key] === value) &&
    (await exists(join(destination, 'libcua_driver_sdk.dylib'))) &&
    (await exists(join(destination, 'cua_driver_node_runtime.node'))) &&
    (await exists(join(destination, 'RUST_LICENSES.txt'))) &&
    cached.licensesSha256 === sha256(await readFile(join(destination, 'RUST_LICENSES.txt'))) &&
    cached.sdkSha256 === sha256(await readFile(join(destination, 'libcua_driver_sdk.dylib'))) &&
    runtimeSha256 === sha256(await readFile(join(destination, 'cua_driver_node_runtime.node')))
  ) {
    console.log(`Sia Cua ${arch}: verified cached build.`);
  } else pending.push({ arch, destination, upstream, expected });
}
if (pending.length === 0 && !testConsent) process.exit(0);

// Fetch only the exact upstream source needed for the SDK. Never modify pnpm's shared store.
await mkdir(cache, { recursive: true });
if (!(await exists(join(source, '.git')))) {
  run('git', [
    'clone',
    '--filter=blob:none',
    '--depth=1',
    '--sparse',
    '--branch',
    pin.tag,
    pin.repository,
    source,
  ]);
  run(
    'git',
    ['sparse-checkout', 'set', 'libs/cua-driver', 'libs/cua/crates/cua-telemetry'],
    source,
  );
}
if (run('git', ['rev-parse', 'HEAD'], source, {}, true) !== pin.commit) {
  throw new Error(
    `The native source cache does not match ${pin.commit}. Inspect ${source} before rebuilding.`,
  );
}
const currentDiff = run('git', ['diff', 'HEAD', '--binary'], source, {}, true);
if (currentDiff && currentDiff !== patch.toString('utf8').trim()) {
  throw new Error(
    `The native source cache has a different patch. Inspect ${source} before rebuilding.`,
  );
}
if (!currentDiff) run('git', ['apply', '--check', join(root, pin.patch)], source);
if (!currentDiff) run('git', ['apply', join(root, pin.patch)], source);

// rustup must be installed by the contributor; the checked-in pin chooses the compiler.
run('rustup', ['toolchain', 'install', pin.rustToolchain, '--profile', 'minimal']);
for (const { arch, destination, upstream, expected } of pending) {
  const target = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  run('rustup', ['target', 'add', '--toolchain', pin.rustToolchain, target]);
  run(
    'cargo',
    [
      `+${pin.rustToolchain}`,
      'build',
      '--locked',
      '--release',
      '--target',
      target,
      '-p',
      'cua-driver-sdk',
    ],
    workspace,
    {
      MACOSX_DEPLOYMENT_TARGET: pin.minimumMacOS,
      CARGO_INCREMENTAL: '0',
      CARGO_TARGET_DIR: join(cache, 'target'),
    },
  );
  const library = join(cache, 'target', target, 'release/libcua_driver_sdk.dylib');
  run('/usr/bin/lipo', [library, '-verify_arch', arch === 'arm64' ? 'arm64' : 'x86_64']);
  await copyFile(library, join(destination, 'libcua_driver_sdk.dylib'));
  for (const name of ['cua_driver_node_runtime.node', 'node-runtime-NOTICE.md']) {
    await copyFile(join(upstream, name), join(destination, name));
  }
  const metadata = JSON.parse(
    run(
      'cargo',
      [
        `+${pin.rustToolchain}`,
        'metadata',
        '--locked',
        '--format-version=1',
        '--filter-platform',
        target,
      ],
      workspace,
      {},
      true,
    ),
  );
  const licenses = await buildCuaLicenses(metadata, licenseInputs, source);
  await writeFile(join(destination, 'RUST_LICENSES.txt'), licenses);
  await writeFile(
    join(destination, 'build-provenance.json'),
    JSON.stringify(
      {
        ...expected,
        sdkSha256: sha256(await readFile(library)),
        licensesSha256: sha256(licenses),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Sia Cua ${arch}: built ${pin.commit} with Chrome consent patch.`);
}

if (testConsent) {
  const hostTarget = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  run(
    'cargo',
    [
      `+${pin.rustToolchain}`,
      'test',
      '--locked',
      '--release',
      '--target',
      hostTarget,
      '-p',
      'platform-macos',
      'browser::consent_ui::tests',
    ],
    workspace,
    {
      MACOSX_DEPLOYMENT_TARGET: pin.minimumMacOS,
      CARGO_INCREMENTAL: '0',
      CARGO_TARGET_DIR: join(cache, 'target'),
    },
  );
}
