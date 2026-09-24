# Public distribution candidate

## Current status

Sia `0.1.0-alpha.25` is prepared for internal release validation. It is **not approved or ready for
public distribution**. The public website and download artifacts have not been published.
The source changes remain local and uncommitted on `codex/codex-setup`.

The universal candidate is `apps/desktop/release/mac-universal/Sia.app`. It is signed with the
existing Developer ID Application identity and contains arm64 and x86_64 slices. Its designated
requirement exactly matches the installed previous release (`ai.sia.desktop`, team `DXYJ578DD4`).
Strict nested signature verification passed. Package verification reached Gatekeeper and correctly
stopped with `Unnotarized Developer ID`; there is no distributable DMG or ZIP yet.

`pnpm test:pilot` passed for the prepared source: 684 desktop unit tests and 46 deterministic UI
checks, with six desktop skips and four explicitly opt-in live UI checks skipped. Native tests,
workspace builds, formatting, quality, types, signing-identity checks and download metadata tests
passed. The download page's unavailable state was also checked in a real browser.
These checks do not establish clean-account login, physical voice input, live Slack control, or
Keychain continuity across a signed update.

## Fresh-profile rehearsal on the developer Mac

The signed `0.1.0-alpha.25` candidate was launched with an empty isolated profile on this Mac,
using Electron's `--user-data-dir` switch. No existing Sia profile was reset, and the packaged
app used its real cloud configuration and Keychain-backed encrypted storage. The tested
`Contents/Resources/app.asar` SHA-256 was
`585743bfc600e8aab3506f7d62e9a4acb634261663bfbcc83d61fe0276ae2ee6`.

- The real email sign-in screen appeared before private app access. The user completed email
  sign-in and reported **no Keychain prompt** on this launch.
- A single **Set up Sia** click created the first agent and entered the permission checklist.
  Core Accessibility, Screen Recording and voice access were already allowed on this Mac.
  The checklist progressed to nine of ten grants, with six of seven everyday apps allowed;
  Calendar remained optional and **Start using Sia** was enabled.
- Desktop-control calls then timed out. A process sample showed the main thread waiting in its
  normal event loop, not a Keychain call. Completion into the composer, a real first turn and
  two quit/reopen cycles have not yet been verified for this profile.
- Two wording issues found in the rehearsal are fixed in source: the public sign-in screen no
  longer asks for a pilot-invited university email, and partial app-permission status explicitly
  distinguishes ready core access from optional remaining app access. The initial rehearsal
  used the candidate before these wording corrections.

For the user's manual walkthrough, the candidate was subsequently rebuilt with both corrections,
passed strict nested code-signature verification, and opened with another empty profile at the
real email sign-in screen. The corrected email copy and placeholder were verified in the running
app, then the window was brought forward and left for the user. Its `app.asar` SHA-256 is
`8b51befbc8ba4b5b6db0e2a1d469c0f8d0b7edf68500bb02b2b77264a4ea5cbe`.
This remains a signed internal candidate without notarization; no installer was published.
The user completed the manual setup successfully, then reported voice stuck on Listening.

Seven focused deterministic first-run/relaunch checks passed. The full pilot gate passed again
after both wording fixes: 677 desktop tests and 46 UI tests, with six desktop and four opt-in live
UI skips. These tests simulate services and cannot replace live acceptance. Local evidence is in `/private/tmp/sia-fresh-user-e2e.log`,
`/private/tmp/sia-fresh-user-pilot.log` and `/private/tmp/sia-fresh-user-final-pilot.log`.

This is a **fresh Sia profile, not a fresh macOS user or proven new cloud account**. Existing
Keychain permissions, OS grants, installed Codex/login and device-level voice configuration may
be reused. It does not establish first-time Codex download/browser login, new-recipient email
registration, downloaded-app Gatekeeper acceptance, clean-account permission prompts, signed
update continuity, or public distribution readiness.

## Voice listening regression

