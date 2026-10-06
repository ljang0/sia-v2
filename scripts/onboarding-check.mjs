import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { devHome, selectIdentity } from '../apps/desktop/scripts/dev-signing.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const results = [];

function required(label, ok, detail) {
  results.push({ label, ok, detail, required: true });
}

function optional(label, ok, detail) {
  results.push({ label, ok, detail, required: false });
}

function command(name, args = ['--version']) {
  const result = spawnSync(name, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n')[0];
  return { ok: result.status === 0, output };
}

const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
required('Repository', manifest.name === 'sia-v2', root);
required('macOS', process.platform === 'darwin', `${process.platform} ${process.arch}`);

const nodeMajor = Number(process.versions.node.split('.')[0]);
required('Node.js', nodeMajor >= 24, `v${process.versions.node} (need 24+)`);

const pnpm = command('pnpm');
const pnpmMajor = Number(pnpm.output.match(/\d+/)?.[0]);
required('pnpm', pnpm.ok && pnpmMajor >= 11, pnpm.output || 'not found (need 11+)');

const git = command('git');
required('Git', git.ok, git.output || 'not found');

const xcode = command('xcode-select', ['-p']);
required('Xcode tools', xcode.ok, xcode.output || 'run: xcode-select --install');

try {
  const signing = spawnSync('/usr/bin/security', ['find-identity', '-p', 'codesigning'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  const identities = [...(signing.stdout ?? '').matchAll(/\b([A-Fa-f0-9]{40}) "([^"]+)"/g)].map(
    (match) => ({ hash: match[1].toUpperCase(), name: match[2] }),
  );
  const pin = resolve(devHome, 'signing.json');
  selectIdentity(
    identities,
    existsSync(pin) ? JSON.parse(readFileSync(pin, 'utf8')) : undefined,
    process.env.SIA_DEV_SIGN_IDENTITY,
  );
  required('Dev signing', true, 'stable identity available');
} catch (error) {
  required('Dev signing', false, error.message);
}

required(
  'Lockfile',
  existsSync(resolve(root, 'pnpm-lock.yaml')),
  existsSync(resolve(root, 'pnpm-lock.yaml')) ? 'present' : 'pnpm-lock.yaml must be present',
);
const dependenciesInstalled =
  existsSync(resolve(root, 'node_modules/.pnpm')) &&
  existsSync(resolve(root, 'apps/desktop/node_modules/electron'));
required(
  'Dependencies',
  dependenciesInstalled,
  dependenciesInstalled ? 'installed' : 'run: pnpm install --frozen-lockfile',
);

// Node 24 type stripping loads these dependency-free runtime sources directly, so this check and
// the app admit exactly the same Codex builds. Older Node versions are already reported above.
const codexRules = await Promise.all([
  import('../packages/runtime/src/discovery.ts'),
  import('../packages/runtime/src/providers/codex-versions.ts'),
]).catch(() => undefined);
const codex = command('codex');
if (codexRules) {
  const [{ isVersionSupported, parseCliVersion }, { CODEX_SUPPORTED_VERSIONS: range }] =
    codexRules;
  const codexVersion = parseCliVersion(codex.output);
  const supportedRange = [
    `>=${range.minimum} <${range.maximumExclusive}`,
    ...range.additionalVersions,
  ].join(', ');
  optional(
    'Codex CLI',
    codex.ok && codexVersion !== undefined && isVersionSupported(codexVersion, range),
    !codex.ok
      ? 'optional for fake-services development; required for Codex-plan testing'
      : `${codex.output}; supported: ${supportedRange}`,
  );
}

for (const result of results) {
  const marker = result.ok ? 'PASS' : result.required ? 'FAIL' : 'INFO';
  console.log(`${marker.padEnd(4)}  ${result.label.padEnd(14)} ${result.detail}`);
}

const failures = results.filter((result) => result.required && !result.ok);
if (failures.length > 0) {
  console.error(`\nOnboarding check failed: ${failures.map(({ label }) => label).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(
    '\nReady. Run `SIA_FAKE_SERVICES=1 pnpm dev` for deterministic local development.',
  );
}
