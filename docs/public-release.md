# Public distribution candidate

## Decision

Sia `0.1.0-alpha.25` remains an internal release candidate. Live testing found and repaired
model-selection, optional-research, approval-focus and iMessage decoding issues. The latest signed
app under test is built from `73b4a0f3cd0fd51f47f6026caba966413de457db`; its app.asar SHA-256 is
`36db237be32dca851c2a20ac43f9eae912ba887432b648c1173995764e975e3c`. Apple accepted app submission
`781c19c3-d04c-414a-b537-34f58bbaa8e7`, and the isolated copied app passed strict signatures,
staple validation and Gatekeeper. DMG notarization and the repeated live phone check are pending.
The additional Messages search repair described below is not yet in that signed artifact.
Public distribution remains blocked until
the recipient acceptance checks below pass. No alpha.25
installer or public download has been published. The last published pilot release remains
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

Notion live acceptance is deferred for this release at the operator's request. Its implementation
remains included, but no live Notion result is claimed.

The integration preserves BYOK and lab provider validation alongside the expanded connector IDs,
local-connector ownership and the improved sign-in errors. Calendar, Tasks, and Outlook remain
unavailable. Slack's deployed behavior is unchanged; the prepared manifest is not a deployment.

Verification on October 6, 2026 UTC:

