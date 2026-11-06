# Distribution acceptance record

**Public 1.0 and RA handoff are held.** The current internal app includes the recording-control,
vision pointer-focus, background-rendering and recording-store startup repairs. It can edit a TextEdit document body,
but the ordinary edit-and-save task still fails at Save-panel filename input. Startup has also
shown a storage error. No release was published, sent to a recipient or submitted to Arena.
Source work is on draft PR #34.

## Current installed candidate

| Identity               | Value                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| Source                 | `fc0cfcfb61b30263a99507a66bb518a5bbfeba0b`                                                       |
| Installed              | November 5, 2026, 22:39:10 EST                                                                   |
| Package                | arm64 internal QA; Developer ID signed; not notarized; not a DMG                                 |
| ASAR SHA-256           | `8475e0f9f405cb479f74d83e652bc34748c7741fc5ba282b5f54ebb0205c064b`                               |
| Cloud resource SHA-256 | `d09232e493f0bd07cfebdea81b7353d4cad499de585907ed2b99b05ba5d11f45`                               |
| Native patch SHA-256   | `3e6a68249581bf263708075cf93cf5b9c99f5948a3a2b1458a8a20b808857297`                               |
| Private evidence       | `alpha122-browser-selection-internal/sheet-visibility-acceptance` under Sia Release Verification |
| Rollback               | `Sia QA alpha122 before pointer coordinate.app` (signed `1a1b7e5`)                               |

The exact-source `pnpm test:pilot` gate passed on `fc0cfcf`: 2,128 desktop unit tests,
46 Electron, 48 renderer and 72 companion checks, plus build/static/shared/cloud/native checks
(23 desktop unit and five Electron skips). Signed package/runtime verification and installed strict
signature checks also passed. Private full-gate log: `storage-index-pilot.log`. The first attempt
correctly refused a native cache that still contained the rejected pointer trial; it was restored
to the retained canonical patch before the complete successful run. Automated checks do not replace
useful-task acceptance.

## Live results that determine readiness

### Save acceptance and rejected pointer-coordinate trial

A bounded comparison on retained `1a1b7e5` explicitly clicked Save As, selected its text and typed
once. The filename did not change; Cancel and Escape also failed. This diagnostic took 103.071
seconds and does not establish ordinary-task acceptance. Post-terminal operator CUA dismissed the
panel and verified the draft. AWS matched 93 events across two batches, 28 usage events, 12 actions
and ten PNGs. Receipt: `pointer-save-comparison.json`.

An upstream-inspired window-local pointer stamp was then tried in signed `24683bb`. A fresh
conversation requested saving the existing draft through background TextEdit. Save opened, but
filename input through the panel and parent did not change it. The task failed after 76.138 seconds;
no output file exists and all seven protected RTFs remain byte-identical. Operator cleanup happened
only after terminal failure. AWS matched the complete prompt, eight actions, six PNGs, 20 usage
events and terminal failure in one encrypted 69-event batch. Receipts:
`pointer-coordinate-acceptance.json` and
`native-archive-verification-9153d41d-fed6-4cfd-b3f7-f7654875e955.json`.

The trial was reverted in `d7d92bd`; the installed app was restored to signed `1a1b7e5` before the
storage repair. This result does not establish that the upstream coordinate change is incorrect;
it did not resolve Sia's ordinary Save workflow on this Mac. No unsuccessful trial remains in the
retained native patch.

### Recording-store startup repair

The pointer trial's first launch again reported “database or disk is full.” A read-only integrity
check passed, and a second explicit QA-profile launch loaded. Inspection found that ordered record
reads sorted large encrypted payloads into a temporary SQLite B-tree and materialized all ciphertexts
before decoding. This is unnecessary startup work; the evidence does not prove it caused the error.

The repair adds a `(scope, updated_at, id)` index and decodes rows as they are read. Existing
ciphertexts, chronological ordering and deterministic ID ordering for timestamp ties are preserved.
A legacy-database regression fails before and passes after the repair. On a disposable copy using
Electron 43.8.1, the 133,588,937-byte recording read dropped from 1,040.8 ms to 84.8 ms; index creation
took 22.2 ms. Hashes confirmed identical payloads and order. This is one database-read measurement,
not total startup latency or proof that every storage failure is fixed. Receipt:
`storage-index-benchmark.json`.

