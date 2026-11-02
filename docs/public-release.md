# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** Signed internal arm64 alpha.116
completed a native capture diagnostic but still fails the document handoff. Alpha.115 completed
two useful planning outputs with setup and review interventions. Concurrency acceptance remains open.
Nothing new was published; the last published Mac pilot is alpha.24.

## Current signed candidate

| Identity                   | Value                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Version                    | `0.1.0-alpha.116`                                                                                                              |
| Source                     | `3d9c65db0d8aca2c5fecd0a020e3edf95dea3ce8`, no source diff                                                                     |
| Installed ASAR SHA-256     | `28142d0f14e125cb0596222b68c944f38aaf3b9d0770dcf07360eadfd5b582bf`                                                             |
| Private evidence directory | `alpha116-capture-diagnostics`                                                                                                 |
| Package                    | Developer ID signed arm64; packaged-runtime verification passed; not notarized                                                 |
| Local pilot gate           | Full pilot command passed: 2,003 desktop, 46 Electron, 48 renderer, 72 phone-browser; native/shared/build/static checks passed |

The private directory retains package/install receipts, logs, per-turn trajectories, screenshots,
native observations and result. Planning outputs remain in `alpha115-scrolled-browser-point`. Alpha.112 reopen evidence and original/copy hashes remain
in `alpha112-cross-app-rollback`. CI is a separate gate; local results do not establish
that the latest remote commit passed.

## Signed alpha.116 native diagnosis

Alpha.116 changes only bounded capture diagnostics. Turn `ffb0593b-5e6d-48e0-b5ac-11b52a468545`
obtained a fresh checklist screenshot with `on_current_space=true` and `is_on_screen=true`.
The previous post-unlock alpha.115 check had both flags false and refused capture. The cause of
the intervening Space change is unknown; this is not proof of a capture correction.

Resumed handoff turn `3fe00913-a5ee-46d7-9e6c-dd483baa4084` stopped before typing because selecting
an already-selected name produced no visible change. Operator guidance clarified that case.
Turn `6151c09a-9d42-4c55-a38e-c016561c7039` then issued one literal filename replacement;
the accepted event left the visible Name field unchanged.

A separate pointer-focus comparison, turn `6750c7e1-5722-4da3-854e-d12f7c21e9a5`, clicked the
visible Name field. The screenshot instead showed the popover dismissed and a caret at the
start of the document. Sia stopped before Command+A or typing. Independent screenshot review
confirmed that result; both original/copy files remain at 1,874 bytes with the recorded hash.
Rename, move and reopen remain incomplete. Focus/clipboard preservation was not independently
measured. Prompts, trajectories, screenshots and checks are retained in the private evidence
folder. QA was quit through CUA before further code work.

## Signed alpha.112 workflow results

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
The signed alpha.113 package and installed ASAR were verified. Startup remained on Loading Sia
until an operator CUA Command+R reload. Disk space was low; the cause is not established. Only
rebuildable native incremental cache and hash-verified duplicate QA backups were removed, with
receipts retained. Chrome reconnection required selecting the titled window after the unnamed
choice failed exact-target verification. No permission dialog was observed.

A resumed turn initially selected an unrelated tab; navigation was refused before input because
Chrome was active. An explicit recovery prompt selected the existing museum tab by its known URL.
With FaceTime active, screenshot capture and coordinate scrolling succeeded; a navigation click
returned `browser_action_unavailable`, and the subsequent screenshot showed no change. No plan
was saved. This is neither Chrome-active input acceptance nor two completed simultaneous tasks.
The start-page correction itself was not exercised because the resumed tab was already a web page.
Trajectories, images and interventions are retained in `alpha113-browser-navigation`.

Alpha.114 corrects recovery instructions that recommended a hidden assisted-only tab option. It
uses existing prepare-only tab discovery without navigating. Two regressions also exposed lost
browser refusal diagnostics: native action dispatch projects the message into `error.hint`, while
Sia read only the producer envelope. The host now recognizes both, exposing only fixed diagnostic
codes. The tests fail before the fix and pass afterward; the full pilot command passed
2,000 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static
checks. The signed alpha.114 artifact verified this correction: turn
`a255b1a2-195c-4fd1-8a5d-047b5874d086` captured the exact museum page, then refused the visible
Visit click at original-image coordinates (1142, 101) with `browser_point_context_unavailable`.
No input was sent; the agent stopped as instructed. A prior resume again encountered browser
consent/target refusal and needed the operator's inline connection and titled-window selection.
Startup cleared normally without a reload. No plan was saved. Package/install receipts,
trajectories, screenshot and failure record are retained in `alpha114-browser-diagnostics`.

