// Kept free of imports so scripts/onboarding-check.mjs can load it with Node's type stripping.
// Admission covers the Astra-capable app server as well as existing Sia installs.
export const CODEX_SUPPORTED_VERSIONS = {
  minimum: '0.147.0',
  maximumExclusive: '0.154.0',
  // The installed desktop build is verified independently; do not admit the
  // entire next minor or other prereleases merely to expose a newer catalog.
  additionalVersions: ['0.155.0-alpha.9', '0.155.0-alpha.9.2'],
} as const;
