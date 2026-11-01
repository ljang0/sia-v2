# Release status

Updated October 31, 2026. **Distribution is not ready.** The current internal Mac build is
alpha.76. It is Developer ID signed for arm64, but not notarized or accepted for distribution.
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
| Automated verification | Full current local pilot gate passes: 1,958 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static checks. Previous commit CI passed, including unsigned universal packaging. | Run current-commit CI and verify the final distributable. |
| Native images and coordinates | Alpha.67 delivered image-only facts. Alpha.70 visibly collapsed/re-expanded the real Save sheet with fresh background coordinates. | Capture and safely target transient menus; repeat across useful tasks. |
| Native shortcuts and typing | Alpha.75 selected the filename through the menu route once. Alpha.76 did not reproduce selection and stopped before typing. | Repeatable keyboard-only input, Save/close/reopen, and complete file contents. |
| Browser work | Alpha.59 delivered restricted background clicks/scrolls; separate operator-typed notes survived. | Chrome access after restart, permission-prompt dismissal and network-error recovery; completed planning output. |
| Concurrency and performance | Forty alpha.76 focus samples over 40 seconds all identified Sia. Earlier ten CUA navigation samples had median 946.5 ms and worst 1,199 ms. | Two completed Sia tasks, clipboard preservation, end-to-end latency, Stop/recovery. These limited samples are not acceptance. |
| Physical/fresh install | Existing-profile signed-app checks pass. | Lock/sleep/voice, first-use sign-in/permissions and a fresh account/second Mac. The keep-awake assertion still fails on this host. |

Alpha.76's real reviewer-brief task failed at folder navigation without saving, closing or reopening.
After it ended, operator CUA found an AX folder menu absent from both screenshots and cancelled it.
A separate bounded selection diagnostic fell back to synthetic keys, showed no selection, and
stopped before typing. Thus keyboard-only text delivery remains live-unverified. The destination
folder is empty. A plan-limit banner during alpha.75 did not stop that turn; quota is not its failure.

See [exact artifacts and interventions](./public-release.md), [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use),
and the [native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. Do not publish,
distribute or contact Arena until the remaining acceptance work and owner decisions are complete.
