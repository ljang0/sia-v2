# Distribution acceptance record

Updated November 1, 2026. **Distribution is not ready.** The installed internal QA app is signed
arm64 alpha.76, not notarized. The latest verified universal distribution artifact is alpha.60;
its real task failed. Nothing new was published; the last published Mac pilot is alpha.24.

## Current popup capture finding

A read-only alpha.79 probe identified the omitted popup as a **separate layer-101 window owned by
Apple's AppKit Open/Save Panel service**, not TextEdit. Its WindowServer bounds exactly matched the
AX menu geometry under the proven document sheet. The menu's ancestry named the document, but its
raw AX window ID was absent. Sia still returned an image without the prepared popup.

The operator opened the popup through CUA. The first screenshot may have preceded preparation; a
second read was refused for an expired prior-turn grant. A third read refreshed inventory and
recorded the metadata with the menu already open. Sia sent no input. The operator then cancelled
only the menu and quit QA. Nothing was typed, navigated, saved, closed or reopened. Six sheet
regressions and signed-package checks passed; this is diagnostic evidence, not workflow acceptance.

Private `alpha79-popup-geometry` retains all three turns, screenshots, content-free metadata,
source diff and package/restoration receipts. Thread: `3c746ef6-8aa4-499d-b703-775bd997f45b`.
Source base `bcc050e2de3c3975d3dd88be060a384fa91d7f88`; diff
`4bc491d9a0f3625611a187c12954857d7a4661e456d4ba90a596170e1fb490d6`; trial ASAR
`9a845774e1ae1802df74ac4ef4d237e3b1c680d681feced464920e035a9a574f`.
The temporary probe was removed and signed alpha.76 restored with its exact hash and signature.

## Reverted popup diagnostics

Neither experiment fixed the real Save-sheet popup. Both were signed internal arm64 builds, not
notarized candidates. The exact source and installed signed alpha.76 app were restored after each;
ASAR identity and strict signatures were verified. No experimental runtime fallback remains.

| Trial    | Change and checks                                                                                           | Live result                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Alpha.77 | Include child windows in exact-window capture; 28 capture regressions passed.                               | 22.466 seconds; one coordinate click and follow-up image showed no menu. Post-task operator popup click also had no visible effect. |
| Alpha.78 | Reuse native key-window preparation and focus suppression for coordinate AX presses; 17 click tests passed. | 19.110 seconds; one coordinate click acknowledged, but no popup in image or subsequent AX read.                                     |

After alpha.78 completed, operator CUA activated TextEdit through its app menu and clicked the
folder popup once. AX then exposed its menu, but the window screenshot still omitted it. The
operator cancelled only that menu and quit QA. No text, navigation, Save, close or reopen occurred;
no operator TextEdit input occurred during either assistant turn. This isolates an additional
capture gap without establishing successful background popup creation. Twenty read-only foreground
samples changed among Sia, FaceTime, Messages and Slack; their cause is unproven, and this run
does not establish foreground preservation. The next investigation is
exact ownership and capture of separate popup windows, not a semantic substitute for pixels.

Private `alpha77-child-menu` and `alpha78-point-focus` retain prompts, traces, screenshots, package
and restoration receipts, source diffs and test logs. Alpha.78 thread:
`96a149c0-ab46-4403-b1a7-bb1678b922a7`. These diagnostics are not completed useful work.

| Trial    | Source base                                | Diff SHA-256                                                       | ASAR SHA-256                                                       |
| -------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Alpha.77 | `fb683c2a2287cade539e9bd54cc65af31d608df0` | `6e1f038c243d8408b6cf1a0870443b661f2cf3790d72114c4682492aa6b5ca45` | `271fce90cf5ea585e20a38333935eb2cd3095336f100188e13afacdd81f9e8e8` |
| Alpha.78 | `a24282ce34cb6302559253ae0f9dd5a55d63a6b1` | `b7dd21146dad6c5c5603ab5700b2687a6313aa3a9f22cc65a788bb5d6022f854` | `b767afadad0aaa18973cc1d417d3bc49c6ab15c9fc09ccbff8a678e69ad84439` |

## Latest fully regression-tested build

| Identity               | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Version                | `0.1.0-alpha.76`                                                   |
| Source base            | `39163bb497b7ce75c4dd0e49e33919b3e01fc819`                         |
| Captured source diff   | `e8c57d78edb7121075294c496be377975197c3779faefc652bd5124c2e97d9e9` |
| Installed ASAR SHA-256 | `f0acb1a3b67ac7ca1270fb454c7d3255940ae8e4f38379898cdc3a82e830f72e` |
| Evidence directory     | Private `alpha76-visual-typing`                                    |

