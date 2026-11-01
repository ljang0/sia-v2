# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed arm64 alpha.107 is the latest
installed internal build, now stopped. Its clean source passed the full local pilot gate, and signing
and packaged-runtime verification passed. The real file-copy workflow remains incomplete.
Nothing new was published; the last published Mac pilot is alpha.24.

## Resolved Finder observation regression

Signed alpha.107 was packaged from `aeb75f49f6e930329401e695eea5f1a9f6ecb60b` with no source diff.
Its installed ASAR SHA-256 is `52f81dca22dc958de6add8058f37670b8ca1f38b34266ccbccf2b3a687cadcda`.
Signing and packaged-runtime verification passed; private evidence is in `alpha107-finder-file-labels`.
The read-only signed repeat captured both Finder Applications windows and TextEdit Untitled 8.
Independent inspection of the returned image confirmed the Applications listing including 1Password.
No target input, clipboard operation or foreground fallback occurred in this turn. An unrelated
memory-vault call lacked a note selection; that failure is retained in the trace. The original
checklist hash remains unchanged. QA was quit after verification. This resolves the observation
regression, not the incomplete copy/reopen workflow.

## Background menu focus regression

A subsequent signed alpha.107 file-copy attempt at 21:17 UTC opened Finder’s Go to Folder panel,
then paused before path input because Finder had become active. No copy was created; the original
hash is unchanged. No operator focus rescue was used, and QA was quit after the pause. Private
per-turn evidence is in `alpha107-finder-file-labels/background-copy-repeat`.

The native hotkey menu-equivalent path returned before the ordinary key-event focus guard.
Alpha.108 source wraps the shared background menu dispatch in that existing targeted guard,
including its post-dispatch settle period. The full local pilot gate passed: 1,996 desktop,
46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static checks.
A signed repeat is pending; this source change does not yet establish focus preservation or
copy/reopen acceptance.

## Prior capture diagnostic

Signed arm64 alpha.106 was packaged from `adcbcc5e3f73b7717464c36c71386c98ad08474f` with no source diff.
Installed ASAR SHA-256 is `78bd6b04688c605a458f15ac5b0d2bc332c2fee9c80c840691734467ef8e3e2b`.
Signing and packaged-runtime checks passed. The full local pilot passed as recorded below.
Private evidence is in `alpha106-capture-diagnostics`.

A read-only turn captured the Finder TextEdit folder and TextEdit document, but refused Finder
Applications. No native capture diagnostic was logged. After QA quit, operator CUA inspection of
Finder’s Applications listing found 1Password and Passwords filename fields. Source inspection shows
these can trigger the authentication-label heuristic; the image is withheld and mislabeled as a
capture failure. Alpha.107 source distinguishes an openable Finder filename from a credential field
and returns an explicit protected-window result for genuine protection. Its full local pilot passed: 1,996 desktop (22 skipped), 46 Electron (5 skipped), 40 renderer
and 72 browser tests, plus native/shared/build/static checks. The signed capture repeat above passed. The original copy workflow remains incomplete.

## Latest real document attempt

| Identity               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Version                | `0.1.0-alpha.105`                                                  |
| Source commit          | `dd988b9e03a4a0ed34e1c7a91d68bc581f2e7be9`                         |
| Source diff            | Empty                                                              |
| Installed ASAR SHA-256 | `eca06079de4f92184025977aa871e6dac21e41d97ebdeea49b06b59e03e22618` |
| Private evidence       | `alpha105-clean-popovers`                                          |
| Thread                 | `c0ea6770-bc21-4448-8bc3-8a6b51860150`                             |

