# Sia `0.1.0-alpha.13` internal-candidate handoff

_Prepared 2026-08-26 KST. This is a source handoff, not signed release evidence._

## Outcome

`alpha.13` closes the low-risk interaction gaps identified in the clean-room Grok Bot behavioral
audit without importing reference code, assets, copy, or package dependencies. The room keeps
Sia's cool mineral surfaces and evergreen navigation; no paper-yellow surface treatment was added.

The candidate adds room pin/duplicate/notification controls, manual read state, contextual starts,
in-thread find, message/file/link search in the switcher, provider activity totals, bounded native
drag/drop, local image preview, external PDF/file open, reviewed feedback handoff, exact-thread
notifications, Dock unread badge, and an honest update-readiness state.

## Safety boundaries

- New room, draft, unread, and usage state stays in the encrypted desktop repository.
- Dropped paths exist only between the sandboxed preload and main process. File grants expire after
  one hour and do not survive relaunch.
- Image previews are limited to common raster types and 8 MB. PDF content is not embedded in the
  renderer; it opens in the default system reader.
- Feedback is not silently uploaded. Sia opens a mail draft for review. Optional diagnostics do not
  contain transcript or file contents.
- Update checks require a clean HTTPS manifest. Development can use `SIA_UPDATE_MANIFEST_URL`; a
  packaged release receives the URL through signed configuration prepared from
  `SIA_RELEASE_UPDATE_MANIFEST_URL`. No feed is configured by default, and the app does not claim
  automatic installation.
- Shared rooms, plugin marketplaces, VNC, password-vault integration, and webhook automation remain
  outside the internal candidate because they change the security and operating model.

## Release gates

### Verified locally

- `pnpm check`: passed build, formatting, quality, types, and 482 runnable unit/integration tests;
  the credential-dependent Codex isolation smoke test remained skipped.
- `pnpm test:e2e`: 26 runnable Electron scenarios passed, including strict parity behavior and the
  refreshed visual baselines. Four real Codex/Chrome/macOS-permission probes remained opt-in.
- `pnpm package:mac:arm64:dir`: produced and verified an unsigned
  `apps/desktop/release/mac-arm64/Sia.app` with cloud services deliberately disabled.
- `node apps/desktop/scripts/verify-release-environment.mjs`: correctly stopped before a signed
  release because signing/notarization and production API/Cognito configuration are not present in
  this shell.

### Still required for distribution

The following can be completed from this source checkout:

- workspace formatting, type, lint, unit, integration, quality, package, and Electron end-to-end
  gates;
- a fresh universal package, signature/notarization/stapling verification, and checksum evidence
  when release credentials are present;
- update-manifest endpoint configuration and validation if a durable feed is provisioned.

The following still require a human or external system and must not be inferred from green tests:

- recipient/cohort approval and the final participant list;
- institutional research and privacy sign-off where applicable;
- production signing/notarization identity (`CSC_NAME`, or `CSC_LINK` with
  `CSC_KEY_PASSWORD`) and Apple notarization credentials/profile;
- production `SIA_RELEASE_API_BASE_URL`, `SIA_RELEASE_COGNITO_REGION`, and
  `SIA_RELEASE_COGNITO_CLIENT_ID` values;
- deployment of a durable update manifest, including its access and retention policy;
- an approved user's actual install/login/connect/voice/computer-use acceptance pass.

Do not call `alpha.13` internally released until those recipient-specific and operational records
are attached to fresh release evidence. The last signed and published evidence remains
[`alpha.11`](./release-evidence-2026-08-26-alpha.11.md); `alpha.12` and `alpha.13` are later local
source candidates unless separately published.

## Reference

See [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md) for the feature
comparison and clean-room boundary.
