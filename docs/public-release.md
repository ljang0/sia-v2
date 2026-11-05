# Distribution acceptance record

**RA handoff is held.** Useful browser research after restart passed on `b7c1f36`, and a native
copy/edit/reopen task with working result delivery passed on included `a2d63b8`. Dinner research
passed on `0c72ce8` after explicit Chrome setup. Automatic recovery while another Chrome window
is active, input reliability and exact-DMG acceptance remain open. Cancellation capture is fixed
and verified on included `5bab2f5`. The current `e2c1dd7` rerun failed at Finder panel input and
later browser responsiveness; see the current [release status](./release-status.md#current-targeted-repair).
Nothing has been
published, sent to a recipient or submitted to Arena by this work.

## Current installed candidate

| Identity               | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Source                 | `e2c1dd74e86ba55cfe877fcdc115d3f254d2d9a8`                           |
| Installed              | November 5, 2026, 04:31:22 UTC (November 4 Eastern)                  |
| Package                | arm64 internal QA; Developer ID signed; not notarized; not a DMG     |
| ASAR SHA-256           | `6ad4878f16094f23baa657ffa910a2f1412907b858ce582425153f68bc80d37c`   |
| Cloud resource SHA-256 | `d09232e493f0bd07cfebdea81b7353d4cad499de585907ed2b99b05ba5d11f45`   |
| Native patch SHA-256   | `90def1bc4ee021ebcef6cc869e64368dcca03f36d9cd4a1c053d96a9a04ecbfc`   |
| Private evidence       | `alpha122-browser-selection-internal` under Sia Release Verification |
| Rollback               | `Sia QA alpha122 before live foreground.app`                         |

Package/runtime verification, installed deep/strict signature checks and the native gate passed.
The current full pilot stopped at an unexplained Electron bare-launch fixture failure; its
isolated rerun passed unchanged. Later desktop, Electron, renderer and companion phases remain
unrun on this candidate. The prior `5bab2f5` full pilot
passed: 2,100 desktop unit tests (23 skipped), 46 Electron (five skipped), 48 renderer and
72 companion checks, plus build/static/shared/cloud/native gates. Four capture lifecycle
regressions failed before the repair and passed after it. The prior browser repair's
67 focused tests and native gate pass. Its earlier full pilot command passed build/static/unit checks
(2,096 desktop tests, 23 skipped), then failed one Electron test: `pwd` became `pwda`. An isolated
rerun passed unchanged; the cause is unresolved. The four remaining desktop cases, 48 renderer
and 72 companion-browser checks subsequently passed. Preserve the original failure and trace.
The included native-result repair previously passed the full pilot: 2,091 desktop tests (23 skipped), 46 Electron (five skipped),
48 renderer and 72 companion tests, plus cloud/shared/native/build/static checks. The external
Chrome-policy regression failed with the old 100 ms retry cadence; all 14 native consent checks
pass after the change. The selection repair passed 138 affected checks. These automated checks
do not establish useful-task acceptance. The first pilot attempt exhausted disk space in temporary
Electron copies. Obsolete generated QA packages were removed; the complete retry passed. The
native-result regression failed before the repair and passes after it.

## Live results that determine readiness

### Dinner research: useful-task pass; continuous isolation remains open

On `a2d63b8`, ordinary three-dinner research failed after 124.621 seconds with freshness refusals,
one wrong-target refusal and a final stale read. Two refused actions returned images identical to
the preceding screenshots. The notes and earlier files were preserved, but foreground focus and
clipboard isolation were not established. AWS matched 125 stored / 110 logical records, 32 usage,
14 actions and six PNGs. Private receipts: `personal-concurrency-acceptance`.

Included `0c72ce8` allows child-frame refresh only with identical PNG bytes and unchanged native
root/viewport proof, URL, geometry and age; input receives the new full-frame token. Native
dispatch and protection checks remain. Its fresh ordinary rerun, thread
`5b3a0988-5739-4890-a680-6cfc71d9c4f6`, turn `79a06c1c-1661-4ae3-a2e3-3b6741823a0b`,
paused before this path: `browser_prepare` refused `foreground_app_in_use` while a different
Chrome window was active. Terminal outcome was cancelled at 20.290 seconds; no plan was saved.
The operator note was typed after termination, so it proves no concurrency. AWS matched the
prompt, terminal outcome, six actions and six usage records in one 40-record encrypted batch;
there were no screenshots. Private receipts: `visual-equivalence-acceptance`.

Already-bound browser input can use a different proven Chrome window. Reconnection may involve
setup UI, so removing its foreground guard is not a valid repair. After explicit setup, a fresh
ordinary dinner request in thread `0d737267-9d55-4b0f-ba0f-2e2ab08da11c`, turn
`4ae02bd5-94fb-4145-827d-c083c866c26f`, completed without task-time intervention in 351.416 seconds.
The saved plan's sources, portions, shopping quantities and estimated budget were independently
checked. Three concurrent TextEdit additions and prior documents were preserved. Four genuinely
changed screenshots caused stale refusals that recovered autonomously; a 95.705-second gap before
file writing is unexplained. Continuous focus/clipboard isolation was not established.
AWS matched 70 usage records, 33 actions and 23 PNGs in 11 encrypted batches (276 stored /
261 logical records). Receipts: `connected-dinner-acceptance`. Restart recovery, CUA reliability
and the unrelated terminal-test character remain open.

### Cancellation capture: repaired and verified

Stop on the grocery follow-up originally produced two capture finalizations for one cancelled
turn. `5bab2f5` moves running-turn finalization to the runner after provider cleanup. In the same
conversation, ordinary follow-up turn `1f287145-0ed4-4dac-b6d8-2d3947904120` was stopped through CUA
at 04:15:10.882 UTC. Terminal cancellation followed in 350 ms. An in-flight browser click returned
accepted/unverified 158 ms after Stop; no action results followed the terminal event. The plan's
bytes were unchanged. AWS matched exactly one discarded capture, all seven actions (including
that late result), six usage records and one PNG in 46 stored / 45 logical records. Receipts:
`capture-finalization-acceptance`. This verifies recording closure, not general native-write
cancellation or absence of any in-flight input after Stop.

### Initial Chrome setup: passed on an included earlier repair

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

### Fresh browser task after restart: passed on `b7c1f36`

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

### Native document work and result delivery: passed on `a2d63b8`

A fresh conversation with **Reviewer document assistant** received an ordinary request to make
an RA checklist copy using Finder and TextEdit, preserve its three sections/12 items, append an
exact reviewer note, save under the requested name, close, reopen and link the finished file.
The operator supplied no target-app input, Continue action or task coaching during execution.
Thread `64671fdd-630f-4ec3-9f8f-d13885689949`, turn `2142a4f7-4de4-4c55-b2e8-51e83758667a`,
started November 5 at 02:42:36.347 UTC. The reply arrived in **221.809 seconds**, and completion
settled in **229.959 seconds**. The largest gap between recorded action results was 14.677 seconds;
this does not measure interactive UI latency. One computer-action step and one checkpoint step
failed; the task recovered autonomously.

Independent file comparison confirmed both existing RTF documents were byte-for-byte unchanged.
The 1,989-byte `RA distribution checklist.rtf` preserves the complete source text and appends the
exact note with a blank separator line. SHA-256:
`2f68e08a64f533dbff530da45825dcf1151b29d70ca35f6c91bee398f5b60ab5`.
The verifier initially expected no blank separator; inspecting the difference confirmed correct
content. CUA used **View saved file → Open file** in Sia and visually checked the correct named
TextEdit document. No draft or clipboard marker appeared in the output.

During the task the operator typed an unrelated unsent draft and used Access. The original draft
text remained intact; a later operator extension landed at the clicked caret because the attempted
end-of-document shortcut did not move it. A post-task paste matched the exact pre-task clipboard
marker. These are bounded observations, not continuous foreground monitoring. CUA returned stale
views, `noWindowsAvailable`, a stale-element error and ScreenCaptureKit invalid-parameter errors.
The trajectory proves the first Send action started the task before CUA showed it running.
Refreshed observations and keyboard navigation recovered operator access. No broad responsiveness
or Stop claim is made; the earlier unexplained filename incident remains unresolved.

Automatic AWS verification matched the exact prompt, final reply, terminal outcome, all **33
actions** and **21 PNGs** across **four batches / 219 records**, including **62 usage records**.
Object hashes, lengths and KMS checks passed; no manual upload was performed. Private
`local-result-acceptance/acceptance.json`, installation/pilot receipts and archive verification
record the source, hashes and limits. The first archive-verifier invocation still pointed at the
preceding local thread; correcting that input allowed the exact current-thread comparison.

The preceding `b7c1f36` task, thread `15c13c0c-45a0-4e0f-bec9-a15627de0bfe`, turn
`23042d4b-cda2-4b41-a378-9630723977f9`, saved and reopened the correct document but **failed** at
result registration outside the conversation folder. It remains failed. Its original documents,
draft and clipboard were preserved; its automatic archive matched 225 records, 66 usage records,
34 actions and 23 PNGs. The repair gives structured native results an exact local Open/Reveal
reference with existing file guards, without content preview or remote export. The earlier
`8dc8e14` rename/review pass and its detailed evidence remain in Git history.

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