The task requested a local handoff copy of the actual autosaved checklist, followed by close/reopen.
TextEdit captured; the Finder Applications window refused capture. An operator-suggested Inbox
window captured after the model refreshed its per-turn inventory. Go to Folder opened, but typing
paused because Finder had become active. The operator activated the existing QA app through its
authorized LaunchServices command and clicked Continue. Background path typing then reached the
source folder. Duplicate produced no visible copy; an operator-suggested menu recovery also exposed
no usable Duplicate command. No operator Finder/TextEdit input occurred, but the coaching and focus
restoration prevent this from counting as unassisted acceptance.

Filesystem verification found the original unchanged at SHA-256
`bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`, with no requested alpha.105 output.
The action trace contains no clipboard operation; an independent clipboard hash was not sampled.
QA was quit before automated validation. Alpha.106 source fixes missing bounded capture diagnostics
when the native driver returns an error code; this does not change capture or input authority.
Its full local `pnpm test:pilot` passed: 1,983 desktop (22 skipped), 46 Electron (5 skipped),
40 renderer and 72 Chromium/WebKit phone tests, plus native/shared/build/static checks.

A two-second `/usr/bin/caffeinate -d` probe also exited 1 with “Failed to create
PreventUserIdleDisplaySleep assertion,” and no assertion appeared in `pmset`. Thus the display-awake
failure reproduces outside Electron/Sia. Its host cause remains unresolved; this is not a successful
physical sleep/lock test. The private `host-awake-check.json` records the check.

## Latest capture diagnostics

Alpha.97 captured the document-title popover. The ordered popup stack retains both a popover and
its menu, with composition and stale-image regressions. The real destination menu still refuses
capture: its AX ancestry belongs to TextEdit, but its pixels belong to Apple's shared
DocumentPopoverViewService. Exact service-path matching alone cannot establish ownership.

Signed alpha.100–104 diagnostics found a self-responsible service PID, no raw AX menu window ID,
and a WindowServer parent chain ending inside the service. ScreenCaptureKit's child-window option
was already enabled; explicitly enabling it still omitted the menu. Temporary ownership queries
and private image-dump code were removed from alpha.105 source. Unknown ownership stays refused.
These attempts did not name, save, close or reopen the checklist. No operator TextEdit input occurred.

| Prior capture diagnostic     | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Version                      | `0.1.0-alpha.104`                                                  |
| Source base                  | `202635071e23629748d958215b1ac2e63ba90251`                         |
| Packaged source diff SHA-256 | `56fbf34a7f83628aa0259b2e494d6b09220c9dfb63d5a22bcc272454b150e909` |
| Installed ASAR SHA-256       | `92a72135924e1952c1a8b0182300864e693876be4c073bb531afd61ad7409d12` |
| Private evidence             | `alpha104-native-child-capture`                                    |

Each internal diagnostic passed its native and signed-package checks. Those checks do not replace
full pilot validation or real-work acceptance. The app is stopped; private folders preserve the
exact source patches, receipts, logs, prompts, trajectories and outcomes. Model-facing capture
refusals now explain that a fresh screenshot is unavailable and invalidate earlier image authority.

Alpha.105 source passed `pnpm test:pilot`, including `pnpm check`: 1,981 desktop tests (22 skipped),
46 Electron tests (5 skipped), 40 renderer tests, 72 Chromium/WebKit phone tests, and
native/shared/build/static checks. QA remained closed throughout. The private
`alpha105-popup-capture-source` folder preserves this source checkpoint and full validation log.

## Verified typing, Stop and recovery baseline

| Identity                     | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Version                      | `0.1.0-alpha.96`                                                   |
| Source base                  | `2591a9a943ea6766492b868e6ee699a6c88da383`                         |
| Packaged source diff SHA-256 | `51d0fdc03caf8bb139dbaefeb97f9723dca8a72ade3a86852a41de4bdda0d021` |
| Installed ASAR SHA-256       | `7e1bd3333fc94b8078615d00b9b1f92dc6f383b3792de1344cea6ee79c557fd3` |
| Private evidence             | `alpha96-cancellable-typing`                                       |
| Thread                       | `e4ecb078-4ed1-4713-9419-fa4d955915cb`                             |
| Stop turn                    | `cda29873-91d3-488c-b163-5fd36d45db84`                             |
| Recovery turn                | `f023b035-f804-4520-80f1-f4b82508ddd2`                             |

