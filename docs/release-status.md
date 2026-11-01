# Release status

Updated November 1, 2026. **Distribution is not ready.** The current internal Mac build is
alpha.92, stopped after an internal focused-field identity diagnostic. It is Developer ID signed
for arm64, but not notarized or accepted for distribution.
Universal alpha.60 passed distribution-artifact verification and failed its real native task.
The last published Mac pilot is alpha.24. Nothing new has been published.

The owner selected **Mac first; iPhone follows** and is the pilot support/incident owner.
The [Arena proposal](./arena-proposal.md) offers a bounded technical review and invited pilot;
it does not claim a partnership, validated ranking or completed acceptance. Research sharing is off.

## Release requirements

- Vision-only computer use is the default throughout Sia. Models receive screenshots and choose
  coordinates, literal text and keys. DOM/AX observations, element references, OCR, semantic setters
  and provider-native UI/shell tools cannot substitute for this route. Host access, protected-surface,
  window identity, stale-image, cancellation and foreground checks remain enforced.
- Useful personal work must finish on the signed candidate: real-source research and writing,
  file/document preparation and planning, with independently verified deliverables. Smoke fixtures,
  isolated shortcuts and operator-completed steps do not satisfy this requirement.
- Background work must preserve the person's app and clipboard. Verify two completed simultaneous
  Sia tasks, contention, cancellation/recovery and latency before claiming concurrent usefulness.
- The codebase must be lean and reviewable: explicit state owners, narrow module boundaries,
  obsolete paths removed at cutover, and an accurate [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path).
  Large declarative catalogs alone do not justify abstraction. Mixed responsibilities, duplicate
  execution paths and hidden fallbacks do.
- Mac setup guides the person through required access, including Chrome, and reuses existing grants.
  macOS and Chrome consent remain the person's decisions. Expired access needs an actionable
  recovery control, not a raw driver error. No fresh account or second Mac is currently available.

## Implemented boundaries

Browser and native work have separate runtimes, queues, authorization contexts and deadlines.
Exact-window leases and cancellation checks prevent retired calls from changing a newer turn.
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

Native visual typing now requires keyboard events through `type_text/visual.rs`, without semantic
text writes or text-value readback. The previous implicit AX insertion is excluded from vision-only
acceptance. Failed keyboard transports and temporary probes were removed. A provider-local module
owns dynamic-tool image forwarding, verified with image-only facts in a real model turn.

## Current evidence and open gates

| Area | Verified | Still required |
| --- | --- | --- |
| Automated verification | The alpha.88 local pilot gate passed: 1,971 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static checks. [CI for the committed focus/coordinate fixes](https://github.com/ljang0/sia-v2/actions/runs/41330418586) passed. Internal diagnostic builds are not full-pilot acceptance. | The final signed distributable and real-work acceptance. |
| Native images and coordinates | Alpha.85 saved and closed the real 444-word brief. Alpha.86 opened the standalone dialog folder menu and selected the parent folder without operator input. | Repeat unassisted menu opening/selection and complete useful tasks. |
| Native shortcuts and typing | Alpha.75 selected the filename through the menu route once. Alpha.76 did not reproduce selection and stopped before typing. | Repeatable keyboard-only input, Save/close/reopen, and complete file contents. |
| Browser work | Alpha.59 delivered restricted background clicks/scrolls; separate operator-typed notes survived. | Chrome access after restart, permission-prompt dismissal and network-error recovery; completed planning output. |
| Concurrency and performance | Forty alpha.76 focus samples over 40 seconds all identified Sia. Earlier ten CUA navigation samples had median 946.5 ms and worst 1,199 ms. | Two completed Sia tasks, clipboard preservation, end-to-end latency, Stop/recovery. These limited samples are not acceptance. |
| Physical/fresh install | Existing-profile signed-app checks pass. | Lock/sleep/voice, first-use sign-in/permissions and a fresh account/second Mac. The keep-awake assertion still fails on this host. |

The native fix binds Apple's Open/Save Panel service to its client, validates popup ancestry and
geometry, and prunes clipped file-list subtrees before coordinate hit testing. Alpha.85 saved and
closed the real 444-word reviewer brief without operator target input. Alpha.86 navigated the standalone
Open dialog's folder menu, but could not reopen the file. Alpha.88 shares screenshot-scale/session
transforms between clicks and focus verification in `tools/pixel_focus.rs`; its full pilot gate passed.

Signed trials still fail to enter the filename in the focused Search field. Alpha.89 inspected
routing metadata; alpha.90 re-primed the exact key window; alpha.91 tried the native event route and
separately sent a single physical-key-code event. None reopened the brief. Failed route changes were
removed. Alpha.92 found the field and window report the same TextEdit process; the filename still
did not appear. It did not establish a process-ID mismatch. Its probe was removed. Production runtime source
remains the CI-verified alpha.88 baseline. These are diagnostics, not acceptance.

A delayed process-close race found during verification is also fixed: cancellation, timeout and
output-limit termination preserve the first stop cause. Deterministic regressions and the final
full pilot run passed.

Keyboard-only input remains live-unverified. The reviewer brief is safely saved; the standalone
Open dialog remains open. Useful browser/background input and concurrent-work acceptance remain open.

See [exact artifacts and interventions](./public-release.md), [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use),
and the [native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. Do not publish,
distribute or contact Arena until the remaining acceptance work and owner decisions are complete.
