# Release status

Updated November 5, 2026. **Public 1.0 is not ready.** The retained signed internal app still
fails background typing in TextEdit's Open dialog and Slack's directory filter. A navigation-only
Slack test also captured an unintended message screenshot; its authorized local and AWS cleanup
is complete. Neither an RA installer nor a public release has been approved or published.

## Public Mac 1.0 goal

The owner's November 5 request expands the previous bounded RA milestone to a public Mac release.
Mac remains first; iPhone follows. Vision-only computer use, background operation, automatic task
authorization after initial setup, and disclosed default AWS recording remain requirements.
A new version number or signed installer does not establish readiness.

The release decision has five gates:

1. **Useful work:** ordinary requests complete browser research and native document tasks on the
   exact candidate, with independently checked outputs and preserved sources. Repeat from fresh
   conversations without task-time rescue. Resolve the native Open-panel and text-entry failures.
2. **Background isolation and responsiveness:** the person can continue typing in another app
   without changed focus, text or clipboard. Sia's own controls work through CUA. Verify independent
   simultaneous tasks, same-window contention, Stop and recovery. Measure startup, local UI feedback,
   pauses, retries and task durations using the targets in [manual acceptance](./manual-acceptance.md).
3. **First use and recovery:** verify a clean macOS account or second Mac, upgrade, cold launch,
   account sign-in, grant reuse, browser recovery, sleep/lock and the offered voice flow. macOS grants
   remain person-approved. Fresh-account access is currently unavailable; Intel runtime is unverified.
4. **Recording and task scope:** match automatic AWS prompts, usage, actions, screenshots and
   terminal outcomes to the actual task. Verify pause, resume, opt-out and deletion during running
   tasks. Prevent observations outside an explicitly restricted task surface. The Slack capture
   mismatch remains unresolved; deleting its records does not repair it.
5. **Distributable artifact:** build one signed, notarized, stapled DMG only after the functional
   gates pass; verify its exact bytes, clean install, update/rollback and release configuration.
   Provide a short setup guide, accurate limits, a reviewable codebase and the Arena technical-review
   proposal. Lawrence owns support and incidents. Publication and outreach are separate from prep.

Work only on an open gate: identify an evidenced defect, make a targeted repair, and rerun the
failing path. Automated checks protect changes; they do not replace useful live acceptance.
Do not repeat failed transport variants, remove safety checks, introduce semantic UI fallbacks,
or count manually rescued runs as passes. Keep unsuccessful trials out of the retained runtime.

## Recording-control repair

A controller-level regression reproduced three cases: pause then resume, decline then re-consent,
and delete then re-consent while the same task was still running. Raw recording resumed for that
interrupted task. Pause and decline retained its earlier staged raw events; deletion allowed its
later events to recreate a recording.

The repair excludes pending turns until their runners finish and discards both staged formats.
New tasks still record after Resume. All three regressions failed before and passed after the
repair; the adjacent recording, finalization and account suite passed (37 tests). The full
`pnpm test:pilot` gate passed: 2,126 desktop unit tests, 46 desktop E2E, 48 renderer and 72 companion
checks, plus build/static/shared/cloud/native checks (23 desktop unit and five E2E skips). Private
log: `public-readiness-pilot.log`. This source change is installed in `f83319c`; live pause/resume/delete verification remains open and does
not resolve the navigation-only screenshot failure. The separate local diagnostic log remains
controlled by its existing Computer setting; Privacy now makes that distinction explicit.

## Dependency audit

The current audit passes the high/critical threshold but reports two moderate build-tool
advisories: [glob cancellation](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) through rimraf,
and [minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) through
linting and packaging tools. No dependency versions were changed in this repair. The minimatch
fix requires version 11, whose upstream changelog removes APIs; a blanket major-version override
has not been validated. These findings remain open in the public release audit.

## Latest useful-task and UI observation