Developer ID signing and packaged-runtime verification passed. Alpha.96 passed the full
`pnpm test:pilot` gate, including `pnpm check`: 1,976 desktop tests (22 skipped), 46 Electron tests
(5 skipped), 40 renderer tests, 72 Chromium/WebKit phone tests, and native/shared/build/static checks.
The artifact’s `pilot.log` captures the running QA app; `full-pilot.log` records automated validation.

Stop was clicked during native entry at 18:50:22.411 UTC. Sia reported cancellation, with the CUA click
and UI readback taking 1,233 ms. Independent target observations at 18:53:01 and 18:53:10 found the same
485-character partial checklist. That establishes stopped input, not a precise key-event latency.
The follow-up inspected screenshots and completed the same document in 78.467 seconds. Independent
comparison found all 1,469 characters without duplication; only the requested terminal newline was
omitted. The document remains open. No operator TextEdit input or foreground fallback
was used. The earlier Stop attempt is explicitly inconclusive: CUA screenshot capture stalled, and
typing completed before Stop could be pressed.

The private record preserves prompts, trajectories/images, two stable partial-text observations,
recovered-text comparison, timings, exact source patch, signing/install receipts and full logs.
Independent operator accessibility reads verified the output; they were not sent to the Sia model
or used to control TextEdit. QA was quit before automated validation. Only evidence documentation
changes after packaging are intended.

## Autosave correction

Independent filesystem verification after the alpha.105 source checkpoint found TextEdit had
persisted `Untitled 8.rtf` automatically in its default iCloud Documents folder. Its 1,469 characters
exactly match the independently observed document. The 1,874-byte RTF has SHA-256
`bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`;
creation was 18:50:28 UTC and last modification 18:54:59 UTC on November 1. Thus earlier descriptions
of the draft as **unsaved were incorrect**. The app's visible state and assistant's claim did not
prove filesystem absence. This does not establish the requested local filename or close/reopen
acceptance. The original is preserved; `alpha105-popup-capture-source/autosave-correction.json`
records the independent check and corrects the alpha.96 private result.

## Defects reproduced before the fix

On the restored alpha.88 baseline, Sia created a useful Arena handoff checklist and typed its full
1,470-character payload into the ordinary TextEdit editor. The host timed out at 60 seconds; a fresh
image showed the completed text. Save opened, but its filename field did not accept the requested
name. The requested save/reopen workflow failed; the open draft and observations are preserved in
`alpha88-document-boundary`.
This isolates ordinary editor delivery from the unresolved Open/Save dialog problem.

Alpha.95 increased native typing's deadline to 120 seconds, covering the driver's 100-second synthesis
budget plus focus and result delivery. Other calls retain 60 seconds. It completed the checklist in
64.690 seconds with a normal native reply and fresh screenshot. The model omitted the terminal
newline. Ten composer edits/readbacks during typing measured median 649.5 ms and worst 1,205 ms;
these are CUA round trips, not isolated UI latency or concurrent-work acceptance.

Its Stop test failed: the UI reported cancellation while the native blocking loop continued to the
full checklist. Alpha.96 adds cooperative cancellation between complete characters and retains the
process mutation lease in the writer until exit. Native regression tests reproduce cancellation
between two characters and prevent the second write. Host regressions cover long typing without
replay, bounded deadlines, caller abort and queue recovery.

| alpha.95 identity            | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Source base                  | `2591a9a943ea6766492b868e6ee699a6c88da383`                         |
| Packaged source diff SHA-256 | `2c490b1cd29ac2a3d2db6c35366e9274d8eaf3ac01608c0c953480ae4c3f0deb` |
| ASAR SHA-256                 | `356893c8dd9c7832984f8a4fa03f1a24cf22ab96ecc7b58dd9c7bdf14e5c6188` |
| Private evidence             | `alpha95-typing-deadline`                                          |

