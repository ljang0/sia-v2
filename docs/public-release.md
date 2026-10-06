# Public distribution candidate

## Decision

Sia `0.1.0-alpha.25` remains an internal release candidate. Public distribution is blocked until
the exact candidate is notarized and the recipient acceptance checks below pass. No alpha.25
installer or public download has been published. The last notarized pilot release remains
[`alpha.24`](./release-evidence.md).

## Integrated release candidate

The `codex/release-verification` branch combines all four workstreams against remote main
`5c80af0`, including the six earlier local-main commits through `8ed02a4`:

| Workstream                                            | Included source                            |
| ----------------------------------------------------- | ------------------------------------------ |
| UI and streaming, PR #17                              | `1149feda49d36504974f866d7c4619e9812b04a2` |
| GitHub and Notion, PR #18                             | `9f917672a3174d2c402d6436556358f64a12e910` |
| Texting and bot channels, PR #19                      | `570f8f7b674544ad9ddd025022a3a14e121f0160` |
| Public-release audit, BYOK, lab harness and Mac setup | `ffd1aca`                                  |

The integration preserves BYOK and lab provider validation alongside the expanded connector IDs,
local-connector ownership and the improved sign-in errors. Calendar, Tasks, and Outlook remain
unavailable. Slack's deployed behavior is unchanged; the prepared manifest is not a deployment.

Verification on October 6, 2026 UTC:

- `pnpm test:pilot` passed: build, formatting, lint, quality guard, all workspace type/unit gates,
  **1,159 desktop unit tests**, **45 Electron tests**, and **17 renderer tests**. Seven desktop
  tests and four Electron tests remain opt-in and were skipped; passing fixtures do not establish
  real OAuth, Messages, model responses, or operating-system grants.
- The texting E2E now uses the integrated one-click setup; its obsolete optional-app checkbox
  was removed from the test. Saved numbers, preferences, and trusted people survive relaunch.
- PR #19's failed CI screenshot was compared with main's reference: its actual image was
  **pixel-identical to main**. The branch had inherited a display-profile-dependent reference.
  Deterministic Electron tests now force sRGB at 1× backing scale, and the original main reference
  is restored. Both visual tests passed again after that change.
  No screenshot comparison tolerance was increased.
- Phone-browser verification passed all **60 tests**: 30 Chromium and 30 WebKit. WebKit was
  initially absent locally; its pinned runtime was installed and all 30 WebKit tests reran
  successfully. These exercise the phone web client, not iMessage/Telegram/Discord delivery.
- `pnpm package:mac:dir` built and verified the combined **unsigned universal** app, including
  both native architectures, app identity, bundled resources, license corpus, and MCP bridge.
  It has cloud disabled for local verification and is neither signed nor notarized. Its
  `Contents/Resources/app.asar` SHA-256 is
  `1c1d26ef22db23b6f3eac2acbe07e603d918ad7ad0c3919d755b95077072e800`.
  Do not distribute it or use it as evidence of signed upgrade or Gatekeeper acceptance.
- CI now installs Chromium and WebKit and runs both renderer and phone-browser checks. Signed
  packaging depends on the verification job, so it cannot run after that job fails.
- [Combined application CI](https://github.com/ljang0/sia-v2/actions/runs/37411104281) passed all
  source, Electron, renderer, phone-browser, and universal-package gates on `d1eacf5`. A rerun after
  the live-evidence documentation update exposed a Telegram test's fixed 10 ms wait for attachment
  delivery. Bot tests now wait for observable completion instead. CI on `1999c98` passed the source, desktop,
  and renderer gates, then passed 58 of 60 phone-browser checks; two WebKit cases failed during
  connection/send recovery. Both cases passed three consecutive local runs. CI failure evidence
  remains under investigation; a local pass does not close that gate.

The installed `/Applications/Sia.app` is **alpha.14**, not this candidate. Computer Use works in
this session. The integrated source was opened with real services in the existing signed
`ai.sia.desktop.dev` runtime and an isolated encrypted profile. Its Keychain opened successfully.
The app reports Accessibility, Screen Recording, Chrome Automation, Finder Automation, Messages
Automation, and Full Disk Access allowed. System Events, Safari, Calendar, and Reminders Automation
still need grants. The personal ElevenLabs voice service is configured and enabled. These are existing development-identity grants, not
clean-user or signed-release acceptance. No operating-system grants were changed in this pass.

The installed global Codex `0.154.0` is outside Sia's admitted versions. The app correctly shows it
as incompatible. The operator approved the managed runtime installation. Its live download exposed
a fixed two-minute deadline: the official 116 MB archive could not finish over the observed slow
connection. Setup now displays downloaded megabytes and permits a progressing download for up to
45 minutes, while aborting after two minutes without incoming data. SHA-512 verification, archive
size limits, admitted-version checks, and atomic installation remain required. Regression checks
cover slow success, a stalled stream, the overall deadline, and visible progress. The repaired full `pnpm test:pilot` gate passed with 1,162 desktop unit tests, 45 Electron checks,
and 17 renderer checks. The repaired GUI setup is being verified; no completed model turn or real message round trip is claimed yet.

A real ElevenLabs probe completed speech generation, batch and streaming transcription, and
cancellation using a synthetic sentence. It generated 46,020 audio bytes and completed in 3,050 ms.
This verifies the configured service, not physical microphone/Fn input or phone delivery. The
Mac-only dictation fallback does not transcribe uploaded voice-note files.

Read-only external checks found the production stack in `UPDATE_COMPLETE`, SES production sending
enabled, and the sender domain verified with successful DKIM. All 17 alarms were `OK`, with actions
enabled and a confirmed email subscription. The control Lambda remains the September 24 deployment;
this integration has not been deployed. The public homepage, privacy, terms, and support pages
responded successfully; `/download/` returned 404 because the new download has not been published.
Unauthenticated session, catalog, voice-catalog, and release-feed requests returned 401 as expected.
These checks do not establish fresh-recipient delivery, authenticated endpoint behavior, or alarm
receipt during an actual incident.

The GitHub `alpha-release` environment contains the five cloud/update configuration secrets, but
no signing or Apple notarization secrets; the repository-level secret list is empty. Local signing uses the existing Developer ID certificate and the operator's named Keychain profile.
The profile initially returned Apple's missing-agreement error; after the operator accepted the
agreement, the notarization service accepted the profile. The installed app's non-secret cloud and
update configuration matches the deployed stack and is available for the new signed build. This is
release preparation, not evidence that the new artifact has passed notarization or Gatekeeper.

## Instinct comparison scope

The comparison target is [Instinct's public product](https://instinct.com/): connected apps,
computer actions, messaging, voice interaction, and proactive follow-up. Sia's implemented phone
channels are iMessage, Telegram, Discord, and the Wi-Fi browser remote. Their live acceptance is
recorded separately from browser fixtures and unit tests. Voice notes and in-app voice conversation
are implemented; incoming/outgoing telephone calls and an always-on cloud worker are not implemented. The operator
confirmed this release should finish and verify the existing phone features before adding calling.
Local work still requires Sia running on an awake Mac. Calendar, Tasks, and Outlook remain disabled
by the operator's prior scope decision. Do not claim complete Instinct parity or arbitrary-account
connector availability from the current automated test results.

## Earlier audit verification

These results describe the earlier audit candidate and do not replace the integrated-build gates.

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

## Earlier signed internal candidate

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

The operator supplied the exact existing notarization Keychain profile. Apple initially refused it
because a developer agreement was missing or expired. After the operator accepted the agreement,
the read-only notarization history request succeeded. No password was written to the repository,
command-line arguments, or evidence.

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
