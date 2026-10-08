# Public distribution candidate

## Decision

Sia `0.1.0-alpha.25` is an **internal release candidate**, not approved for public distribution.
The latest phone-approval and dialog-dismissal repairs passed the complete automated gate and CI. Their replacement
app and DMG passed signing, notarization, stapling and package verification. The preceding signed
phone-repair candidate passed a live background iMessage self-test: while another conversation stayed selected,
it returned the exact requested answer in about five seconds. The earlier physical-phone failure
was traced to a real integration bug: UI snapshots omitted background answers, so the relay sent
**Sia › Done.** instead. A regression reproduced that failure before the repair.

The repaired Mac-originated test was followed by a physical-phone request. Sia received it at
16:35:46 UTC, generated the exact answer at 16:35:57 UTC, and the operator confirmed receipt of
**Sia › SIA-PHONE-FIXED-OK** on the phone. This passes one physical-phone text round trip.
On October 8, CUA in Mac Messages verified live self-addressed iMessage file actions, texted
NO/YES, STATUS, stale-YES rejection, NEW, photo understanding and synthetic voice transcription on signed `2898c71`.
Live testing found two further defects: STOP sent an extra “Done” and outgoing voice attachments
could not be opened. The replacement signed `0d4b87f` passes both retests: STOP sends only
**Sia › Stopped.** and leaves the requested file absent; the synthetic voice request returns
**blue paper lantern** and an MP3 that was saved from Messages, decoded without errors and played
to completion in QuickTime after temporary-source cleanup. A fresh file-action NO/YES test on
that replacement also passed: NO left the file absent, separate YES replies allowed its write
and read-back, and **SIA-FINAL-PHONE-ACTION-OK** appeared in Messages and matched independent bytes.
These Mac-originated checks do not establish handset-originated actions or handset receipt.
No alpha.25 installer has been uploaded or published; the last published pilot release remains
[`alpha.24`](./release-evidence.md).

The current signed candidate was built from `0d4b87fb02f2079492f72d43604d97e55f3460a8` on macOS
15.7.2. Later evidence-only documentation updates do not change that artifact. Its app identity is
`ai.sia.desktop`, signed by Developer ID team `DXYJ578DD4`.

| Artifact                           | SHA-256                                                            |       Bytes |
| ---------------------------------- | ------------------------------------------------------------------ | ----------: |
| `app.asar`                         | `a34e91c0ad4d6530475c7e9a33e35f4cf21538d18cf07e0a62e076318d78184a` |  12,287,793 |
| `Sia-0.1.0-alpha.25-universal.dmg` | `3661c09ad3fc73d3e8307c588021ee09ef0cebaab3956eaef20f391f9a08ea5c` | 263,093,393 |
| `Sia-0.1.0-alpha.25-universal.zip` | `d74a6084ee2e4d98d62fd16c1710cbcf276b5768a61760f093662049a465cda3` | 261,474,494 |

Apple accepted app submission `0eee0fca-d3a2-4df8-a30b-9605c3513ead` and DMG submission
`44d7715e-878e-4598-acfe-8597f5977eac`. The canonical `pnpm package:mac` passed strict nested
signatures, notarization, stapling, Gatekeeper, universal architectures, bundled resources,
license corpus and packaged MCP bridge verification. The separate copied app passed signature,
staple and Gatekeeper checks again before launch.

The durable operator evidence is in `release-verification-evidence/` in the original workspace:
`verification.json`, a verified complete-history `source.bundle`, test and packaging logs, and
`artifacts/phone-live-0d4b87f/`. No credentials, private Messages archives or unrelated
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

The STOP and outgoing-media repair source passed `pnpm test:pilot` on October 8, 2026: build, formatting, lint, quality,
workspace types and unit gates, **1,212 desktop unit tests**, **45 Electron tests** and **20 renderer
tests**. Seven desktop tests and four live Electron tests remain opt-in and were skipped.

