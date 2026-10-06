# Public distribution candidate

## Decision

Sia `0.1.0-alpha.25` remains an internal release candidate. Public distribution is blocked until
the exact candidate is notarized and the recipient acceptance checks below pass. No alpha.25
installer or public download has been published. The last notarized pilot release remains
[`alpha.24`](./release-evidence.md).

## Current source and local verification

The current candidate passed `pnpm test:pilot`: 1,077 desktop unit tests,
42 Electron checks and 17 renderer checks, with six desktop and four opt-in Electron checks
skipped. All 60 phone checks passed across Chromium and WebKit. Computer Use exercised the
connected-app setup, email-code resend fixture, permission/relaunch fixture, and monthly schedule
creation. Simulated services do not establish real email delivery or OAuth consent.

The release-readiness pass additionally found and repaired two defects:

- Generated report tools return canonical file paths. macOS may spell an authorized `/var`
  workspace as `/private/var`; the result grant now accepts either spelling of the authorized
  root while still rejecting descendant symlinks, hard links, hidden files, and outside paths.
- Release packaging now removes only Finder/resource-fork metadata from the staged app before
  signing, including after the universal merge. It preserves quarantine and other attributes.
  The development and release paths share the same cleanup helper. File Provider-managed
  Documents folders can reintroduce this metadata during signing, so the candidate is staged in
  an unsynced local build directory.

The full source gate passed again with both fixes. All 60 phone checks passed again. The signed
universal candidate passed strict nested signature verification. Its designated requirement
exactly matches the installed previous Sia app; this is identity evidence, not a completed upgrade
acceptance test.

## Live harness and package evidence

- Sia's actual pinned Codex `0.153.0` download, SHA-512 validation, extraction, and version check
  passed in a disposable directory. The operator's existing Codex installation was unchanged.
- The downloaded Codex authenticated and offered GPT-6 Astra. Four no-turn isolation checks
  passed for connected, disabled-native-tools, foreground Mac, and background Mac sessions.
- A real Codex App Server completed the included-model protocol/tool round trip against a local
  synthetic Responses relay. This is not proof of the deployed included-model service.
- The app's live no-turn checks passed Codex authentication and CUA permission reporting.
  The dedicated Chrome-window check was not enabled.
- GPT-6 Astra completed the disposable background workflow after the path fix: report creation,
  saved skill execution, restart and unchanged skill reuse, and repair of an existing report.
  Output contents were checked; GUI access was denied throughout. This does not establish live
  app control, external account coverage, or all nine consumer demos.
- Universal unsigned packaging passed native architecture, bundled runtime, license, resource,
  and MCP bridge checks. The repaired Developer ID candidate also passed those checks and strict
  nested signatures, then correctly stopped at Gatekeeper with `Unnotarized Developer ID`.
  Neither artifact is distributable without notarization and recipient acceptance.

## Signed internal candidate

The preserved app is `apps/desktop/release/internal-candidate/mac-universal/Sia.app` in the
original checkout. It was built in an unsynced local staging directory and verified again after
copying. Its `Contents/Resources/app.asar` SHA-256 is
`6182b3773d166cb122a73af03a37fc42c9c516dc7b7bf7492ffeb9d397e01f02`.

Computer Use verified the real packaged email sign-in screen with an empty isolated Sia profile.
New conversation, search and Settings keyboard shortcuts did not expose private app surfaces.
No email was sent or account created. This reused the existing Mac and does not establish clean
macOS permissions, new-user Keychain behavior or authenticated upgrade persistence.
No notarized DMG/ZIP was produced or published.

## Production email delivery

The `sia-alpha` stack in `us-east-1` now uses SES production delivery with
`Sia <auth@superintelligentagents.ai>` as the verified sender. The completed change set is
`sia-release-ses-20261004-v2`. The domain's DKIM status is `SUCCESS`; SES sending and production
access are enabled. CloudFormation finished `UPDATE_COMPLETE`.

Only `EmailSendingAccount` and `FromEmail` parameter values changed. All resource definitions
were retained, no resource was replaced, and Cognito's refresh lifetime remains **30 days** with
revocation enabled. An initial preview omitted the required branded From address and rolled back
at parameter validation before any resource update. The corrected change completed successfully.

Actual new-recipient email delivery, wrong-code handling, resend, expiry, and full sign-in still
need the disposable recipient acceptance check. SES configuration alone is not delivery evidence.

The source's separately prepared ten-year refresh-token setting has **not** been deployed.
Do not apply it incidentally through a broad stack update. That production-wide duration still
needs explicit approval of the credential lifetime; this email-only update preserved the live
template and existing sessions.

## Signing and recipient acceptance

The existing Developer ID Application certificate for team `DXYJ578DD4` is available. The release
must keep the `Sia` runtime/product/executable name and `ai.sia.desktop` bundle identifier so it
retains the established Keychain namespace and designated requirement.

The saved Apple notarization profile name is still required. A targeted metadata query found no
matching entry. Automatic approval review rejected opening the entire Keychain Access window
because it could expose unrelated credential metadata; broad enumeration was not used as a
workaround. Supply the exact profile name, never a password in chat or a repository file.

Run the canonical `pnpm package:mac` with that profile and the deployed non-secret cloud/update
configuration. Require strict nested signatures, successful notarization, stapling, and Gatekeeper
assessment for both the app and DMG. Retain the previous signed artifact for rollback.

On that exact artifact, complete [manual acceptance](./manual-acceptance.md):

1. Clean macOS user/account install, new-recipient signup, Codex download/browser login, optional
   connections, guided permissions, denial/skip/resume, and one final relaunch.
2. Upgrade from the prior signed release with encrypted state, conversation history, grants,
   generated results, and schedules intact; repeat quit/reopen twice.
3. Physical microphone/Fn input, background and foreground control, lock/sleep recovery, and
   cancellation against visible app state. Existing OS grants are not clean-user evidence.
4. Real Google and Slack consent, reads, denial, expiry and reconnect with designated disposable
   identities. Public availability also requires the independent
   [connector distribution gates](./connector-distribution-readiness.md).
5. Actual runs of the [nine demo cases](./demo.md), checking source coverage and outputs.
   Purchase, cancellation, and outreach rehearsals use synthetic fixtures and explicit approval.
6. Confirm the previously exposed Meta and Apple app-specific credentials were revoked and replaced,
   as required by [release status](./release-status.md). No credential rotation was performed or
   claimed in this pass. Confirm the support/incident owner before broader distribution.

Schedules still require Sia open and the Mac awake. Durable source-specific seen/read state,
offline cloud scheduling, and full binary/scanned tax-document coverage remain unproven.

## Publication

After the exact signed artifacts and human acceptance pass, run `pnpm release:stage-public-download`
to validate and stage the immutable installer and `/download/release.json`. The public site's
`pnpm --filter @sia/site deploy --public-release` performs the release checks before uploading.
Verify an unauthenticated recipient download and its hash. The authenticated signed update feed
is a separate publication step in [release.md](./release.md).

Keep Google/Slack limited to their approved tester cohort until their distribution gates pass.
Research recruitment is separate and requires every approval in
[research-release-signoff.md](./research-release-signoff.md). Signing, staging, or local automated
success does not grant those approvals.
