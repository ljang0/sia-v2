# Release status

Updated November 5, 2026. **Native document creation, visitor research and a fresh dinner-planning task completed without task-time rescue. The dinner run followed explicit Chrome setup; automatic recovery after restart still fails when another Chrome window is active. The duplicate cancellation-capture bug is repaired and verified in signed QA with matching AWS records. RA handoff remains held for recovery, input/observation reliability and exact-installer acceptance. The notarized alpha.122 DMG lacks later fixes; broad distribution and Arena acceptance remain open.**

## Bounded RA handoff goal

**Definition of done:** deliver a usable Mac app, not a collection of test results. The next
release decision has five gates:

1. From ordinary prompts, complete useful browser research and native document work through
   the installed app; independently check the saved results. No task-time operator rescue.
2. Let the person keep using another window: preserve their text, focus and clipboard; make
   Sia's composer, task controls and Stop work through CUA. Record elapsed time, stalled periods
   and retries. Unexplained misdirected input or recurring stalls fail acceptance.
3. Reuse initial access grants after restart, with automatic ordinary-task authorization.
   Person-owned macOS grants are setup, not permissions that the app can silently enable.
4. Automatically archive the exact prompts, provider usage, actions/results, screenshots and
   terminal outcome in AWS; independently match them to the local run, retaining disclosure
   and explicit opt-outs.
5. Ship those verified behaviors in one signed, notarized DMG with a short setup guide and
   honest limits. Keep the changed code focused, remove superseded experiments, and maintain
   a short architecture walkthrough and Arena proposal.

A first RA evaluation does not complete the broader goal of reliable concurrent desktop work.
Two simultaneous native workflows and wider recovery coverage remain explicit follow-on gates.
Work only on an open gate: identify a user-visible failure, repair its evidenced cause, and rerun
that useful path. Do not build again for documentation changes or rerun passing suites without a
new change or unresolved concern. A failed attempt stays in the evidence; do not relabel it a pass
because a diagnostic continuation succeeded.

**November 4 acceptance clarification:** the RA handoff is a first milestone, not a replacement
for the full distribution goal. Real personal workflows, CUA-operated Sia controls, background
operation alongside the person's work, preserved inputs, independently checked outputs and
matching automatic AWS archives determine readiness. Manual rescue is recorded as failure of
autonomous acceptance. Unit tests, synthetic fixtures, diagnostics and signing are supporting
checks; none substitutes for working functionality. Each cycle must deliver a targeted repair
and a live rerun or establish a concrete blocker. The menu-routing diagnostic identified a missing native edit-session step; its successful
explicit-click comparison now informs the functional guidance repair. Do not repeat diagnostic
builds or unchanged workflow loops instead of completing fresh-conversation and input-isolation acceptance.
Acceptance starts with an ordinary user request on the candidate, without operator-supplied click,
key or recovery instructions. Diagnostic continuations count only as evidence for a repair; the
default app must perform the sequence itself before that workflow passes.

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

Signed `bed8a3c` preserves only allowlisted native network-error codes, recognizes the
exact browser error-document URL without exposing its pixels or controls, and directs research
recovery through a known public search page instead of guessed replacement domains. It preserves
post-action focus checks, rejects stale input, and does not reinterpret certificate or policy
errors as network failures. All 274 focused checks and signed package/runtime checks pass.
The fresh ordinary Phipps task completed autonomously in 456.682 seconds, recovered from the
failed restaurant domain through public search, and saved a complete 4,735-byte plan. Independent
checks confirm the saved bytes, source screenshots, budget arithmetic, six unchanged RTFs and
both additions to an unrelated Chrome draft. AWS matches the exact prompt, completed outcome,
96 usage events, 47 actions and 38 PNGs in 34 encrypted batches (426 stored / 370 logical records).
Private receipt: `sheet-visibility-acceptance/network-recovery-acceptance.json`.

This passes the useful browser workflow, not overall distribution acceptance. Three changed-page
retries and a 72.142-second event gap before report writing remain recorded. One operator CUA
observation timed out after the write; a later read showed completion. Continuous focus/clipboard
isolation, cold restart recovery and exact-DMG acceptance remain open. The full pilot gate passed
on this source: 2,115 desktop tests (23 skipped), 46 Electron checks (five skipped), 48 renderer
and 72 companion checks, plus build/static/shared/cloud/native gates. Log:
`network-recovery-pilot.log`. The previous failed run below remains failed.

