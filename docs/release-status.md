# Release status

Updated November 2, 2026. **A signed, notarized alpha.122 DMG is available for the requested RA evaluation. Broad distribution and Arena acceptance remain open.**

Alpha.122 permits tab-addressed background browser navigation and visual input when an identity-only host check proves that a different window of the same browser is in front. It checks that exact foreground window again after delivery. Unknown identity, the target window being active, native input and connection setup retain the conservative guard. These before/after samples do not prove uninterrupted foreground preservation.

The exact source `7531ee7f3115265817e8dd56cf081672799bd8f4` passed 202 focused checks and the full local pilot gate: 2,045 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. Only version metadata and release-status prose changed after that gate. Universal app/DMG signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks passed. The app was installed from the exact DMG into isolated QA. Apple silicon received runtime verification; Intel received static verification. Remote CI run 362 passed for the exact source, including the pilot gates and unsigned universal package verification. Identities and receipts are in the [distribution record](./public-release.md).

The installed alpha.122 attached a public recipe window after the operator resized it through Chrome's Window menu. The initial five-dinner attempt paused before navigation after 23.726 seconds. Operator continuation resumed research for 316.411 seconds, reaching three recipes before a snapshot failed with `authorization_host_failed`; no five-dinner file was created. Safe diagnostics show zero authorization callbacks started/completed, but do not identify the underlying failure. A separate Wikipedia field held the exact test text in two samples while background actions continued; final/continuous foreground and clipboard preservation remain unverified.

The next source change preserves a closed set of native browser attestation failure codes that previously collapsed into `authorization_host_failed`. It applies only before any host callback starts, exposes no native detail, and does not change access checks or retry input. Regression tests reproduced the erased code before the fix; 212 focused desktop tests and 252 native browser tests pass (one native test ignored). This change is not in the alpha.122 DMG. The full pilot gate passed: 2,056 desktop, 46 Electron, 48 renderer and 72 phone-browser tests, plus shared/native/build/static checks. A Developer ID-signed Apple silicon QA app was verified and installed from source `cb944d2fb8bde9bef8686098ce6806f329816c29`; it is internal-only, not notarized or a replacement distribution DMG. The live trial below completed; broad acceptance remains open.

The internal trial completed a useful late-start museum backup in **70.663 seconds**, saving and reading back a 5,245-byte document. Independent review verified the three-hour schedule and separate walking/transit budgets; both source hashes stayed unchanged. The operator opened its Sia Preview attachment. The browser trial needed reconnection after restart, two foreground-input pauses and CUA Command-Tab recovery. Background scroll then succeeded, but navigation reported uncertain delivery and a fresh snapshot still showed the old recipe. The meal task ended without its output. The document task overlapped the first reconnected browser attempt for 9.225 seconds; only the document task succeeded. The new safe diagnostic did surface `browser_wrong_target_refused`, but the later navigation failure's underlying transport/native cause remains unknown.

The keep-awake assertion returns `0xe00002bd`, which Apple's installed IOKit SDK identifies as `kIOReturnNoMemory` (allocation failure). macOS power logs record actual idle sleep during this testing period. This is evidence of a host assertion failure, not missing app permission; its cause and reliable sleep recovery remain unresolved.

Two document tasks then overlapped for 36.563 seconds in separate workspaces before both paused on a Mac sleep event. The visitor task saved a useful 3,562-byte pocket guide, preserving its original source and correctly reconciling the budget. After recovery it read the file back but reported no tool for opening Preview; the operator opened and verified the rendered result. The household guide remains paused without an output. Same-folder queuing worked, but two successful concurrent tasks and unattended completion are not established. CUA repeatedly returned older UI state or no-frame/no-window errors during operator recovery; these observations do not isolate an application rendering defect.

Alpha.121 introduced the explicit return to Sia after direct Chrome setup, waiting up to 1.5 seconds for native foreground confirmation before resuming. Its exact-source CI run 359 passed. Alpha.122 also includes clearer ambiguous-window recovery guidance: resize the intended window; duplicate pages in another window's background tabs can prevent title disambiguation. Native filename input remains a separate unresolved issue. The owner denied typing the unexpected text seen during alpha.120; the operator restored the original copy name and verified both document hashes. Neither rename/move acceptance nor two successful concurrent tasks is established.

Cloud recording is selected by default in first-run setup. The notice discloses prompts, provider-reported usage, actions/results and screenshots; Continue saves the choice. Existing opt-outs and pauses remain respected. Ordinary AWS users can upload through the existing encrypted outbox and private archive. The control-function deployment completed without resource replacement. The installed app showed the default-selected notice and then **Recording** in Privacy.

