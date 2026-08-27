import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const requestedArch = process.argv
  .find((argument) => argument.startsWith('--arch='))
  ?.slice('--arch='.length);
const signingMode = process.argv
  .find((argument) => argument.startsWith('--signing='))
  ?.slice('--signing='.length);
const requestedOutput = process.argv
  .find((argument) => argument.startsWith('--output='))
  ?.slice('--output='.length);

if (
  !requestedArch ||
  !['arm64', 'x64', 'universal'].includes(requestedArch) ||
  !signingMode ||
  !['unsigned', 'release'].includes(signingMode)
) {
  throw new Error(
    'Usage: verify-packaged-app.mjs --arch=arm64|x64|universal --signing=unsigned|release [--output=directory]',
  );
}

const desktopRoot = resolve(import.meta.dirname, '..');
const outputDirectory =
  requestedArch === 'universal'
    ? 'mac-universal'
    : requestedArch === 'arm64'
      ? 'mac-arm64'
      : 'mac';
const releaseDirectory = requestedOutput
  ? resolve(desktopRoot, requestedOutput)
  : join(desktopRoot, 'release');
const appPath = join(releaseDirectory, outputDirectory, 'Sia.app');
const desktopPackage = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8'));
const dmgPath = join(
  releaseDirectory,
  `Sia-${String(desktopPackage.version)}-${requestedArch}.dmg`,
);
const contentsPath = join(appPath, 'Contents');
const resourcesPath = join(contentsPath, 'Resources');
const executablePath = join(contentsPath, 'MacOS', 'Sia');
const infoPlistPath = join(contentsPath, 'Info.plist');
const asarPath = join(resourcesPath, 'app.asar');
const packagedIconPath = join(resourcesPath, 'icon.icns');
const cloudConfigPath = join(resourcesPath, 'sia-cloud.json');
const noticesPath = join(resourcesPath, 'THIRD_PARTY_NOTICES.md');
const licenseCorpusPath = join(resourcesPath, 'THIRD_PARTY_LICENSES.txt');
const electronLicensePath = join(resourcesPath, 'ELECTRON_LICENSE.txt');
const chromiumLicensesPath = join(resourcesPath, 'CHROMIUM_LICENSES.html');
const ubjsPatchPath = join(resourcesPath, 'patches', '@ubjs__node@0.31.0-3.patch');
const unpackedModules = join(resourcesPath, 'app.asar.unpacked', 'node_modules');
const packagedArchitectures =
  requestedArch === 'universal' ? ['arm64', 'x64'] : [requestedArch];

await Promise.all([
  requirePath(executablePath),
  requirePath(infoPlistPath),
  requirePath(asarPath),
  requirePath(packagedIconPath),
  requirePath(cloudConfigPath),
  requirePath(noticesPath),
  requirePath(licenseCorpusPath),
  requirePath(electronLicensePath),
  requirePath(chromiumLicensesPath),
  requirePath(ubjsPatchPath),
  ...packagedArchitectures.flatMap((architecture) => [
    requirePath(
      join(
        unpackedModules,
        '@trycua',
        `cua-driver-darwin-${architecture}`,
        'libcua_driver_sdk.dylib',
      ),
    ),
    requirePath(
      join(
        unpackedModules,
        '@trycua',
        `cua-driver-darwin-${architecture}`,
        'cua_driver_node_runtime.node',
      ),
    ),
    requirePath(
      join(
        unpackedModules,
        '@ubjs',
        `node-darwin-${architecture}`,
        `uniffi-runtime-napi.darwin-${architecture}.node`,
      ),
    ),
  ]),
]);

await verifyLicenseResources();

const executableArchitectures =
  requestedArch === 'universal' ? ['arm64', 'x86_64'] : [toLipoArch(requestedArch)];
for (const binaryPath of [
  executablePath,
  join(
    contentsPath,
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Electron Framework',
  ),
  join(
    contentsPath,
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Helpers',
    'chrome_crashpad_handler',
  ),
  ...['', ' (GPU)', ' (Plugin)', ' (Renderer)'].map((suffix) =>
    join(
      contentsPath,
      'Frameworks',
      `Sia Helper${suffix}.app`,
      'Contents',
      'MacOS',
      `Sia Helper${suffix}`,
    ),
  ),
]) {
  verifyMachOArchitectures(binaryPath, executableArchitectures);
}

