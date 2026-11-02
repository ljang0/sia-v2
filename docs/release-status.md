# Release status

Updated November 2, 2026. **A notarized alpha.119 DMG is available for the requested RA evaluation. Broad distribution and Arena acceptance remain open.**

The universal Mac artifact at source `2dfcf45ac78e1f6798891ca91a458c5786dd728c` passed Developer ID signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks. Its contents were installed directly from the mounted DMG into the isolated QA app. Exact identities and test receipts are in the [distribution acceptance record](./public-release.md). Alpha.119 also passes the full local pilot gate. Its native handoff stopped at Finder’s Go to Folder dialog because neither the sheet nor parent had a verified background input route. Both source documents remained unchanged.

Cloud recording is selected by default in first-run setup. The notice discloses prompts, provider-reported usage, actions/results and screenshots; Continue saves the choice. Existing opt-outs and pauses remain respected. Ordinary AWS users can upload through the existing encrypted outbox and private archive. The control-function deployment completed without resource replacement. The installed app showed the default-selected notice and then **Recording** in Privacy.

On alpha.118, two real-provider tasks automatically uploaded 109 events to AWS without per-task recording actions. Independent S3 reads verified the batch hashes, prompt text, reported token usage, action results and three actual computer screenshots. A saved dinner plan became a practical prep checklist in 104.759 seconds; the result was saved, read back and opened in Sia Preview. Its original file remained unchanged. The native checklist handoff stopped when clicking the title failed to expose the Name field; both documents remained unchanged. These initial runs were sequential. A follow-up grocery task completed and reopened in 88.670 seconds while overlapping another stopped native recovery attempt for 18.208 seconds. Both planning sources remained unchanged; two successful concurrent tasks are still unverified.

The full local alpha.118 pilot gate passed: 2,007 desktop, 46 Electron, 48 renderer and 72 phone-browser tests, plus native/shared/build/static checks and 223 cloud tests. Remote CI run 345 passed for the exact DMG source revision (`db14166524a0d6fe80c5055fee6209a3bc5c96e7`). A separate authenticated disposable-user AWS transport check verified retry acknowledgement and complete deletion of all uploaded object versions. That synthetic check is separate from real-task acceptance.

Earlier alpha.115 browser tasks produced an itinerary and dinner/grocery plan with setup and review interventions. Native popup input, off-Space capture, restart recovery, continuous focus/clipboard preservation, two completed concurrent tasks, lock/sleep/voice and fresh-account acceptance remain open. A fresh Mac/account is unavailable. The alpha.117 popup-routing correction is included but was not exercised by alpha.118's stopped title-click attempt. The broad native test run still has the known host keep-awake failure; this is not an all-native pass.

The owner selected **Mac first; iPhone follows** and Lawrence Jang is the support/incident owner. The [Arena proposal](./arena-proposal.md) offers a bounded technical review and invited pilot, without claiming a partnership, validated ranking or completed acceptance. No artifact has been publicly published or sent to a recipient by this work.

