# Release status

Updated November 5, 2026. **Public 1.0 is not ready.** The retained signed internal app still
fails background input in native Open/Save dialogs and Slack's directory filter. A navigation-only
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

## Current evidence and open gates

The exact installed identity, checks and detailed live receipts are in the
[distribution acceptance record](./public-release.md#current-installed-candidate).

| Area          | Verified                                                                                                                                                                   | Still required                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Native work   | Signed `28c5a50` added all four requested checklist items through background TextEdit input; seven source files stayed byte-identical                                      | Save-panel filename input failed; no saved deliverable after 86.030 seconds. Duplicate capture and Open-panel navigation also fail             |
| Browser work  | Earlier builds completed sourced outing and museum plans (457 and 496 seconds), with independently checked outputs                                                         | Repeat on the final candidate; recovery, long stalls and same-browser coexistence                                                              |
| Sia controls  | Open-window rendering continues under cover; read-state requires focus. Signed `1a1b7e5` loaded twice without Open Sia, accepted a complete unsent sentence and cleared it | One intervening startup failed with a disk-full error. Startup latency, continuous focus/clipboard isolation and concurrency remain unverified |
| AWS recording | Both latest failed native tasks matched complete prompts, actions, screenshot bytes, usage and terminal outcomes without manual upload                                     | Live recording-control acceptance and task-scope protection; a matched archive does not prove task success                                     |
| Dependencies  | Audit reports zero advisories after scoped build-tool updates; 54,574 matcher comparisons found no differences; signed package/runtime checks passed                       | Independent CI completion; exact-source local full gate passed                                                                                 |
| Distribution  | Held alpha.122 universal DMG was signed, notarized and stapled                                                                                                             | It lacks later repairs and must not be distributed; final installer waits for functional gates                                                 |

Current internal QA source: `1a1b7e50e4996745d60e0d9814e2ffbcdaf7ff57`, arm64, Developer ID
signed, not notarized and not a DMG. The full pilot gate passed on exact installed source `1a1b7e5`: 2,127 desktop
unit tests, 46 Electron, 48 renderer and 72 companion checks, plus static/shared/cloud/native
checks (23 unit and five Electron skips). The later dependency run encountered one timeout;
its complete 21-test file passed in isolation, and the exact-source full rerun now passed.
Private full-gate log: `startup-repaint-pilot.log`.
[CI 410](https://github.com/ljang0/sia-v2/actions/runs/42118175786) checks the dependency update.

## Repairs and unresolved causes

**Recording controls.** Pause/Resume, decline/re-consent and delete/re-consent during the same
running task could resume or recreate its raw recording. The installed fix excludes pending turns
until their runners finish and discards both staged formats. Three regressions failed before and
passed after the repair; 37 adjacent checks passed. Live AWS pause/resume/delete acceptance is
still required. The separately controlled local diagnostic log is now explained in Privacy.

**Rendering.** Open Sia windows no longer throttle their renderer; hiding or minimizing restores
throttling. Conversation read-state separately requires focus. Secure startup now requests repaint
after replacing its inert page with the application. Two signed launches reached usable controls
without Open Sia; an intervening launch failed with “database or disk is full.” SQLite integrity
passed. A later stale accessibility snapshot disagreed with a fresh screenshot, which showed the
loaded conversation and working input. No latency or repeatability claim follows from these runs.

**Native dialogs.** Coordinate-targeted vision keys now focus by pointer, retaining host-only
editable-field and exact-window checks. Main TextEdit body input works in the latest useful-task
attempt, but Save filename input does not. A bounded foreground comparison could open Go to Folder
where background input failed. No semantic setter or implicit foreground fallback is included.
The existing focus-lifetime correction preserves a newly selected window during cleanup; its causal
role in the dialog failure remains unproved.

**Trials already ruled out.** Additional target-only key-window preparation, alternate menu/envelope
transports and filename transports did not fix the ordinary task and were removed. Diagnostics
observed no guard restoration, activation reversal or key-focus release during the failed shortcut;
the exact WindowServer owner matched the keyboard destination. Do not repeat these variants,
disable isolation guards or guess a service PID. Details and receipt identifiers are retained in the
[distribution record](./public-release.md); the owner asked that the upstream report stay private.

**Dependencies.** rimraf 6.1.4 removes the vulnerable glob dependency. Scoped minimatch 11.0.4
overrides cover five reviewed consumers; unaffected older consumers remain unchanged. Frozen
install, lint, matcher comparison and signed packaging passed. The dependency-only build's ASAR
matches `28c5a50` exactly. No runtime change is attributed to that update.

**Privacy scope.** A navigation-only Slack request captured an unintended message thread. Authorized
local and AWS deletion is complete; no Slack messages were deleted. Do not recreate those recordings.
The observation-scope defect remains a public-release blocker.

Managed voice passed earlier AWS/ElevenLabs checks and the owner confirmed the microphone works.
Physical Fn and a full spoken command remain independently unverified. No fresh macOS account or
second Mac is available; Intel runtime is unverified. These limits are not waived by packaging.

## Full distribution requirements

A bounded RA handoff would be an intermediate milestone, not completion of public 1.0. Vision-only and
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
