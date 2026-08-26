# Sia `0.1.0-alpha.13` operator/internal-QA handoff

_Prepared 2026-08-26 KST. Signed release evidence is linked below._

## Outcome

`alpha.13` closes the low-risk interaction gaps identified in the clean-room Grok Bot behavioral
audit without importing reference code, assets, copy, or package dependencies. It is signed,
Apple-notarized, stapled, pushed, tagged, privately published, and ready for operator/internal QA.
The room keeps Sia's cool mineral surfaces and evergreen navigation; no paper-yellow surface
treatment was added.

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
- The follow-up source now requires an authenticated private manifest route and a pinned Ed25519
  public key. The desktop verifies the signature and binds the presigned AWS S3 URL to the exact
  signed object key. No feed is embedded in the already-signed `alpha.13` artifact, and the app does
  not claim automatic installation.
- Shared rooms, plugin marketplaces, VNC, password-vault integration, and webhook automation remain
  outside the internal candidate because they change the security and operating model.

## Release gates

### Verified locally

- `pnpm check`: passed build, formatting, quality, types, and 482 runnable unit/integration tests;
  the credential-dependent Codex isolation smoke test remained skipped.
- `pnpm test:e2e`: 26 runnable Electron scenarios passed, including strict parity behavior and the
  refreshed visual baselines. Real Codex isolation/authentication and macOS permission probes also
  passed separately. Chrome's real attachment probe failed closed at Chrome's disabled one-time
  remote-debugging permission.
- `pnpm package:mac:arm64:dir`: produced and verified an unsigned
  `apps/desktop/release/mac-arm64/Sia.app` with cloud services deliberately disabled.
- `pnpm package:mac`: produced and verified the signed, notarized, stapled universal app, DMG, and
  ZIP through the secured local-Mac Keychain path.
- Private publication stored both artifacts under content-addressed keys, generated a seven-day DMG
  link, and returned HTTP 206 for a 1,024-byte range request.
- Exact hashes, notarization identifiers, stack evidence, and the remaining rollout gates are in
  [`release-evidence-2026-08-26-alpha.13.md`](./release-evidence-2026-08-26-alpha.13.md).

### Still required for distribution

Source verification, signed packaging, notarization, stapling, content-addressed private upload,
presigned-link range testing, stack drift, and alarm checks are complete.

The following still require a human or external system and must not be inferred from green tests:

- recipient/cohort approval and the final participant list;
- institutional research and privacy sign-off where applicable;
- production Cognito email delivery or the reviewed Cognito-managed custom-sender alternative,
  followed by an unrelated-domain human delivery test;
- deployment and first offline-key publication of the implemented signed update manifest, then a
  new signed desktop package containing its API URL and pinned public key;
- Chrome's one-time visible remote-debugging permission followed by the exact attachment probe;
- an approved user's actual install/login/connect/voice/computer-use acceptance pass.

The GitHub `alpha-release` environment now exists, is limited to `main`, and contains the three
production API/Cognito values. It does not contain portable Apple signing secrets; signed builds
continue to use the secured release Mac unless those secrets are deliberately provisioned.

`alpha.13` is an operator/internal-QA release, but do not call it participant-approved until the
recipient-specific, human, and operational records above are complete. The current signed evidence
is [`release-evidence-2026-08-26-alpha.13.md`](./release-evidence-2026-08-26-alpha.13.md).

## Reference

See [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md) for the feature
comparison and clean-room boundary.
