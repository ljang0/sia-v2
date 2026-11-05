# Release status

Updated November 5, 2026. **Signed internal `d67df60` fixes stale window-focus cleanup, but the ordinary native document task still fails in TextEdit's Open dialog. A bounded foreground comparison works; subsequent input trials were removed and background mode restored. AWS matches the runs and protected files are unchanged. The full pilot suite passed on the retained runtime source. Native background delivery, input isolation, responsiveness and exact-DMG acceptance remain open. RA distribution and Arena acceptance are held.**

## Bounded RA handoff goal

**Definition of done:** deliver a usable Mac app, not a collection of test results. The next
release decision has five gates:

1. From ordinary prompts, complete useful browser research and native document work through
   the installed app; independently check the saved results. No task-time operator rescue.
2. Let the person keep using another window: preserve their text, focus and clipboard; make
   Sia's composer, task controls and Stop work through CUA. Record elapsed time, stalled periods
   and retries. Unexplained misdirected input or recurring stalls fail acceptance.
3. Reuse initial access grants after restart, with automatic ordinary-task authorization.
   Person-owned macOS grants are setup, not permissions that the app can silently enable.
4. Automatically archive the exact prompts, provider usage, actions/results, screenshots and
   terminal outcome in AWS; independently match them to the local run, retaining disclosure
   and explicit opt-outs.
5. Ship those verified behaviors in one signed, notarized DMG with a short setup guide and
   honest limits. Keep the changed code focused, remove superseded experiments, and maintain
   a short architecture walkthrough and Arena proposal.

A first RA evaluation does not complete the broader goal of reliable concurrent desktop work.
Two simultaneous native workflows and wider recovery coverage remain explicit follow-on gates.
Work only on an open gate: identify a user-visible failure, repair its evidenced cause, and rerun
that useful path. Do not build again for documentation changes or rerun passing suites without a
new change or unresolved concern. A failed attempt stays in the evidence; do not relabel it a pass
because a diagnostic continuation succeeded.

**November 4 acceptance clarification:** the RA handoff is a first milestone, not a replacement
for the full distribution goal. Real personal workflows, CUA-operated Sia controls, background
operation alongside the person's work, preserved inputs, independently checked outputs and
matching automatic AWS archives determine readiness. Manual rescue is recorded as failure of
autonomous acceptance. Unit tests, synthetic fixtures, diagnostics and signing are supporting
checks; none substitutes for working functionality. Each cycle must deliver a targeted repair
and a live rerun or establish a concrete blocker. The menu-routing diagnostic identified a missing native edit-session step; its successful
explicit-click comparison now informs the functional guidance repair. Do not repeat diagnostic
builds or unchanged workflow loops instead of completing fresh-conversation and input-isolation acceptance.
Acceptance starts with an ordinary user request on the candidate, without operator-supplied click,
key or recovery instructions. Diagnostic continuations count only as evidence for a repair; the
default app must perform the sequence itself before that workflow passes.

Owner reset, November 3: finish a supervised **Apple-silicon RA evaluation**, not general desktop
reliability. Freeze functional scope at the tested QA candidate plus the targeted Chrome
corrections justified below. Prepare one final signed,
notarized DMG from that candidate and a short setup/limitations guide. Reuse the existing Arena
proposal; keep it a technical-review draft, not a rollout or reliability promise.

Owner clarification: useful background personal-desktop control, automatic task approval after
initial setup, and correct automatic AWS prompt/usage/trajectory uploads remain required. A
workspace-file tool alone does not prove desktop control. On the exact installed DMG, complete a
public-browser research task and a bounded everyday native-app task with checked results and
preserved sources. Include browser reuse after restart and input isolation while another app is
in use. Initial macOS/Chrome grants remain person-approved; reuse existing grants without redundant
Sia approval cards. Default recording must retain its disclosure and existing opt-outs.

Verify AWS objects against that candidate's local task records, including prompts, provider usage,
action results, screenshot hashes and completion/failure events. Existing internal-QA evidence
informs these checks but does not replace them. Record operator intervention; a rescued or failed
run is not a background acceptance pass.

Do not expand this pass beyond the bounded native task to two native-app tasks, unattended concurrency,
physical Fn/lock/sleep, Intel runtime, iPhone or a fresh-account setup that is unavailable. Keep those
as future milestones. Do not promise them to the RA or Arena. No speculative native-driver changes,
cosmetic fixes, new demos or repeated packaging for documentation changes.

If a scoped workflow fails, isolate one evidenced cause, make one targeted repair and rerun that
path. If it still fails, record the exact blocker. Another repair requires new evidence that changes
the diagnosis; do not repeat timeout or transport variants speculatively. The artifact can be labeled a limited technical-evaluation build, but the owner's
background personal-desktop requirement is not complete and must not be waived or labeled
passed. Wrong-window input,
credential disclosure or source-data loss blocks sharing until resolved. Finish with the exact DMG,
checksums, pass/fail results and known limits. Publishing, invitations and Arena outreach remain
separate actions requiring authorization.

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
acceptance. A sanitized comment for upstream issue #3351 is drafted privately; posting requires
the owner's explicit authorization. It identifies the patched host and does not claim a clean
upstream reproduction.

The earlier native menu-key transport trial `770360e` did not fix the task and was removed,
along with temporary ownership logging. The `9e7e436` diagnostic reported the focused input
under TextEdit's PID without a raw window ID; that cannot rule out a remote AX proxy. Envelope,
public-event and filename-transport trials also failed. Do not repeat those variants without a
new causal distinction. Detailed failed and successful runs remain in the
[distribution acceptance record](./public-release.md), private receipts and Git history.

## Current artifacts

- Installed internal arm64 QA: `d67df60156fec3b1d63c7073504ac38cb0d6a78d`, Developer ID signed.
  Native regression, desktop build, quality, package/runtime and installed strict-signature
  checks passed. The full pilot gate passed on `8326bcb`, whose runtime source matches this
  installed candidate. Not notarized; not a DMG.
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