After setup, Settings showed the saved personal ElevenLabs voice ready and Codex connected.
A real ElevenLabs synthetic-audio round trip passed speech generation, batch transcription,
realtime transcription, and cancellation. It used the existing encrypted configuration through
Sia's main-process gateway; no microphone audio, credential material, or private messages were
included in the test output. This verifies the service path, not the physical microphone.

Renderer regressions exposed hidden streaming errors restarting capture, late startup continuing
after cancellation, and End voice conversation leaving hands-free mode enabled while a spoken
reply loaded. The controls now surface errors and stop retrying, discard late results, end reply
playback and listening together, and provide an explicit **Finish speaking** control. Ordinary
dictation also identifies its stop-to-transcribe action. Six new regression cases cover failures,
startup cancellation, quiet-speech manual completion, empty transcripts, pending transcription
cancellation, and ending a loading reply. Physical microphone/Fn acceptance remains pending.
The corrected universal candidate passed the full pilot gate (683 desktop tests, six skipped;
46 UI tests, four opt-in live checks skipped), then was rebuilt with the existing Developer ID
identity and passed strict nested signature validation. Its `app.asar` SHA-256 is
`7311b506aa16e07ac2c867a5fe3c50e23776a70f71cebf1c96f1ff3989a0ddf5`.
It was relaunched with the same completed walkthrough profile, without clearing any local data.
The running app reached the existing ready conversation with both voice controls available.
It remains an unnotarized internal test candidate, not a public download.
Local evidence: `/private/tmp/sia-voice-listening-roundtrip.log`,
`/private/tmp/sia-voice-stop-regression.log`, `/private/tmp/sia-voice-stop-fixed.log`, and
`/private/tmp/sia-voice-fixed-pilot.log`.

## Remembered sign-in lifetime — prepared, not deployed

The user requested persistent sign-in instead of a monthly code. The source now requests
`DesktopClient.RefreshTokenValidity: 3650` days, Cognito's 10-year maximum. Hourly ID/access
expiry, token revocation, encrypted storage, and the existing authentication flow are retained.
A real encrypted SQLite reopen test exercises simulated day 31, year one, and the final year of
the requested lifetime, then verifies explicit sign-out revocation and no restored sign-in.
The Cognito responses are fixtures; this is not evidence that a real token has aged for years.
The focused nine identity tests, SAM lint, and full pilot gate passed (684 desktop tests and
46 UI tests; six desktop and four opt-in live UI skips).

The live app client was verified at **30 days**. A deployment preview named
`sia-remember-login-20260924` on `sia-alpha` was created from the exact live template with all
22 parameters retained. Its only change is `DesktopClient.RefreshTokenValidity`; it modifies
in place without resource replacement. Automatic approval review rejected execution because the
user had not explicitly approved the exact production-wide 10-year duration and its longer
credential exposure window. It has **not been executed**. Obtain explicit approval before retrying.
No user was signed out, no email was sent, and the running app/profile was not changed.

After approved execution, verify the live client reports 3650 days with revocation still enabled.
Existing issued 30-day sessions may still need one further email-code sign-in; do not clear them.
Recreate the separate pending SES change set against the updated template if this update makes
it obsolete, so an older email-sender change cannot revert the session lifetime.
Local evidence is under `/private/tmp/sia-long-lived-session-deploy/` and in
`/private/tmp/sia-long-lived-session-tests.log`, `/private/tmp/sia-long-lived-session-lint.log`,
and `/private/tmp/sia-long-lived-session-pilot.log`.

## Keychain continuity

The distributed app must retain the `Sia` runtime/product name, `Sia` executable name,
`ai.sia.desktop` bundle identifier, and pinned Developer ID team. The packaged verifier enforces
these using `apps/desktop/build/release-identity.json`. Electron 43 derives the macOS storage service
from the runtime app name. The development app currently uses that same name under a different
signing identity; it may need authorization to the existing item. This is not evidence of what a
new recipient will see on a clean Mac.

