import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const devHome = join(homedir(), 'Library/Application Support/Sia Development');
export function selectIdentity(identities, pinned, requested) {
  if (pinned) {
    if (requested && requested !== pinned.hash && requested !== pinned.name)
      throw new Error(
        'Sia’s development identity is already pinned on this Mac. Keep it to preserve permissions.',
      );
    const found = identities.find((item) => item.hash === pinned.hash);
    if (!found)
      throw new Error(
        'Restore Sia’s pinned development certificate in Keychain; refusing an ad-hoc fallback that would reset permissions.',
      );
    return found;
  }
  const found = requested
    ? identities.find((item) => item.hash === requested || item.name === requested)
    : (identities.find((item) => item.name === 'Sia Dev Signing') ??
      identities.find((item) => item.name === 'Notch Dev Signing'));
  if (!found)
    throw new Error(
      'A stable development signing certificate is required. Run pnpm --filter @sia/desktop signing:setup once, or set SIA_DEV_SIGN_IDENTITY to an existing certificate.',
    );
  return found;
}
export function devIdentity({ required = true } = {}) {
  const output = execFileSync('/usr/bin/security', ['find-identity', '-p', 'codesigning'], {
    encoding: 'utf8',
  });
  const identities = [...output.matchAll(/\b([A-Fa-f0-9]{40}) "([^"]+)"/g)].map((match) => ({
    hash: match[1].toUpperCase(),
    name: match[2],
  }));
  const pin = join(devHome, 'signing.json');
  const pinned = existsSync(pin) ? JSON.parse(readFileSync(pin, 'utf8')) : undefined;
  // Build/test workers without a local certificate can produce unsigned artifacts;
  // interactive development launch requires a stable certificate and never falls back.
  if (
    !required &&
    !pinned &&
    !process.env.SIA_DEV_SIGN_IDENTITY &&
    !identities.some(({ name }) => ['Sia Dev Signing', 'Notch Dev Signing'].includes(name))
  )
    return undefined;
  const selected = selectIdentity(identities, pinned, process.env.SIA_DEV_SIGN_IDENTITY);
  if (!pinned) {
    mkdirSync(devHome, { recursive: true, mode: 0o700 });
    writeFileSync(pin, JSON.stringify(selected) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return selected;
}
export function signDevelopment(path, identity, identifier, extra = []) {
  execFileSync(
    '/usr/bin/codesign',
    [
      '--force',
      '--sign',
      identity.hash,
      '--timestamp=none',
      '--identifier',
      identifier,
      ...extra,
      path,
    ],
    { stdio: 'inherit' },
  );
  execFileSync('/usr/bin/codesign', ['--verify', '--strict', path], { stdio: 'inherit' });
}

export function designatedRequirement(path) {
  const result = spawnSync('/usr/bin/codesign', ['-d', '-r-', path], { encoding: 'utf8' });
  const requirement = (result.stdout + result.stderr).match(/designated => ([^\r\n]+)/)?.[1];
  if (result.status !== 0 || !requirement)
    throw new Error(
      'Could not verify Sia’s existing signing identity. Restore the signed app before updating.',
    );
  return requirement;
}

export function assertSameIdentity(before, after) {
  if (designatedRequirement(before) !== designatedRequirement(after))
    throw new Error(
      'This update would change Sia’s signing identity and invalidate saved permissions. Restore the original pinned certificate; the installed app was kept.',
    );
}