A Chromium regression reproduced the point failure after scrolling in both active and inactive
tabs. Adding the document scroll offset allowed validation of the intended new-window link.
Alpha.115 source adds the live document offset only for this safety hit test. Mouse input retains
the model-selected viewport point. Native regressions cover click, double/right click and drag,
plus malformed/out-of-bounds geometry; the scroll regression failed before the correction. Eleven
Chromium preflight cases pass, including active/inactive tabs, scroll and pinch scale. The full
alpha.115 pilot command passed: 2,000 desktop, 46 Electron, 48 renderer and 72 phone-browser tests,
plus native/shared/build/static checks. Initial runs caught release-table formatting and a missing
null check in the new test fixture; both were corrected before the complete passing run. The
alpha.114 remote CI failure was the same documentation formatting issue, now corrected. Signed
real-work verification now confirms the formerly refused scrolled Visit click succeeds.

## Signed alpha.115 practical planning result

After inline Chrome reconnection and selecting the titled window, turn
`a0cd9bb5-89fd-4cb5-b3ca-76c076c7f452` completed in 481.146 seconds. Screenshot-based research
covered official museum hours, the November 7 12:30 PM adult ticket ($25), restaurant availability
and Café Carnegie menu prices. The agent handled a suspended site, refused new-context link,
stale observations and conflicting café closing times without an operator clicking the browser.
It saved and read back a $97 two-person itinerary with a rainy-day alternative and labeled estimates.

The first draft violated the vegetarian requirement by recommending a turkey-and-bacon sandwich
in its main schedule. An explicit review prompt corrected the default to two $16 vegetarian salads
in 24.855 seconds, preserving the budget. The corrected 5,322-byte file was independently read,
opened in Sia Preview, closed and reopened; captured source images confirm the meal price and
dated ticket selection. SHA-256: `0be71f91f4453a9dd667179eda3fa9163347dfebe86fa0b89a4c41a4e1e94849`.
Before/after files, all three turn records and screenshots are retained in
`alpha115-scrolled-browser-point`. Startup needed no reload.

This is completed useful work **with connection and content-review interventions**, not an
unassisted pass. Continuous focus/clipboard preservation and two completed simultaneous tasks
were not independently established. No purchase, reservation or invitation occurred.

## Signed alpha.115 dinner planning and native overlap

A second real task researched three vegetarian dinners and consolidated their ingredients from
published Good Food and Budget Bytes pages. After Chrome reconnection and explicit permission to
reuse the completed museum test tab, turn `b9048d95-d8c5-46a1-849f-d8fae8d8db97` saved and read
back the plan in 204.931 seconds. Independent screenshot review checked recipe servings,
ingredients and 35/15/25-minute publisher totals; arithmetic and unspecified quantities were
checked against the saved file. Sia Preview closed and reopened correctly.

The exact two-serving quesadilla scaling produced awkward fifths and a light portion. An operator
review relaxed that recipe to a half batch: two quesadillas per adult and one leftover. Sia updated
all affected shopping quantities and read back the file in 47.257 seconds; independent review
confirmed the ratios and shared garlic total. Revised file: 6,702 bytes, SHA-256
`e3fb2eb00a3747039cbe64a25089c6c1b5b5eff1e70a5984cf97410209e0743b`.
This is a second saved practical result with setup/review intervention, not an unassisted pass.
Before/after files, trajectories and source screenshots remain in the alpha.115 evidence folder.

The native handoff retry overlapped meal research but did not complete. Inventory reported the
preserved TextEdit copy off screen and off the current Space; capture returned
`visual_observation_unavailable` before input. Operator CUA Raise and exact Window-menu selection
did not restore Sia capture. CUA's separate document screenshot is not evidence that Sia's route
works. Three attempts stopped without native input; original and copy hashes remain unchanged.
No successful concurrent pair or continuous focus/clipboard measurement was established. A final
read-only capture after relaunch with retained logging failed the same way. Runtime diagnostics
include `capture_surface_unproven` and `capture_unavailable`; they are not individually correlated
to model calls and do not establish a root cause. QA is stopped for the next repair.

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