[CI for the exact signed source](https://github.com/ljang0/sia-v2/actions/runs/37814670930)
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

- STOP clears relay tracking before cancellation emits its final idle snapshot, preventing an
  incorrect “Done” reply. Two regressions failed before the fix and passed afterward; the signed
  retest returned only “Stopped” and the disposable file stayed absent.
- Approved outgoing files are copied into a private per-send directory inside Messages’ permitted
  data directory. The original file remains untouched; staging rejects symlinks and cleans failed,
  completed and stale sends. Three attachment regressions failed before the fix and passed after.
  The signed live voice retest delivered a 24,286-byte MP3 that decoded and completed playback.

- An idle phone relay treated an unsolicited or delayed YES/NO/OK as a new model request.
  It now reports that no approval is waiting and starts no task. Genuine follow-up questions
  still accept these answers. Six regressions failed before the fix; all 46 relay tests pass.
- Dismissed Radix dialogs and menus depended on CSS exit animations completing. When rendering
  stalled, an invisible modal could continue intercepting input. Closed overlays now unmount
  immediately. Agent Cancel and the Settings menu failed with deliberately paused exit animations
  before the fix; all three input-recovery checks pass afterward. The Access panel retains its
  existing bounded timer. Working-folder copy also no longer implies it bounds native Mac access.

- A release-signed lab manifest with omitted optional arguments was incorrectly rejected: schema
  defaults changed its canonical payload before signature verification. The same ordering also
  hid whitespace-only edits to signed display text. Source now verifies the original signed
  payload before applying defaults or trimming. Both regressions failed before the fix and pass
  afterward. The full gate and CI passed. The replacement signed app accepted the same valid
  manifest, exposed its model, and completed a local ACP protocol-fixture turn. A changed manifest
  was rejected with a signature error and the lab route was absent from AI settings. Normal launch
  without the manifest was restored. This checks admission, not external lab/model conformance.

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
  No live research consent was supplied. The separate staged connector-test enrollment below
  does not enable research capture.
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

On `64b40df`, the signed app created and read back a disposable file with exactly
`SIA-LOCAL-DEMO-OK` in 13 seconds; independent bytes matched. A focused spending rehearsal on
`2898c71` then passed with the real GPT-5.6-Sol model and Sia controller: 23.875 seconds, two
approved local writes, net spending $2,499 and subscriptions $59. It used fictional data and
no GUI or external account tools. The initial invocation found an incompatible global Codex;
the retained successful run used Sia's admitted 0.153.0 runtime. These results do not complete
the physical-phone NO/YES action gate or the signed-app interactive rehearsal.

| Area                       | Observed result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remaining check                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed app and persistence | The `0d4b87f` replacement passed signature, staple and Gatekeeper checks, then restored authenticated conversations and the selected GPT-5.6-Sol route in the existing isolated profile without an observed sign-in or Keychain prompt. Real iMessage tasks and the paired LAN browser reconnected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Clean macOS user and actual alpha.24 upgrade.                                                                                                                             |
| Email and setup            | Earlier signed candidate requested a live email code, rejected a wrong code, then reached authenticated setup after the operator entered the delivered valid code. Managed runtime restart preserved its profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | New recipient, expired code and resend acceptance on the final candidate.                                                                                                 |
| Model task                 | Real Codex completed a disposable CSV task with all expected totals and grand total 31.50.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Each optional provider route on the final signed app.                                                                                                                     |
| GitHub                     | Development app read PR #20 and matched an independent GitHub check. Signed-profile consent/read remains unverified; the earlier Chrome-control blocker is no longer the current CUA status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Signed-profile consent/read, disconnect, cancelled reconnect, reconnect and relaunch.                                                                                     |
| Mac control                | The preceding signed candidate (`4be6bfc`) activated and inspected Calculator, cleared it, entered 123 × 456 with a foreground guard, and produced 56088. Independent native UI inspection confirmed both expression and result. TextEdit changed only the requested third line and saved; independent bytes preserved Unicode, other lines and final LF. Finder renamed the fixture to a Unicode name; its window and unchanged file bytes were independently checked. Commands were individually approved with window-only capture and compact-command guidance. On the preceding signed candidate (`9eb1eea`), a fresh automatic-mode Calculator task completed 17 × 19 = 323 in 1m40s; independent AX and window screenshot matched. It recovered from an initial process-not-running check and needed no operator approval. | Lock/sleep recovery and mid-input cancellation; clean-user permissions.                                                                                                   |
| UI and update check        | Signed About screen visibly included alpha.25, the Brand S icon and company logo. Its authenticated update check completed with “You’re on the latest version.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Final candidate cold/warm timing, long streaming response, cancellation and live reduced-motion check.                                                                    |
| iMessage                   | Earlier `0925e66` handset text round trip was operator-confirmed. Mac-originated live `2898c71` checks passed NO/YES actions, STATUS, stale YES, NEW and photo understanding. Signed `0d4b87f` passed corrected STOP and a fresh denied-then-approved exact file write/read-back, with completion in Messages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Physical handset origin and receipt for actions, approval commands and media; no full parity claim.                                                                       |
| Wi-Fi remote               | On `2898c71`, a paired Chrome client on the Mac completed an exact reply and file action with Mac-side approvals; reload restored its result. On `0d4b87f`, the same private link reconnected after replacement and displayed the latest iMessage task completion. Tokenless access remained rejected in earlier testing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Physical phone pairing, task and reconnect; Mac-browser evidence is not handset evidence.                                                                                 |
| Telegram and Discord       | Implemented, with automated channel and attachment checks. No configured disposable test bots were confirmed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Operator enters test-bot tokens directly in Sia, then real pairing, messages, approvals, media and disconnect.                                                            |
| Voice                      | On signed `0d4b87f`, a synthetic WAV sent via real iMessage transcribed correctly and returned the requested three-word text plus audio. The received MP3 was saved through Messages, decoded without errors and played to completion in QuickTime after source cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Physical microphone/Fn, in-app voice, handset-originated voice notes and handset playback. Audible spoken words were not independently transcribed from the returned MP3. |

The final Calculator draft initially encountered a changed live model catalog; Sia rejected the
unavailable pinned choice and preserved the draft. After relaunch, the catalog offered that model
again. Stopping the later self-message sender at an approval expired the card and allowed the queued relay task to complete; no further sender action was observed. After recovering input and reviewing compact commands, the preceding signed candidate completed the Calculator check recorded above. This does not establish reliable unattended Mac control.

During manual retesting, recipient-entry focus changed and a phone-number-only message went to an
unintended conversation. Undo Send was invoked but independent confirmation was blocked by
automatic approval review protecting unrelated conversation privacy. The operator was asked to
confirm removal. Native Messages input stopped for that session. On October 8, authorized CUA self-tests resumed with the exact recipient and draft checked before each send; retained transcripts exclude unrelated conversations. Automated Electron tests and
manual Mac input now run in separate phases; the complete recipient and draft must be inspected
before a separate Send action. See [manual acceptance](./manual-acceptance.md).

## External services and release gates

The operator's designated test account initially lacked the `ConnectorTesters` group. Under the
release-testing authorization, only that account was enrolled in the existing staged tester group;
it has no attached AWS role. After a normal signed-app restart on `0925e66`, Connections showed
**Available for this account**. Google setup reached **Awaiting approval**; cancelling returned
both selected providers to **Not connected** and re-enabled setup. Provider consent and a data read
were not completed; Slack was queued behind Google and did not start. Other accounts and public
connector eligibility were unchanged. Telegram and Discord still have no test bots configured.

The approved **Use my Mac / On my screen / Bypass on** preference, authenticated conversations,
texting Ready and Wi-Fi remote Ready survived the earlier signed restart. macOS grants were
retained. Closed System Events and Safari remained **Open to check**, while the other nine required
permissions showed Allowed. The `64b40df` replacement restored authenticated conversations and the
lab fixture's completed result without an observed sign-in or Keychain prompt. The latest
`2898c71` replacement also restored the authenticated profile and unsent draft. Its live runtime
catalog offers GPT-5.6-Sol, but the saved GPT-6-Astra choice is unavailable. Submission correctly
stopped before a turn. On October 8, leaving full screen and using Window → Center restored CUA
input. GPT-5.6-Sol was selected for the phone conversation and saved as the Sia agent default;
NEW then created a working fresh conversation. The agent editor saved and dismissed normally.
The `0d4b87f` replacement retained that model choice and authenticated profile. Its live STOP, voice-delivery and NO/YES file-action retests passed. Physical-handset action and receipt remain separate gates. iPhone Mirroring reported that the paired phone could not be found, so CUA could not complete those handset checks.

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
2. Complete live BYOK with a test provider entered directly in Settings and any external lab route.
   Signed lab-manifest admission and tamper rejection now pass with a local protocol fixture; that
   fixture does not establish external provider success.
3. The nine [demo cases](./demo.md) and four follow-ups passed again with a real model and fictional
   local data. Complete the live account portions for advertised workflows; purchase, cancellation
   and outreach rehearsals require their specific approval.
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
download returned 263,093,393 bytes with the recorded SHA-256, matching the manifest. The temporary
loopback server was stopped afterward. Staging and local transfer are not publication. After all recipient gates pass, publish with the
site's `deploy --public-release` flow and verify an unauthenticated external recipient download and
its hash. The authenticated signed update feed is a separate step in [release.md](./release.md).
Keep the prior published signed artifact available for rollback.
