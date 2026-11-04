# Release status

Updated November 4, 2026. **A signed, notarized alpha.122 DMG exists, but RA handoff is blocked by native background input and input-isolation failures. It does not contain the latest internal browser fixes. Broad distribution and Arena acceptance remain open.**

## Bounded RA handoff goal

**November 4 acceptance clarification:** the RA handoff is a first milestone, not a replacement
for the full distribution goal. Real personal workflows, CUA-operated Sia controls, background
operation alongside the person's work, preserved inputs, independently checked outputs and
matching automatic AWS archives determine readiness. Manual rescue is recorded as failure of
autonomous acceptance. Unit tests, synthetic fixtures, diagnostics and signing are supporting
checks; none substitutes for working functionality. Each cycle must deliver a targeted repair
and a live rerun or establish a concrete blocker. The current menu-routing diagnostic gets one
signed selection trial to distinguish missing/disabled menu matches from skipped menu lookup;
its result must lead to an evidenced repair or a blocker, not another unchanged workflow loop.

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

## Current targeted repair

Signed internal QA `7fe2089` completed the practical commute-card follow-up using the same
approved public Chrome window after app restart. Two evidenced browser defects were repaired:

- The consent observer missed a native focused sheet that operator CUA could see. The bounded
  fallback inspects only a native sheet belonging to the already-approved process and retains
  exact consent matching. In this live run, its diagnostic confirms that the fallback found the
  sheet and acceptance settled in 143 ms.
- WindowServer middle-elided the approved window's title while several Chrome windows shared
  its geometry. Full-title containment refused the binding. Substantial exact prefix/suffix
  matching around one ellipsis now preserves unique-or-refuse decisions. The regression failed
  before the fix; the live diagnostic found one exact binding among 29 tabs in seven windows.
  Duplicate candidates still refuse; missing geometry still permits only a read-only heuristic.

All 20 focused binding tests and the full local pilot gate passed on the exact source: 2,075
desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/
static checks. Developer ID signing, installed strict signature and package/runtime verification
passed. CI run 384 passed its pilot step but was cancelled during unsigned universal packaging;
release signing was skipped. This app is not notarized and is not the distribution DMG.

The commute task completed at **03:48:20.526 UTC November 4** (November 3 Eastern), **109.402
seconds** after its final continuation. Initial execution paused on Mac sleep. After the owner
unlocked, the first continuation correctly paused while Chrome was still foreground. Operator CUA
activated the exact Sia window through its native Window menu and clicked Continue. No operator
reconnected Chrome, selected a browser window or supplied browser input during the run. Sia
recovered the approved window, captured/scrolled USDA guidance and saved/read back the card.
This is one recovered useful task, not repeatable unattended recovery acceptance.

Independent review checked the 5¼-hour interval, discard deadlines, conditional cold-holding
advice, shelf-stable alternative, quantities and separate grocery/equipment costs against three
readable source screenshots and the saved plans. All nine baseline planning files are byte-for-byte
unchanged. Sia Preview opened with matching content and a readable signed-app screenshot after
an initial stale capture. An unsent foreground reminder eventually appeared intact and was cleared;
its delivery timing was not established. It does not prove
concurrent input isolation.

AWS uploaded all three segments automatically: **174 events**, including the original prompt,
**28 usage records, 15 matching action results and three byte-matching PNGs**, interruption and
completion events. Object hashes and KMS encryption passed. Private receipts in
`alpha122-elided-title-internal` include `commute-acceptance.json`,
`aws-recording-verification.json`, `installation.json` and `pilot-result.json`.

### Native workflow: partial success, acceptance still blocked

Signed internal QA `68eecb4` adds a content-free `window_not_key` diagnostic without changing
input dispatch or its guards. The full pilot gate passed: 2,082 desktop tests, 46 Electron checks,
48 renderer checks and 72 companion checks, plus native/cloud/shared/build/static gates.
Developer ID, packaged-runtime and installed strict-signature checks passed. It is not notarized.

The latest Finder comparison distinguishes two routes:

- At 22:15 UTC November 4, exact-window key preparation passed, but background Cmd+Ctrl+N used
  synthetic events and created no folder. Independent disk verification confirmed no change.
- The operator opened Finder's File menu, observed the enabled folder-with-selection command and
  cancelled without invoking it. One subsequent background Cmd+Ctrl+N used the accessibility menu
  route and created `New Folder With Items`, containing `Sia Arena handoff checklist.rtf`.
  Independent disk verification confirmed all 1,874 original bytes and SHA-256
  `bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`.