Signed `f83319c` corrects coordinate focus so vision keyboard input uses pointer clicks, preserving
host-only editable-field and exact-window checks. The ordinary TextEdit copy-and-edit request
opened a duplicate in the background, then failed after 60.828 seconds because capture could not
match its popover (`popover_window_unmatched`). No save or content edit occurred; all seven
protected RTFs remain unchanged. AWS matched the prompt, nine actions, three PNGs, 22 usage
records and terminal failure. No operator rescue or concurrent typing check occurred.

CUA typed the complete request into Sia, but it appeared only after Open Sia brought the window
forward. Production background throttling differs from the test harness, which disables it.
The renderer repair is under test; it does not resolve native popup capture or establish input isolation.
Details and exact installed identity are in the [distribution record](./public-release.md).

## Current native blocker

The ordinary Saturday comparison on signed `d67df60` failed after 70.369 seconds. TextEdit
opened its standard Open dialog, but background Cmd+Shift+G and directory-popup input had no
visible effect. No source was opened and no RTF was created. Post-terminal inspection confirmed
the sheet was absent; this run is not a missed-sheet screenshot. All eight sources and both
additions to an unrelated Chrome draft survived. Continuous focus and clipboard isolation are
not established. AWS matches nine actions, seven screenshots and 20 usage events in one
73-record encrypted batch with one finalization (`dialog-focus-acceptance.json`).

A separate bounded comparison on the same signed build used **On my screen** with the same
still-open dialog. One foreground Cmd+Shift+G opened Go to Folder, verified by Sia's fresh
screenshot. It entered no text and opened no file. The comparison took 45.733 seconds; AWS
matches five actions, three screenshots and 12 usage events in one 39-record batch with one
finalization (`dialog-foreground-comparison.json`). Operator cleanup closed both dialogs and
restored **Work in background → Pause and tell me**. This proves a background/foreground
routing difference, not useful-task completion or background acceptance.