On alpha.118, two real-provider tasks automatically uploaded 109 events to AWS without per-task recording actions. Independent S3 reads verified the batch hashes, prompt text, reported token usage, action results and three actual computer screenshots. A saved dinner plan became a practical prep checklist in 104.759 seconds; the result was saved, read back and opened in Sia Preview. Its original file remained unchanged. The native checklist handoff stopped when clicking the title failed to expose the Name field; both documents remained unchanged. These initial runs were sequential. A follow-up grocery task completed and reopened in 88.670 seconds while overlapping another stopped native recovery attempt for 18.208 seconds. Both planning sources remained unchanged; two successful concurrent tasks are still unverified.

The full local alpha.118 pilot gate passed: 2,007 desktop, 46 Electron, 48 renderer and 72 phone-browser tests, plus native/shared/build/static checks and 223 cloud tests. Remote CI run 345 passed for the exact DMG source revision (`db14166524a0d6fe80c5055fee6209a3bc5c96e7`). A separate authenticated disposable-user AWS transport check verified retry acknowledgement and complete deletion of all uploaded object versions. That synthetic check is separate from real-task acceptance.

Earlier alpha.115 browser tasks produced an itinerary and dinner/grocery plan with setup and review interventions. Native popup input, off-Space capture, restart recovery, continuous focus/clipboard preservation, two completed concurrent tasks, lock/sleep/voice and fresh-account acceptance remain open. A fresh Mac/account is unavailable. The alpha.117 popup-routing correction is included but was not exercised by alpha.118's stopped title-click attempt. The broad native test run still has the known host keep-awake failure; this is not an all-native pass.

The owner selected **Mac first; iPhone follows** and Lawrence Jang is the support/incident owner. The [Arena proposal](./arena-proposal.md) offers a bounded technical review and invited pilot, without claiming a partnership, validated ranking or completed acceptance. No artifact has been publicly published or sent to a recipient by this work.