The route and outcome changed after operator menu inspection. Menu initialization is a lead;
causality and unattended reliability remain unproved. The next continuation stopped **before input**
at 22:20 UTC because fresh
capture returned `visual_observation_unavailable`; the native diagnostic was
`capture_off_space,capture_backing_missing`. Naming the folder `RA review`, editor inspection,
close/reopen and continuous input isolation remain incomplete. Do not replay the successful
folder command. The complete bounded workflow still must pass without operator menu preparation.

Selecting the exact Finder window through its Window menu restored the missing name in both
operator screenshots and AX state. The name stayed visible after selecting Sia. At 22:29 UTC,
one background Return made the label disappear again; two read-only snapshots did not verify an
inline rename field, so no replacement text was typed. A separate Get Info continuation opened
the correct folder panel in background, but Cmd+A did not visibly select its name. It stopped at
22:31 UTC without typing. The original file hash and folder name remain unchanged. The Info panel
is open; do not replay either uncertain input. These are assisted diagnostics, not acceptance.

Related upstream [Finder rename reports](https://github.com/trycua/cua/issues/4615) describe a
transient editor that closes when activation is restored. The proposed
[focus fix](https://github.com/trycua/cua/pull/4616) is still open and explicitly leaves its
other-app-active cases failing; it was not adopted as a background repair. This is a related lead,
not proof of the cause on Sia's candidate. Further changes must distinguish menu lookup, key
delivery and focus restoration rather than repeat the same inputs or relax target checks.

The three initial diagnostic turns uploaded automatically: **101 events, all three matching prompts, 30 usage
records, nine matching action results and five byte-matching screenshots**. Object hashes and KMS
encryption passed. Private `alpha122-key-window-internal` contains `finder-menu-comparison.json`,
per-turn `native-archive-verification-<turnId>.json`, installation/signature receipts and logs.
The two later rename turns added **108 verified archived events, two matching prompts, 32 usage
records, 12 matching action results and nine byte-matching PNGs**, with matching object hashes and
KMS encryption. `finder-rename-comparison.json` records the interventions and unchanged file.
The full pilot log is `alpha122-elided-title-internal/key-window-diagnostic-pilot.log`.

Operator CUA initially showed no composer changes and returned `noWindowsAvailable`. Earlier text
attempts later appeared as a duplicated unsent draft. It was normalized and independently checked
against the exact single prompt before submission; no duplicate task was submitted. Native Window
menu selection and refreshed controls allowed continuation. The manual typing request was withdrawn.
This behavior does not by itself establish whether the delay arose in Sia or the external tool.

Earlier signed QA `7fe2089` passed Finder background field typing and a committed file rename,
with unchanged contents. Its successful typing turn archived 27 events, eight usage records,
three matching action results and two matching screenshots. A matched TextEdit comparison on
`e842725` inserted text in foreground but failed in background; both turns archived 90 events,
28 usage records, 12 matching actions and eight matching screenshots. These observations are
app/control-specific and do not establish general background typing. Prior failed transport variants
remain documented in the [native integration guide](../apps/desktop/native/cua/README.md).

The older iCloud duplicate was downloaded and restored by operator CUA to `Untitled 8 copy.rtf`;
its complete bytes match the original and the baseline hash above. This resolves availability and
contents, **not the origin of the unexpected filename or input isolation**. Operator semantic cleanup
does not count as Sia vision-only acceptance. Receipts are in `alpha122-focused-consent-internal`.

Sia itself need not be foreground: successful Finder input ran while another app was active.
Initial macOS/Chrome approvals remain person-owned; ordinary task authorization was automatic.
Removing permission or foreground-protection checks would not fix the observed delivery failures.
Artifact identities and earlier evidence are in the [distribution record](./public-release.md).

## Current artifacts

| Artifact | Exact source and verification | Scope |
| --- | --- | --- |
| RA evaluation DMG, alpha.122 universal | `7531ee7f3115265817e8dd56cf081672799bd8f4`; signing, notarization, stapling, Gatekeeper and package/runtime checks passed. Local pilot and remote CI run 362 passed. | Apple silicon runtime; Intel static verification. Known limitations below apply. |
| Installed internal arm64 QA | `68eecb44a152f8adb16dff128c2a810e220de0d1`; ASAR `04d7e8964683a25e016ff75b1de4663614df92dd93a865258265fe58649a0603`; full pilot, Developer ID and package/runtime checks passed. | Finder folder creation/move succeeded after operator menu preparation. After capture recovery, inline rename and Info-field selection remained unverified. Full native acceptance remains open. Not notarized or a replacement distribution artifact. |

Exact paths, hashes, operator interventions and private receipts are in the
[distribution record](./public-release.md). Older candidate history remains there and in Git;
this page describes current evidence and outstanding requirements.

## Current evidence and open gates

| Area | Observed evidence | Still required |
| --- | --- | --- |
| Automated checks | Current diagnostic source `68eecb4` passed the full pilot gate: 2,082 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. The packaged guidance also passed 15 focused runtime tests. Earlier source `e7dd676` passed CI run 377, including unsigned universal package verification. Earlier `7fe2089` CI run 384 passed the pilot step; unsigned universal packaging was cancelled. | Release signing was skipped in CI. Automated checks do not establish live usefulness. Two earlier executable-sandbox timeouts remain unexplained despite passing isolation and rerun. |
| Useful personal tasks | On signed QA, recipe research and an outing checklist completed with 67.582 seconds of overlapping successful turns and interleaved actions. Independent recipe/quantity/budget/timing review and both Sia Previews passed. All 11 original source hashes stayed unchanged. | Repeatability and unattended completion. Browser setup required operator reconnection; the checklist included an intentional Stop and continuation. This was browser plus file work, not two native-app tasks. |
| Stop and performance | Stopping the checklist left browser research running. Resumed checklist: 67.582 seconds. Recipe task after reconnect: 241.765 seconds. | Two native workflows, same-window contention, continuous foreground/clipboard preservation, wider cancellation/recovery, and acceptable repeated end-to-end latency. Before/after focus samples are insufficient. |
| Native workflow | Finder background typing and file rename passed. Folder creation/move passed after operator File-menu preparation, with all original bytes intact. TextEdit background field typing failed in the matched comparison. | Complete folder naming and editor inspection/close/reopen, then repeat the bounded workflow without operator menu preparation. Capture availability, the earlier unexpected input’s origin and continuous input isolation remain unresolved. |
| Browser recovery | After QA restart, Chrome recovery selected the same approved public window and resumed the task automatically. Five stale-page refusals recovered through fresh observations. Exact SDK lease-expiry envelopes now reach connection recovery. | Natural idle-expiry recovery, repeatable restart recovery, permission-prompt dismissal, network errors, and live same-browser coexistence. The previous raw native lease envelope was not retained, so its cause is not proved. |
| AWS recording | Four automatic batches for the successful personal tasks contained prompts, usage, action results and 12 screenshots. Stored payload hashes and KMS encryption were verified. | Retain default disclosure, explicit opt-outs, paused capture, deletion and exclusions. These records do not establish research-release consent or permissions for other people. |
| Handoff and public disclosure | Installed-app onboarding now separates evaluation from developer setup. Repository privacy/site/infrastructure copy matches default-on recording and ordinary-user eligibility; site build/check and download tests pass. | Publish the reviewed disclosure changes only with authorization, then verify live pages. Direct HTTP checks on November 3 at 00:24 UTC found no default-on notice in the live privacy page and `/download/` returned 404. No site or installer was published. |
| Keep-awake, voice and installation | Before restart, native tasks and an independent process failed to create idle-sleep prevention (`0xe00002bd`). After restart, the independent probe and Sia’s live assertions succeeded. Owner reported the microphone works after duplicate Fn helpers were resolved. | Explain the prior host assertion failure and verify sustained keep-awake and lock/sleep recovery. Physical Fn/spoken-command coverage is owner-reported, not independently reproduced. Fresh sign-in/permissions and Intel runtime remain unverified; no fresh account or second Mac is available. |

The native task ended at 23:51:09.467 UTC and its supervised diagnostic at 23:57:01.244 UTC,
November 2. The post-restart typing diagnostic also failed at 02:40:42.115 UTC, November 3.
At those historical checks, both RTFs were 1,874 bytes with SHA-256
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

A later read-only preflight ended at 20:36:08.706 UTC with
`visual_observation_unavailable`; the designated TextEdit window was off the current Space.
No input was attempted by Sia, and both document hashes remain unchanged. The owner approved
one bounded foreground keyboard comparison, but unreliable operator CUA input prevented
opening Settings, so that first attempt did not reach the comparison or change background policy.
This adds no foreground or background keyboard acceptance. Private receipt:
`alpha122-focus-restoration-internal/foreground-comparison-preflight.json`.

The subsequent approved foreground comparison reached a fresh screenshot at 20:44:33.822 UTC.
The uncommitted Name field contained unexpected text, so the conditional diagnostic stopped
without clicking or typing. It completed at 20:44:42.629 UTC; this is not a keyboard-delivery
pass. Both file hashes remain unchanged. The operator restored and verified Work in background
with Pause and tell me. Moving QA through its native Window menu had restored operator input;
that intervention is not evidence of unattended recovery. The text's origin remains unresolved.
Private receipt: `alpha122-focus-restoration-internal/foreground-comparison.json`.

A fresh lunch-planning task on the same signed QA stopped at 20:17:23.189 UTC on November 3.
The agent selected an unrelated Chrome window despite the request to reuse the prior public
research window. None of the nine Chrome inventory entries had a recognizable recipe/USDA
identity; eight had no source URL. Observation and prepare-only recovery refused, and no
navigation, source inspection or output write occurred. All 13 planning-source hashes remain
unchanged. This is a target-selection failure, not a valid recovery test of the intended window.
The follow-up source guidance distinguishes connection readiness from task relevance and tells
the agent to stop when the requested window cannot be identified. Its signed-app retry correctly
requested the window chooser without observing or navigating an unrelated window; this was
one successful regression observation, not an authorization change. Private receipt:
`alpha122-focus-restoration-internal/lunch-recovery/result.json`.

On signed QA `2ac42bc`, a subsequent lunch task completed in 283.113 seconds after the operator
created and connected a fresh public Chrome window. Sia inspected two Budget Bytes recipes and
USDA guidance, saved and reread `nov9-lunch-prep.md` and `nov9-lunch-groceries.md`, and recovered
from three stale-page checks without intervention during that turn. Independent review confirmed
the recipe scaling, five-lunch allocation, $30 estimated whole-package basket plus $5 cushion,
and safe late-week freezing. All 13 existing source hashes were preserved. Both previews opened;
the grocery table's no-wrap header hid its price column beyond the initial viewport. The header-wrap
correction passed the full pilot gate and signed visual verification on `e7dd676`: all four columns
and the first two prices are visible without horizontal scrolling. This is a supervised browser-plus-file task, not
native typing or concurrent-use acceptance. Five automatic AWS batches contained 209 records
(204 events after reassembling five chunk groups), including prompt, usage, action results and
15 PNGs whose hashes matched the local trajectory. Stored batch hashes and KMS encryption passed.
Private receipts: `alpha122-window-selection-internal/lunch-acceptance.json` and
`aws-recording-verification.json`.

The subsequent cold-lunch follow-up on `e7dd676` failed after restart. Initial inventory could not
identify the public research window; operator CUA found the USDA tab behind a selected New Tab.
After selecting the existing USDA tab and resuming without reconnecting, preparation refused with
`browser_wrong_target_refused` (safe diagnostic: `consent_not_settled`); observation then required
browser connection. The resumed attempt ended at 21:21:14.812 UTC without an output. Existing
source documents remain unchanged. This is a failed restart-recovery test, not a useful-task pass.
Private receipt: `alpha122-table-preview-internal/restart-trial.json`. Automatic recording of both failed attempts was also verified
from AWS: two encrypted batches, 88 events, prompt, usage, eight action results and two capture
completion records. Both stored object hashes matched. No screenshot was expected because both
attempts failed before capture; the earlier successful lunch trial separately verified screenshots.
All 15 existing workspace documents remain unchanged. Private receipt:
`alpha122-table-preview-internal/aws-recording-verification.json`.

On `5011ab3`, the first continued attempt again could not identify the public window. Operator
CUA then selected only the existing USDA tab via Chrome Tab Search and brought Sia forward.
The subsequent failed connection attempt is described above; neither attempt reached a successful
screenshot or UI input. All 15 source hashes remain unchanged. Two new automatic AWS batches
contain 87 events, including 18 usage records, nine action results, automatic authorization and
two capture completion records. Both stored object hashes and KMS encryption passed. The original
prompt in the earlier batch for this continued turn exactly matches the local prompt; no new prompt
was submitted. No screenshot is expected for these failures. Private receipts:
`alpha122-consent-deadline-internal/live-retry.json` and `aws-recording-verification.json`.

The approved native comparison was not reached on this candidate. Operator CUA initially timed
out binding TextEdit, then showed no designated duplicate in its Window menu and could not
provide a screenshot after Open. No text typing, rename commit or Sia settings change occurred.
A new hash check blocked reading the iCloud document and was interrupted, so no fresh native-file
integrity claim is made. This is a diagnostic/tool barrier, not a new Sia input result. Private
receipt: `alpha122-consent-deadline-internal/native-comparison-preflight.json`.

## Later broad-release requirements

These remain future milestones; they are not the exit criteria for the bounded RA handoff above.

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
