# Release status

Updated October 31, 2026. **Distribution is not ready.** Universal alpha.60 passed signing,
notarization and final-DMG installation verification, but its native TextEdit brief stopped at Save.
A parent-document diagnostic also failed. Alpha.59 corrected browser clicks worked; Chrome restart
setup and network-error recovery still failed without an itinerary. Exact-artifact uninterrupted
workflows remain open. The last published Mac pilot is alpha.24; no new distribution is authorized.

The owner selected **Mac first; iPhone follows**. Research sharing stays off and Codex App Server
is the initially admitted engine. The [Arena proposal](./arena-proposal.md) describes a bounded
technical review and invited pilot, without claiming a partnership or validated model ranking.

## Expanded release goal

Owner requirement, October 31: the handoff code must be lean, modular and easy for an external
reviewer to follow. Maintainability is part of release readiness: remove obsolete execution paths
at cutover, keep state ownership and dependency direction explicit, and provide a short route from
model request to authorized input and verified result. The [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path)
identifies the modules and boundaries. Large declarative catalogs alone are not a reason to add
abstraction; mixed responsibilities, duplicate implementations and hidden fallback routes are.

Owner decision, October 31: **vision-only computer use is the default throughout Sia**, not an
Arena-only option. This is a new implementation and acceptance requirement; alpha.56 still uses
assisted DOM/accessibility control and does not satisfy it. The model must receive screenshots,
choose image coordinates and use pointer/keyboard input. No implicit DOM/AX text, element refs,
OCR or semantic setters may substitute for visual control. Host-side permission, protected-surface,
window identity, stale-image, cancellation and background-focus checks stay enforced.

## Implemented boundaries and current verification

The central production visual policy covers native windows, connected browsers and on-screen
turns. Model-facing schemas provide screenshots, coordinates and keys; provider-native shell/UI
tools, semantic targets, OCR, launcher UI extraction and native-script skill execution are disabled.
Voice activation supplies app identity only, and persisted activation context is sanitized. Host
checks still enforce permissions, protected surfaces, exact window/tab identity, screenshot
freshness, cancellation and background focus. Explicit file/connector tools remain separate.
The [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path) explains ownership;
the [native patch guide](../apps/desktop/native/cua/README.md) covers the pinned driver and regressions.
Remaining assisted branches are internal test seams to retire after visual cutover acceptance.

Alpha.59's restricted coordinate regression failed with the original allowlist lookup and passed
with the correction; a live Visit-menu click confirmed that fix. The artifact record retains the
prior package, gate and intervention evidence.

The fresh signed outing needed Chrome reconnection, then failed after a restaurant network timeout.
Continue and a diagnostic restart did not restore reading of the settled error page; diagnostics
identify `Page.getFrameTree`. One setup attempt also failed to dismiss the approved Chrome prompt.
Ten CUA navigation samples measured median 946.5 ms / worst 1,199 ms; separately typed TextEdit
notes remained intact. These limited observations do not establish completed concurrent work,
clipboard preservation or acceptable end-to-end performance. See the
[artifact record](./public-release.md) for exact hashes, interventions and failures.

Alpha.60 source corrects a native focus mismatch: observation mapped an attached Save sheet to its
parent document, while keyboard priming still compared the raw sheet ID. The correction requires
matching window/element ownership and retains raw IDs for restoration. Thirteen key-focus
regressions pass, including a new sheet case that failed with the old comparison. The full local
pilot gate passed: 1,950 desktop, 249 native browser, 46 Electron, 40 renderer and 72 phone-browser
tests, plus build/static/shared checks and 12 exact-target ownership tests. The signed universal
artifact is installed and verified. Live Save/reopen failed: the new Save panel was AX-unresolved,
and a recorded parent-document diagnostic returned needs_foreground. The source regression does
not establish a live fix. Its 444-word brief was preserved by operator CUA, not saved in the
requested workspace by Sia; all interventions are in the artifact record.

Internal signed alpha.65 corrects a separately reproduced sheet point-lookup miss and visibly
expands the Save panel. Collapse still fails after the image geometry changes; Save/reopen remains
unverified. Point resolution has its own bounded native module with six regression cases, separate
from ownership, focus and dispatch. Failed transport experiments and temporary diagnostics were
removed instead of becoming compatibility paths. See the [artifact record](./public-release.md).

Alpha.66's read-only capture diagnostic confirmed an 800-point attached sheet overhanging its
586-point parent; the screenshot API supplied no frame metadata. It also exposed a separate image
handoff failure. Codex received the PNG content item, but its Code Mode wrapper returned text and
image URLs as a string that the model did not render. Alpha.67 source adds provider-local forwarding
instructions and a real-provider image test: the model correctly read four screenshot facts absent
from the prompt and tool text. Signed internal alpha.67 also passed through a fresh Sia assistant:
one new screenshot, four correct image-only facts and correct sheet-overhang recognition, with
zero computer inputs. The full local pilot gate passed. This verifies image handoff, not completed
native work; expanded-sheet coordinate mapping and Save/reopen remain open.