Signed `5a8b1e5` changes the browser timeout guidance: keep a failed source local, allow a
bounded attempt at a different permitted source in the same tab, and save verified findings
with explicit gaps. It does not repeat uncertain input or widen permissions. A preceding
same-tab diagnostic proved navigation away from an error page works; the connection reuse
repair in `1cf54d8` is retained. Cold process restart recovery remains open.

The fresh ordinary Phipps request ran for 327.834 seconds without task-time rescue and saved a
4,010-byte partial plan. The original restaurant timed out; the alternate failed DNS resolution.
Sia mislabeled the browser error document as outside its grant, then saved its verified findings.
Lunch details, paying-adult reservation rules and date-specific notices remain unfinished, so
both terminal outcome and acceptance are failed. The next evidenced defect is failure
classification and recovery from a browser-generated network error, not missing user permission.
Two changed-page retries are retained. Independent verification matches the saved file and its
arithmetic; six protected RTFs and both additions to an unrelated Chrome draft remained intact.
Continuous global focus/clipboard isolation is unproved.

AWS matches the exact prompt, failed outcome, 56 usage events, 26 actions and 15 PNGs in nine
encrypted batches (289 stored / 277 logical records). Private receipt:
`sheet-visibility-acceptance/recovery-acceptance.json`. Earlier failed runs and the successful
recovery diagnostic remain in the [acceptance record](./public-release.md) and private receipts.
The full pilot gate passed on this source, followed by signed package/runtime and installed
strict-signature verification. No distribution claim follows from those checks.

During diagnostic preparation, operator CUA typing introduced punctuation/spacing errors in an
unsent draft; CUA paste corrected it before submission. This remains input-reliability evidence,
not a resolved issue. The current setup also required rebinding CUA after two
`failedToCreateImageDestination` observation errors; no live task was underway then.

Earlier signed QA `6b24a04` passes the previously failing Finder Go to Folder path in 58.737
seconds. It selects the field, types the requested path through keyboard events and opens the
correct folder without operator rescue. Independent CUA inspection confirms the folder and file;
five protected RTFs retain their hashes. An unrelated Sia draft remains exact. This is a targeted
regression pass, not broad usefulness or continuous input-isolation acceptance.

A fresh ordinary personal request on the same installed build completed in 206.524 seconds:
Finder duplicated and named the source; TextEdit reorganized the reminders into a dated,
printable checklist, saved, closed and reopened it. Independent disk and CUA checks confirm the
exact filename, three requested sections and 14 unchecked items covering every original reminder.
All five prior RTFs are byte-identical. Both additions to an unrelated Sia draft stayed intact.
The longest event gap was 33.459 seconds during keyboard-only entry of 748 characters. A checkpoint
update was rejected after the model changed an existing source label; the agent restored the label
and continued. The historical failed step remains visible. No task-time operator rescue occurred.
Continuous focus/clipboard preservation and two simultaneous native workflows remain unproved.

AWS independently matches both completed outcomes: the panel run has 10 actions, seven PNGs and
22 usage events in two batches (73 stored / 69 logical records); the personal task has 25 actions,
19 PNGs and 54 usage events in three batches (209 records). Each has one finalization. Private
receipts: `sheet-visibility-acceptance/field-acceptance.json` and
`personal-checklist-acceptance.json`, with signed identities and read-only archive receipts nearby.

The repairs preserve exact sheet identity in three host checks: visibility, native menu context
and focused-field ownership. Parent-document ownership still applies to ordinary ownership reads;
a different window, replaced sheet, missing visibility or unproved ancestry still refuses input.
The model receives screenshots, not AX content, and visual text entry uses keyboard events.
An explicit `no_focused_text_input` preflight refusal is now recorded as refused rather than
uncertain delivery. Each correction has a failing-before/passing-after regression. Signed
package/runtime and installed strict-signature checks passed. After correcting the documentation
formatting failure, the full pilot passed on `283d1f4` (the same functional source as installed
`6b24a04`): 2,101 desktop tests (23 skipped), 46 Electron checks (five skipped), 48 renderer
and 72 companion checks, plus build/static/shared/cloud/native gates. The failed first log is retained.