Normal signed launches and updates should retain access with an unlocked login Keychain. macOS may
still request authorization for a locked Keychain, one-time grants, development-to-release changes,
or a changed signing identity. Do not promise that a password prompt can never occur. Do not rename
or clear the storage service, weaken encryption, or alter Keychain access controls to suppress it.
Complete the fresh-install and prior-release upgrade checks in [manual acceptance](./manual-acceptance.md).

Sources: [Electron signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing),
[Electron 43 Keychain namespace](https://github.com/electron/electron/blob/v43.4.0/shell/browser/electron_browser_main_parts.cc#L481),
and [Apple's authorization choices](https://support.apple.com/guide/keychain-access/if-youre-asked-for-access-to-your-keychain-kyca1243/mac).

## Public download path

The local product site now includes `/download/`, browser-based Codex setup instructions, explicit
background-control limitations, and correct optional-research language. Google Workspace and Slack
API connections remain restricted to their existing tester cohort. Public computer use does not
remove those separate connector restrictions. Review the updated product, support and terms copy
before publication; the changes describe existing behavior and do not constitute research approval.

After `pnpm package:mac` has produced signed, notarized and stapled universal artifacts, run:

```sh
pnpm release:stage-public-download
```

This runs the real release verifier, then copies the DMG into the local site output under an
immutable version/hash path and creates `/download/release.json`. There is no unsigned or skip-checks
mode. Without valid metadata the page exposes no download link. The public release deployment entry
point is `pnpm --filter @sia/site deploy --public-release`; it performs the same validation before
uploading. Ordinary site deployments preserve previous installers and download metadata. Existing
custom-domain configuration is retained when no new certificate override is supplied.

The repository is private, so a GitHub source release alone is not a public download channel.
Use the existing public site's private S3 origin and CloudFront distribution; do not make the
research or release-artifact buckets public. The app's signed authenticated update feed remains a
separate publication step under [release.md](./release.md).

## Remaining launch gates

1. Supply the saved Apple notarization profile name, or explicitly authorize its metadata lookup.
   No password belongs in chat, source, or build logs. Run the canonical signed release packaging
   command, then require successful app and DMG notarization, stapling and Gatekeeper assessment.
2. Apply and verify the prepared `sia-public-email-ses-20260923` change set on `sia-alpha` after
   explicit operator approval. It changes `EmailSendingAccount` from `COGNITO_DEFAULT` to `DEVELOPER`
   with the existing verified `auth@superintelligentagents.ai` identity. SES production access and
   sending are enabled in `us-east-1` (50,000/day and 14/second at inspection), but Cognito still
   uses its limited default sender. The change set lists dependent IAM/Lambda/API references;
   all are modifications without resource replacement. No change has been executed and no test
   email has been sent. Verify an actual newly registered person's email-code delivery afterward.
3. On the exact notarized app, verify a clean Mac/account install and a previous signed-release
   upgrade: email login, one-button Codex setup, permissions, repeated quit/reopen with saved data,
   physical voice input, public browser actions, and Slack navigation using the chosen fallback.
   A separate macOS test account is needed to establish genuinely fresh Keychain behavior.
4. Review and commit the candidate source, record exact artifact hashes and source revision, retain
   the previous signed build for rollback, and publish the verified installer and corresponding
   update metadata only after these checks. Verify an unauthenticated public download and its
   hash from a recipient machine. Do not expose private signed download URLs or account data.

Automatic approval review blocked both the notarization-profile metadata lookup and execution of
the production email change because those actions need explicit user approval. Neither was retried
through another route. The two approval questions are pending in the preparation task.

## Workflow robustness candidate

The separate candidate and workflow audit are recorded in [workflow-robustness.md](./workflow-robustness.md).
It adds stale-login response guards, voice cancellation at service/account boundaries, and included
ElevenLabs selection for cloud-configured builds. The full deterministic gate passed. The shared
voice server configuration still requires completion of the operator Keychain transfer and activation;
the open walkthrough app was preserved. This does not change the public-distribution gates above.