Read-only internal alpha.69 narrowed the coordinate failure: stream metadata reports
`content_scale ≈ 0.7325` and backing scale 2, while `screen_rect` still names the parent window.
Scale alone therefore cannot supply the captured sheet's origin. The next correction must pair
same-frame pixels/metadata with fresh, proven sheet ownership and bounds, and reject stale geometry.
The dependency's frame-status decoder returned null despite other metadata being available.
Temporary probes were removed and signed alpha.67 restored; no input or task acceptance is credited.

Signed internal alpha.70 replaces the size-only coordinate assumption with a shared capture
geometry module and same-sample stream pixels/metadata. Host and native input compare the captured
proof, reject padding and changed sheet geometry, and constrain overhanging sheet clicks to the
owned-sheet press backend. The unproven shell window fallback is removed. The full local pilot gate
passed: 1,952 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus shared/native and
build/static checks. A fresh assistant visibly collapsed and re-expanded the real Save sheet using
two background clicks, each about 1.4 seconds. The requested Save/reopen task then stopped at
Cmd-Shift-G with `needs_foreground/window_not_key`; its output folder remains empty. This verifies
the coordinate correction, not completed native work or distribution readiness. QA was quit before
further source work. The failed alpha.62/.63 keyboard experiments remain excluded.

Signed internal alpha.71 admits coordinate-targeted native keys through the canonical schema and
existing pixel preflight/focus-then-key path. The full pilot gate passed (1,956 desktop tests and
the same Electron, renderer and phone-browser counts). A fresh assistant sent Cmd+A at the visible
filename field; the driver returned `accepted_unverified`, but both subsequent screenshots showed
no visible selection. Sia stopped without typing or saving. Native Save/reopen remains blocked;
schema admission and successful dispatch do not establish working keyboard delivery.

Owner requirement, October 30: the app must demonstrate useful personal desktop work, not merely
pass toy tasks. Calculator, tiny CSVs and fake-service tests are smoke checks, not proof of readiness.
The release requires real-source research and writing, file/document preparation, and planning
workflows with independently verified deliverables on the signed candidate. Test both background
work while the person uses another app and two simultaneous Sia tasks. Measure responsiveness,
task duration, cancellation and recovery; fix failures before claiming out-of-the-box usefulness.

Default Mac setup must guide the person through the access needed for these workflows, including
background Chrome access, and verify it before advertising readiness. macOS/Chrome consent still
belongs to the person. Existing grants should be reused without repeated setup; denied, revoked
or expired access needs an actionable recovery control rather than a raw driver error. Detailed
scenarios and evidence requirements are in [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use).

## Evidence and remaining gates

| Area | Verified evidence | Still required |
| --- | --- | --- |
| Source | Alpha.67 full local pilot gate passed, including six sheet-point regressions; the opt-in real-provider image test also passed. Alpha.60 exact-source CI passed. | Latest candidate exact-source CI and successful exact-artifact real-task repeats. |
| Signed package | Universal vision-only alpha.60 passed signing, notarization, stapling, Gatekeeper, packaged runtime and mounted-DMG installation checks. | Repeat failed real workflows after recovery fixes. |
| Useful work | Alpha.57 saved a source-checked three-dinner plan and consolidated groceries after recovery; previews loaded. Alpha.60 typed a real reviewer brief, but Save and the parent-document diagnostic failed. | Unattended browser recovery, native Save/reopen and the sourced outing (alpha.59 stopped on network-error recovery). |
| Background/concurrency | Alpha.59 delivered browser clicks/scrolls while separate supervisor-typed notes remained intact; ten CUA navigation samples median 946.5 ms / worst 1,199 ms. Earlier assisted-mode Stop/recovery evidence is retained in history. | Two completed Sia tasks, contention, Stop/recovery, focus and clipboard preservation on the final artifact. |
| Setup/recovery | Alpha.59 resumed the saved request after explicit connection; relaunch still required setup and one prompt-dismissal attempt failed. | Reliable restart/expiry and prompt dismissal; clean-account setup. No fresh account or second Mac is available. |
| Physical use | Existing grants work on the QA Mac. | Keep-awake, lock/sleep and voice. This Mac refuses Sia and independent caffeinate display-awake assertions. |
| Cloud | October 30: 18 alarms OK, five Lambdas Active/Successful; anonymous protected requests return 401. Synthetic authenticated rating reached the report. | Recheck changed configuration before invitations. |
| Ownership | Source rights confirmed; Lawrence Jang owns support/incidents. | Private recipient list and final release decision before invitations. |
| iPhone | Build 31 Ready to Test internally; tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. |

See [exact artifact evidence](./public-release.md) for hashes, timings and retained failures.
Alpha.51 refuses known new-context link clicks before input, then explains existing-tab navigation
from observed URLs. It does not disable the focus guard or grant control of another tab.

Default Mac setup includes Chrome with a deliberate opt-out. Choosing a window authorizes its
explicit connection setup, including Chrome's exact prompt. Task tools cannot approve permission
dialogs. macOS grants remain person-owned. Expiry, revocation and restart need actionable recovery.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
