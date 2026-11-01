# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed internal arm64 alpha.110
survived the previous crash and created a verified copy, but did not finish rename, relocation
or close/reopen. Opening the copy in TextEdit changed foreground focus. QA is stopped.
Nothing new was published; the last published Mac pilot is alpha.24.

## Current signed candidate

| Identity                   | Value                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Version                    | `0.1.0-alpha.110`                                                                                                            |
| Source                     | `5a58dfff600a6886e35e59a27f1e57d026944f27`, no source diff                                                                   |
| Installed ASAR SHA-256     | `127b09f4888a9531f73f49d47b072ec0e651205f920dc642b6a04bd57baacc70`                                                           |
| Private evidence directory | `alpha110-main-thread-rollback`                                                                                              |
| Package                    | Developer ID signed arm64; packaged-runtime verification passed; not notarized                                               |
| Local pilot gate           | 1,996 desktop (22 skipped), 46 Electron (5 skipped), 40 renderer, 72 phone-browser; native/shared/build/static checks passed |

The private directory retains the package/install receipts, logs, exact per-turn trajectory,
screenshots, original/copy hashes and result. CI is a separate gate; local results do not establish
that the latest remote commit passed.

## Signed workflow result

1. The controlled regression reset the visible Finder Go to Folder panel and reopened it once.
   Unlike alpha.109, the call returned and the app remained alive. Return navigated to the
   iCloud TextEdit folder. A right-click selected the file but exposed no visible context menu.
2. After an operator continuation prompt, Cmd+D created **Untitled 8 copy.rtf**. Independent
   filesystem inspection found both files at 1,874 bytes with identical SHA-256:
   `bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`.
   Return did not visibly start filename editing, so the model stopped before typing.
3. After another continuation, Cmd+O opened the copy in TextEdit. Initial inventory marked no
   permitted app active; the later inventory marked TextEdit active. Its next input was refused
   before dispatch. No requested local destination, rename, close or reopen was completed.

The original and copy remain in the TextEdit iCloud Documents folder. Do not duplicate the copy
again or overwrite either. The requested `Sia-Arena-handoff-checklist-alpha110.rtf` does not exist.
The operator inspected and cancelled Finder’s File menu between turns; no operator file write
or target focus rescue occurred. Continuation prompts make this a controlled regression, not
unassisted acceptance. Clipboard preservation and uninterrupted foreground preservation were not
independently sampled. QA was quit through CUA after the final pause.

## Current correction

Alpha.110 fixed self-process AXRaise on a Rust worker thread by sharing the existing bounded
AppKit main-queue dispatcher with focus rollback. Alpha.109’s signed crash report identified
that call and the assertion “Must only be used from the main thread.” The signed repeat above
passed that crash regression; it does not establish completion of the file task.

Alpha.111 source also gives menu-equivalent dispatch the existing bounded window-change observer.
That route previously returned before the observer was armed, leaving cross-app opens unguarded.
The targeted guard remains for the source app. Crash recovery now asks the person to check the
last action, instead of claiming retry is safe. All local pilot stages passed with the counts
above. The first Electron run caught an outdated recovery-message assertion; after correcting
it, the complete Electron, renderer and phone stages passed. A signed repeat remains pending.

## Other retained evidence

- **Finder observation:** signed alpha.107 captured Applications windows containing openable
  1Password filenames. Credential controls still remain protected. The narrow filename-classifier
  fix passed; it did not complete the copy task.
- **Typing and Stop:** alpha.95 wrote the 1,469-character checklist in 64.690 seconds. Alpha.96
  stopped at 485 characters, remained unchanged nearly three minutes, then completed without
  duplication. TextEdit autosaved the draft to iCloud; local Save/close/reopen was not verified.
- **Responsiveness:** alpha.95 CUA composer round trips had median 649.5 ms and worst 1,205 ms
  across ten samples. Alpha.96 Stop took 1,233 ms. These limited samples are not end-to-end
  performance or concurrency acceptance.
- **Reviewer brief:** alpha.85 saved and closed a 444-word, 3,303-byte brief in 74.277 seconds.
  Reopen failed. SHA-256: `b24e378ad6d7822456a7cf973bd34e81aa29e376722d98696ae320710ab7a05c`.
  Preserve that file. Earlier semantic setters and operator-prepared menus do not validate
  vision-only acceptance.

[The previous detailed record](https://github.com/ljang0/sia-v2/blob/5a58dfff600a6886e35e59a27f1e57d026944f27/docs/public-release.md)
retains exact older artifact identities, failed diagnostics and interventions. Progress across
versions does not constitute one complete workflow pass.

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
