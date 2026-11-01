# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed internal arm64 alpha.112
reopened the preserved checklist copy through two input routes without a reported focus interruption.
The handoff still fails at rename; a fresh browser planning task also remains incomplete. QA is stopped.
Nothing new was published; the last published Mac pilot is alpha.24.

## Current signed candidate

| Identity                   | Value                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version                    | `0.1.0-alpha.112`                                                                                                                                           |
| Source                     | `eed169b03fd57e7a031a03cb8504c9de70c0ebc8`, no source diff                                                                                                  |
| Installed ASAR SHA-256     | `37c1a2d9a095f5e3c7aa767f698850433bf4c3dacdf57cd104ad8a2f5e668d13`                                                                                          |
| Private evidence directory | `alpha112-cross-app-rollback`                                                                                                                               |
| Package                    | Developer ID signed arm64; packaged-runtime verification passed; not notarized                                                                              |
| Local pilot gate           | Full `pnpm test:pilot` passed: 1,996 desktop (22 skipped), 46 Electron (5 skipped), 40 renderer, 72 phone-browser; native/shared/build/static checks passed |

The private directory retains package/install receipts, logs, per-turn trajectories, screenshots,
original/copy hashes and the reopen result. CI is a separate gate; local results do not establish
that the latest remote commit passed.

## Signed workflow results

1. The first controlled reopen attempt closed only **Untitled 8 copy**, then clicked its already-selected
   filename in Finder. This entered filename editing; the agent stopped at an ambiguous keyboard route.
2. An explicit recovery prompt directed the agent to use visible pointer controls to exit that state
   and select the icon. Command+O reopened the copy without a reported focus interruption.
3. A separate prompt directed another close/reopen using an icon double-click. It also reopened the copy
   without a reported focus interruption. Independent inspection of both result images confirmed the
   checklist heading through its final release-decision sentence. The target appeared inactive.
4. Continuing the actual handoff opened TextEdit’s document controls, but keyboard typing did not
   visibly change the selected Name field. The agent stopped without committing or repeating the rename.
5. A fresh practical planning task requested a November 7 CMU/museum/lunch itinerary for two under $100.
   It overlapped the native turn, then encountered `browser_consent_required` and `browser_wrong_target_refused`.
   The operator clicked the inline **Connect Chrome & continue** control. Reconnection resumed the saved
   request, but accepted navigation was followed by repeated stale start-page tab choices. No plan was saved.

No operator input was sent to Finder or TextEdit. The recovery prompts and Chrome connection click
are interventions; these results are not unassisted acceptance. Two completed simultaneous tasks,
continuous foreground preservation and clipboard preservation were not established. QA was quit
through CUA before source repair and automated testing.

The original and copy remain at 1,874 bytes with identical SHA-256:
`bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`.
The requested `Sia-Arena-handoff-checklist-alpha112.rtf` does not exist. Preserve both existing
files; do not duplicate again or overwrite either. Rename and relocation are still required.
Earlier evidence remains in `alpha110-main-thread-rollback` and `alpha111-cross-app-menu`.

## Current corrections

Alpha.110 moved self-process AppKit focus rollback onto the existing bounded main-queue dispatcher,
fixing the signed alpha.109 crash. Alpha.111 armed the existing window observer for menu equivalents
and corrected unsafe crash-retry wording. Alpha.112 retained early-detection focus leases through
the existing deadline and shared exact-window rollback. The early-change regression failed on the
prior implementation; the full pilot command and the two signed reopen paths above passed.
The initial build rejected a differently formatted patch; canonical Git diff regeneration fixed it.

The planning failure exposed cached `navigationOnly` metadata surviving accepted navigation when
its first observation was delayed or redirected. Subsequent screenshots returned the old chooser
without attempting a fresh page read. Alpha.113 clears that classification after accepted navigation,
retains the exact tab/session binding and requires the normal live-URL/screenshot checks before input.
Both regressions fail on prior source and pass with the fix. All local alpha.113 pilot stages passed:
1,998 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static
checks. The full command reached the last stage but one phone fixture failed to create its temporary
directory with ENOSPC. After storage recovery, the complete phone suite passed without source changes.
Signed verification is pending; this does not yet establish a completed browser workflow.

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
