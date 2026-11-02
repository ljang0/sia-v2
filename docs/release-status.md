# Release status

Updated November 1, 2026 (verification completed November 2 UTC). **A notarized alpha.118 DMG is available for the requested RA evaluation. Broad distribution and Arena acceptance remain open.**

The universal Mac artifact at source `db14166524a0d6fe80c5055fee6209a3bc5c96e7` passed Developer ID signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks. Its contents were installed directly from the mounted DMG into the isolated QA app. Exact identities and test receipts are in the [distribution acceptance record](./public-release.md).

Cloud recording is selected by default in first-run setup. The notice discloses prompts, provider-reported usage, actions/results and screenshots; Continue saves the choice. Existing opt-outs and pauses remain respected. Ordinary AWS users can upload through the existing encrypted outbox and private archive. The control-function deployment completed without resource replacement. The installed app showed the default-selected notice and then **Recording** in Privacy.

Two real-provider tasks automatically uploaded 109 events to AWS without per-task recording actions. Independent S3 reads verified the batch hashes, prompt text, reported token usage, action results and three actual computer screenshots. A saved dinner plan became a practical prep checklist in 104.759 seconds; the result was saved, read back and opened in Sia Preview. Its original file remained unchanged. The native checklist handoff stopped when clicking the title failed to expose the Name field; both documents remained unchanged. These runs were sequential, not concurrency proof.

The full local alpha.118 pilot gate passed: 2,007 desktop, 46 Electron, 48 renderer and 72 phone-browser tests, plus native/shared/build/static checks and 223 cloud tests. Remote CI was still running at the evidence check. A separate authenticated disposable-user AWS transport check verified retry acknowledgement and complete deletion of all uploaded object versions. That synthetic check is separate from real-task acceptance.

Earlier alpha.115 browser tasks produced an itinerary and dinner/grocery plan with setup and review interventions. Native popup input, off-Space capture, restart recovery, continuous focus/clipboard preservation, two completed concurrent tasks, lock/sleep/voice and fresh-account acceptance remain open. A fresh Mac/account is unavailable. The alpha.117 popup-routing correction is included but was not exercised by alpha.118's stopped title-click attempt. The broad native test run still has the known host keep-awake failure; this is not an all-native pass.

The owner selected **Mac first; iPhone follows** and Lawrence Jang is the support/incident owner. The [Arena proposal](./arena-proposal.md) offers a bounded technical review and invited pilot, without claiming a partnership, validated ranking or completed acceptance. No artifact has been publicly published or sent to a recipient by this work.

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

| Area                          | Verified                                                                                                                                                                                                                                                                                                               | Still required                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated verification        | Alpha.118 full local pilot command passed: 2,007 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. Automated checks are not real-work acceptance. | Remote CI and remaining real-work acceptance.                                                                                                                            |
| Native images and coordinates | Alpha.107 resolved Finder filename observation. Alpha.110 created a verified duplicate; alpha.112 reopened it with both Command+O and double-click without a reported focus interruption.                                                                                                                              | Complete rename and relocation; independently sample continuous foreground preservation.                                                                                            |
| Native shortcuts and typing   | Alpha.95 completed a 1,469-character checklist in 64.690 seconds without a host timeout. Alpha.96 stopped at 485 characters and resumed to the full checklist without duplication.                                                                                                                                     | Repeatable dialog filename input and Save/close/reopen with complete file contents.                                                                                                 |
| Browser work                  | Alpha.115 saved/read/reopened a source-checked $97 itinerary after Chrome reconnection and a vegetarian-content correction.                                                                                                                                                                                            | Repeat without rescue; Chrome access after restart, permission-prompt dismissal and network-error recovery.                                                                         |
| Concurrency and performance   | Alpha.95 composer CUA round trips during typing: median 649.5 ms, worst 1,205 ms (10 samples). Alpha.96 Stop UI round trip: 1,233 ms, followed by stable partial text and successful recovery.                                                                                                                         | Two completed Sia tasks, clipboard/focus preservation, end-to-end latency and broader Stop/recovery. These limited samples are not performance acceptance.                          |
| Physical/fresh install        | Alpha.118 universal DMG is signed, notarized, stapled, Gatekeeper-accepted and installed directly from the DMG; existing-profile checks pass.                                                                                                                                                                                                                                                                               | Lock/sleep/voice, first-use sign-in/permissions and a fresh account/second Mac. The keep-awake assertion still fails on this host, including with macOS’s own `caffeinate` utility. |

The original checklist and its alpha.110 duplicate are preserved in TextEdit’s iCloud folder,
with matching hashes. The requested local handoff filename does not exist. Do not count the
operator-guided continuation as an unassisted workflow pass. The reviewer brief and earlier
private evidence are also preserved; exact identities and limitations are in the artifact record.

See [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use) and the
[native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. The owner requested a local RA evaluation DMG; alpha.118 is prepared for that limited handoff with the known limitations disclosed. Do not publish, send invitations or contact Arena without authorization. Broad distribution still requires the remaining acceptance work.
