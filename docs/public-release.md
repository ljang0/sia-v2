# Public distribution candidate

## Decision

Sia `0.1.0-alpha.25` is an **internal release candidate**, not approved for public distribution.
The corrected source passed the complete automated gate and CI. The signed candidate passed
notarization and a live background iMessage self-test: while another conversation stayed selected,
it returned the exact requested answer in about five seconds. The earlier physical-phone failure
was traced to a real integration bug: UI snapshots omitted background answers, so the relay sent
**Sia › Done.** instead. A regression reproduced that failure before the repair.

The repaired Mac-originated test was followed by a physical-phone request. Sia received it at
16:35:46 UTC, generated the exact answer at 16:35:57 UTC, and the operator confirmed receipt of
**Sia › SIA-PHONE-FIXED-OK** on the phone. This passes one real text round trip; repeated commands,
approvals, media and the remaining recipient checks below are still unverified. No alpha.25 installer has been uploaded or published;
the last published pilot release remains [`alpha.24`](./release-evidence.md).

The exact signed candidate was built from `0925e66175dffee7a443f8a227a41bf99df3750b` on macOS
15.7.2. Later evidence-only documentation updates do not change that artifact. Its app identity is
`ai.sia.desktop`, signed by Developer ID team `DXYJ578DD4`.

| Artifact                           | SHA-256                                                            |       Bytes |
| ---------------------------------- | ------------------------------------------------------------------ | ----------: |
| `app.asar`                         | `a5d85b4a682ddf283246065ea8bfb1479bcd7a2d68bccba4d7d40fee051a5152` |  12,287,300 |
| `Sia-0.1.0-alpha.25-universal.dmg` | `1e14fe939044c6b9ac60a92f0e71789d98d1dd9b423d9b62174b9b570b7a56f6` | 263,094,752 |
| `Sia-0.1.0-alpha.25-universal.zip` | `3d6eadd89d66eda3e17c43a8b6210fa6f02db74624f1a3d9cd802aafbacc9748` | 261,474,728 |

Apple accepted app submission `87c08c5e-563b-4f1c-a559-c623f855afed` and DMG submission
`af5650c9-e2fa-4115-95d5-8f7bb911af0e`. The canonical `pnpm package:mac` passed strict nested
signatures, notarization, stapling, Gatekeeper, universal architectures, bundled resources,
license corpus and packaged MCP bridge verification. The separate copied app passed signature,
staple and Gatekeeper checks again before launch.

The durable operator evidence is in `release-verification-evidence/` in the original workspace:
`verification.json`, a verified complete-history `source.bundle`, test and packaging logs, and
`artifacts/background-reply-0925e66/`. No credentials, private Messages archives or unrelated
conversation screenshots belong in that evidence. Earlier artifact records remain in Git history
and the preserved evidence directories.

## Integrated scope

The `codex/release-verification` branch combines the following against remote main `5c80af0`,
including the six earlier local-main commits through `8ed02a4`:

| Workstream                                                   | Included source                            |
| ------------------------------------------------------------ | ------------------------------------------ |
| UI and streaming, PR #17                                     | `1149feda49d36504974f866d7c4619e9812b04a2` |
| GitHub and Notion, PR #18                                    | `9f917672a3174d2c402d6436556358f64a12e910` |
| Texting and bot channels, PR #19                             | `570f8f7b674544ad9ddd025022a3a14e121f0160` |
| Public-release audit, BYOK, lab harness and guided Mac setup | `ffd1aca`                                  |

The comparison scope is connected apps, computer actions, messaging, voice and proactive
follow-up. Existing phone channels are iMessage, Telegram, Discord and the Wi-Fi browser remote.
Voice notes and in-app voice are implemented. Telephone calls and Notion live acceptance are
explicitly deferred by the operator. Calendar, Tasks and Outlook remain disabled. Slack's deployed
behavior is unchanged. Local work requires Sia open and the Mac awake; an always-on cloud worker is
not implemented. Do not claim complete Instinct parity or arbitrary-account connector availability.

## Automated verification

The background-reply repair source passed `pnpm test:pilot` on October 7, 2026: build, formatting, lint, quality,
workspace types and unit gates, **1,199 desktop unit tests**, **45 Electron tests** and **17 renderer
tests**. Seven desktop tests and four live Electron tests remain opt-in and were skipped.

