const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

/** Keep the packaged plist aligned with Sia's deny-by-default network and device policy. */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const plistPath = join(appPath, 'Contents', 'Info.plist');

  runPlutil([
    '-replace',
    'NSAppTransportSecurity',
    '-json',
    JSON.stringify({
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: false,
    }),
    plistPath,
  ]);

  for (const unusedPermission of [
    'NSAudioCaptureUsageDescription',
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'NSCameraUsageDescription',
  ]) {
    const present = spawnSync(
      '/usr/bin/plutil',
      ['-extract', unusedPermission, 'raw', '-o', '-', plistPath],
      { encoding: 'utf8' },
    );
    if (present.status === 0) runPlutil(['-remove', unusedPermission, plistPath]);
  }

  // Electron Builder calls this again after merging the universal app, immediately
  // before signing. Finder metadata can otherwise make codesign reject a helper.
  const { cleanSigningMetadata } = await import('../scripts/signing-metadata.mjs');
  cleanSigningMetadata(appPath);
};

function runPlutil(argumentsValue) {
  const result = spawnSync('/usr/bin/plutil', argumentsValue, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`plutil failed: ${result.stderr || result.stdout}`);
  }
}