Developer ID signature and packaged runtime checks passed. Native checks and 51 focused host tests
passed. The full current local pilot gate passed: 1,958 desktop, 46 Electron, 40 renderer and
72 phone-browser tests, plus native/shared/build/static checks. [Runtime-commit CI](https://github.com/ljang0/sia-v2/actions/runs/41260487890)
passed, including unsigned universal packaging; signing/notarization was skipped. These checks do not establish real task skill.

The current changes bind native menu shortcuts to the exact document/attached-sheet context after
field focus, under one process lease. Modal commands must be enabled; disabled modal Save cannot
fall through to a scripted parent save. Visual typing uses keyboard events only, with no AX text
setter or value readback. The native gate includes these modules, shortcut matching and legacy
keyboard regressions. Failed transport experiments are not retained as runtime fallbacks.

## Alpha.76 real workflow and diagnostic

A fresh conversation used GPT-6-Astra through the ChatGPT plan. The request was to finish the existing
444-word Arena reviewer brief in TextEdit, save it to a prepared empty folder, close only that
document, reopen it and verify its title/opening text. Ordinary UI recovery was allowed, without
changing background delivery or bypassing access refusals. No file-writing/script substitute was allowed.

- The real task ran for **49.981 seconds** and failed at destination navigation. A coordinate-targeted
  Cmd-Shift-G had an uncertain acknowledgement; the folder popup click returned accepted/unverified;
  a later Cmd-Shift-G used synthetic events. No usable menu or destination appeared in the images.
  No text insertion, Save, close or reopen occurred. The output folder remains empty.
- **Forty read-only frontmost samples over 40 seconds all identified Sia.** This bounds the observed
  foreground behavior; it is not proof of zero transient changes, clipboard preservation or concurrency.
- After the task ended, operator CUA read the same TextEdit state. An AX folder menu existed but was
  absent from both screenshot sources. The operator cancelled that exact menu without editing text
  or navigating. This intervention is excluded from task acceptance.
- A separate **18.371-second** typing diagnostic attempted one screenshot-targeted Cmd+A. It used
  synthetic events, showed no selection and stopped before typing. Keyboard-only insertion remains
  live-unverified. The earlier alpha.75 menu-selection result is not repeatable acceptance.
- QA was quit through CUA before further builds/tests. The Save sheet remains open with the alpha.75
  filename. Both prompts, traces, images, focus samples, receipts and results are retained privately.

Real-work thread: `2fd733d0-75c0-4c01-bc9a-a7f17b697595`; diagnostic thread:
`cc299327-3aa1-44c1-bf43-6229dddce0b8`. No operator TextEdit input occurred during either assistant turn.
The next capture investigation is exact-owned child-menu inclusion and geometry, not exposing AX
labels or using a semantic navigation fallback.

## Evidence leading to the current change

| Build    | Observation and disposition                                                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Alpha.74 | Application-targeted AX keyboard API calls all succeeded, but Cmd+A showed no selection (2,006 ms; 18.313-second turn). A later operator menu Select All worked and activated TextEdit. The operator cleared selection with Right. The experiment was removed and signed alpha.71 restored; no background acceptance.                      |
| Alpha.75 | Native menu Cmd+A visibly selected the filename once (1,854 ms). Text replacement used AXSelectedText and is excluded from strict visual acceptance. Cmd-Shift-G produced no folder panel (1,432 ms). The 43.047-second task stopped without Save/close/reopen. A usage-limit banner appeared, but the turn continued to a final response. |

Both builds use source base `39163bb497b7ce75c4dd0e49e33919b3e01fc819`.
Private `alpha74-application-key` and `alpha75-modal-menu` retain their complete receipts and interventions.

| Build    | Captured diff SHA-256                                              | ASAR SHA-256                                                       |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Alpha.74 | `568bff26a34ee5aa360918d0f00f5d80ea0891621c6e9ddd725c59ef730c9d54` | `4c16994db0bb5a51e643d19afbdbcb554736c2b2d86776bf87ebbae9cc75f559` |
| Alpha.75 | `00b71bc5aef08d540f7bc7ae8aa61cb79aba254842d4787cdeb9504d5338834d` | `2eae4560633dce306b3c1d3cc70f12d8b3b8bf4c1f4a5f84a28a75e71d125e76` |

Focused/native/package checks passed for these internal experiments. They were not notarized and
were not full pilot acceptance. [Earlier detailed records](https://github.com/ljang0/sia-v2/blob/39163bb497b7ce75c4dd0e49e33919b3e01fc819/docs/public-release.md)
retain alpha.60–.73 hashes, failed transport experiments and operator interventions.

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
