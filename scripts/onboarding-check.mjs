import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const codex = command('codex');
const codexVersion = codex.output.match(/(\d+)\.(\d+)\.(\d+)/);
const supportedCodex =
  codex.ok &&
  codexVersion !== null &&
  Number(codexVersion[1]) === 0 &&
  Number(codexVersion[2]) >= 147 &&
  Number(codexVersion[2]) < 154;
optional(
  'Codex CLI',
  supportedCodex,
  !codex.ok
    ? 'optional for fake-services development; required for Codex-plan testing'
    : `${codex.output}; release range is >=0.147.0 <0.154.0`,
);

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