[CI for the exact signed source](https://github.com/ljang0/sia-v2/actions/runs/37606481098)
passed, including all **62 Chromium/WebKit phone checks** and unsigned universal packaging.
Local release signing is recorded separately above; the CI signing job was not run.

[CI for the preceding signed source](https://github.com/ljang0/sia-v2/actions/runs/37583850875) passed,
including all 60 Chromium/WebKit phone checks and unsigned universal package verification.
The preceding iMessage-repair source
[passed CI](https://github.com/ljang0/sia-v2/actions/runs/37581928176), including all **60 phone-browser
checks** across Chromium and WebKit and unsigned universal package verification. Browser fixtures do
not establish physical phone or messaging-service delivery. Unsigned CI artifacts are not distributable.

[CI for the permission repair](https://github.com/ljang0/sia-v2/actions/runs/37592543879)
passed the source gates but timed out in one WebKit phone theme case (59 passed). Trace inspection
showed that all view/theme and screenshot assertions completed before its final resume assertion
reached the total test deadline. Commit `418f647` separates light and dark into individual tests,
retaining every assertion and the same 20-second limit. The focused four cases passed locally;
all 62 local cases passed (31 Chromium, 31 WebKit). [CI rerun](https://github.com/ljang0/sia-v2/actions/runs/37599286070) passed all 62 phone checks and unsigned universal packaging. The next documentation-only run, [cf97709](https://github.com/ljang0/sia-v2/actions/runs/37600713235), failed one Chromium typing-animation assertion (61 passed). Its trace sampled only the starting and ending heights during a busy render. The test now advances the actual CSS transitions to fixed intermediate times; three repeats on each browser passed without changing product animation or dropping assertions. Verify the latest PR checks before merging.

The integrated suite retains its visual and concurrency assertions. Electron screenshots use sRGB
at 1× backing scale; no image tolerance was increased. The theme-restoration check waits for the
first window. Concurrent worktrees are created before their two tasks start, avoiding a setup-time
race without extending task delays or assertion deadlines. Bot and phone-browser tests wait for
observable connection, draft and attachment states rather than fixed short sleeps.

## Repairs found through live work

- A release-signed lab manifest with omitted optional arguments was incorrectly rejected: schema
  defaults changed its canonical payload before signature verification. The same ordering also
  hid whitespace-only edits to signed display text. Source now verifies the original signed
  payload before applying defaults or trimming. Both regressions failed before the fix and pass
  afterward. This repair still needs full gates and a replacement signed candidate.

- Background phone answers no longer read the renderer’s selected-conversation snapshot. That
  optimization had removed the actual answer before the relay finished, producing **Sia › Done.**
  in the live self-test. A regression reproduced that exact failure before the fix. The relay now
  reads complete in-process state for answers, approvals and result files; tests keep a different
  conversation selected throughout. The renderer retains its smaller, faster updates.

- Outbound reply failures now remain visible through successful inbox polls, with **Needs attention**
  and a useful recovery message. A successful reply to another contact does not hide the failed
  recipient. Raw send-process errors stay out of the renderer. File and voice-reply failures are
  also reported. This diagnostic repair does not itself establish successful handset delivery.
- Returned files and voice notes carry a bounded, encrypted, short-lived content fingerprint so
  their sent/received self-chat copies cannot start another task, including after restart. Tests
  cover renamed copies, changed content, explicit captions, later reuse and expired markers.

- Closed apps are now labeled **Open to check**, with an **Open app** action, instead of
  **Needs you**. The guided pass still verifies them before completing and preserves actual
  denied states. Live System Settings showed every Sia Automation switch on while four target
  apps were closed; Apple’s permission API cannot verify a closed target. The fixed checklist
  does not treat unknown access as granted or reopen apps during passive checks. The preceding `9eb1eea` signed
  candidate completed the guided pass and displayed **Mac access is ready**, with every permission
  allowed. The operator subsequently enabled automatic local actions; the setting survived restart and a
  fresh Calculator task completed without an approval card. Phone turns retain confirmation.
  After restart, closed targets correctly return to **Open to check**, without implying a denied grant.
- The supported Codex download now shows byte progress and permits a slow progressing download for
  up to 45 minutes, with a two-minute stalled-stream deadline. SHA-512 verification, size limits,
  admitted versions and atomic installation remain enforced. Real GUI setup installed admitted
  Codex `0.153.0`; the installed global `0.154.0` was correctly reported incompatible.
- An unavailable pinned model is shown explicitly. Selecting a replacement resolves and persists
  its full allowed execution route while preserving harness and credential source.
- The obsolete mandatory-research task gate was removed. Signed-in users can leave sharing off,
  decline or pause it and still complete tasks. Only explicit accepted consent captures research.
  No live research consent or account-membership change was supplied during this verification.
- Foreground guidance tells the model to restore and inspect the authorized app after an approval,
  prefer app-scoped controls and combine a small action with verification when practical. This is
  model guidance; native shell commands still use the provider's approval boundary.
- A real self-addressed iMessage reached Sia and produced an answer, but the old decoder included
  binary length bytes or archive metadata in message text. Sia then treated its own malformed
  prefixed replies as new tasks. The relay was turned off. The replacement reads the root
  attributed string with bounded binary parsing and rejects unknown formats without guessing.
  Independent Foundation-generated synthetic archives cover short commands, Unicode, line breaks,
  attachments, long lengths and exact reply/approval text.
- Self-message deduplication now pairs sent and received copies, preserving a second YES for a
  different pending approval within one minute. Tests cover both copy arrival orders and exact
  request binding.
- Messages search now decodes archived bodies before filtering and limiting. Modern message text
  is searchable without matching archive metadata. Tests cover sender/name matching, empty text,
  case-insensitive body search and plain-text precedence.

The initial iMessage answer followed by echoes remains a **failed live test**. The preceding signed candidate (`4be6bfc`)
subsequently received one self-addressed test intact and produced the exact requested answer, with
no extra task over more than 30 seconds (the relay polls every two seconds). That test originated
on the Mac through an individually approved explicit-recipient action. A later physical-phone request
on `9eb1eea` reached the app at 09:27:14 UTC and produced the exact answer at 09:27:19 UTC, but the
operator reported **No reply arrived** on the handset. A subsequent scoped read found two copies
of **Sia › Done.** at 09:27:19 UTC, confirming the background-snapshot defect. An explicit
`messages_send` diagnostic at 10:06:53 UTC succeeded and its exact marker appeared in sent/received
self records; physical receipt remains unconfirmed. The initial requested-answer test remains recorded as failed; the repaired Mac-originated test below passed.
The corrected candidate subsequently received the operator’s physical-phone request at 16:35:46 UTC
and generated **SIA-PHONE-FIXED-OK** at 16:35:57 UTC. The operator explicitly confirmed the exact
**Sia › SIA-PHONE-FIXED-OK** reply arrived on the handset. This passes the physical-phone text round
trip. Repeated commands, approvals and media remain required.

## Live evidence and limitations

| Area                       | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remaining check                                                                                                                                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed app and persistence | The corrected `0925e66` candidate restored the authenticated isolated profile and fixture conversations after installation and another restart, without an observed sign-in or Keychain prompt. Use my Mac, On my screen, bypass, texting Ready and Wi-Fi remote Ready persisted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Clean macOS user and actual alpha.24 upgrade.                                                                                                                                                                                                                                                              |
| Email and setup            | Earlier signed candidate requested a live email code, rejected a wrong code, then reached authenticated setup after the operator entered the delivered valid code. Managed runtime restart preserved its profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | New recipient, expired code and resend acceptance on the final candidate.                                                                                                                                                                                                                                  |
| Model task                 | Real Codex completed a disposable CSV task with all expected totals and grand total 31.50.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Each optional provider route on the final signed app.                                                                                                                                                                                                                                                      |
| GitHub                     | Development app read PR #20 and matched an independent GitHub check. The corrected signed profile still shows Connect GitHub; Chrome control is unavailable in this operator session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Signed-profile consent/read, disconnect, cancelled reconnect, reconnect and relaunch.                                                                                                                                                                                                                      |
| Mac control                | The preceding signed candidate (`4be6bfc`) activated and inspected Calculator, cleared it, entered 123 × 456 with a foreground guard, and produced 56088. Independent native UI inspection confirmed both expression and result. TextEdit changed only the requested third line and saved; independent bytes preserved Unicode, other lines and final LF. Finder renamed the fixture to a Unicode name; its window and unchanged file bytes were independently checked. Commands were individually approved with window-only capture and compact-command guidance. On the preceding signed candidate (`9eb1eea`), a fresh automatic-mode Calculator task completed 17 × 19 = 323 in 1m40s; independent AX and window screenshot matched. It recovered from an initial process-not-running check and needed no operator approval. | Lock/sleep recovery and mid-input cancellation; clean-user permissions.                                                                                                                                                                                                                                    |
| UI and update check        | Signed About screen visibly included alpha.25, the Brand S icon and company logo. Its authenticated update check completed with “You’re on the latest version.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Final candidate cold/warm timing, long streaming response, cancellation and live reduced-motion check.                                                                                                                                                                                                     |
| iMessage                   | The `9eb1eea` physical-phone test generated the answer but sent **Sia › Done.** The corrected `0925e66` candidate passed a Mac-originated background self-test with another conversation selected throughout. A subsequent physical-phone request arrived at 16:35:46 UTC and generated **SIA-PHONE-FIXED-OK** at 16:35:57 UTC; the operator explicitly confirmed the exact **Sia › SIA-PHONE-FIXED-OK** reply arrived on the handset.                                                                                                                                                                                                                                                                                                                                                                                           | Repeated exact text, STATUS/STOP/NEW, approvals, photo and voice note.                                                                                                                                                                                                                                     |
| Wi-Fi remote               | The corrected signed candidate retained the enabled listener and reported Ready. A request without its private token reached the live LAN server and was rejected with HTTP 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Physical phone pairing, task, approval and reconnect remain unverified; the tokenless request does not establish paired access.                                                                                                                                                                            |
| Telegram and Discord       | Implemented, with automated channel and attachment checks. No configured disposable test bots were confirmed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Operator enters test-bot tokens directly in Sia, then real pairing, messages, approvals, media and disconnect.                                                                                                                                                                                             |
| Voice                      | Real ElevenLabs synthesis, batch/stream transcription and cancellation passed earlier with synthetic speech. The corrected profile reports ElevenLabs ready, Fn enabled and spoken replies on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Physical microphone/Fn, in-app voice and phone voice-note delivery. Synthetic fixture injection did not send: Connected apps restricted scripting; after restoring Use my Mac, the native agent required a screenshot that conflicted with the test’s privacy restriction. No audio round trip is claimed. |

The final Calculator draft initially encountered a changed live model catalog; Sia rejected the
unavailable pinned choice and preserved the draft. After relaunch, the catalog offered that model
again. Stopping the later self-message sender at an approval expired the card and allowed the queued relay task to complete; no further sender action was observed. After recovering input and reviewing compact commands, the preceding signed candidate completed the Calculator check recorded above. This does not establish reliable unattended Mac control.

During manual retesting, recipient-entry focus changed and a phone-number-only message went to an
unintended conversation. Undo Send was invoked but independent confirmation was blocked by
automatic approval review protecting unrelated conversation privacy. The operator was asked to
confirm removal. No further native Messages UI input was performed. A later authorized self-test used an explicit-recipient command reviewed in Sia, without inspecting unrelated conversations. Automated Electron tests and
manual Mac input now run in separate phases; the complete recipient and draft must be inspected
before a separate Send action. See [manual acceptance](./manual-acceptance.md).

## External services and release gates

The corrected signed test account reports Google Workspace and Slack **Not enabled for this
account**. Telegram and Discord have no test bots configured. No account role or connector
entitlement was expanded during verification. The operator’s approved **Use my Mac / On my screen /
Bypass on** preference was restored after connected-tool diagnostics and survived a fresh restart.
Authenticated conversations, texting Ready and Wi-Fi remote Ready also persisted; no new sign-in
or Keychain prompt was observed. macOS grants were retained. Closed System Events and Safari
remained **Open to check**, while the other nine required permissions showed Allowed.

Read-only production checks found `sia-alpha` in `UPDATE_COMPLETE`, SES production sending enabled,
sender-domain verification and DKIM successful, all 17 alarms `OK` with actions enabled, and a
confirmed email subscription. Homepage, privacy, terms and support returned successful responses;
`/download/` returned 404 because alpha.25 has not been published. Anonymous session, catalog,
voice-catalog and release-feed requests returned 401. Those checks do not establish every
authenticated endpoint or alarm delivery during an actual incident.

The production cloud Lambda remains the September 24 deployment. Only the separately completed
email delivery change set `sia-release-ses-20261004-v2` changed SES delivery settings; no resources
were replaced and the refresh-token lifetime remains 30 days. The source's proposed ten-year
setting has **not** been deployed and must not be applied incidentally. The protected GitHub release
environment has cloud/update configuration but no Apple signing secrets. Local signing uses the
existing Developer ID certificate and named Keychain profile; no password is stored in source.

Before distribution:

1. Complete the exact-artifact checks in [manual acceptance](./manual-acceptance.md), including
   clean-user install, alpha.24 upgrade, every enabled permission, real Mac control, physical voice,
   phone tasks/approvals/media and connector reconnect.
2. Complete live BYOK with a test provider entered directly in Settings; verify signed lab-harness
   admission and tamper rejection. Fixture probes do not establish external provider success.
3. Complete the nine [demo cases](./demo.md) against disposable data and inspect their outputs.
   Purchase, cancellation and outreach rehearsals require their specific approval.
4. Keep Google and Slack restricted to their approved tester cohort until the independent
   [connector distribution gates](./connector-distribution-readiness.md) pass.
5. Confirm exposed credentials were revoked/replaced and assign the support/incident owner, as
   required by [release status](./release-status.md). This pass did not rotate credentials.

Research recruitment is separate and requires
[research release sign-off](./research-release-signoff.md). Signing, staging or automated success
does not grant research approval. Durable source-specific seen/read state, offline cloud scheduling
and complete binary/scanned tax-document coverage remain unproven.

## Publication

`pnpm release:stage-public-download` passed for the exact final candidate. A complete local HTTP
download returned 263,094,752 bytes with the recorded SHA-256, matching the manifest. The temporary
loopback server was stopped afterward. Staging and local transfer are not publication. After all recipient gates pass, publish with the
site's `deploy --public-release` flow and verify an unauthenticated external recipient download and
its hash. The authenticated signed update feed is a separate step in [release.md](./release.md).
Keep the prior published signed artifact available for rollback.
