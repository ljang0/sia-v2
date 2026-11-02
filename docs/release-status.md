# Release status

Updated November 1, 2026. **Distribution is not ready.** Signed internal alpha.112 reopened the
preserved checklist copy through both Command+O and double-click without a reported focus
interruption. Independent image review confirmed the complete contents, and both file hashes
remain unchanged. These were controlled regressions with recovery guidance, not unassisted acceptance.

The full alpha.112 local pilot command passed: 1,996 desktop, 46 Electron, 40 renderer and
72 phone-browser tests, plus native/shared/build/static checks. The real handoff still stopped
at TextEdit’s Name field: keyboard input did not visibly change it. Rename and relocation remain open.
A fresh planning task overlapped native work, but Chrome needed inline reconnection and then
stalled after navigation. Neither task completed on alpha.112; concurrency has not passed.

Alpha.113 source fixes a stale browser start-page classification after accepted navigation;
regressions for delayed observation and redirects failed before the fix and pass afterward.
All local pilot stages passed: 1,998 desktop, 46 Electron, 40 renderer and 72 phone-browser
tests, plus native/shared/build/static checks. The phone suite passed on a complete repeat after
one ENOSPC fixture-creation failure. Signed alpha.113 captured and scrolled the inactive museum
tab while FaceTime was active, then refused a click with a generic browser error; no plan was saved.
Initial startup required a UI reload, and Chrome reconnection required the correct window choice.
The start-page correction itself was not exercised on the signed app.

Alpha.114 source preserves the driver’s projected refusal hint, with two regressions failing before
the fix and passing afterward. Browser recovery guidance now uses the exposed prepare-only tab
discovery route instead of the hidden assisted snapshot option. The full alpha.114 pilot command passed: 2,000 desktop, 46 Electron, 40 renderer and
72 phone-browser tests, plus native/shared/build/static checks. Signed alpha.114 verified the
diagnostic fix: the real scrolled museum page now reports `browser_point_context_unavailable`
before input. Chrome still required reconnection; no plan was saved. Startup cleared without reload. See the
[exact artifact and intervention record](./public-release.md). The last published Mac pilot remains
alpha.24. Nothing new has been published.

Alpha.115 source corrects the scrolled-page hit test: the read-only guard uses document offsets,
while mouse input keeps screenshot-derived viewport coordinates. Chromium regressions cover active
and inactive tabs, scroll and pinch scale; a native regression failed before the correction.
The full alpha.115 pilot command passed: 2,000 desktop, 46 Electron, 48 renderer and
72 phone-browser tests, plus native/shared/build/static checks. Signed alpha.115 now completes the
real museum/lunch itinerary: the formerly refused click works, official prices/hours were checked
visually, and the $97 plan was saved, read back and reopened. Chrome reconnection required an
operator selection; review caught a meat recommendation that violated the vegetarian requirement.
Sia corrected it after a follow-up prompt. Research took 481.146 seconds; correction took 24.855
seconds. This is useful completed work with interventions, not unassisted or concurrency acceptance.
The alpha.114 remote CI failure was release-table formatting, corrected here. A second dinner-and-grocery
plan also saved/read/reopened after setup; a review revision replaced impractical fractional
portions with an explicitly permitted half batch. Research took 204.931 seconds and revision
47.257 seconds. Native work overlapped but failed capture while its window was off the current
Space, so two completed concurrent tasks remain unverified.

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
acceptance. Failed keyboard transports and temporary probes were removed. A provider-local module
owns dynamic-tool image forwarding, verified with image-only facts in a real model turn.

## Current evidence and open gates

| Area | Verified | Still required |
| --- | --- | --- |
| Automated verification | The full alpha.115 local pilot command passed: 2,000 desktop, 46 Electron, 48 renderer and 72 phone-browser tests, plus native/shared/build/static checks. [CI for the typing/cancellation baseline](https://github.com/ljang0/sia-v2/actions/runs/41339903171) passed. Automated checks are not real-work acceptance. | The final signed distributable and real-work acceptance. |
| Native images and coordinates | Alpha.107 resolved Finder filename observation. Alpha.110 created a verified duplicate; alpha.112 reopened it with both Command+O and double-click without a reported focus interruption. | Complete rename and relocation; independently sample continuous foreground preservation. |
| Native shortcuts and typing | Alpha.95 completed a 1,469-character checklist in 64.690 seconds without a host timeout. Alpha.96 stopped at 485 characters and resumed to the full checklist without duplication. | Repeatable dialog filename input and Save/close/reopen with complete file contents. |
| Browser work | Alpha.115 saved/read/reopened a source-checked $97 itinerary after Chrome reconnection and a vegetarian-content correction. | Repeat without rescue; Chrome access after restart, permission-prompt dismissal and network-error recovery. |
| Concurrency and performance | Alpha.95 composer CUA round trips during typing: median 649.5 ms, worst 1,205 ms (10 samples). Alpha.96 Stop UI round trip: 1,233 ms, followed by stable partial text and successful recovery. | Two completed Sia tasks, clipboard/focus preservation, end-to-end latency and broader Stop/recovery. These limited samples are not performance acceptance. |
| Physical/fresh install | Existing-profile signed-app checks pass. | Lock/sleep/voice, first-use sign-in/permissions and a fresh account/second Mac. The keep-awake assertion still fails on this host, including with macOS’s own `caffeinate` utility. |

The original checklist and its alpha.110 duplicate are preserved in TextEdit’s iCloud folder,
with matching hashes. The requested local handoff filename does not exist. Do not count the
operator-guided continuation as an unassisted workflow pass. The reviewer brief and earlier
private evidence are also preserved; exact identities and limitations are in the artifact record.

See [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use) and the
[native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. Do not publish,
distribute or contact Arena until the remaining acceptance work and owner decisions are complete.
