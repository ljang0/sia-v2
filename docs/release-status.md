# Release status

Updated November 1, 2026. **Distribution is not ready.** The installed internal Mac build is
alpha.108, stopped after a failed signed background file-copy repeat. Developer ID signing and
packaged-runtime verification passed for arm64; it is not notarized or accepted for distribution.
The full local pilot gate passed: 1,996 desktop, 46 Electron, 40 renderer and 72 browser tests.
The background menu dispatch now uses the existing targeted focus guard, but Finder still became
active after Go to Folder. Sia detected the focus change and paused before typing. No copy was
created; Save/reopen remains incomplete. See the [exact artifact and failure record](./public-release.md).

Signed alpha.107 resolved the Finder observation regression: Applications screenshots now work
when openable filenames include 1Password, while genuine credential controls remain protected.
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
| Automated verification | The alpha.108 source pilot gate passed: 1,996 desktop, 46 Electron, 40 renderer and 72 phone-browser tests, plus native/shared/build/static checks. [CI for the typing/cancellation baseline](https://github.com/ljang0/sia-v2/actions/runs/41339903171) passed. Automated checks are not real-work acceptance. | The final signed distributable and real-work acceptance. |
| Native images and coordinates | Alpha.85 saved and closed the real 444-word brief. Alpha.97 captured the title popover. Later diagnostics isolated an unproven shared-service destination menu; it remains refused. | Repeat unassisted menu opening/selection and complete useful tasks. |
| Native shortcuts and typing | Alpha.95 completed a 1,469-character checklist in 64.690 seconds without a host timeout. Alpha.96 stopped at 485 characters and resumed to the full checklist without duplication. | Repeatable dialog filename input and Save/close/reopen with complete file contents. |
| Browser work | Alpha.59 delivered restricted background clicks/scrolls; separate operator-typed notes survived. | Chrome access after restart, permission-prompt dismissal and network-error recovery; completed planning output. |
| Concurrency and performance | Alpha.95 composer CUA round trips during typing: median 649.5 ms, worst 1,205 ms (10 samples). Alpha.96 Stop UI round trip: 1,233 ms, followed by stable partial text and successful recovery. | Two completed Sia tasks, clipboard/focus preservation, end-to-end latency and broader Stop/recovery. These limited samples are not performance acceptance. |
| Physical/fresh install | Existing-profile signed-app checks pass. | Lock/sleep/voice, first-use sign-in/permissions and a fresh account/second Mac. The keep-awake assertion still fails on this host, including with macOS’s own `caffeinate` utility. |

The native fix binds Apple's Open/Save Panel service to its client, validates popup ancestry and
geometry, and prunes clipped file-list subtrees before coordinate hit testing. Alpha.85 saved and
closed the real 444-word reviewer brief without operator target input. Alpha.86 navigated the standalone
Open dialog's folder menu, but could not reopen the file. Alpha.88 shares screenshot-scale/session
transforms between clicks and focus verification in `tools/pixel_focus.rs`; its full pilot gate passed.

Ordinary editor typing and dialog typing now have distinct evidence. On the alpha.88 baseline,
Sia wrote the useful checklist into a new document, but the host's 60-second deadline interrupted the
call before it returned. The full text was present; subsequent filename entry in Save still failed.
Alpha.95 gives native typing 120 seconds to cover the pinned driver's 100-second paced-input budget;
other operations retain 60 seconds. The same checklist returned normally in 64.690 seconds.

That trial exposed a separate Stop defect: cancelling the async call left its blocking keyboard loop
running. Alpha.96 carries cancellation into the writer, checks between complete characters and keeps
the process lease until it exits. The signed test stopped at 485 characters; independent observations
nearly three minutes later found the text unchanged. A vision-only follow-up completed the same
1,469-character checklist without duplication. The requested terminal newline was omitted. The first
Stop attempt was inconclusive because the operator's screenshot call stalled until typing finished;
only the repeated attempt counts. No operator TextEdit input occurred. A later filesystem check found TextEdit had automatically saved the complete draft under its
default iCloud name. The requested local filename and close/reopen are still unverified.

Save/Open filename input remains unresolved. Earlier diagnostics found matching field/window process
IDs and confirmed the signed host's Accessibility and event-posting grants; missing permission is not
supported by that evidence. Failed transport experiments and probes were removed. The saved reviewer
brief remains preserved. Alpha.97–104 added capture and stale-image coverage for an ordered popover/menu
stack, but could not prove the shared menu owner. The unsuccessful service-parent and native-child
capture probes were removed. Model-facing screenshot refusals now use plain language and revoke
old image authority. A clean alpha.105 run captured TextEdit but refused one Finder window. Another Finder window worked;
Go to Folder opened, then input paused because Finder became active. After operator QA activation and
Continue, background path typing reached the source folder. Duplicate and menu attempts produced no
verified copy. The original hash is unchanged, and the requested local output does not exist. These
operator-guided recovery attempts are diagnostics, not an unassisted workflow pass. Useful browser
work and two completed simultaneous tasks remain open.

See [exact artifacts and interventions](./public-release.md), [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use),
and the [native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. Do not publish,
distribute or contact Arena until the remaining acceptance work and owner decisions are complete.

Alpha.106 reproduced the Applications-only refusal, with no native capture-failure diagnostic.
Independent operator inspection found 1Password and Passwords file labels. The host classifier can
withhold that image as protected content yet report a missing screenshot. The correction
requires Finder identity, an AXTextField whose label duplicates its filename value, and AXOpen;
structural credential markers, titles and separate controls remain protected. The signed alpha.107 repeat captured both Applications windows and the TextEdit document,
confirming this specific refusal is resolved. The turn contained no target input; it does not
establish completion of the copy workflow.
