# Distribution acceptance record

**RA handoff is held.** A useful browser task after restart passed on the current internal
candidate, and one native workflow passed on an earlier candidate. Input isolation and exact-DMG
acceptance remain open. Nothing has been
published, sent to a recipient or submitted to Arena by this work.

## Current installed candidate

| Identity               | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Source                 | `b7c1f36222057936f3cced1f39ccf9ef0997bc24`                           |
| Installed              | November 5, 2026, 01:49:02 UTC (November 4 Eastern)                  |
| Package                | arm64 internal QA; Developer ID signed; not notarized; not a DMG     |
| ASAR SHA-256           | `38992a1089b818e2d145a7e330b79dbe0c3344400e3394df57e836554f9fa8ee`   |
| Cloud resource SHA-256 | `d09232e493f0bd07cfebdea81b7353d4cad499de585907ed2b99b05ba5d11f45`   |
| Native patch SHA-256   | `bbcfb1c11772237654983f967756cea4458ea662e3ecc9993cbdf71fc2b964ff`   |
| Private evidence       | `alpha122-browser-selection-internal` under Sia Release Verification |
| Rollback               | `Sia QA alpha122 before window activation.app`                       |

Package/runtime verification and installed deep, strict signature checks passed. The current
activation change passed build, type/lint/format and the existing window-close/reopen Electron
check. Its full pilot passed: 2,089 desktop tests (23 skipped), 46 Electron (five skipped),
48 renderer and 72 companion tests, plus cloud/shared/native/build/static checks. The external
Chrome-policy regression failed with the old 100 ms retry cadence; all 14 native consent checks
pass after the change. The selection repair passed 138 affected checks. These automated checks
do not establish useful-task acceptance.

## Live results that determine readiness

### Initial Chrome setup: passed on the installed candidate

On `e244d5a`, selecting the approved public USDA window through Sia Settings failed. The
same-build diagnostic found its native consent sheet in 9 ms, but 68 scans over 8.114 seconds
kept finding it after acknowledged button actions. Chrome 156 treats accessibility button actions
as mouse events and rejects rapid repeats, updating the last-event timestamp even when ignored.
The repair respects the system double-click interval plus 50 ms between action attempts; the
original deadline, exact-sheet matcher and disappearance checks remain.

On installed `4e5724b`, Sia found the sheet in 17 ms and verified disappearance at 1,148 ms.
Settings showed **Attached: Chrome window 4**. No operator clicked Allow. Operator cancellation
of earlier failed dialogs and selection of the public window through Chrome's Window menu were
diagnostic setup, not autonomous task evidence. Receipts: `consent-diagnostic.json`,
`consent-installation.json`, `consent-setup-pass.json` and their logs.

### Fresh browser task after restart: passed on the current candidate

`b7c1f36` makes explicit app opening activate Sia as well as its Electron window, and adds
**Sia → Open Sia** to the same path. After installed-app replacement/restart, CUA used that menu,
started a fresh conversation with **Personal visitor planner**, and submitted the same ordinary
CMU visitor request described below. No reconnect, Continue, task coaching or browser input was
provided by the operator during execution. The model recovered the retained exact Chrome window
and reused its existing public tab through screenshot-based navigation, scrolling and clicking.

Thread `3801059e-c294-4ea9-ae36-5dddeb821d67`, turn `88c0b315-021a-490c-b768-b577a218f2cc`,
started at 01:52:20.398 UTC on November 5. The reply arrived after **195.354 seconds**;
completion settled after **214.348 seconds**. The first snapshot required autonomous connection
recovery. A checkpoint also failed, and a 57.6-second gap preceded report writing; no continuous
latency claim is made. The final result completed without rescue.

The 6,770-byte `cmu-visitor-plan.md` was read back from disk and opened through Sia's CUA-operated
preview. SHA-256: `4d01cc29de9396fd40f7ad9e0f41a8337c83ab43f4ada11c66c35588fdb2a392`.
Recorded screenshots corroborate museum admission/hours, café hours and transit fares; budget
arithmetic is correct. Menu prices, date-specific availability, live routing and weather are
explicitly unverified. The plan gives a walking itinerary and rainy alternative without booking.
An unsent draft was typed and extended during browser actions and remained intact at completion.
Observed composer focus persisted; continuous focus and clipboard preservation were not measured.
Immediate CUA typing observations showed prefixes before later observations showed full text.

Automatic AWS verification matched the exact prompt, all **23 actions**, **13 PNGs**, **44 usage
records** and completion across **11 batches** (175 stored records, 157 reassembled logical events).
All object hashes, lengths and KMS checks passed. The first audit script ignored `raw.event_chunk`
and falsely reported missing actions; validating and reassembling six chunked events resolved it.
Private `window-activation-acceptance/acceptance.json` and archive receipts preserve both the
method correction and result. No manual upload was performed.

### Earlier browser restart attempt: failed, retained

Fresh agent **Personal visitor planner**, with ordinary instructions and the default
GPT-6.1-Sol/ChatGPT plan, received a practical CMU visitor request: Saturday afternoon, no car,
$60 including transport and food, current official sources, a rainy alternative and a saved plan.
Thread `9ed5a7ab-7ddb-4f57-875e-8d941aa50192`, turn `ba9232f2-92a5-4fbc-852a-3efd8b6a2e92`, ran
01:31:25.822–01:31:46.096 UTC on November 5 (20.274 seconds including terminal settlement).