for (const architecture of packagedArchitectures) {
  const nativeArchitecture = toLipoArch(architecture);
  for (const fileName of ['libcua_driver_sdk.dylib', 'cua_driver_node_runtime.node']) {
    verifyMachOArchitectures(
      join(unpackedModules, '@trycua', `cua-driver-darwin-${architecture}`, fileName),
      [nativeArchitecture],
      true,
    );
  }
  verifyMachOArchitectures(
    join(
      unpackedModules,
      '@ubjs',
      `node-darwin-${architecture}`,
      `uniffi-runtime-napi.darwin-${architecture}.node`,
    ),
    [nativeArchitecture],
  );
}

const packagedIconHeader = (await readFile(packagedIconPath)).subarray(0, 4).toString('ascii');
if (packagedIconHeader !== 'icns')
  throw new Error('Packaged Sia icon is not a valid ICNS file.');

const minimumSystemVersion = readPlistRaw('LSMinimumSystemVersion');
if (minimumSystemVersion !== '14.0') {
  throw new Error(
    `Packaged minimum macOS version is ${minimumSystemVersion || 'missing'}, not 14.0.`,
  );
}

const cloudConfig = parseCloudConfig(await readFile(cloudConfigPath, 'utf8'));
if (
  signingMode === 'release' &&
  (!cloudConfig.enabled ||
    !cloudConfig.updateManifestUrl ||
    !cloudConfig.updateManifestPublicKey)
) {
  throw new Error(
    'A signed alpha release must include enabled cloud and signed-update configuration.',
  );
}

const transportSecurity = readPlistJson('NSAppTransportSecurity');
if (
  transportSecurity.NSAllowsArbitraryLoads !== false ||
  transportSecurity.NSAllowsLocalNetworking !== false
) {
  throw new Error('Packaged transport security is not deny-by-default.');
}
for (const unusedPermission of [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
]) {
  const value = spawnSync(
    '/usr/bin/plutil',
    ['-extract', unusedPermission, 'raw', '-o', '-', infoPlistPath],
    { encoding: 'utf8' },
  );
  if (value.status === 0) {
    throw new Error(`Packaged app declares unused permission: ${unusedPermission}`);
  }
}

const microphoneDescription = readPlistRaw('NSMicrophoneUsageDescription');
if (
  microphoneDescription !==
  'Sia uses the microphone only while you record a message for transcription.'
) {
  throw new Error('Packaged microphone access is not limited to explicit dictation.');
}

if (requestedArch === 'universal' || requestedArch === process.arch) {
  const driverEntryUrl = pathToFileURL(
    join(asarPath, 'node_modules', '@trycua', 'cua-driver', 'dist', 'index.js'),
  ).href;
  const permissionProbe = runNode([
    '--input-type=module',
    '--eval',
    `const cua = await import(${JSON.stringify(driverEntryUrl)}); console.log(JSON.stringify(cua.currentMacOsPermissionStatus()));`,
  ]);
  if (!permissionProbe.stdout.includes('"accessibility"')) {
    throw new Error(
      `CUA packaged-runtime probe returned an unexpected result: ${permissionProbe.stdout}`,
    );
  }

  const bridgeEntry = join(asarPath, 'out', 'main', 'tool-bridge.js');
  const bridgeProbe = spawnSync(executablePath, [bridgeEntry], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000,
  });
  if (
    bridgeProbe.status !== 1 ||
    !bridgeProbe.stderr.includes('Missing tool-bridge capability arguments.')
  ) {
    throw new Error(
      `Packaged tool-bridge probe failed unexpectedly (${String(bridgeProbe.status)}): ${bridgeProbe.stderr}`,
    );
  }
}

if (signingMode === 'release') verifyReleaseSignature();
else verifyNotReleaseSigned();

console.log(`Verified ${signingMode} packaged Sia app: ${appPath}`);

async function requirePath(path) {
  try {
    await access(path);
  } catch {
    throw new Error(`Required packaged file is missing: ${path}`);
  }
}

