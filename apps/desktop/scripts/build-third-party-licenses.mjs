import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const desktopRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(desktopRoot, '../..');
const storeRoot = join(workspaceRoot, 'node_modules', '.pnpm');
const output = join(desktopRoot, 'build', 'THIRD_PARTY_LICENSES.txt');
const electronRoot = join(desktopRoot, 'node_modules', 'electron');
const licenseSourcesRoot = join(desktopRoot, 'build', 'license-sources');
const packageRoots = new Set();

const canonicalSpdxLicenses = new Map([
  ['Apache-2.0', 'Apache-2.0.txt'],
  ['BSD-2-Clause', 'BSD-2-Clause.txt'],
  ['ISC', 'ISC.txt'],
  ['MIT', 'MIT.txt'],
  ['MPL-2.0', 'MPL-2.0.txt'],
  ['WTFPL', 'WTFPL.txt'],
]);

const supplementalLicenses = new Map([
  ['@trycua/cua-driver@0.19.3', ['cua-driver-rs-v0.19.3-MIT.txt']],
  ['@trycua/cua-driver-darwin-arm64@0.19.3', ['cua-driver-rs-v0.19.3-MIT.txt']],
  ['@trycua/cua-driver-darwin-x64@0.19.3', ['cua-driver-rs-v0.19.3-MIT.txt']],
  ['@ubjs/core@0.31.0-3', ['uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt']],
  ['@ubjs/node@0.31.0-3', ['uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt']],
  ['@ubjs/node-darwin-arm64@0.31.0-3', ['uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt']],
  ['@ubjs/node-darwin-x64@0.31.0-3', ['uniffi-bindgen-react-native-v0.31.0-3-LICENSE.txt']],
]);

const requiredPackageGroups = {
  native: [
    '@trycua/cua-driver',
    '@trycua/cua-driver-darwin-arm64',
    '@trycua/cua-driver-darwin-x64',
    '@ubjs/core',
    '@ubjs/node',
    '@ubjs/node-darwin-arm64',
    '@ubjs/node-darwin-x64',
  ],
  ui: [
    '@phosphor-icons/react',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    'react',
    'react-dom',
    'zod',
  ],
};

const storeEntries = await readdir(storeRoot, { withFileTypes: true });
storeEntries.sort((left, right) => left.name.localeCompare(right.name));
for (const storeEntry of storeEntries) {
  if (!storeEntry.isDirectory()) continue;
  const modules = join(storeRoot, storeEntry.name, 'node_modules');
  let names;
  try {
    names = await readdir(modules, { withFileTypes: true });
  } catch {
    continue;
  }
  names.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of names) {
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      const scopedEntries = await readdir(join(modules, entry.name), {
        withFileTypes: true,
      });
      scopedEntries.sort((left, right) => left.name.localeCompare(right.name));
      for (const scoped of scopedEntries) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          packageRoots.add(join(modules, entry.name, scoped.name));
        }
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      packageRoots.add(join(modules, entry.name));
    }
  }
}

const packages = new Map();
for (const root of [...packageRoots].sort()) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue;
  const key = `${manifest.name}@${manifest.version}`;
  const licenseFiles = [];
  const rootEntries = await readdir(root, { withFileTypes: true });
  rootEntries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of rootEntries) {
    if (
      !entry.isFile() ||
      !/(?:^|[._-])(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(entry.name)
    ) {
      continue;
    }
    const text = await readFile(join(root, entry.name), 'utf8');
    if (!text.includes('\0') && Buffer.byteLength(text) <= 5_000_000) {
      licenseFiles.push({ name: entry.name, text: text.trimEnd() });
    }
  }
  const declaredLicense = normalizeLicense(manifest.license ?? manifest.licenses);
  const publishesLicenseTerms = licenseFiles.some(({ name }) =>
    /(?:^|[._-])(?:licen[cs]e|copying)(?:[._-]|$)/i.test(name),
  );
  if (!publishesLicenseTerms) {
    for (const [spdxId, sourceName] of canonicalSpdxLicenses) {
      if (!containsSpdxId(declaredLicense, spdxId)) continue;
      licenseFiles.push({
        name: `SIA-SUPPLIED-SPDX-${sourceName}`,
        text: (await readFile(join(licenseSourcesRoot, sourceName), 'utf8')).trimEnd(),
      });
    }
  }
  for (const sourceName of supplementalLicenses.get(key) ?? []) {
    licenseFiles.push({
      name: `SIA-SUPPLIED-${sourceName}`,
      text: (await readFile(join(licenseSourcesRoot, sourceName), 'utf8')).trimEnd(),
    });
  }
  const item = {
    key,
    name: manifest.name,
    version: manifest.version,
    declaredLicense,
    repository: normalizeRepository(manifest.repository),
    licenseFiles: licenseFiles.sort((left, right) => left.name.localeCompare(right.name)),
  };
  const previous = packages.get(key);
  if (previous && JSON.stringify(previous) !== JSON.stringify(item)) {
    throw new Error(`Conflicting installed package metadata or license texts: ${key}`);
  }
  packages.set(key, item);
}