Discovery correctly retained the exact selected public window across restart. The model inspected
that window and attempted prepare-only recovery without coaching or operator reconnection.
Recovery stopped at `foreground_app_in_use`, before browser input. Inventory initially reported
Slack active; the later host check reported Chrome active. The cause of that switch is not
established. Connection setup cannot inherit the exception for already-bound page input: a new
Chrome consent dialog can affect another window the person is using. No plan or browser screenshot
was produced. No operator clicked Continue or rescued the run.

The attempted unsent draft did not appear in the immediate observation; it was visible after the
next app restart. This run proves no typing latency or input isolation. Before submission,
rebinding CUA to the restarted app allowed the full prompt to be entered and verified.

AWS automatically archived the exact prompt, terminal event, 40 events, six provider-usage records
and six matching action results in one batch. Zero screenshots is correct for this failed run.
Read-only verification matched object hashes, lengths and KMS encryption. Receipts live in
`restart-acceptance/acceptance.json` and its archive-verification files.

### Native document workflow: one earlier autonomous pass

Signed internal `8dc8e14` completed the ordinary checklist request with fresh agent **RA handoff
check**: rename in Finder, read three sections and 12 checklist items in TextEdit, close, verify
absence, reopen and review. Thread `f371af2b-9f3d-4522-abbf-832613d3cee6`, turn
`c2f769cb-e3dd-4947-8173-69da565abb66`, finished November 4 at 23:46:09 UTC, about 150 seconds after
submission. There was no task-time operator input or recovery coaching.

Independent screenshots and the renamed file's unchanged 1,874 bytes/SHA-256
`bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14` corroborate the result. The old
filename is absent. The three sections contain 3, 7 and 2 items. An unsent Sia draft remained
intact; initial observations were stale, so continuous focus/clipboard preservation and latency
are not established. Only the target file had a full baseline; other-file preservation is not
independently claimed.

AWS automatically archived the prompt, 175 events, 48 usage records, 27 matching action results
and 17 byte-matching PNGs, including completion. Hashes, lengths and KMS encryption passed.
Private `alpha122-rename-recovery-internal` retains screenshots and receipts. Its application
code passed the full pilot gate on documentation-only successor `465e555`: 2,083 desktop,
46 Electron, 48 renderer and 72 companion checks, plus cloud/shared/native/build/static checks.
This earlier pass must be repeated on the final DMG.

## Held distribution artifact

| Identity               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Version                | `0.1.0-alpha.122`                                                  |
| Source                 | `7531ee7f3115265817e8dd56cf081672799bd8f4`                         |
| Universal DMG SHA-256  | `277f22d0d950878cfee3abb751293430ffed88b04e9174910088f6ec4c38e895` |
| Universal ZIP SHA-256  | `efde7e42893384ce9fff2cb8cc4a376ce9a8ce763b7ffc4a9c20bf237b35c474` |
| Installed ASAR SHA-256 | `c6614fa9bd45465b474edc64d37cdc9a4405825ef65f7d79e0b3047bd7636c3c` |
| Private evidence       | `alpha122-browser-window`                                          |

Signing, notarization, stapling, Gatekeeper and package/runtime checks passed. The exact-source
pilot/CI gates passed. Installation used the read-only DMG and compared the ASAR. Apple silicon
received runtime verification; Intel received static verification only. This artifact lacks the
later functional repairs and remains held from RA handoff.

## Recording and voice baseline

The earlier installed DMG displayed the first-run recording disclosure with recording selected.
CUA clicked Continue once and verified **Recording** in Privacy. Real turns then uploaded
without per-task controls. Preserve explicit declines, pauses, deletion and Google Workspace
exclusions. Ordinary users have upload eligibility; archive reads are restricted to authorized
administrators. Verified S3 objects use KMS encryption. The deployed policy blocks public access
and uses 90-day active-record retention. These earlier deployment/first-run checks do not replace
fresh-account or final-artifact acceptance.

Managed ElevenLabs uses the AWS route, with no shared key in the app. After the authorized secret
replacement, a disposable ordinary user's live speech round trip passed catalog, TTS, batch and
realtime transcription, and cancellation in 3,516 ms. Installed CUA observed **ElevenLabs voice
ready** and **Speaking…**. After disabling a competing development Fn helper, the owner confirmed
“mic now works.” Physical Fn and a full spoken-command round trip remain independently unverified.

## Remaining decision

Keep the PR draft. Required work includes repeatable browser recovery, continuous
focus/text/clipboard isolation, the earlier unexplained filename input, repeated native work,
two simultaneous native workflows, contention/Stop/recovery and measured responsiveness. Test
the exact final DMG. Fresh-account/second-Mac access is unavailable; broader sleep/lock, Intel
runtime and physical voice acceptance remain incomplete. macOS access grants remain person-owned.

Lawrence Jang owns support and incidents. Mac comes first; iPhone follows. The
[Arena proposal](./arena-proposal.md) is a technical-review draft, not a reliability or rollout
claim. Follow the five [release gates](./release-status.md) and [real-work checklist](./manual-acceptance.md#real-work-and-concurrent-use).

Older failed attempts, artifact identities, provider receipts and interventions remain in the
[prior detailed record](https://github.com/ljang0/sia-v2/blob/4e5724b69b9d96a41aface3d688e8de49742fa47/docs/public-release.md)
and private evidence directories. They are retained for diagnosis, not accumulated as acceptance.
