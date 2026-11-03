# Release status

Updated November 3, 2026. **A signed, notarized alpha.122 DMG is available for the requested RA evaluation. Broad distribution and Arena acceptance remain open.**

## Current artifacts

| Artifact | Exact source and verification | Scope |
| --- | --- | --- |
| RA evaluation DMG, alpha.122 universal | `7531ee7f3115265817e8dd56cf081672799bd8f4`; signing, notarization, stapling, Gatekeeper and package/runtime checks passed. Local pilot and remote CI run 362 passed. | Apple silicon runtime; Intel static verification. Known limitations below apply. |
| Installed internal arm64 QA | `2c0deaac7593a8c6a8185dace9504902b8b02559`; ASAR `23ccb8eea100d6efeee814267782cfce2573d0d3445cb1871166e903ed1eca02`; Developer ID and package/runtime checks passed. | Includes browser recovery and partial-activation focus restoration after the DMG. Not notarized or a replacement distribution artifact. |

Exact paths, hashes, operator interventions and private receipts are in the
[distribution record](./public-release.md). Older candidate history remains there and in Git;
this page describes current evidence and outstanding requirements.

## Current evidence and open gates

| Area | Observed evidence | Still required |
| --- | --- | --- |
| Automated checks | Installed QA source passed the full pilot rerun: 2,075 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. Three real native browser-session probes passed. | Automated checks do not establish live usefulness. Two executable-sandbox tests timed out initially; isolation and the unchanged full rerun passed, but the cause is undiagnosed. |
| Useful personal tasks | On signed QA, recipe research and an outing checklist completed with 67.582 seconds of overlapping successful turns and interleaved actions. Independent recipe/quantity/budget/timing review and both Sia Previews passed. All 11 original source hashes stayed unchanged. | Repeatability and unattended completion. Browser setup required operator reconnection; the checklist included an intentional Stop and continuation. This was browser plus file work, not two native-app tasks. |
| Stop and performance | Stopping the checklist left browser research running. Resumed checklist: 67.582 seconds. Recipe task after reconnect: 241.765 seconds. | Two native workflows, same-window contention, continuous foreground/clipboard preservation, wider cancellation/recovery, and acceptable repeated end-to-end latency. Before/after focus samples are insufficient. |
| Native filename input | Both pre-restart attempts and the post-restart coordinate-addressed typing attempt failed to show the requested name. Original/duplicate RTF hashes stayed unchanged; no destination file was created. | Fix typing, then rename/move/close/reopen and verify complete contents. An earlier alpha.120 mismatch between recorded images and later uncommitted field text remains unexplained; input isolation and capture freshness are not accepted. |
| Browser recovery | After QA restart, Chrome recovery selected the same approved public window and resumed the task automatically. Five stale-page refusals recovered through fresh observations. Exact SDK lease-expiry envelopes now reach connection recovery. | Natural idle-expiry recovery, repeatable restart recovery, permission-prompt dismissal, network errors, and live same-browser coexistence. The previous raw native lease envelope was not retained, so its cause is not proved. |
| AWS recording | Four automatic batches for the successful personal tasks contained prompts, usage, action results and 12 screenshots. Stored payload hashes and KMS encryption were verified. | Retain default disclosure, explicit opt-outs, paused capture, deletion and exclusions. These records do not establish research-release consent or permissions for other people. |
| Handoff and public disclosure | Installed-app onboarding now separates evaluation from developer setup. Repository privacy/site/infrastructure copy matches default-on recording and ordinary-user eligibility; site build/check and download tests pass. | Publish the reviewed disclosure changes only with authorization, then verify live pages. Direct HTTP checks on November 3 at 00:24 UTC found no default-on notice in the live privacy page and `/download/` returned 404. No site or installer was published. |
| Keep-awake, voice and installation | Before restart, native tasks and an independent process failed to create idle-sleep prevention (`0xe00002bd`). After restart, the independent probe and Sia’s live assertions succeeded. Owner reported the microphone works after duplicate Fn helpers were resolved. | Explain the prior host assertion failure and verify sustained keep-awake and lock/sleep recovery. Physical Fn/spoken-command coverage is owner-reported, not independently reproduced. Fresh sign-in/permissions and Intel runtime remain unverified; no fresh account or second Mac is available. |

The native task ended at 23:51:09.467 UTC and its supervised diagnostic at 23:57:01.244 UTC,
November 2. The post-restart typing diagnostic also failed at 02:40:42.115 UTC, November 3.
The two RTFs remain 1,874 bytes with SHA-256
`bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`.
Private receipts in `alpha122-browser-lease-internal` preserve action records, file checks and
power samples. Failure outside Sia does not establish the underlying system cause.

Earlier signed diagnostics already found matching window/field process identities and granted
Accessibility/event-posting access; switching native typing to public `CGEventPostToPid` also
failed. A newly prepared duplicate experiment was abandoned before installation and its source
changes removed. Inspect those receipts before proposing another transport variant.

The owner restarted the Mac at 9:26 PM Eastern on November 2. The independent IOKit assertion
then succeeded, and both Electron and Cua Driver keep-awake assertions were present during a
signed QA task. This resolves that reproduction of assertion creation failure; physical sleep/lock
and sustained behavior still need acceptance. CI run 371 passed for `07a685d`, including the full
pilot gate and unsigned universal package verification; signing was not run.

Two post-restart attempts on an off-Space TextEdit window stopped when capture failed after
opening its title control. After relaunching the unchanged QA with diagnostic logging, a read-only
capture showed the selected filename. Coordinate-addressed background typing still did not change
the name in Sia's returned image. A later independent operator accessibility observation showed
different uncommitted text in that field. Its origin and the image/state mismatch remain unresolved;
the owner has been asked whether they typed that text elsewhere. Further diagnostics must establish
where input lands and whether captures update before attempting the remaining workflow. Private evidence is in
`alpha122-after-restart`; no rename, move or close/reopen pass is claimed.

A subsequent source review found a separate cleanup gap: failed private activation could leave
the exact target holding keyboard focus without triggering restoration. The correction restores
that observed target only while the user’s app remains foreground; unknown and unrelated focus
holders remain untouched. The regression failed before the fix and all 19 focused click tests
passed afterward. The full local `pnpm test:pilot` gate then passed, including 2,075 desktop,
46 Electron, 48 renderer and 72 phone-browser tests, plus shared, cloud and native checks.
The correction is installed in signed internal QA, but not the DMG. On November 3 at 19:58–20:00 UTC,
read-only capture and one title-control click produced screenshots matching independent TextEdit
observations. One coordinate-addressed background typing attempt still left the original name selected.
This time Sia’s returned image and the subsequent independent accessibility observation agreed; no
new unexpected field text was observed. No rename was committed, and both file hashes remain unchanged.
The partial-focus fix does not resolve text delivery or explain the earlier mismatch. Private receipt:
`alpha122-focus-restoration-internal/live-diagnostic.json`.

## Release requirements

- Vision-only computer use is the default throughout Sia. Models receive screenshots and choose
  coordinates, literal text and keys. DOM/AX observations, element references, OCR, semantic setters
  and provider-native UI/shell tools cannot substitute for this route. Host access, protected-surface,
  window identity, stale-image, cancellation and foreground checks remain enforced.
- Useful personal work must finish on the signed candidate: real-source research and writing,
  file/document preparation and planning, with independently verified deliverables. Smoke fixtures,
  isolated shortcuts and operator-completed steps do not satisfy this requirement.
- Background work must preserve the person's app and clipboard. The browser-plus-file trial above is one successful overlap. Verify repeatability, two native-app
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