async function verifyLicenseResources() {
  const generatedResources = [
    ['THIRD_PARTY_LICENSES.txt', licenseCorpusPath],
    ['ELECTRON_LICENSE.txt', electronLicensePath],
    ['CHROMIUM_LICENSES.html', chromiumLicensesPath],
  ];
  for (const [name, packagedPath] of generatedResources) {
    const [generated, packaged] = await Promise.all([
      readFile(join(desktopRoot, 'build', name)),
      readFile(packagedPath),
    ]);
    if (sha256(generated) !== sha256(packaged)) {
      throw new Error(`Packaged license resource differs from its generated input: ${name}`);
    }
  }
  for (const [sourcePath, packagedPath, label] of [
    [
      resolve(desktopRoot, '../..', 'THIRD_PARTY_NOTICES.md'),
      noticesPath,
      'third-party notice',
    ],
    [
      resolve(desktopRoot, '../..', 'patches', '@ubjs__node@0.31.0-3.patch'),
      ubjsPatchPath,
      'UniFFI packaging patch',
    ],
  ]) {
    const [source, packaged] = await Promise.all([
      readFile(sourcePath),
      readFile(packagedPath),
    ]);
    if (sha256(source) !== sha256(packaged)) {
      throw new Error(`Packaged ${label} differs from its repository source.`);
    }
  }

  const corpus = await readFile(licenseCorpusPath, 'utf8');
  for (const packageName of [
    '@phosphor-icons/react',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-tooltip',
    '@trycua/cua-driver',
    '@trycua/cua-driver-darwin-arm64',
    '@trycua/cua-driver-darwin-x64',
    '@ubjs/core',
    '@ubjs/node',
    '@ubjs/node-darwin-arm64',
    '@ubjs/node-darwin-x64',
    'react',
    'react-dom',
    'zod',
  ]) {
    if (!corpus.includes(`PACKAGE: ${packageName}@`)) {
      throw new Error(`Packaged license corpus omits required package: ${packageName}`);
    }
  }
  for (const mplBodyMarker of [
    '--- SIA-SUPPLIED-SPDX-MPL-2.0.txt ---',
    'Mozilla Public License Version 2.0',
    '2. License Grants and Conditions',
    '10. Versions of the License',
    'Exhibit A - Source Code Form License Notice',
  ]) {
    if (!corpus.includes(mplBodyMarker)) {
      throw new Error(`Packaged license corpus omits MPL-2.0 terms: ${mplBodyMarker}`);
    }
  }

  const electronLicense = await readFile(electronLicensePath, 'utf8');
  if (!electronLicense.includes('Copyright (c) Electron contributors')) {
    throw new Error('Packaged Electron license is incomplete.');
  }
  const chromiumLicenses = await readFile(chromiumLicensesPath, 'utf8');
  if (
    chromiumLicenses.length < 10_000_000 ||
    !chromiumLicenses.startsWith(
      '<!-- Generated by licenses.py; do not edit. --><!doctype html>',
    ) ||
    !chromiumLicenses.includes('Chromium software is made available as source code')
  ) {
    throw new Error('Packaged Chromium license corpus is incomplete.');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function toLipoArch(architecture) {
  return architecture === 'x64' ? 'x86_64' : architecture;
}

function verifyMachOArchitectures(path, expectedArchitectures, allowAdditional = false) {
  const file = spawnSync('/usr/bin/file', ['-b', path], { encoding: 'utf8' });
  if (file.error) throw file.error;
  if (file.status !== 0 || !file.stdout.includes('Mach-O')) {
    throw new Error(
      `Required native binary is not Mach-O: ${path}\n${file.stderr || file.stdout}`,
    );
  }

  const result = spawnSync('/usr/bin/lipo', ['-archs', path], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not inspect native architectures for ${path}: ${result.stderr}`);
  }
  const actual = new Set(result.stdout.trim().split(/\s+/).filter(Boolean));
  for (const expected of expectedArchitectures) {
    if (!actual.has(expected)) {
      throw new Error(
        `Native binary ${path} is missing ${expected}; found ${[...actual].join(', ') || 'none'}.`,
      );
    }
  }
  if (!allowAdditional && actual.size !== expectedArchitectures.length) {
    throw new Error(
      `Native binary ${path} has unexpected architectures: ${[...actual].join(', ')}.`,
    );
  }
}

function runNode(argumentsValue) {
  const result = spawnSync(executablePath, argumentsValue, {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Packaged runtime exited with ${String(result.status)}: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function readPlistJson(key) {
  const result = spawnSync(
    '/usr/bin/plutil',
    ['-extract', key, 'json', '-o', '-', infoPlistPath],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not read ${key} from the packaged Info.plist: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function readPlistRaw(key) {
  const result = spawnSync(
    '/usr/bin/plutil',
    ['-extract', key, 'raw', '-o', '-', infoPlistPath],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) return '';
  return result.stdout.trim();
}

function parseCloudConfig(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Packaged cloud configuration is not valid JSON.');
  }
  const keys = Object.keys(value).sort();
  if (value.schemaVersion !== 1 || typeof value.enabled !== 'boolean') {
    throw new Error('Packaged cloud configuration has an invalid schema version.');
  }
  const hasUpdateManifestUrl = typeof value.updateManifestUrl === 'string';
  const hasUpdateManifestPublicKey = typeof value.updateManifestPublicKey === 'string';
  if (hasUpdateManifestUrl !== hasUpdateManifestPublicKey) {
    throw new Error('Packaged signed-update configuration is incomplete.');
  }
  const updateKeys = hasUpdateManifestUrl
    ? ['updateManifestPublicKey', 'updateManifestUrl']
    : [];
  if (!value.enabled) {
    const expected = ['enabled', 'schemaVersion', ...updateKeys].sort();
    if (JSON.stringify(keys) !== JSON.stringify(expected)) {
      throw new Error('Disabled packaged cloud configuration contains unexpected fields.');
    }
    validateUpdateConfiguration(value);
    return value;
  }
  const expected = [
    'apiBaseUrl',
    'cognitoClientId',
    'cognitoRegion',
    'enabled',
    'schemaVersion',
    ...updateKeys,
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error('Enabled packaged cloud configuration contains unexpected fields.');
  }
  let apiUrl;
  try {
    apiUrl = new URL(value.apiBaseUrl);
  } catch {
    throw new Error('Packaged cloud API URL is invalid.');
  }
  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(value.cognitoRegion) ||
    !/^[A-Za-z0-9]{10,128}$/.test(value.cognitoClientId)
  ) {
    throw new Error('Enabled packaged cloud configuration is invalid.');
  }
  validateUpdateConfiguration(value);
  return value;
}

function validateUpdateConfiguration(value) {
  if (!value.updateManifestUrl && !value.updateManifestPublicKey) return;
  let updateUrl;
  try {
    updateUrl = new URL(value.updateManifestUrl);
  } catch {
    throw new Error('Packaged signed-update URL is invalid.');
  }
  if (
    updateUrl.protocol !== 'https:' ||
    updateUrl.username ||
    updateUrl.password ||
    updateUrl.search ||
    updateUrl.hash ||
    !/^[A-Za-z0-9_-]{59}$/.test(value.updateManifestPublicKey)
  ) {
    throw new Error('Packaged signed-update configuration is invalid.');
  }
}

function verifyReleaseSignature() {
  runSystem('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  const details = runSystem('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], true);
  const output = `${details.stdout}\n${details.stderr}`;
  if (
    !output.includes('Authority=Developer ID Application:') ||
    !/TeamIdentifier=(?!not set)\S+/.test(output) ||
    !/flags=.*runtime/.test(output)
  ) {
    throw new Error(`Packaged app is not a hardened Developer ID release:\n${output}`);
  }
  runSystem('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  runSystem('/usr/bin/xcrun', ['stapler', 'validate', appPath]);

  runSystem('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', dmgPath]);
  const dmgDetails = runSystem('/usr/bin/codesign', ['-dv', '--verbose=4', dmgPath], true);
  const dmgOutput = `${dmgDetails.stdout}\n${dmgDetails.stderr}`;
  if (
    !dmgOutput.includes('Format=disk image') ||
    !dmgOutput.includes('Authority=Developer ID Application:') ||
    !/TeamIdentifier=(?!not set)\S+/.test(dmgOutput)
  ) {
    throw new Error(`Release DMG is not signed with Developer ID:\n${dmgOutput}`);
  }
  runSystem('/usr/bin/xcrun', ['stapler', 'validate', dmgPath]);
  runSystem('/usr/sbin/spctl', [
    '--assess',
    '--type',
    'open',
    '--context',
    'context:primary-signature',
    '--verbose=4',
    dmgPath,
  ]);
}

function verifyNotReleaseSigned() {
  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], {
    encoding: 'utf8',
  });
  const output = `${details.stdout}\n${details.stderr}`;
  if (output.includes('Authority=Developer ID Application:')) {
    throw new Error('Unsigned verification mode cannot be used for a Developer ID release.');
  }
}

function runSystem(command, args, allowStderr = false) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args[0]} failed (${String(result.status)}): ${result.stderr || result.stdout}`,
    );
  }
  if (!allowStderr && result.signal)
    throw new Error(`${command} was terminated by ${result.signal}.`);
  return result;
}