Signed `fc0cfcf` opened the existing QA profile without a storage error or Open Sia rescue. CUA
verified the loaded conversation, typed an unsent sentence and cleared it. Read-only verification
found the new index, unchanged total row count (1,130), byte-identical existing recording payloads
(67), and a passing integrity check. Startup was observed within 53 seconds of the launch request;
that upper bound includes tool scheduling and is not a precise paint-time measurement. One launch
does not establish repeatability or prove the earlier disk-full error resolved. Receipts:
`storage-index-startup.json`, `storage-index-live-migration.json` and
`storage-index-installation.json`. Signed package/runtime and installed strict signature checks
passed. The exact-source full pilot gate passed; see the current-candidate checks above.

### Background rendering and secure-startup repaint

`28c5a50` disables throttling for an open Sia window and restores it when hidden or minimized.
Read-state tracking separately requires actual document focus, so rendering a covered conversation
does not mark it read. Electron coverage verifies frames continue under a test-owned covering
window and stop after Hide. The signed app still needed Open Sia after its first blank startup.

`1a1b7e5` requests a repaint after the secure-startup page is replaced by the application renderer.
Two cold launches reached the composer without Open Sia; CUA typed a complete unsent sentence,
verified it and cleared it. One intervening launch failed with “database or disk is full.”
The QA database passed SQLite quick_check; no database reset or migration was performed for
verification. Only reproducible older build staging directories were removed to recover space.
Installed apps, rollback copies, the held DMG and evidence were preserved.

On the third launch, an accessibility snapshot still reported Loading Sia while a fresh screenshot
showed the loaded conversation. Screenshot-based input and clearing worked. The exact startup
latency was not measured; these observations do not establish repeatability, background isolation
or a fix for the storage error. Receipt: `startup-repaint-cua-check.json`.

### Existing draft: body edit succeeds, Save-panel filename input fails

Signed `28c5a50`, thread `2388baa5-90f0-48a0-bafd-b2b7455c0502`, turn
`753b5300-c83b-49b7-8b85-98129cccab7e`, ran an ordinary request to finish the existing untitled
errands checklist, preserve its contents and save a named copy. Sia inserted keys, wallet, water
bottle and phone charger under Before leaving using background pointer/keyboard control. It opened
Save and captured the panel, but typing through both the panel and parent window left the filename
unchanged. It reported the draft updated but unsaved after 86.030 seconds. This is a failed task.

Post-terminal CUA verified all four additions, cancelled Save and left the edited duplicate unsaved.
The requested file does not exist; all seven protected RTFs remain byte-identical. There was no
operator rescue during the task and no continuous focus, clipboard or concurrent typing check.
Automatic AWS verification matched the complete prompt, nine actions, seven PNGs, 22 usage events
and terminal failure in one encrypted 75-event batch. Receipts: `draft-edit-acceptance.json` and
`native-archive-verification-753b5300-c83b-49b7-8b85-98129cccab7e.json`.

### Build-dependency audit

`18f3881` updates rimraf to 6.1.4 (glob 14.0.3) and scopes minimatch 11.0.4 overrides to five
reviewed lint/packaging consumers. No blanket override changes older unaffected consumers.
The advisory audit now reports zero findings. Across 2,099 repository/package paths and 13
real lint/packaging patterns, 54,574 old/new normal and partial matches had zero differences.
Frozen install, lint and signed package/runtime verification passed; the dependency-only package
has exactly the same ASAR as signed `28c5a50`.

