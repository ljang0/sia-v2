// typescript-eslint loads the TypeScript compiler API, which TypeScript 7 no longer ships.
// Give the lint toolchain its own TypeScript 5.9 (the version the packages already build with)
// instead of the workspace-root TypeScript 7 it would otherwise receive as a peer.
const LINT_TYPESCRIPT = '~5.9.3';

function readPackage(pkg) {
  const usesCompilerApi =
    pkg.name === 'typescript-eslint' ||
    pkg.name === 'ts-api-utils' ||
    pkg.name.startsWith('@typescript-eslint/');
  if (usesCompilerApi && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: LINT_TYPESCRIPT };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