Alpha.95 passed the full pilot gate: 1,976 desktop tests (22 skipped), 46 Electron tests (5 skipped),
40 renderer tests, 72 Chromium/WebKit phone tests, and native/shared/build/static checks. That run
predates the native cancellation change and cannot stand in for alpha.96 validation.

## Preserved evidence and limits

Alpha.85 saved and closed the real reviewer brief without operator target input in 74.277 seconds.
The 3,303-byte, 444-word file remains unchanged, SHA-256
`b24e378ad6d7822456a7cf973bd34e81aa29e376722d98696ae320710ab7a05c`.
Reopening stopped at the standalone Open dialog. Alpha.88 fixed screenshot-scale focus validation
and passed the full pilot gate; [runtime CI passed](https://github.com/ljang0/sia-v2/actions/runs/41330418586).

Subsequent signed diagnostics failed to type into that dialog. They found matching TextEdit field
and window process IDs and confirmed the signed host had Accessibility and event-posting grants.
Both public PID events and the earlier private route experiment failed. Temporary probes and failed
transports were removed. Do not treat these results as evidence of missing permission, request
another grant or count them as workflow passes. [The previous detailed record](https://github.com/ljang0/sia-v2/blob/2591a9a943ea6766492b868e6ee699a6c88da383/docs/public-release.md)
retains exact alpha.85–94 identities, transient test failures and interventions. Earlier semantic
text insertion and operator-prepared menus do not validate vision-only acceptance. Progress across
versions is not a complete workflow pass.

## Last notarized universal artifact

Universal alpha.60 passed signing, notarization, stapling and final-DMG installation checks.
Its source passed the full local pilot gate (1,950 desktop, 46 Electron, 40 renderer and 72 phone-browser
tests, plus shared/native/build/static checks) and [CI](https://github.com/ljang0/sia-v2/actions/runs/41242349687).
It was never published and is not accepted for distribution.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `af33f7157412d3e8b4befdd31f1360dd42a87ba58cc44b16f48a1dad64839ae1` |
| Universal ZIP  | `75a97eac0e07f475a78a8e0518e031387c05f909e3b512fd16ce1b5b2c32afeb` |
| Installed ASAR | `15bf1a235112be62631900e01f401bdf9991cd6295d12caa13bc6e85520a285e` |

Its fresh assistant drafted the 444-word reviewer brief but stopped at Save; a parent-document
follow-up also failed. Afterward, operator CUA accidentally activated Save when indices changed,
creating `Untitled 3.txt` in the alpha.58 evidence folder. That preserved file is operator-created,
not the requested Sia deliverable. Native Save/close/reopen acceptance has never passed.

## Browser and release gates still open

Alpha.59 corrected restricted background clicks and reached official museum visitor information.
The outing needed Chrome reconnection, then failed on a restaurant network timeout. Continue and
restart did not restore `Page.getFrameTree` on the settled error page; one setup attempt also left
the approved Chrome prompt visible. No itinerary was saved. Separately typed operator notes survived,
and ten CUA navigation samples measured median 946.5 ms / worst 1,199 ms. This was not a second Sia task.

Before distribution, complete native Save/reopen, repeatable browser restart/setup/error recovery,
real research/document/planning deliverables, two concurrent Sia tasks, broader Stop/recovery, clipboard/focus
preservation and end-to-end latency on the exact candidate. Lock/sleep/voice remain unverified;
the keep-awake assertion fails on this host with `0xe00002bd` (`kIOReturnNoMemory` in the macOS SDK). A fresh account/second Mac is unavailable. Final
universal notarized artifacts and fresh-install acceptance are still required. The owner is the
support/incident contact. No publication, invitations or Arena outreach is authorized by these tests.