Failed diagnostics remain failed: `04fdb7d` refused visibility (35.122 seconds), `b15d68c` fixed
visibility but refused the sheet's Select All menu context (55.279 seconds), and `d4b4f73` fixed
that route but refused focused-field ownership (51.248 seconds). All preserved source files;
AWS matches their exact failed outcomes. The `0385bc4` opt-in diagnostic distinguished the raw
focused sheet from its parent without changing input decisions. These are repair evidence,
not additional successful use cases. Earlier `52a81f3` completed an ordinary reviewer-copy task
in 225.015 seconds by using another Finder window; its full pilot passed, but did not prove panel
input. Current evidence supersedes that panel limitation, not the remaining browser/isolation gates.

Included `e2c1dd7` backports upstream Cua [#6182](https://github.com/trycua/cua/pull/6182), replacing
a potentially cached AppKit foreground PID with a live WindowServer query. Upstream reproduced
that defect in a no-overlay host; its causal relationship to Sia's observed failures is unproved.
Sia's separate signed observer and all foreground/setup guards remain unchanged.

The prior `e2c1dd7` combined acceptance remains failed: native work stopped at panel discovery
in 51.234 seconds, and browser work ended failed after 338.847 seconds. The approved Chrome
connection restored automatically with Chrome inactive, but later navigation lost acknowledgement
and a bounded read timed out. Only a clearly provisional itinerary was saved. Four original files
and an unrelated draft stayed intact; no task-time rescue or concurrency pass occurred. AWS matches
both failed outcomes, 44 actions and 28 PNGs, with one finalization per turn. Private receipts:
`live-foreground-acceptance`. Its full pilot also failed the real Electron bare-launch fixture
(exit 1, no output); an isolated rerun and the new full run pass, but the original cause remains
unexplained. Neither these results nor the new native-task pass authorizes a distribution DMG.

An ordinary three-dinner research request on installed `a2d63b8`, alongside operator notes in
TextEdit, failed after 124.621 seconds. It produced no dinner plan. Repeated
`browser_document_changed` refusals, one `browser_wrong_target_refused` and a final
`browser_ref_stale` are observed; the assistant's claim that the connection was lost is not
established. Two rejected actions returned PNGs byte-for-byte identical to their previous
observations. Child-frame refresh is a candidate cause, not a confirmed diagnosis of all failures.
The notes contain exactly the operator's three additions and the earlier documents are unchanged.
Continuous foreground focus and the post-run clipboard have not been verified for this run.
AWS independently matches its exact prompt, failed terminal outcome, 14 action results,
32 usage records and six PNGs in eight encrypted batches (125 stored / 110 logical records).

The targeted repair separates root/viewport identity from the full frame-tree token. A pending
visual action may continue only when the fresh protected screenshot is byte-identical and the
native root/viewport proof, URL, geometry and age agree. Input uses the latest full-frame token;
native reload, protection and dispatch checks remain in force. Focused regressions reproduce the
previous refusal and cover changed-image/root rejection. This repair is installed as signed
internal `0c72ce8`; its signed package/runtime and installed strict-signature checks passed.

The fresh ordinary rerun stopped after 20.290 seconds, before reaching that repaired input path.
The selected Chrome window was on another Space; a different Chrome window was active.
`browser_prepare` refused `foreground_app_in_use`, and the task paused with a cancelled terminal
outcome. Existing tab-addressed visual input permits another proven foreground Chrome window,
but connection setup deliberately does not: it may display or operate Chrome's setup UI.
Recovery after restart must distinguish reuse from setup without removing that safeguard.
No operator rescue occurred. The operator's TextEdit note arrived after the task had stopped,
so this is not a concurrency pass. AWS matches all 40 records, six usage events, six action
results, the exact prompt and terminal outcome in one encrypted batch; no screenshots were
produced. CUA again showed delayed composer/Send observations, `noWindowsAvailable` and a Dock
binding timeout. This restart-recovery attempt remains failed.

After explicit setup selected the already approved public Chrome window in Settings, a fresh
ordinary dinner-planning request on the same signed `0c72ce8` candidate completed without
task-time intervention. It saved a usable three-dinner plan for two with recipe links, scaled
ingredients, a combined shopping list, prep order and an honestly estimated $60 budget.
Independent source, quantity, budget and file checks passed, and CUA opened the result preview.
The reply arrived in 331.656 seconds; terminal completion took 351.416 seconds. Four stale-image
refusals returned genuinely changed images and recovered autonomously. A 95.705-second gap
between the last file listing and writing the plan remains unexplained; this is not a performance
pass. TextEdit retained exactly three operator additions made during the run, and the earlier
documents were unchanged. Continuous foreground focus and clipboard isolation were not measured.
AWS independently matched the prompt, reply, outcome, 70 usage records, 33 action results and
23 byte-identical PNGs across 11 encrypted batches (276 stored / 261 logical records).
This validates useful connected-browser work, not automatic connection recovery.

The follow-up requested a public grocery-price comparison while preserving the completed plan.
CUA pressed Stop during browser work; the UI showed cancellation, terminal cancellation arrived
7.806 seconds after the click, no subsequent action results appeared, and the plan stayed unchanged.
The automatic AWS verifier failed: the same cancelled turn had two `turn.capture_finished`
records, with five action results in the first episode and late provider events in the second.
Stop and runtime event handlers were closing capture before the provider stream drained.
The current source repair makes the runner the sole finalizer for running turns, retaining late
usage/results in one episode; queued turns still finalize immediately. Four regressions reproduced
premature sealing before the fix and now pass for completion, failure, Stop and a thrown stream
error. Signed `5bab2f5` repeated the real grocery follow-up and Stop through CUA. Cancellation
settled 350 ms after the Stop click. One in-flight browser click returned accepted/unverified
158 ms after Stop; no action results followed terminal cancellation. The dinner plan stayed
byte-identical. AWS contained exactly one cancelled capture with all seven action results,
six usage records and one byte-matching PNG (46 stored / 45 logical records). This closes the
duplicate-finalization defect, not general in-flight input or native-write cancellation acceptance.
The full pilot suite and signed package/runtime/installed-signature verification passed.

The repair's focused tests and native gate pass. The full pilot command passed build, static and
unit checks, then failed one terminal UI case: the fixture filled `pwd`, while the executed value
was `pwda`. An immediate isolated rerun passed without a code change. Its trace is retained;
the extra character's source is unresolved and the rerun does not establish a fix. The four
unrun desktop cases, 48 renderer checks and 72 companion-browser checks subsequently passed.
The original full command remains recorded as failed.

Included `a2d63b8` fixes native result registration. The preceding task on `b7c1f36` saved the
correct document but failed because its requested location was outside the conversation folder.
Native results now retain an exact local reference for explicit Open/Reveal, without granting
content preview or remote export. That earlier failed run remains failed.

A fresh ordinary request on the signed repair completed Finder/TextEdit copy, edit, save, close
and reopen without operator rescue. The reply arrived in 221.809 seconds and the terminal outcome
settled in 229.959 seconds. Independent file comparison preserved both existing documents and
confirmed the new copy's complete source text plus the exact requested note. CUA opened the
result from Sia in TextEdit. An unrelated draft's text and the before/after clipboard matched;
the operator's own later draft extension landed at the clicked caret. AWS matched the prompt,
reply, completion, 33 actions and 21 PNGs across 219 records, including 62 usage records.

CUA still produced stale observations, one `noWindowsAvailable` error, a stale-element error and
ScreenCaptureKit invalid-parameter errors. Refreshed observations and keyboard navigation
recovered operator access. The trajectory shows the initial Send action started the task before
CUA displayed the working state. This is a bounded workflow pass, not a responsiveness or
universal-control pass. Continuous focus, Stop and the earlier filename incident remain open.

Signed internal `b7c1f36` activates Sia as well as its window when the person explicitly opens it,
and exposes that canonical action as **Sia → Open Sia**. Merely showing/focusing the Electron
window could leave another app active. Task-time background actions do not invoke this path.
After opening the installed app through CUA, an ordinary visitor-planning request recovered the
retained Chrome connection and finished without operator rescue. Its report, sources, arithmetic
and automatic AWS archive were independently checked. An unsent draft remained intact and
focused at observed points while browser actions ran. This is not a continuous focus/clipboard
measurement or evidence for another foreground Chrome window.

The included `4e5724b` fix addresses an evidenced Chrome consent timing failure. The preceding
candidate found the exact sheet in 9 ms but retried its button every 100 ms; Chrome's rapid-input
protection kept rejecting those events. Action retries now respect the system double-click
interval plus 50 ms. The deadline, native-sheet identity and disappearance checks remain.
The regression failed before the change; 14 consent checks pass after it.

That installed repair completed initial setup through Sia Settings: consent settled in 1,148 ms
and the approved public window showed **Attached**, without operator Allow input. After restart,
a fresh agent identified that same window and attempted recovery itself. The useful visitor-plan
request then paused before input because the host reported Chrome foreground. That failed run
remains in the evidence; the successful `b7c1f36` run used a fresh conversation after restart.
Do not relax the setup guard merely because already-bound page actions can use a different Chrome
window: a new consent dialog may affect the person's active browser window.

A fresh native workflow on earlier signed `8dc8e14` did pass without rescue: Finder rename,
TextEdit review of three headings/12 items, close and reopen, in about 150 seconds. Independent
screenshots, window inventory and unchanged file bytes support that bounded result. It must be
repeated on the exact final DMG. The earlier unexpected filename input remains unresolved.

## Current artifacts

- Installed internal arm64 QA: `5a8b1e589f833b0e133022c713674f7032df001b`, Developer ID signed,
  full pilot, package/runtime and installed strict-signature checks passed. Not notarized and
  not a DMG. Live browser research preserved a partial plan but did not complete the request.
  Earlier `6b24a04` passed native personal-document work. Handoff remains held.
- Held universal alpha.122 DMG: source `7531ee7f3115265817e8dd56cf081672799bd8f4`, signed,
  notarized, stapled and verified, but missing later fixes. Do not hand it to the RA yet.
- Exact hashes, task identities, timings and private receipt locations are in the concise
  [distribution acceptance record](./public-release.md).

## Current evidence and open gates

| Requirement | Evidence | Remaining work |
| --- | --- | --- |
| Useful native work | `6b24a04` repairs panel navigation and completes an ordinary personal checklist through Finder/TextEdit; originals and unrelated draft preserved; result opens from Sia | Repeat on final DMG; broader native workflows |
| Useful browser work | Visitor plan on `b7c1f36`; checked dinner plan on `0c72ce8` after explicit setup, without task-time rescue | Repeat on final DMG; restart recovery, repeatability and unexplained stalls |
| Reuse access | Retained exact public window recovered autonomously on `b7c1f36` | Broader recovery while another Chrome window is in use |
| Input isolation and CUA controls | Native run preserved sources, draft and clipboard; dinner run preserved concurrent notes; CUA Stop on `5bab2f5` settled in 350 ms | Intermittent CUA errors, earlier filename incident, continuous focus/latency and native-write cancellation |
| Automatic AWS recording | Native and dinner archives matched; `5bab2f5` cancellation archive matched all seven actions, six usage records and one PNG with one finalization | Reverify complete useful runs on final DMG |
| Distribution | Older DMG's signing/notarization/package checks passed | One final installer containing accepted functional repairs |

Earlier failed restart thread `9ed5a7ab-7ddb-4f57-875e-8d941aa50192`, turn
`ba9232f2-92a5-4fbc-852a-3efd8b6a2e92`, ended after 20.274 seconds. Inventory initially reported
Slack active; the later setup guard reported Chrome active. The cause of the switch is not
established. No operator clicked Continue, reconnected Chrome or supplied browser input during
that task. The failed attempt remains failed. AWS hashes, lengths and KMS encryption matched via
read-only verification; zero screenshots is appropriate because no browser image was obtained.

Current successful browser thread `3801059e-c294-4ea9-ae36-5dddeb821d67`, turn
`88c0b315-021a-490c-b768-b577a218f2cc`, replied in 195.354 seconds and settled in 214.348 seconds.
The 57.6-second gap before report writing is recorded, not treated as measured responsiveness.
The archive verifier initially skipped large chunked events; reassembly confirmed every local
action and image. This was a verifier defect, not missing application uploads. Exact evidence and
remaining limits are in the [acceptance record](./public-release.md).

The earlier native-workflow pass was on `8dc8e14`; the included `a2d63b8` pass adds document editing,
usable result delivery and before/after clipboard verification. Neither substitutes for the exact
final installer or closes the remaining input-isolation gates.
The managed voice transport passed earlier live AWS/ElevenLabs checks and the owner confirmed
that the microphone works. Physical Fn and a full spoken command remain independently unverified.

Earlier experiments and their limits are retained in the
[prior detailed status](https://github.com/ljang0/sia-v2/blob/4e5724b69b9d96a41aface3d688e8de49742fa47/docs/release-status.md)
and private evidence. Do not repeat discarded transport, service-panel ownership or timeout
variants without new evidence that changes the diagnosis. Current work must close a functional gate.

## Later broad-release requirements

These remain future milestones; they are not the exit criteria for the bounded RA handoff above.

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
