# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed arm64 alpha.88 is installed and
stopped after live verification. It is not notarized or accepted for distribution. Nothing new
was published; the last published Mac pilot is alpha.24.

## Current signed candidate

Alpha.88 passed `pnpm test:pilot`: 1,971 desktop tests (22 skipped), 46 Electron tests (5 skipped),
40 renderer tests, 72 Chromium/WebKit phone tests, and native/shared/build/static checks.
Developer ID signing and packaged-runtime verification passed. The new native suite includes
exact-window coordinate selection, clipping, focus geometry and screenshot-scale/session isolation.
CI for the previous committed source `9ab265b` passed ([run 320](https://github.com/ljang0/sia-v2/actions/runs/41324521904)); the new commit still needs CI.

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
the keep-awake assertion fails on this host. A fresh account/second Mac is unavailable. Final
universal notarized artifacts and fresh-install acceptance are still required. The owner is the
support/incident contact. No publication, invitations or Arena outreach is authorized by these tests.