The retained cleanup correction re-reads the app's focused window before restoring the prior
window. If an action or the person has selected another window, cleanup preserves that newer
choice. The regression failed before the fix by selecting the old document over a newly opened
panel, then passed; ordinary restoration and wrong-window refusals remain covered. The finding
is also described in [upstream PR #5770](https://github.com/trycua/cua/pull/5770). Only the
focus-lifetime correction is included, not that PR's broader menu activation changes. Its
causal role in this live Open-panel failure remains unproved.

A subsequent signed trial, `6953337`, prepared the exact native window with target-only focus
and make-key records before the unchanged PID-addressed shortcut, then restored its inactive
state. The ordinary task still failed after 76.808 seconds. The preparation and focus checks
completed, but Go to Folder did not appear. All eight protected files and unrelated typing
survived; AWS matched ten actions, eight screenshots and 22 usage events in two batches with
one finalization. The trial was removed, and signed `d67df60` was restored at 11:56:32 UTC.
Receipt: `native-key-preparation-acceptance.json`. Additional key-window preparation alone is
not sufficient; do not repeat it or combine it with an already failed transport variant without
new causal evidence.

The actual event destination and remote Open/Save panel's handling of background events remain
unresolved. The existing background click prologue already uses activation without defocusing
the user's front app. Do not guess a service PID, relax exact-window guards, silently use
foreground control or repeat unchanged task loops.

A logging-only signed diagnostic, `9cd0718`, reproduced the missing Go to Folder dialog in
56.948 seconds. Five guard entries were observed, with **zero** order restorations, activation
reversals or keyboard-focus theft releases. Those guard interventions did not cause this run's
failure; do not disable them as a workaround. The diagnostic changed no files, preserved the
unrelated draft and matched AWS (seven actions, five screenshots, 16 usage events, one 51-record
batch and one finalization). Logging was removed and signed `d67df60` restored at 12:11:56 UTC.
Receipt: `focus-guard-diagnostic-result.json`. This is diagnostic evidence, not useful-task
acceptance. The owner requested that the sanitized upstream report remain private; nothing was
sent. It identifies the patched host and does not claim a clean upstream reproduction.

A final logging-only check, `e8d47b5`, resolved the exact WindowServer owner without an AX proxy
or caller-PID fallback. The owner matched the keyboard destination, but Go to Folder still did
not appear (55.428 seconds). This rules out that specific owner/destination mismatch in the run;
it does not prove how AppKit forwards or consumes the event. All eight files were unchanged.
AWS matched seven actions, five PNGs, 16 usage events and one 51-record batch. No concurrent
typing check was performed. The trial needed the normal Open Sia menu to reveal its initially
blank window. Logging was removed and signed `d67df60` restored at 13:24:47 UTC
(`window-server-owner-result.json`). No new functional fix or demo acceptance is claimed.

The earlier native menu-key transport trial `770360e` did not fix the task and was removed,
along with temporary ownership logging. The `9e7e436` diagnostic reported the focused input
under TextEdit's PID without a raw window ID; that cannot rule out a remote AX proxy. Envelope,
public-event and filename-transport trials also failed. Do not repeat those variants without a
new causal distinction. Detailed failed and successful runs remain in the
[distribution acceptance record](./public-release.md), private receipts and Git history.

## Current artifacts

- Installed internal arm64 QA: `f83319c06c16c3e721cedfa67714d627fe6408c2`, Developer ID signed.
  Native regression, desktop build, quality, package/runtime and installed strict-signature
  checks passed. The full pilot gate passed on `cf1ea44` before the latest input change; rerun on retained source. Not notarized; not a DMG.
- Held universal alpha.122 DMG: source `7531ee7f3115265817e8dd56cf081672799bd8f4`, signed,
  notarized, stapled and verified, but missing later fixes. Do not hand it to the RA.
- Exact hashes, installed time, rollback and receipts have one authoritative table in the
  [distribution acceptance record](./public-release.md#current-installed-candidate).

## Current evidence and open gates

| Requirement                      | Evidence                                                                                                                                 | Remaining work                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Useful native work               | Earlier `6b24a04` completed an ordinary Finder/TextEdit checklist in 207 seconds; current Saturday comparison fails in Open              | Fix and repeat the failing document workflow; verify on final DMG                                                                |
| Useful browser work              | Sourced Phipps plan on `bed8a3c` (457 seconds); museum plan after visible restart on `1269df9` (496 seconds)                             | Repeat on final DMG; hidden-startup recovery and unexplained stalls                                                              |
| Reuse access                     | `1269df9` restored the chosen public Chrome connection during visible startup without task-time setup                                    | Hidden/background-only startup and broader recovery                                                                              |
| Input isolation and CUA controls | Latest runs preserve protected files and unrelated typing; Sia composer/settings/Send are CUA-operated; `5bab2f5` Stop settled in 350 ms | Continuous focus/clipboard isolation, unexplained prior filename input and `pwd` → `pwda`, native-write cancellation and latency |
| Automatic AWS recording          | Exact prompts, usage, actions, screenshot bytes and terminal outcomes match useful and failed runs; cancellation has one finalization    | Reverify complete useful runs on final DMG                                                                                       |
| Distribution                     | Older DMG passed signing/notarization/package checks                                                                                     | One final installer with accepted functionality and full pilot gate                                                              |

The full pilot gate passed on `8326bcb`: 2,123 desktop tests (23 skipped), 46 Electron
checks (five skipped), 48 renderer and 72 companion checks, plus build/static/shared/cloud/native
gates (`retained-native-pilot.log`). The desktop, native patch, shared runtime, cloud and
infrastructure source match installed `d67df60`; intervening input trials are removed. Passing tests do not explain the earlier bare-Electron exit,
filename incident or input mismatch; those failures remain in the evidence.

[CI run 407](https://github.com/ljang0/sia-v2/actions/runs/42027820059) also passed on `65acc34`,
including the pilot gate and unsigned universal package verification. Signing/notarization was
skipped; this is not a new distribution artifact (`retained-source-ci407.json`).

Browser tasks still recorded long intervals before report writing (including 72 and 91 seconds),
and earlier connected-browser runs had recovery refusals. Successful final files are not a
responsiveness claim. Stop's one-finalization fix closes duplicate archives, not general proof
that in-flight input can never arrive after Stop. Older bounded native passes with before/after
clipboard checks do not prove continuous isolation or two concurrent native workflows.

Managed voice passed earlier AWS/ElevenLabs checks and the owner confirmed the microphone works.
Physical Fn and a full spoken command remain independently unverified. No fresh Mac/account is
available for clean-install acceptance. None of these limits is waived by packaging.

## Full distribution requirements

The bounded RA handoff is a first milestone, not completion of the full goal. Vision-only and
access defaults apply to every build; broader coverage below remains required before claiming
general desktop reliability.

- Vision-only computer use is the default throughout Sia. Models receive screenshots and choose
  coordinates, literal text and keys. DOM/AX observations, element references, OCR, semantic setters
  and provider-native UI/shell tools cannot substitute for this route. Host access, protected-surface,
  window identity, stale-image, cancellation and foreground checks remain enforced.
- Useful personal work must finish on the signed candidate: real-source research and writing,
  file/document preparation and planning, with independently verified deliverables. Smoke fixtures,
  isolated shortcuts and operator-completed steps do not satisfy this requirement.
- Background work must preserve the person's app and clipboard. Earlier browser-plus-file overlap
  is preserved in the linked detailed record; it does not prove two completed native workflows. Verify repeatability, two native-app
  workflows, contention, cancellation/recovery and latency before claiming general concurrent usefulness.
  Alpha.122's exact-window exception is packaged and covered by focused and full pilot checks,
  but successful live same-browser coexistence is not yet accepted. Native input and connection
  setup retain the process guard. Unknown identity fails closed.
- The codebase must be lean and reviewable: explicit state owners, narrow module boundaries,
  obsolete paths removed at cutover, and an accurate [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path).
  Large declarative catalogs alone do not justify abstraction. Mixed responsibilities, duplicate
  execution paths and hidden fallbacks do.
- Mac setup guides the person through required access, including Chrome, and reuses existing grants.
  macOS and Chrome consent remain the person's decisions. Expired access needs an actionable
  recovery control, not a raw driver error. No fresh account or second Mac is currently available.

## Implemented boundaries

Browser and native work have separate runtimes, queues, authorization contexts and deadlines.
Exact-window leases and cancellation checks constrain retired calls. Native visual typing now
checks cancellation between characters and holds its mutation lease until the blocking writer exits.
Execution, permission setup and result decoding have distinct owners; ESLint enforces layer boundaries.
The unwanted sidebar badge is removed.

Visual policy is central across the controller, runtime and action backend. Voice activation carries
app identity only; persisted activation context is sanitized. Explicit file/connector tools remain
separate. Remaining assisted paths are internal compatibility/test seams to retire after cutover acceptance.

Native capture pairs pixels and metadata from one completed sample, validates fresh owned-sheet
geometry, and keeps the coordinate proof outside model-visible data. Capture validation has its own
module and does not import input tools. Coordinate-targeted keys reuse the same preflight and focus
operation. Native menu shortcuts resolve after field focus under the same process lease; a narrow
context module validates the exact document and attached sheet again before dispatch.

Native visual typing requires keyboard events through `type_text/visual.rs`, without semantic
text writes or text-value readback. The previous implicit AX insertion is excluded from vision-only
acceptance. A provider-local module
owns dynamic-tool image forwarding, verified with image-only facts in a real model turn.

## Handoff decision

Keep the PR draft. The [Arena proposal](./arena-proposal.md) requests a bounded Mac-first
technical review; it is not a partnership announcement or a leaderboard claim. Lawrence Jang
owns support and incidents. iPhone follows the Mac work.

Use the [real-work acceptance checklist](./manual-acceptance.md#real-work-and-concurrent-use)
and [native patch guide](../apps/desktop/native/cua/README.md) for the remaining work.
Do not publish, invite participants or contact Arena without authorization. The available RA
evaluation DMG does not establish broad distribution readiness.
