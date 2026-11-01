# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed arm64 alpha.104 is the latest internal
build, stopped after capture diagnostics. Cleaned alpha.105 source removes unsuccessful probes;
it passed the full local pilot gate and has not been packaged as a new signed candidate. Nothing new was published; the last published Mac pilot is alpha.24.

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

| Latest installed diagnostic  | Value                                                              |
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
omitted. The document remains open and unsaved. No operator TextEdit input or foreground fallback
was used. The earlier Stop attempt is explicitly inconclusive: CUA screenshot capture stalled, and
typing completed before Stop could be pressed.

The private record preserves prompts, trajectories/images, two stable partial-text observations,
recovered-text comparison, timings, exact source patch, signing/install receipts and full logs.
Independent operator accessibility reads verified the output; they were not sent to the Sia model
or used to control TextEdit. QA was quit before automated validation. Only evidence documentation
changes after packaging are intended.

## Defects reproduced before the fix

On the restored alpha.88 baseline, Sia created a useful Arena handoff checklist and typed its full
1,470-character payload into the ordinary TextEdit editor. The host timed out at 60 seconds; a fresh
image showed the completed text. Save opened, but its filename field did not accept the requested
name. The real workflow failed, with the unsaved draft preserved in `alpha88-document-boundary`.
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
