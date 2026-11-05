# Release status

Updated November 4, 2026. **A signed, notarized alpha.122 DMG exists, but RA handoff is blocked by native background input and input-isolation failures. It does not contain the latest internal browser and native-workflow fixes. Broad distribution and Arena acceptance remain open.**

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

Signed internal `4e5724b` fixes an evidenced Chrome consent timing failure. The preceding
candidate found the exact sheet in 9 ms but retried its button every 100 ms; Chrome's rapid-input
protection kept rejecting those events. Action retries now respect the system double-click
interval plus 50 ms. The deadline, native-sheet identity and disappearance checks remain.
The regression failed before the change; 14 consent checks pass after it.

The installed repair completed initial setup through Sia Settings: consent settled in 1,148 ms
and the approved public window showed **Attached**, without operator Allow input. After restart,
a fresh agent identified that same window and attempted recovery itself. The useful visitor-plan
request then paused before input because the host reported Chrome foreground. No research result
was produced. This proves initial setup and retained selection, not completed browser recovery.
Do not relax the setup guard merely because already-bound page actions can use a different Chrome
window: a new consent dialog may affect the person's active browser window.

A fresh native workflow on earlier signed `8dc8e14` did pass without rescue: Finder rename,
TextEdit review of three headings/12 items, close and reopen, in about 150 seconds. Independent
screenshots, window inventory and unchanged file bytes support that bounded result. It must be
repeated on the exact final DMG. The earlier unexpected filename input remains unresolved.

## Current artifacts

- Installed internal arm64 QA: `4e5724b69b9d96a41aface3d688e8de49742fa47`, Developer ID signed,
  package/runtime and installed strict-signature checks passed. Not notarized and not a DMG.
  The full pilot gate passed: 2,089 desktop, 46 Electron, 48 renderer and 72 companion tests,
  plus cloud/shared/native/build/static checks.
- Held universal alpha.122 DMG: source `7531ee7f3115265817e8dd56cf081672799bd8f4`, signed,
  notarized, stapled and verified, but missing later fixes. Do not hand it to the RA yet.
- Exact hashes, task identities, timings and private receipt locations are in the concise
  [distribution acceptance record](./public-release.md).

## Current evidence and open gates

| Requirement | Evidence | Remaining work |
| --- | --- | --- |
| Useful native work | One fresh-agent rename/review/close/reopen pass on `8dc8e14`; target file unchanged | Repeat on final DMG; broader native workflows |
| Useful browser work | Earlier research outputs required interventions; current initial connection succeeds | Finish an ordinary task after restart without rescue |
| Reuse access | Exact public-window selection survives Sia restart; agent attempts recovery | Recover without disrupting the person's active work |
| Input isolation and CUA controls | Prompt submission works after rebinding to restarted QA; earlier draft stayed intact | Current draft attempt did not appear; no continuous focus/clipboard/latency pass; resolve filename incident |
| Automatic AWS recording | Earlier native pass: exact prompt, 175 events, 48 usage, 27 actions, 17 matching PNGs. Latest failed restart: 40 events, 6 usage, 6 actions, terminal capture | Reverify complete useful runs on final DMG |
| Distribution | Older DMG's signing/notarization/package checks passed | One final installer containing accepted functional repairs |

Latest restart thread `9ed5a7ab-7ddb-4f57-875e-8d941aa50192`, turn
`ba9232f2-92a5-4fbc-852a-3efd8b6a2e92`, ended after 20.274 seconds. Inventory initially reported
Slack active; the later setup guard reported Chrome active. The cause of the switch is not
established. No operator clicked Continue, reconnected Chrome or supplied browser input during
that task. The failed attempt remains failed. AWS hashes, lengths and KMS encryption matched via
read-only verification; zero screenshots is appropriate because no browser image was obtained.

The current full pilot passed on application source `4e5724b`; only evidence/docs changed afterward.
The earlier native-workflow pass was on `8dc8e14`. Neither automated gate substitutes for complete
installed-task acceptance.
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