const packagesWithoutTerms = [...packages.values()].filter(
  (item) => item.licenseFiles.length === 0,
);
if (packagesWithoutTerms.length > 0) {
  throw new Error(
    `Installed packages without bundled license terms: ${packagesWithoutTerms
      .map((item) => item.key)
      .join(', ')}`,
  );
}

for (const [group, names] of Object.entries(requiredPackageGroups)) {
  for (const name of names) {
    const matches = [...packages.values()].filter((item) => item.name === name);
    if (matches.length === 0) {
      throw new Error(
        `Required ${group} package is absent from the license inventory: ${name}`,
      );
    }
    if (matches.some((item) => item.licenseFiles.length === 0)) {
      throw new Error(`Required ${group} package has no bundled license text: ${name}`);
    }
  }
}

const bundledFontAssets = [
  {
    key: 'font:Bricolage Grotesque (variable, latin subset)',
    declaredLicense: 'OFL-1.1',
    repository: 'https://github.com/ateliertriay/bricolage',
    licenseFile: 'bricolage-grotesque-OFL.txt',
  },
];

const fontSections = [];
for (const font of bundledFontAssets) {
  const text = (await readFile(join(licenseSourcesRoot, font.licenseFile), 'utf8')).trimEnd();
  fontSections.push(
    `${'='.repeat(80)}\nBUNDLED FONT: ${font.key}\nDECLARED LICENSE: ${font.declaredLicense}\nSOURCE: ${font.repository}\n${'-'.repeat(80)}\n--- SIA-SUPPLIED-${font.licenseFile} ---\n${text}`,
  );
}

const sections = [...packages.values()]
  .sort((left, right) => left.key.localeCompare(right.key))
  .map((item) => {
    const header = [
      `PACKAGE: ${item.key}`,
      `DECLARED LICENSE: ${item.declaredLicense || 'not declared'}`,
      ...(item.repository ? [`SOURCE: ${item.repository}`] : []),
    ];
    const body = item.licenseFiles
      .map(({ name, text }) => `--- ${name} ---\n${text}`)
      .join('\n\n');
    return `${'='.repeat(80)}\n${header.join('\n')}\n${'-'.repeat(80)}\n${body}`;
  });

const document = [
  'SIA INSTALLED JAVASCRIPT/NATIVE PACKAGE LICENSE CORPUS',
  '',
  'Generated deterministically from the exact pnpm installation used for this build.',
  'It is intentionally over-inclusive: build-only packages may appear.',
  'For packages that omit license files from npm, manifest declarations are recorded',
  'and matching pinned SPDX terms are appended. Required native packages also receive',
  'their pinned, repository-specific licenses or notices.',
  'Electron and Chromium license files are copied separately without modification.',
  '',
  ...sections,
  ...fontSections,
  '',
].join('\n');

await mkdir(join(desktopRoot, 'build'), { recursive: true });
await writeFile(output, document, { encoding: 'utf8', mode: 0o644 });
await Promise.all([
  copyFile(
    join(electronRoot, 'dist', 'LICENSE'),
    join(desktopRoot, 'build', 'ELECTRON_LICENSE.txt'),
  ),
  copyFile(
    join(electronRoot, 'dist', 'LICENSES.chromium.html'),
    join(desktopRoot, 'build', 'CHROMIUM_LICENSES.html'),
  ),
]);
console.log(
  `Generated ${basename(output)} for ${packages.size} installed packages (${Buffer.byteLength(document)} bytes) plus unmodified Electron/Chromium license resources.`,
);

function normalizeLicense(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => (typeof item === 'string' ? item : item?.type))
    .filter((item) => typeof item === 'string')
    .join(' OR ');
}

function normalizeRepository(value) {
  const raw = typeof value === 'string' ? value : value?.url;
  if (typeof raw !== 'string') return '';
  return raw.replace(/^git\+/, '').replace(/\.git$/, '');
}

function containsSpdxId(expression, spdxId) {
  return expression
    .split(/\s+(?:AND|OR|WITH)\s+|[()]/)
    .map((part) => part.trim())
    .includes(spdxId);
}