The reported Fn voice outage was traced to a rejected AWS ElevenLabs key. The owner supplied a valid replacement; only the cloud credential changed, so alpha.118 needs no reinstall. An authenticated ordinary-user check passed catalog access, synthetic TTS, batch/realtime transcription and cancellation in 3.516 seconds. CUA also refreshed the installed app’s catalog and observed reply playback reach Speaking. Alpha.119 additionally passed microphone startup and stopping with no detected speech; a deliberately spoken command and physical Fn remain open because CUA cannot send Fn. The synthetic test did not record user audio. See the [voice repair evidence](./public-release.md#managed-voice-repair).

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
| Automated verification        | Alpha.118 full local pilot command passed: 2,007 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. Automated checks are not real-work acceptance. | Remaining real-work acceptance.                                                                                                                            |
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
[native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. The owner requested a local RA evaluation DMG; alpha.119 is prepared for that limited handoff with the known limitations disclosed. Do not publish, send invitations or contact Arena without authorization. Broad distribution still requires the remaining acceptance work.

## Alpha.119 candidate

Source inspection found that coordinate clicks could still take the native driver’s AXPress shortcut. Vision-only clicks now request `pointer_only`; the driver rejects semantic targets and focus/menu actions for that request and skips AX click delivery. Exact-window ownership, protection, geometry and focus guards remain. The alpha.118 DMG predates this correction. The desktop regression failed before the change and passes afterward; 526 selected native tests passed (one ignored), and `pnpm check` passed with 2,009 desktop tests. The subsequent Electron gate failed with nine failures and long stalls. Its unchanged rerun passed all nine but had one different early window-close failure (45 passed, one failed, five skipped); that isolated test then passed three consecutive runs. This is unresolved test/host instability, not a clean full-pilot pass. Separate renderer and phone-browser gates passed all 48 and 72 tests. Logs and initial/retry traces are retained privately in `pointer-only-source-checks`. This is not a demonstrated fix for the stopped TextEdit workflow.

Alpha.119 passes the full `pnpm test:pilot` command: 2,009 desktop tests, 46 Electron tests, 48 renderer tests, 72 phone-browser tests and 223 cloud tests, plus native/shared/build/static checks. The earlier intermittent failures and their traces remain recorded above. Universal packaging, notarization and installation from the exact DMG passed. Remote CI run 350 passed for the exact alpha.119 source, including pilot gates and unsigned universal package verification.

CUA started dictation in the installed alpha.119 app, observed Listening, stopped it and received “No speech was detected.” This verifies startup and stopping without the reported service-unavailable error; deliberately spoken content and physical Fn are still unverified. CUA cannot send Fn. External CUA input and screenshots became stale during the test; the window’s exposed Raise action restored responses. This operator intervention is not a Sia background-use pass.

The fresh native handoff ran for 57.659 seconds and stopped after Finder’s Go to Folder sheet and its parent both reported `ax_unresolved`. No rename or move occurred. A five-day meal-plan task reached Chrome connection recovery, then paused when the Mac slept; no output was saved. The later native retry returned HTTP 429. Alpha.119 labeled this as a subscription limit, but that classification is not supported by the generic error. These tasks did not establish successful concurrency. Private `alpha119-pointer-only/live-acceptance.json`, extracted trajectories and screenshots preserve the failures and voice evidence. Further real-provider acceptance requires a successful retry; no subscription reset time can be inferred from this 429.

The owner’s physical Fn attempt surfaced a personal-key error from a competing development installation. Both the development and QA apps had Fn helpers running. CUA disabled the development copy’s Hold Fn setting and verified it off; its Fn helper exited while the QA helper remained. A fresh physical Fn retry remains necessary. No shared credential was installed locally.

The owner subsequently confirmed “mic now works” and requested the latest DMG. Alpha.119’s checksum, Gatekeeper assessment and stapled notarization ticket were revalidated for that handoff. This is owner-reported microphone acceptance; no new independent spoken-command result or concurrency pass is claimed.

## Follow-up source changes after alpha.119

Alpha.120 is being prepared for internal verification. Finder's visible Go to Folder dialog is
a top-level `AXSheet`; the driver previously matched only `AXWindow`, rejecting an exactly
identified sheet as unresolved. Window scoping now accepts the exact sheet and excludes sibling
surfaces. Bounded application-child discovery supplements `AXWindows` only for the requested
ID and process. Visibility and focus requirements remain unchanged. A native regression failed
before the correction; 82 AX tests pass afterward. The pilot gate now explicitly includes
window-scope, bindings and core background-input tests. The full pilot rerun passed: 2,022 desktop,
46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static
checks. Signing and live app acceptance remain pending; this does not establish rename/move/reopen
or concurrent-task acceptance. The first
pilot run stopped in the separate real Electron bare-launch fixture (exit 1, no stderr). Its
isolated and full-gate reruns passed; the cause remains undiagnosed. Both logs are preserved.

Native memory reviews could repeatedly schedule themselves because their own journal edits
were newer than the last-review timestamp. The host now checkpoints journal and failure-note
revisions and advances them only for review writes that replace the checkpointed revision.
Ordinary task activity, including a write during a review, remains eligible after the cooldown.
Explicit requests still override the cooldown; legacy empty markers migrate at the next review.
Both controller routes reproduced the defect before the fix. All 35 focused vault/controller
tests pass, including restart, concurrent task edits, explicit requests and linked-marker checks.
The full `pnpm test:pilot` passed: 2,022 desktop, 46 Electron, 48 renderer, 72 phone-browser
and 223 cloud tests, plus native/shared/build/static checks. Private evidence is retained in
`memory-review-source-checks/pilot-gate.log`. This source correction is not in the alpha.119 DMG.

A generic HTTP 429 was incorrectly translated into an exhausted-plan message with the saved subscription reset time. Error formatting now distinguishes request-rate failures from explicit usage/quota failures. Bare 429 and rate-limit messages advise waiting and retrying without claiming a plan reset; explicit usage/quota errors retain their guidance, and original errors remain under Details. Five focused checks reproduced the old behavior; all 17 focused tests pass after the correction. The full `pnpm test:pilot` passed: 2,013 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. Private evidence is retained in `rate-limit-source-checks/pilot-gate.log`. This change is not in the handed-off alpha.119 DMG.