The reported Fn voice outage was traced to a rejected AWS ElevenLabs key. The owner supplied a valid replacement; only the cloud credential changed, so alpha.118 needs no reinstall. An authenticated ordinary-user check passed catalog access, synthetic TTS, batch/realtime transcription and cancellation in 3.516 seconds. CUA also refreshed the installed app’s catalog and observed reply playback reach Speaking. Alpha.119 additionally passed microphone startup and stopping with no detected speech; a deliberately spoken command and physical Fn remain open because CUA cannot send Fn. The synthetic test did not record user audio. See the [voice repair evidence](./public-release.md#managed-voice-repair).

The follow-up source correction preserves native pre-callback attestation evidence through the action backend. A proved pre-dispatch connection failure now reports its bounded blocker code and that no input was sent, instead of claiming a lost navigation acknowledgement. Plain error strings and post-dispatch failures still do not prove non-delivery; no input is retried and no permission or window check is bypassed. Four regression cases failed before the correction, then all 246 focused browser/controller/result checks passed. The full local pilot gate also passed: 2,060 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. This correction was subsequently installed in a Developer ID-signed internal arm64 QA app (ASAR `b19683e7458593f8160ac2ced6c17d2e7c7fd188d620e51e4e5504daeff0fa18`); package/runtime checks passed. It is not a notarized distribution DMG. Obsolete Mac-route shell/AppleScript guidance was also replaced with screenshot-based computer-tool guidance.

The signed follow-up exposed two recovery problems: the model omitted scroll coordinates, then reused expired app/window IDs in a new turn and incorrectly requested renewed access. Operator guidance corrected both. The next browser run performed background scrolling and two verified navigations, but stopped after repeated page/document/geometry changes; the five-dinner output is still absent. A visitor-message and departure-checklist task completed in 62.352 seconds, saved/read back a 3,031-byte document under 500 words and returned its attachment. The operator verified its rendered Preview and all three planning-source hashes remained unchanged. It overlapped the failed browser run for 8.099 seconds; this is not two successful concurrent tasks. Independent AWS reads verified five automatically uploaded batches for three recent turns: 268 stored records, prompts, reported usage, action results and 11 screenshots. Content-addressed hashes and KMS encryption matched; no per-task recording switch was used.

The current source follow-up makes x/y mandatory in visual-pointer guidance, distinguishes missing coordinates and stale window IDs from access denial, and returns the validated replacement screenshot when a pre-input page check detects change. It never dispatches the old input or bypasses the document check. Four regression cases failed before the changes; 178 focused tests now pass. The full local pilot gate passed: 2,064 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. Signed-app acceptance of this follow-up is pending.

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
[native patch guide](../apps/desktop/native/cua/README.md). Keep the PR draft. The owner requested a local RA evaluation DMG; alpha.122 is prepared for that limited handoff with the known limitations disclosed. Do not publish, send invitations or contact Arena without authorization. Broad distribution still requires the remaining acceptance work.

## Alpha.119 candidate

Source inspection found that coordinate clicks could still take the native driver’s AXPress shortcut. Vision-only clicks now request `pointer_only`; the driver rejects semantic targets and focus/menu actions for that request and skips AX click delivery. Exact-window ownership, protection, geometry and focus guards remain. The alpha.118 DMG predates this correction. The desktop regression failed before the change and passes afterward; 526 selected native tests passed (one ignored), and `pnpm check` passed with 2,009 desktop tests. The subsequent Electron gate failed with nine failures and long stalls. Its unchanged rerun passed all nine but had one different early window-close failure (45 passed, one failed, five skipped); that isolated test then passed three consecutive runs. This is unresolved test/host instability, not a clean full-pilot pass. Separate renderer and phone-browser gates passed all 48 and 72 tests. Logs and initial/retry traces are retained privately in `pointer-only-source-checks`. This is not a demonstrated fix for the stopped TextEdit workflow.

Alpha.119 passes the full `pnpm test:pilot` command: 2,009 desktop tests, 46 Electron tests, 48 renderer tests, 72 phone-browser tests and 223 cloud tests, plus native/shared/build/static checks. The earlier intermittent failures and their traces remain recorded above. Universal packaging, notarization and installation from the exact DMG passed. Remote CI run 350 passed for the exact alpha.119 source, including pilot gates and unsigned universal package verification.

CUA started dictation in the installed alpha.119 app, observed Listening, stopped it and received “No speech was detected.” This verifies startup and stopping without the reported service-unavailable error; deliberately spoken content and physical Fn are still unverified. CUA cannot send Fn. External CUA input and screenshots became stale during the test; the window’s exposed Raise action restored responses. This operator intervention is not a Sia background-use pass.

The fresh native handoff ran for 57.659 seconds and stopped after Finder’s Go to Folder sheet and its parent both reported `ax_unresolved`. No rename or move occurred. A five-day meal-plan task reached Chrome connection recovery, then paused when the Mac slept; no output was saved. The later native retry returned HTTP 429. Alpha.119 labeled this as a subscription limit, but that classification is not supported by the generic error. These tasks did not establish successful concurrency. Private `alpha119-pointer-only/live-acceptance.json`, extracted trajectories and screenshots preserve the failures and voice evidence. Further real-provider acceptance requires a successful retry; no subscription reset time can be inferred from this 429.

The owner’s physical Fn attempt surfaced a personal-key error from a competing development installation. Both the development and QA apps had Fn helpers running. CUA disabled the development copy’s Hold Fn setting and verified it off; its Fn helper exited while the QA helper remained. A fresh physical Fn retry remains necessary. No shared credential was installed locally.

The owner subsequently confirmed “mic now works” and requested the latest DMG. Alpha.119’s checksum, Gatekeeper assessment and stapled notarization ticket were revalidated for that handoff. This is owner-reported microphone acceptance; no new independent spoken-command result or concurrency pass is claimed.

## Alpha.120 candidate

Alpha.120 is signed, notarized and installed from the exact DMG for internal verification. Finder's visible Go to Folder dialog is
a top-level `AXSheet`; the driver previously matched only `AXWindow`, rejecting an exactly
identified sheet as unresolved. Window scoping now accepts the exact sheet and excludes sibling
surfaces. Bounded application-child discovery supplements `AXWindows` only for the requested
ID and process. Visibility and focus requirements remain unchanged. A native regression failed
before the correction; 82 AX tests pass afterward. The pilot gate now explicitly includes
window-scope, bindings and core background-input tests. The full pilot rerun passed: 2,022 desktop,
46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static
checks. Signing, notarization, Gatekeeper and installation checks passed. The live retry reached TextEdit through Finder’s parent window but failed filename entry; the sheet itself remained unresolved. Remote CI run 355 passed, including unsigned universal package verification. Native rename/move/reopen and successful concurrency remain open. The first
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
`memory-review-source-checks/pilot-gate.log`. This correction is included in alpha.120; no live six-hour review cycle is claimed.

A generic HTTP 429 was incorrectly translated into an exhausted-plan message with the saved subscription reset time. Error formatting now distinguishes request-rate failures from explicit usage/quota failures. Bare 429 and rate-limit messages advise waiting and retrying without claiming a plan reset; explicit usage/quota errors retain their guidance, and original errors remain under Details. Five focused checks reproduced the old behavior; all 17 focused tests pass after the correction. The full `pnpm test:pilot` passed: 2,013 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. Private evidence is retained in `rate-limit-source-checks/pilot-gate.log`. This change is included in alpha.120.


The alpha.120 document task lasted 154.066 seconds. Its recorded images showed the original name after typing; later operator inspection found different uncommitted text. Its origin/timing is unresolved, so screenshot freshness and input isolation are not accepted. The operator’s popover Cancel action committed that pending name, which was then restored through TextEdit. Both source hashes match the baseline and the requested destination is absent. The meal task overlapped for 20.260 seconds, required Chrome reconnection and a tab-selection recovery, then paused on sleep and, after Continue, on Chrome being active. No five-dinner output exists. Exact turns and interventions are in the [artifact record](./public-release.md#current-ra-evaluation-artifact).
