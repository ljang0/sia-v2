# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed arm64 alpha.94 is the latest internal
keyboard-event diagnostic, stopped after live verification. It is not notarized or accepted for distribution.
Nothing new was published; the last published Mac pilot is alpha.24.

## Last full-pilot baseline

Alpha.88 passed `pnpm test:pilot`: 1,971 desktop tests (22 skipped), 46 Electron tests (5 skipped),
40 renderer tests, 72 Chromium/WebKit phone tests, and native/shared/build/static checks.
Developer ID signing and packaged-runtime verification passed. The new native suite includes
exact-window coordinate selection, clipping, focus geometry and screenshot-scale/session isolation.
CI for the committed focus/coordinate fixes `0b57e71` passed ([run 321](https://github.com/ljang0/sia-v2/actions/runs/41330418586)).

| Identity                     | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| Version                      | `0.1.0-alpha.88`                                                   |
| Source base                  | `9ab265bcce19c859c79eb47cd94ae23e5c58a18d`                         |
| Packaged source diff SHA-256 | `5d504e505193ae14e21aea82a04c2f3e340b4fc14b8b6805a116051f7454580d` |
| Installed ASAR SHA-256       | `1ffaec556fe77529859c132ee0d7157cde41a32780062e60e7ca80cf43e688c0` |
| Evidence directory           | Private `alpha88-focus-scale`                                      |
| Thread                       | `6d00bb92-0d3d-4341-9c81-c72aa11e3ff8`                             |
| Turn                         | `5a7a3d45-bd75-47c3-8e27-a4390875a63f`                             |

The **36.322-second** real task tried to reopen the saved reviewer brief through TextEdit's
standalone Open dialog. Scaled-coordinate focus passed and Cmd+A was accepted through the
background event route. Keyboard-only filename typing produced no visible text. Two subsequent
images showed Search empty, no selection and Open disabled; the brief was not reopened.
The operator submitted the prompt and quit QA through CUA, with no TextEdit input during the turn.
The private record preserves the prompt, trajectory/images, exact source patch, package/install
receipts and complete check logs. Only evidence documentation changed after packaging.

## Subsequent internal diagnostics

These signed arm64 builds passed the native gate and packaged-runtime checks, but not a new full
pilot gate. The private directories preserve exact source patches, package/install receipts, prompts,
trajectory images and full logs. None is approved for distribution.

| Version  | Diagnostic and observed result                                                                                                                                                                                             | Private evidence            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| alpha.89 | Focus metadata matched the TextEdit window; no on-screen panel-service window was found. Search stayed empty.                                                                                                              | `alpha89-key-routing`       |
| alpha.90 | Re-priming the same key window left a visible caret/focus ring but no typed filename. The workaround was removed.                                                                                                          | `alpha90-key-prime`         |
| alpha.91 | Omitting the Chromium envelope for native text did not replace the selected query. A separate single-key probe also had no visible effect. Both are failed diagnostics, not workflow passes; the route change was removed. | `alpha91-native-key-events` |
| alpha.92 | Field and window both reported TextEdit PID 9967. Typing again left the prior single-character query unchanged; Open stayed disabled. The probe was removed.                                                               | `alpha92-key-owner`         |
| alpha.93 | The signed host reported Accessibility trust and `CGPreflightPostEventAccess()` both true. Typing still left the initial query unchanged. The read-only probe was removed.                                                 | `alpha93-event-access`      |
| alpha.94 | Public `CGEventPostToPid` for native text left the selected query unchanged and Open disabled. No file reopened; the failed route was removed.                                                                             | `alpha94-public-key-events` |

Alpha.90 ran for 34.970 seconds. Alpha.91's first screenshot already contained a different search
query than alpha.90; the cause of that intervening change is unknown. Its filename and single-key
turns both left that query unchanged. No operator TextEdit input occurred during those turns.
The alpha.89 first launch lost stderr during a launcher race; a second launch captured it explicitly.
Later launches use one LaunchServices call with stdout/stderr attached. Diagnostic logging is removed
from production source after inspection. The saved brief's hash remains unchanged. Alpha.92 also
started with an intervening query change of unknown origin; its initial/final images are retained. The diagnostic identified no process-ID
mismatch. Alpha.93 confirmed existing event-posting access, so no permission reset or new grant was
requested. Alpha.94 used the public PID event API, distinct from alpha.91's private PID route without
the Chromium envelope. Neither changed the selected query. The operator provided no TextEdit input
during these turns. Runtime source and version were restored to the committed alpha.88 baseline.
The current changes contain evidence updates and a shorter, vision-only manual acceptance guide;
legacy assisted recipes remain available through a pinned history link.

After removing the alpha.92 probe, `pnpm check` passed, including 1,971 desktop tests (22 skipped). The first
attempt stopped when the real Electron bare-launch fixture exited with code 1 and no output. That
fixture then passed alone and in the full repeat without code changes. Both logs are retained; the
transient failure is not counted as a first-pass success. No full pilot rerun is claimed for the
diagnostic builds. After removing the alpha.93/94 experiments and simplifying the manual guide, a
fresh `pnpm check` passed on its first attempt with the same 1,971 desktop tests (22 skipped), plus
native/shared/build/format/lint/quality/type checks. Its full log is retained with alpha.94 evidence.

## Useful progress and interventions

Alpha.85 saved and closed the real reviewer brief without operator target input in a 74.277-second
task. The 3,303-byte, 444-word file has SHA-256
`b24e378ad6d7822456a7cf973bd34e81aa29e376722d98696ae320710ab7a05c`; that hash remains unchanged.
Reopening stopped at the standalone Open dialog. Alpha.86 opened its folder menu and selected the
parent folder, but scrolling and Search typing had no visible effect. Alpha.87 focused Search but
refused keys because focus readback used unscaled coordinates; alpha.88 fixed that mismatch.
Cross-version progress does not establish a complete workflow pass.

| Version  | ASAR SHA-256                                                       | Private evidence       |
| -------- | ------------------------------------------------------------------ | ---------------------- |
| alpha.85 | `bec7b032e8a42f2dc323904fe25176092ac6efc26e23c5a95affa95e143a2634` | `alpha85-sheet-point`  |
| alpha.86 | `2247f461345a9262e1cfd09afac393edc221439a51144f87dfdd5183622a94d8` | `alpha86-window-point` |
| alpha.87 | `0dca491845191b9bfc49141d57002169932507e248c03fbff3fb84db571e1b4a` | `alpha87-point-focus`  |

Those internal builds passed native and signed-package checks. Their private receipts retain
exact source diffs, prompts, turn IDs, full trajectories and interventions. Alpha.88 is the first
full-pilot baseline containing those fixes. [Earlier detailed evidence](https://github.com/ljang0/sia-v2/blob/9ab265bcce19c859c79eb47cd94ae23e5c58a18d/docs/public-release.md)
records prepared-menu operator interventions and previous failed attempts. They are not hidden or
counted as unassisted acceptance. Earlier semantic text insertion is excluded from vision-only acceptance.

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
the keep-awake assertion fails on this host with `0xe00002bd` (`kIOReturnNoMemory` in the macOS SDK). A fresh account/second Mac is unavailable. Final
universal notarized artifacts and fresh-install acceptance are still required. The owner is the
support/incident contact. No publication, invitations or Arena outreach is authorized by these tests.
