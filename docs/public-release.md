# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** The installed internal QA app is signed
arm64 alpha.84, stopped after live verification. It is not notarized or
accepted for distribution. Nothing new was published; the last published Mac pilot is alpha.24.

## Current signed candidate

Alpha.84 passed the full final-source `pnpm test:pilot` gate: 1,971 desktop tests (22 skipped),
46 Electron tests (5 skipped), 40 renderer tests, 72 Chromium/WebKit phone tests, and the native,
shared, build, formatting, lint, quality and type checks. Native capture includes 33 regressions;
sheet ownership/selection includes 10. Developer ID signing and packaged-runtime verification passed.
Current-commit CI is pending.

| Identity                    | Value                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| Version                     | `0.1.0-alpha.84`                                                   |
| Source base                 | `908fdec59c8af9aadf0917e3bb468ec076d5e6df`                         |
| Tracked source diff SHA-256 | `df5828da4f64e24cafd1136deef404270106726694b2c5c89b5b9b5d37dcfe62` |
| Installed ASAR SHA-256      | `ebb84af5020f748696af17552854127faeca62f9fb0c11dfe977a9da5ca69d62` |
| Evidence directory          | Private `alpha84-popup-scan`                                       |
| Thread                      | `9365db14-87b1-45b8-83f8-518dcea8caee`                             |
| Save/reopen turn            | `0ffe539e-a518-44e5-a57f-8f2f3b0a1343`                             |
| Image-receipt diagnostic    | `807f930d-0c87-4da3-b337-b95261914509`                             |

The real task lasted **56.396 seconds**. Capture of the large-folder Save dialog succeeded. One
background coordinate Save click returned an unstructured driver failure and an uncertain-delivery
result. Two later images still showed the unsaved dialog; no target file exists. The task stopped
without closing or reopening. A separate read-only diagnosis correctly read the destination,
clipped filename and visible Save button, explicitly confirming image receipt. Four fresh captures
succeeded across these turns. This closes the observed large-folder capture failure in this run,
not the document workflow or keyboard-only input gate.

No operator TextEdit input occurred during either turn. The operator submitted prompts through Sia
and quit QA through CUA afterward. The private record preserves prompts, full trajectories, images,
package/install receipts and check logs. A newly added test file was untracked when the packaging
script captured the diff; `supplemental-source.json` records its exact contents/hash separately.
All packaged runtime changes are in the tracked source diff.

One intermediate check exposed a real process-cancellation race: a delayed close could let a later
timer mark an aborted command as timed out as well. The process runner now preserves the first stop
cause. Three deterministic delayed-close cases and the final full pilot gate pass. The failed
intermediate log is retained rather than omitted from the evidence.

## Native popup evidence

Alpha.83 captured the prepared TextEdit Save-sheet folder menu, including its extension beyond the
parent sheet. The actual model image was independently inspected. A subsequent background
coordinate click selected **Sia Release Verification**. Both follow-up captures refused
`popup_scan_limit`; only the post-turn operator AX read confirmed the destination. The model
correctly reported navigation as unverified. No text, Save, close or reopen occurred.

The operator prepared the initial menu through CUA. No operator TextEdit input occurred during
either assistant turn. These narrow diagnostics establish popup pixels and coordinate delivery,
not unassisted menu opening, completed personal work, focus preservation or concurrency. QA was
quit through CUA before implementation and automated checks resumed.

| Identity               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Version                | `0.1.0-alpha.83`                                                   |
| Source base            | `908fdec59c8af9aadf0917e3bb468ec076d5e6df`                         |
| Installed ASAR SHA-256 | `4ea3f57e2248a22aa0960e0ee0a61283b809f306bad0c5135dc111743c5fbf32` |
| Evidence directory     | Private `alpha83-owned-panel-menu`                                 |
| Thread                 | `349ab9cb-94dc-4111-aa47-52f7ae43a904`                             |
| Capture turn           | `341a2e0c-b307-458b-9945-9ff34728c220`                             |
| Navigation turn        | `5b28f679-ba65-4a0c-874a-acd6bf8765a2`                             |

The private evidence includes the exact source patch/hash, package/install receipts, full native
check log, prompts, trajectory and images. Developer ID signature and packaged runtime checks
passed. Alpha.84 subsequently passed the full final-source pilot suite.

### Cause and verification in progress

The AX menu reports the TextEdit client PID, while its pixels belong to Apple's separate Open/Save
Panel service. Alpha.82's temporary metadata probe verified exact bounds and process responsibility;
the probe was removed. Production ownership requires the canonical system service executable and
an optional process-responsibility API, plus document ancestry, unique popup identity and geometry.
An unavailable API or ambiguous identity refuses capture.

Alpha.84 checks for popup windows before walking a sheet, avoids unrelated file-row traversal once
the sole owned menu is proven, and rounds shared composition edges consistently at fractional
scales. Native checks and the full pilot gate passed. Signed alpha.84 verified repeated capture of the
large-folder dialog; the Save action remains blocked as recorded above. No completed-work claim
may be inherited from the prepared alpha.83 menu diagnostic.

## Regression baseline and earlier interventions

Alpha.76 passed the full local pilot gate: 1,958 desktop, 46 Electron, 40 renderer and 72
phone-browser tests, plus native/shared/build/static checks. [Runtime-commit CI](https://github.com/ljang0/sia-v2/actions/runs/41260487890)
passed, including unsigned universal packaging; signing/notarization was skipped.
Its ASAR is `f0acb1a3b67ac7ca1270fb454c7d3255940ae8e4f38379898cdc3a82e830f72e`.
This is a baseline, not verification of the current popup changes.

Its real reviewer-brief task failed at destination navigation. Forty frontmost samples over
40 seconds identified Sia, but do not prove zero transient changes, clipboard preservation or
concurrency. A separate keyboard diagnostic showed no filename selection and stopped before typing.
The prior alpha.75 AX text insertion is excluded from strict vision-only acceptance.

Alpha.77 child-window capture and alpha.78 focus preparation were removed after failing to capture
the menu. Alpha.79 identified the separate service-owned window. Alpha.80's first menu trial was
confounded by operator activation; its closed-menu control succeeded. Alpha.81's stable prepared-menu
trial refused `popup_window_unmatched`. Alpha.82 isolated the client-proxy PID mismatch. These were
internal signed diagnostics, not notarized candidates or completed work. Exact private receipts
are retained. [Earlier detailed records](https://github.com/ljang0/sia-v2/blob/908fdec59c8af9aadf0917e3bb468ec076d5e6df/docs/public-release.md)
retain earlier hashes and operator interventions without duplicating that history here.

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
real research/document/planning deliverables, two concurrent Sia tasks, Stop/recovery, clipboard/focus
preservation and end-to-end latency on the exact candidate. Lock/sleep/voice remain unverified;
the keep-awake assertion fails on this host. A fresh account/second Mac is unavailable. Final
universal notarized artifacts and fresh-install acceptance are still required. The owner is the
support/incident contact. No publication, invitations or Arena outreach is authorized by these tests.