The local pilot run on `18f3881` stopped at one five-second browser-test timeout; the complete
21-test file then passed in isolation. That is not a clean full-gate pass.
[CI 412](https://github.com/ljang0/sia-v2/actions/runs/42122709805) subsequently passed the full
pilot gate and unsigned universal packaging on `63d3a36`; signing/notarization were skipped.
Private receipts: `public-readiness-audit-after.json`, `matcher-compatibility-result.json`,
`dependency-pilot.log` and `dependency-browser-recheck.log`.

### Vision pointer focus: duplicate opens, capture blocks completion

Signed `f83319c`, thread `eb571fb1-c5dc-4f30-9363-7eebb06a3998`, turn
`1daff45b-8502-4612-a55c-bc81fcb873a0`, ran an ordinary request to preserve an open errands
checklist, make a copy, add leaving-home items and save it beside the original. Background
Cmd+Shift+S opened a duplicate. Its capture refused twice with `popover_window_unmatched`;
Sia stopped without typing or saving. The run failed after 60.828 seconds with no operator rescue.
All seven protected RTFs remained byte-identical. No concurrent typing check was performed.
Post-terminal CUA could capture the untitled duplicate; this does not explain the earlier failure.

Automatic AWS verification matched the prompt, nine actions, three PNGs, 22 usage events and
failure outcome in one encrypted 75-event batch. Receipts: `vision-focus-acceptance.json`,
`vision-focus-installation.json` and `native-archive-verification-1daff45b-8502-4612-a55c-bc81fcb873a0.json`.
During setup, the full CUA-typed prompt appeared only after Open Sia brought the window forward.
Background rendering is being repaired separately; the run is not an acceptance pass.

### WindowServer ownership diagnostic: input destination matches the panel owner

Signed `e8d47b5`, thread `c71f75a4-388a-435a-9f8c-3ca1becfb88d`, turn
`b6cbd77d-37f1-482e-bb8b-7f8a54c942e3`, added a read-only owner comparison immediately before
background keyboard delivery. It resolved the exact WindowServer connection/process without
AX metadata or a caller-PID fallback. The owner matched the input PID. Go to Folder still did
not appear after one Cmd+Shift+G; post-terminal CUA confirmed the Open dialog remained.
The 55.428-second diagnostic excludes this owner/destination mismatch in that run, but does
not establish how AppKit consumes or forwards the event. No input route was changed.

All eight protected files remained unchanged; no comparison RTF was created. AWS independently
matched the prompt, seven actions, five PNGs, 16 usage events and terminal outcome in one
51-record encrypted batch with one finalization. No concurrent typing check was performed.
The initially blank Sia window required its normal Open Sia menu before the run; this is
recorded as setup intervention, not successful unattended startup. The restored app also required
Open Sia to reveal its composer, then showed Ready. CUA dismissed TextEdit's Open afterward,
temporary logging was removed, and the original signed app was restored. Receipt:
`window-server-owner-result.json`. The owner requested that the upstream report remain private.

### Focus guard diagnostic: no intervention during the failed shortcut

Signed `9cd0718`, thread `50fc95ea-db0c-40de-9702-e9bf74f9665e`, turn
`edf5dee0-faa9-4dd5-bb74-d863b1617792`, added fixed-label logging only; guards and input delivery
were unchanged. The bounded diagnostic opened TextEdit's Open dialog, sent Cmd+Shift+G once,
and stopped after 56.948 seconds. Go to Folder did not appear, confirmed after termination
through CUA. No text was entered into TextEdit, files opened or documents changed.

The runtime recorded five guard requests and zero order restorations, activation reversals,
successful key-focus theft releases or failed release attempts. This excludes those guard
interventions during this run; it does not exclude every possible OS or driver focus mechanism.
The diagnosis does not justify disabling input-isolation protections.

All eight protected file hashes and both unrelated draft additions survived. Automatic AWS
verification matched the prompt, seven actions, five PNGs, 16 usage events and terminal outcome
in one 51-record encrypted batch with one finalization. Receipt:
`focus-guard-diagnostic-result.json`. The completed diagnostic is not an acceptance pass for
background document work. Temporary logging was removed, the canonical native source restored,
and signed `d67df60` reinstalled with matching ASAR and strict signature.

### Native key-window preparation trial removed after ordinary-task failure

Signed `6953337`, thread `6d71348d-7e44-41ac-a01d-08bc0b034019`, turn
`ae47b229-373b-4468-9286-908dcc931580`, ran the unchanged Saturday comparison without rescue.
The trial added target-only focus/make-key records around the unavailable native-menu fallback,
retaining the original PID-addressed keyboard transport. Preparation and exact-focus checks
completed, but Cmd+Shift+G and the directory popup still had no visible effect. The task failed
in 76.808 seconds; no source opened and no RTF was created. Post-terminal CUA confirmed only
the Open dialog, then dismissed it without opening or changing a file.

All eight protected file hashes and both unrelated Chrome draft additions survived. AWS matched
the prompt, ten actions, eight PNGs, 22 usage events and failed outcome: two encrypted batches,
79 records, one finalization. Continuous focus/clipboard isolation remains unproved.
Receipt: `native-key-preparation-acceptance.json`.

The trial was removed from the canonical patch and generated native source. Signed `d67df60`
was restored with matching ASAR and strict signature. This rules out that extra preparation as
a sufficient fix; it does not establish the cause of the remote panel's background input failure.

### Dialog-focus correction: background task fails; bounded foreground comparison works

On `d67df60`, thread `4d9e3ae2-5725-4100-87af-743dc12e82f1`, turn
`c15ec3cc-eb56-43d2-bdc7-5d9acbc38f1f`, ran the unchanged Saturday comparison without rescue.
It opened TextEdit's Open dialog, but Cmd+Shift+G and directory-popup input had no visible effect.
It failed in 70.369 seconds, with no source opened or RTF created. Post-terminal inspection
confirmed no Go to Folder sheet. All eight sources and both unrelated draft additions survived.
AWS matches nine actions, seven PNGs and 20 usage events in one 73-record batch, with one
finalization. Receipt: `dialog-focus-acceptance.json`.

A separate comparison, thread `186ece62-9bb1-4df5-b89d-0a8b14de53f1`, turn
`35c02d13-43cc-455c-9648-24f1690b895e`, temporarily used On my screen on the same still-open
panel. Sia's foreground click and one Cmd+Shift+G opened Go to Folder, visibly captured by Sia.
No text was entered and no file was opened or changed. It finished in 45.733 seconds; AWS
matches five actions, three PNGs and 12 usage events in one 39-record batch, one finalization.
Operator cleanup dismissed both dialogs and verified Work in background → Pause and tell me
was restored. Receipt: `dialog-foreground-comparison.json`. This is a routing diagnosis, not a
rescued task or background acceptance. All eight file hashes still match after cleanup.

### Native menu-key trial removed after ordinary-task failure

Signed `770360e`, thread `e2b13f6a-551c-41e1-a3d2-98d85e36aad0`, turn
`fdb58daa-4e5f-4f04-86ad-0e020e7c7b3f`, failed the unchanged Saturday comparison in
86.582 seconds. The alternate native key-equivalent route did not open Go to Folder, and
post-terminal operator inspection confirmed that the sheet was absent. No RTF was created;
all eight source hashes and both unrelated draft additions survived. AWS matched nine actions,
seven screenshots, 20 usage events and one finalization (73 records, one batch).
Receipt: `native-menu-key-acceptance.json`.

The preceding 44.912-second `9e7e436` diagnostic reported the focused input under TextEdit's
PID but without a raw window ID; this cannot exclude an AX proxy. Operator CUA then opened
Go to Folder on the exact failed dialog without reopening it. AWS matched that diagnostic's
six actions, four screenshots and 14 usage events (45 records, one batch). It was not acceptance.

Both experiments were removed. The prior `6ce129c` signed app was restored at
11:13:37 UTC on November 5, with matching ASAR and strict signature. Failure receipts remain private;
reproducible staging builds were later removed to recover disk space. The ordinary document workflow and distribution remain blocked.

### Saturday comparison on 6ce129c: editor recovery works, Open-panel navigation fails

Fresh thread `4b1686a8-9c8e-4eb1-8e96-3c39d17593e9`, turn
`495f0a69-2d5d-48c6-a800-59f1e90f8c0f`, followed the unchanged ordinary request without rescue.
Sia inspected Finder and TextEdit, then used Cmd+O in the editor. The Open dialog appeared,
but Cmd+Shift+G and sidebar navigation had no visible effect. The run failed in 89.893 seconds;
no source file opened and no `Saturday options.rtf` was created.

All eight protected files remain byte-identical. Both unrelated Chrome draft additions survived
during and after the task; continuous focus/clipboard isolation remains unproved. Automatic AWS
verification matches the prompt, failed outcome, 12 actions, ten PNGs and 24 usage events in two
encrypted batches (89 logical records, one finalization). Receipt: `native-open-acceptance.json`.

After termination, operator CUA's pixel click in Open returned `elementPresumedOOPAndNotFound`.
Its keyboard route could dismiss/reopen Open and invoke GoToWindow. No path was entered or file
opened; both dialogs were dismissed. Sia's Cmd+Shift+G had used synthetic fallback after a disabled
native menu match. This comparison informs the next dispatch investigation, not a rescued pass.

The preceding `ddd4af7` corrected popup-local Y and passed real native event-field readback,
but still failed Open With in the ordinary task (48.123 seconds, no output). AWS matches four
actions, three PNGs and 12 usage events in one 45-record batch; all eight protected files were
unchanged. The first draft addition overlapped that task; overlap for the later addition was not
established. Receipt: `popup-cocoa-acceptance.json`. Do not claim that coordinate correction fixed
submenu tracking. The editor recovery improvement likewise does not waive submenu control.

### Saturday comparison on e943d92: visible menu, submenu interaction failure

Fresh thread `dbe14507-c29b-4bc8-a53d-63e03ada5a67`, turn
`c397ab2d-20ff-4642-b2ef-bb6758063dbf`, ran the original ordinary request without rescue.
The file context menu now appears in Sia's screenshot after right-click, confirming the exact
document capture repair. Clicking Open With dismissed it; a second attempt at the submenu arrow
did the same. The run failed in 71.251 seconds without opening the plans or creating the RTF.
Menu event delivery/geometry versus tracking cancellation remains unresolved.

All eight protected files remain byte-identical and both unrelated Chrome draft additions
survived at observed points. Continuous focus/clipboard isolation remains unproved. Automatic
AWS verification matches the prompt, failed outcome, seven actions, six PNGs and 18 usage events
in two encrypted batches (63 logical records, one finalization). Receipt: `popup-root-acceptance.json`.
The preceding menu-only diagnostic on `20f5616` isolated the lost focused-root capture lookup;
its temporary logging was removed in this repair. This is still a failed useful native task.

### Saturday comparison on e1bebca: repaired folder input, overall failure

Fresh thread `c0e3cc62-b7a1-4d82-8dfd-202e53eb321a`, turn
`839f534b-a2b4-41bd-bc33-ee311110725b`, reran the ordinary request without operator rescue.
Go to Folder accepted Cmd+A, the path and navigation. Finder's file context menu then failed
to appear reliably; the plans did not open in TextEdit and no `Saturday options.rtf` was created.
The run failed after 167.530 seconds. A captured toolbar menu proves menus were visible in
at least one observation, but the precise delivery/observation defect remains unresolved.

All eight protected sources remain byte-identical. Both unrelated Chrome draft additions
survived at observed points; continuous focus and clipboard isolation remain unproved.
Automatic AWS verification matches the exact prompt, failed outcome, 19 action results,
15 PNGs and 42 usage events in three encrypted batches (135 logical records, one finalization).
Receipt: `main-sheet-acceptance.json`. The step repair does not establish native-task readiness.

### Saturday comparison on 1269df9: native useful-task failure

Fresh thread `1e23b468-1109-4fe1-bc06-31a8943bc18a`, turn
`06ba59e7-0ec9-4a7c-a484-2867fb6b0069`, failed in 143.132 seconds. The ordinary request was to
use Finder/TextEdit to turn the two researched Saturday plans into a concise printable RTF,
preserve the sources, and save/close/reopen the result. Finder opened Go to Folder and accepted
a field click, but Cmd+A refused `window_not_key` before input. A later attempt to open the folder
through `computer_open_app` correctly refused foreground delivery in the background-only task.
No `Saturday options.rtf` was produced and no operator rescued the run.

Independent checks confirm all eight protected files and both additions to an unrelated Chrome
draft remained intact. Post-terminal CUA shows the Go to Folder sheet with its path field focused;
the native failure hint is `unavailable`, so the exact focus-proof discrepancy remains unresolved.
AWS matches the prompt, failed outcome, nine actions, five PNGs and 22 usage events in two
encrypted batches (76 stored / 75 logical records), with one finalization. Receipt:
`weekend-native-acceptance.json`. This current failure prevents using earlier native successes
as proof of repeatability or readiness.

### Museum research on 1269df9: visible-restart and useful-task pass

Fresh thread `fb15c188-9cd1-412d-a86c-aa11244413bc`, turn
`cf12668a-14f7-4795-892a-064200e694a8`, completed in 495.546 seconds after restarting the app.
Visible startup restored the previously chosen, still-live Chrome window without opening Settings,
choosing another window or rescuing the task. The ordinary request produced a 6,842-byte
`Rainy Saturday backup.md`, SHA-256
`28f189214d93f2ccb65113335133acba16a1bc81689922adc336f139cd3df9b6`.
Independent review matched the saved bytes and captured official sources: Saturday opening hours,
CMU student eligibility, the companion's admission and a two-hour itinerary. The student timed-ticket
procedure remained explicitly unresolved; no ticket was bought or free guest benefit assumed.
The model researched through screenshots and background input; a workspace-file tool saved the report.

Both additions to an unrelated Chrome draft survived, six protected RTFs and the previous Phipps
plan remained unchanged. This is observed preservation, not continuous focus/clipboard proof.
Two stale-observation outcomes were recovered. The 45 logged tool intervals total 72.400 seconds
(median 0.989 seconds); approximately 91 seconds passed between the final file listing and report
write while no computer-input call was in flight. This locates that delay between tool calls but
does not separate model inference from upstream/network time. General responsiveness remains open.

Automatic AWS verification matches the exact prompt, completed outcome, all 45 actions, 36 PNGs
and 94 usage events in nine encrypted batches (369 stored / 356 logical records), with one
finalization. Receipts: `startup-browser-acceptance.json`, `startup-browser-plan.md` and matching
archive verification. Hidden startup does not use the visible-startup restoration path.
The preceding `bed8a3c` restart attempt remains failed: 37.839 seconds, three actions, no screenshots
or saved plan, with a matching failed AWS archive (`network-recovery-restart-acceptance.json`).

### Phipps planning on bed8a3c: useful-task pass

Fresh thread `806c0661-f355-40fb-9113-234a9309c2a6`, turn
`5025e25f-a6d8-4d93-b4a5-3e304e54719a`, completed in 456.682 seconds without task-time rescue.
The ordinary request produced a complete 4,735-byte `Saturday Phipps plan.md`, SHA-256
`6a83b91efa9387bd0530b0204b8a8bef42b1cbf79b444d035de17ab7d2f0ca3e`. Independent disk and
captured-source review confirm hours, admission/student terms, reservation rules, date-specific
road restrictions, vegetarian brunch details and the budget. Walking times and tax/tip are
explicit estimates. The model used screenshots and background input; the separately labeled
workspace-file tool saved the report.

The repaired network failure classification was exercised: Sia moved from the failed domain to
public search, found the current official restaurant site and finished without another setup
request. Six protected RTFs and two independently typed additions to another Chrome window's
unsent address draft remained exact; Escape restored its original address without navigation.
Initial connection setup occurred before the task, so this does not establish cold restart recovery.
Three changed-page retries and a 72.142-second event gap before writing remain recorded.
An operator CUA observation timed out after the save; a later read showed the completed result.
Continuous focus/clipboard isolation and general responsiveness remain open.

Automatic AWS verification matches the exact prompt and completed outcome, 96 usage events,
47 actions and 38 PNGs in 34 encrypted batches (426 stored / 370 logical records), with one
finalization. An immediate query encountered an action still uploading; the later read-only
retry passed. Receipts: `network-recovery-acceptance.json`, `network-recovery-plan.md` and the
matching archive verification. This is useful-task evidence, not exact-installer acceptance.

### Phipps planning: partial output; useful-task acceptance failed

On `5a8b1e5`, fresh thread `9836fd3a-5d0e-41e7-80a0-509c8375f2d7`, turn
`41e82c70-ad23-4007-9980-f9422aa11265`, ran for 327.834 seconds without task-time rescue.
It reused the approved connection, researched through screenshots and background input, then
saved a 4,010-byte **partial** `Saturday Phipps plan.md`. Independent disk verification matches
SHA-256 `25335c81b11fdb890ff39c271d0b676930c05b292e262433ab8da08c6c1ebcc7` and the action's
full text. Arithmetic checks, but missing lunch details, paying-adult reservation rules and
November 7 notices prevent acceptance. The terminal outcome correctly remains failed.

The first restaurant site timed out; the alternative returned a native navigation error. Sia
reported the subsequent browser error document as outside its grant. Post-terminal CUA inspection
showed `DNS_PROBE_FINISHED_NXDOMAIN`, establishing a misleading failure classification rather
than a new permission requirement. Recovery saved the verified portion, but did not finish the
original request. Two changed-document retries remain recorded. An unrelated Chrome draft
preserved both independently typed additions and was cleared afterward without navigation;
six protected RTF hashes are unchanged. Continuous global focus/clipboard preservation is unproved.

Automatic AWS capture matches the exact prompt, failed outcome, 56 usage events, all 26 actions
and 15 PNGs in nine encrypted batches (289 stored / 277 logical records). An immediate query
caught incomplete chunks during upload; the later read-only verification passed. Private receipts:
`recovery-acceptance.json`, `recovery-partial-plan.md`, and the matching archive verification.

Predecessor failures and the bounded diagnostic remain preserved, not relabeled as passes:

| Candidate / private receipt                        | Result                                                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0428730` / `reuse-acceptance.json`                | Inactive-Chrome preparation blocked all research; 28.953 seconds; AWS matched 37 records, three actions and no PNGs.                                                   |
| `1cf54d8` / `reuse-default-acceptance.json`        | Connection reuse and background research worked, but a site timeout stopped the task without saving; 410.333 seconds; AWS matched 325 records, 35 actions and 27 PNGs. |
| `1cf54d8` / `failed-page-recovery-diagnostic.json` | Same-tab navigation away from the error page worked without new setup; diagnostic only. AWS matched 43 records, five actions and one PNG.                              |

The diagnostic exposed operator CUA typing corruption in an unsent composer draft, corrected
through CUA paste before submission. That input-reliability issue remains open.

### Personal checklist on 6b24a04: useful-task pass

On installed `6b24a04`, thread `baca784e-d62e-4acc-8d36-9c55d834f504`, turn
`4c531f1b-4d6a-432f-82a9-075a9cd000d1`, completed an ordinary background request in 206.524
seconds. Finder duplicated/named the source; TextEdit edited, saved, closed and reopened the
copy. Independent disk and CUA verification confirms the correct filename, date, three sections
and 14 unchecked items covering every original reminder. Five previous RTF hashes are unchanged;
an unrelated Sia draft retained both additions. No task-time operator rescue occurred.

Output: `Tomorrow errands and lunch checklist.rtf` in the private `Personal notes acceptance`
folder. SHA-256: `51c70e210ffd2259f050ccc9b131c360524b18a5806c9ab2700cf59a4b5fbea0`.
The longest event gap, 33.459 seconds, was keyboard-only entry of 748 characters. One checkpoint
update failed after a source label changed; the agent corrected it and finished with complete
coverage. AWS matches the exact prompt, outcome, 54 usage events, 25 actions and 19 PNGs in three
encrypted batches (209 records), with one finalization.

The preceding targeted Go to Folder regression completed in 58.737 seconds, thread
`12521053-19e9-4cc1-93b7-36830e039d52`, turn `dcee37d5-832b-40d4-bdb1-ab93db2a0f8c`.
CUA confirmed the destination folder and file; protected files and an unrelated draft stayed
intact. AWS matches 10 actions, seven PNGs and 22 usage events in two batches (73 stored / 69
logical records). This isolates the repaired panel path; it is not another useful workflow.
Private receipts: `sheet-visibility-acceptance`. Failed predecessor runs remain recorded there.
Continuous focus/clipboard preservation, two simultaneous native tasks and exact-installer
acceptance remain open.

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