- `pnpm test:pilot` passed: build, formatting, lint, quality guard, all workspace type/unit gates,
  **1,168 desktop unit tests**, **45 Electron tests**, and **17 renderer tests**. Seven desktop
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
  connection/send recovery. The captured first page connected just after its five-second assertion expired; the second was
  connected but had no draft before Send. The cold-start check now uses the client's ten-second
  request deadline, and the recovery test installs routes before navigation, types real keys, and
  asserts its draft. All 60 phone-browser checks passed locally again. Failure traces are retained,
  and CI has 45 minutes for the expanded verification/package job.
  [Earlier combined CI](https://github.com/ljang0/sia-v2/actions/runs/37421718412) passed on
  `7f59f848b70d163888ae2a8fa45b8952bddce8f8`: all source gates, 1,162 desktop unit tests,
  45 Electron tests, 17 renderer checks, all 60 phone-browser checks, and unsigned universal
  package verification. The new slow-download test uses native byte-exact Buffer comparison
  to avoid the test framework spending more than five seconds on a recursive 3 MB comparison.

[Previous application CI](https://github.com/ljang0/sia-v2/actions/runs/37429077856) passed on
`cd21ffd08b0c07cf7ee031015e49d4d7daccd061`, including both live-discovered model fixes:
1,165 desktop unit tests, 45 Electron tests, 17 renderer tests, all 60 phone-browser tests,
and unsigned universal package verification. That signed build has been superseded by the
optional-research repair. Local `pnpm test:pilot` passed again on `e544761` with 1,168 desktop
unit tests, 45 Electron tests and 17 renderer tests. [Fresh CI](https://github.com/ljang0/sia-v2/actions/runs/37508953064)
passed on the same source used for the repaired signed candidate, including all 60 phone-browser checks and universal package verification.

The later documentation-only CI run on `29ee868` failed during the appearance relaunch test:
the trace shows the test reading the default native theme before app initialization, then hanging
while closing that partially initialized process. The test now waits for Sia's first window before
checking the restored theme and initial dark background. It retains the same visual assertions.

The installed `/Applications/Sia.app` is **alpha.14**, not this candidate. Computer Use works in
this session. The integrated source was opened with real services in the existing signed
`ai.sia.desktop.dev` runtime and an isolated encrypted profile. Its Keychain opened successfully.
The guided Mac permission check now reports every required permission ready, including
System Events, Safari, Calendar, and Reminders Automation; optional microphone/speech access
also reports allowed. The personal ElevenLabs voice service is configured and enabled. These
are development-identity grants, not clean-user or signed-release acceptance.

The installed global Codex `0.154.0` is outside Sia's admitted versions. The app correctly shows it
as incompatible. The operator approved the managed runtime installation. Its live download exposed
a fixed two-minute deadline: the official 116 MB archive could not finish over the observed slow
connection. Setup now displays downloaded megabytes and permits a progressing download for up to
45 minutes, while aborting after two minutes without incoming data. SHA-512 verification, archive
size limits, admitted-version checks, and atomic installation remain required. Regression checks
cover slow success, a stalled stream, the overall deadline, and visible progress. The repaired full `pnpm test:pilot` gate passed with 1,162 desktop unit tests, 45 Electron checks,
and 17 renderer checks. The repaired GUI setup completed and installed admitted Codex `0.153.0`; Settings shows
Connected. GPT-6-Astra then read a disposable CSV through the real harness and returned every
expected item total and the correct grand total, 31.50, in 12 seconds with two steps.
A live Calculator task correctly stopped when background controls were unavailable under
the selected Pause and tell me policy. Foreground GUI acceptance remains pending.
After the live Codex catalog stopped offering that conversation's pinned model, two defects were
found: the picker visually showed its first available option while retaining the old model, and
an explicit replacement changed the model without updating its saved execution route. The picker
now identifies the unavailable pinned choice, and explicit replacement resolves the complete
allowed route while preserving the conversation's harness and credential source. Regression tests
cover the visible selection, starting a task with the new route, persistence, and repair of an
already mismatched saved conversation. The full pilot gate passed again with 1,165 desktop unit
tests, 45 Electron tests, and 17 renderer tests. The repaired source also passed full CI and signed packaging. A fresh Connected apps conversation
then read PR #20 through GitHub in 15 seconds; its title, state, base/head branches, and draft flag
matched an independent GitHub check after relaunch. Disconnect/reconnect and signed-app connector
acceptance remain pending.
Texting is enabled and Ready for one authorized self-test recipient; physical-phone delivery
remains unverified. With operator approval, the development phone remote was enabled and independently
confirmed listening on its selected LAN address; the app reports Ready. The in-app browser rejected
that LAN URL, and loopback is not a listener, so pairing and task control still require the physical
phone check. Desktop Computer Use input also became unreliable after the Mac lock/sleep interruption.
Neither a listening port nor UI readiness establishes an end-to-end phone result. Telephone calling
is outside this release scope.

On October 7, a real iMessage self-test reached the development app and produced the requested
answer, but exposed a release blocker: the attributed-message decoder included binary length
bytes and sometimes selected attribute metadata instead of the message. Sia then mistook its own
prefixed replies for new tasks. The test relay was turned off to stop the loop. The decoder now
reads the root attributed string's length-delimited text with bounded parsing and rejects unknown
formats without guessing. Independent Foundation-generated synthetic archives cover short commands,
reply suppression, Unicode, line breaks, attachments and long messages. The complete pilot gate
passed with 1,186 desktop unit tests, 45 Electron checks, and 17 renderer checks. A repeated live
self-test and fresh signed packaging remain required. Do not count the first
reply as a completed phone acceptance pass; physical-phone origin, media and approvals remain open.
The same review found that a one-minute text deduplication window suppressed a second YES for
a different approval. Deduplication now pairs opposite-direction copies in a self-chat, rather
than suppressing a new same-direction command with identical text. Regression checks exercise
consecutive exact-step approvals in both copy arrival orders. The full gate also exposed a test
timing race: a deterministic turn could finish while the test was still creating a second worktree.
The test now creates both worktrees first, then dispatches their tasks together and still requires
two running and two completed results, without increasing the delay or assertion deadlines.

The accompanying Messages search review found that filtering only `message.text` missed modern
messages stored in `attributedBody`. Search now uses the same bounded decoder as reading, before
applying the result limit; archive metadata cannot match as message text. Synthetic database checks
cover case-insensitive body search, limiting, sender/name search, empty text and plain-text precedence.
The repaired signed app restored its authenticated profile, saved conversations and connected Codex
plan. Texting was enabled for the authorized self-number, but no successful repeated live delivery
has been verified. A manual recipient-entry operation changed focus and sent only the test number
to an unintended conversation; Undo Send was invoked but could not be independently confirmed.
Real outbound testing is paused until recipient focus is reliable. Automated Electron and manual
Mac input must run separately, with the complete recipient and draft inspected before Send.

The cloud-configured universal candidate passed Developer ID signing, Apple notarization,
stapling, strict nested signature verification, and Gatekeeper acceptance for both app and DMG.
App notarization submission `a8e0e4b6-320f-405a-ac0f-5535f3a38b40` and DMG submission
`902c203f-3d9b-4afe-82ac-8ef626bfd740` were accepted. Its app.asar SHA-256 is
`c086a9ada3e8124a62f26fe4704dd78199e0ac7ed695f3b31b910d375402d8b0`.
The DMG SHA-256 is `b0c202413464cd190e9b68f2fdcf33906acbf0f523a700bfd6de46f26ef2c70a`;
the ZIP SHA-256 is `0d3e3df9088e32e662229baa32dc9b510ab185896623f1e17b55fdc676b5b7cc`.
The prior notarized build completed the following signup check. A fresh isolated profile launched
that app and showed only email sign-in. The live
service accepted a code request and rejected a deliberately incorrect code while preserving
the sign-in wall. The operator received and entered the valid code, and the exact signed copy
independently reached authenticated onboarding in its isolated profile. Managed Codex 0.153.0
then installed through the GUI; its automatic restart preserved that profile. After the operator
completed the macOS prompts, independent inspection confirmed authenticated setup finished and
the conversation screen reported **Sia is ready**. This used the earlier notarized copy, not the
rebuilt artifact. The rebuilt signed candidate then reopened the same isolated profile: the
authenticated conversation screen, completed onboarding and Connected Codex plan persisted without
a new sign-in or observed Keychain prompt. Its permission panel still reports System Events and
Safari as needing attention, so actual app-control acceptance remains pending. Clean-macOS-user
and alpha.24 upgrade acceptance remain pending. The published alpha.24 ZIP was retrieved and its
recorded hash, strict app signature and Gatekeeper acceptance verified in preparation for that test.
Starting a task in the signed candidate exposed a contradiction with the optional-research interface:
accounts eligible for research uploads were required to consent before any task could start, and
could not pause capture while signed in. The obsolete checks and unused mandatory-consent UI path
have been removed. Regression tests complete real controller turns with sharing untouched, declined,
paused, and explicitly accepted; only the accepted case stores and uploads research. No live research
consent was supplied and no account membership was changed for this repair.
The repaired signed app reached its saved conversation and started the Calculator task without
requiring research consent. It opened Calculator and captured the display, but then stopped when
the foreground changed during an approval. This did not complete the calculation. The foreground
execution guidance now requires restoring and checking the authorized app/window after approval,
prefers app-scoped controls, and keeps a small action with its verification capture when practical.
This guidance change needs its own live verification and signed rebuild; the hashes above identify
the preceding optional-research build.
GitHub consent completed and the development app independently showed the expected
connected account; its live read passed as recorded above, while disconnect/reconnect remains pending.

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
Email receipt and authenticated signup were separately verified as recorded above. The other
endpoint checks do not establish all authenticated behavior or alarm receipt during an actual incident.

The GitHub `alpha-release` environment contains the five cloud/update configuration secrets, but
no signing or Apple notarization secrets; the repository-level secret list is empty. Local signing uses the existing Developer ID certificate and the operator's named Keychain profile.
The profile initially returned Apple's missing-agreement error; after the operator accepted the
agreement, the notarization service accepted the profile. The installed app's non-secret cloud and
update configuration matches the deployed stack and is embedded in the signed candidate.
The completed notarization and Gatekeeper results are recorded above.

## Instinct comparison scope

The comparison target is [Instinct's public product](https://instinct.com/): connected apps,
computer actions, messaging, voice interaction, and proactive follow-up. Sia's implemented phone
channels are iMessage, Telegram, Discord, and the Wi-Fi browser remote. Their live acceptance is
recorded separately from browser fixtures and unit tests. Voice notes and in-app voice conversation
are implemented; incoming/outgoing telephone calls and an always-on cloud worker are not implemented. The operator
confirmed this release should finish and verify the existing phone features before adding calling.
Notion live testing is also deferred. Local work still requires Sia running on an awake Mac.
Calendar, Tasks, and Outlook remain disabled
by the operator's prior scope decision. Do not claim complete Instinct parity or arbitrary-account
connector availability from the current automated test results.

## Earlier audit verification

These results describe the earlier audit candidate and do not replace the integrated-build gates.

That earlier audit candidate passed `pnpm test:pilot`: 1,077 desktop unit tests,
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

## Earlier audit harness and package evidence

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
That earlier pass produced no notarized DMG/ZIP. The integrated candidate above has since
completed notarization; no alpha.25 installer has been published.

## Production email delivery

The `sia-alpha` stack in `us-east-1` now uses SES production delivery with
`Sia <auth@superintelligentagents.ai>` as the verified sender. The completed change set is
`sia-release-ses-20261004-v2`. The domain's DKIM status is `SUCCESS`; SES sending and production
access are enabled. CloudFormation finished `UPDATE_COMPLETE`.

Only `EmailSendingAccount` and `FromEmail` parameter values changed. All resource definitions
were retained, no resource was replaced, and Cognito's refresh lifetime remains **30 days** with
revocation enabled. An initial preview omitted the required branded From address and rolled back
at parameter validation before any resource update. The corrected change completed successfully.

The integrated signed candidate accepted an email-code request and rejected a deliberately
incorrect code. Inbox delivery, resend, expiry, and complete new-recipient sign-in remain pending.
SES configuration alone is not delivery evidence.

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

The canonical `pnpm package:mac` completed with that profile and the deployed non-secret
cloud/update configuration. Strict nested signatures, notarization, stapling, and Gatekeeper
assessment passed for both the app and DMG. The previous signed release remains available
for rollback. These packaging results do not replace recipient acceptance.

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
The candidate is already staged locally. The page loaded in a browser, and a full local HTTP
download of the rebuilt candidate returned 263,069,560 bytes matching its manifest SHA-256. Nothing was uploaded.
Verify an external unauthenticated recipient download and its hash after publication. The authenticated signed update feed
is a separate publication step in [release.md](./release.md).

Keep Google/Slack limited to their approved tester cohort until their distribution gates pass.
Research recruitment is separate and requires every approval in
[research-release-signoff.md](./research-release-signoff.md). Signing, staging, or local automated
success does not grant those approvals.
