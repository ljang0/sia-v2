import { execFileSync } from 'node:child_process';

// Apple's QA1940 disallows Finder/resource-fork metadata in signed bundles.
// Clean only the staged app; preserve other attributes, including quarantine.
export function cleanSigningMetadata(app) {
  for (const attribute of ['com.apple.FinderInfo', 'com.apple.ResourceFork'])
    execFileSync('/usr/bin/xattr', ['-dr', attribute, app]);
}
