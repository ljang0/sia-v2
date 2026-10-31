# Release status

Updated October 31, 2026. **Distribution is not ready.** Universal alpha.58 passed signing,
notarization and final-DMG installation with matching ASAR hashes, but its fresh outing still
failed on browser clicks. Alpha.59 source fixes a reproduced native command-policy lookup defect
and host handling of structured refusals. The prior alpha.57 meal plan needed operator recovery;
native TextEdit Save remains unresolved. Exact-artifact uninterrupted workflows and physical
acceptance remain open. The last published Mac pilot is alpha.24; no new distribution is authorized.

The owner selected **Mac first; iPhone follows**. Research sharing stays off and Codex App Server
is the initially admitted engine. The [Arena proposal](./arena-proposal.md) describes a bounded
technical review and invited pilot, without claiming a partnership or validated model ranking.

## Expanded release goal

Owner requirement, October 31: the handoff code must be lean, modular and easy for an external
reviewer to follow. Maintainability is part of release readiness: remove obsolete execution paths
at cutover, keep state ownership and dependency direction explicit, and provide a short route from
model request to authorized input and verified result. The [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path)
identifies the modules and boundaries. Large declarative catalogs alone are not a reason to add
abstraction; mixed responsibilities, duplicate implementations and hidden fallback routes are.

Owner decision, October 31: **vision-only computer use is the default throughout Sia**, not an
Arena-only option. This is a new implementation and acceptance requirement; alpha.56 still uses
assisted DOM/accessibility control and does not satisfy it. The model must receive screenshots,
choose image coordinates and use pointer/keyboard input. No implicit DOM/AX text, element refs,
OCR or semantic setters may substitute for visual control. Host-side permission, protected-surface,
window identity, stale-image, cancellation and background-focus checks stay enforced.

Implementation must cover native apps, the connected background browser and on-screen turns.
Task tools, skill wrappers and recovery paths must not expose a second assisted UI route. Ordinary
explicit file/connector tools remain separately described capabilities; they must not be counted
as visual task completion. Re-run the real personal-assistant scenarios, concurrent native/browser
work, Stop/recovery and responsiveness on the exact signed vision-only candidate. Retain alpha.56
results only as assisted-mode baseline evidence.

Implementation progress: native-window visual observation and pointer/keyboard authority checks
are selected by the central production `visionOnly` setting. They require an image, omit semantic content
and targets, skip text/OCR helpers, reject semantic input and revoke stale/failed image authority.
The background browser now has image-only responses, verified screenshot-to-viewport
coordinates, pointer delivery and text insertion into a visually focused field. It rechecks page
protection before input and refuses stale/mismatched images or unknown delivery without replay.
A host-only token binds capture and input to the live frame/loader identities and CSS viewport
state (scroll position, pan offsets, size, scale and reported zoom). Reloads, including same-URL
reloads, and viewport changes before input or during focus emulation revoke the old image. Capture
checks its protection snapshot identity and viewport before and after the image; no identity token
or semantic content is exposed to the model.
Host-side DOM inspection remains for protection and new-tab guards; it supplies no model targets.
Browser page keys and common editing shortcuts use one key-down/up pair, no DOM
focus/setter fallback, protected-focus and new-context checks, and no clipboard or browser-wide
shortcuts. Unknown delivery consumes its authority without replay. Chromium checks cover the exact
focus guard and selection/replacement, Tab and Enter. Semantic snapshot traversal remains internally,
so this change does not establish latency improvement. The source host now enables this option for the controller, action backend and runtime together.
The installed signed universal alpha.57 contains it. The runtime uses the same hosted-tool boundary for visual on-screen and
background turns, without native shell tools or the legacy runtime screen-context injection. Connected visual turns
also disable provider-native tools and require the verified Codex harness boundary. The installed
managed Codex 0.160.0 passed a no-turn hosted-session isolation probe; this is configuration evidence,
not real-task acceptance.
Visual tool schemas omit semantic references, setters, OCR and menu APIs; a concise visual prompt
replaces the native/assisted recipe for that route. On-screen visual actions default to foreground
delivery, and background policy stays enforced. Voice activation captures app identity only; its old accessibility walk and mode switches are removed,
so changing Computer or Library settings cannot restore them; persisted activation context is stripped to that same identity.
Launcher semantic capture is disabled. Native memory retains preferences and relevant notes but
omits captured UI text and native-script instructions, including when memory preparation fails.
Bounded capture/protection timing and signed real-task acceptance remain required. Research
episodes now identify the configured visual/assisted policy separately from the delivery route,
with per-tool event counts and separate browser/native observations. Historical records without
the policy remain unknown; neither counts nor screenshots establish independent task success. CI exposed new patch sources missing from the cache's diff check;
that verification is corrected and passed twice against a fresh pinned upstream sparse checkout.
Divergent and unexpected local source files remain refused without replacement.
The alpha.57 candidate source passed `pnpm test:pilot`: build, formatting, lint, quality,
types, native/shared checks, 1,933 desktop tests, 46 desktop end-to-end tests, 40 renderer tests
and 72 Chromium/WebKit phone tests. These automated transport/authorization and UI checks are not
evidence of visual task skill. Continue also retires obsolete Chrome setup markers from the
previous execution while retaining its history. Universal alpha.57 passed signing, notarization,
stapling, Gatekeeper, packaged runtime and mounted-DMG installation checks. Exact-source CI
passed. The first real visual tasks exposed browser input/re-observation failures and native
Save-dialog targeting failures; meal planning recovered with an operator prompt. See the
[artifact record](./public-release.md) for exact results, interventions and hashes. Source follow-ups
add a bounded stale-capture read retry, content-free pointer/link guard diagnostics and remove
obsolete native-script promises from settings. Their live effect is not yet verified. This follow-up passed the full local pilot gate with
1,941 desktop tests and the same native, E2E, renderer and phone counts.

The alpha.58 source also aligns the skills library with the visual policy: both Mac delivery modes
use sandboxed gateway skills, model-facing library reads omit native execution recipes, and legacy
native source stays owner-editable with Run disabled. This removes obsolete UI mode branches.
All local pilot-gate stages passed: 1,942 desktop tests, 46 Electron tests, 40 renderer tests,
72 Chromium/WebKit phone tests and native/shared checks, plus build, formatting, lint, quality
and types. The initial Electron run found one obsolete native-creation expectation; its updated
three-test library file passed, and the remaining renderer/phone stages completed separately.
Signed alpha.58 package and final-DMG installation verification passed; its fresh outing failed.
Alpha.58 exact-source CI had not completed at the last check. Alpha.59 source corrects an order-dependent native allowlist
lookup that rejected coordinate hit testing and covers the structured refusal format used by
the real driver. The source reproduction failed before the correction. Native/focused checks
passed. The full `pnpm test:pilot` gate then passed with 1,950 desktop, 249 native browser,
46 Electron, 40 renderer and 72 phone-browser tests plus build, static and other native/shared
checks. The restricted-socket coordinate regression fails with the original lookup and passes
with the fix. Alpha.59 signing, exact-source CI and live repeats remain pending.

Owner requirement, October 30: the app must demonstrate useful personal desktop work, not merely
pass toy tasks. Calculator, tiny CSVs and fake-service tests are smoke checks, not proof of readiness.
The release requires real-source research and writing, file/document preparation, and planning
workflows with independently verified deliverables on the signed candidate. Test both background
work while the person uses another app and two simultaneous Sia tasks. Measure responsiveness,
task duration, cancellation and recovery; fix failures before claiming out-of-the-box usefulness.

Default Mac setup must guide the person through the access needed for these workflows, including
background Chrome access, and verify it before advertising readiness. macOS/Chrome consent still
belongs to the person. Existing grants should be reused without repeated setup; denied, revoked
or expired access needs an actionable recovery control rather than a raw driver error. Detailed
scenarios and evidence requirements are in [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use).

## Evidence and remaining gates

| Area | Verified evidence | Still required |
| --- | --- | --- |
| Source | Alpha.59 full local pilot gate passed: 1,950 desktop, 46 Electron, 40 renderer, 72 phone-web and native/shared checks including 249 browser regressions. The alpha.57 artifact source passed exact-source CI, including universal package verification. | Alpha.59 exact-source CI and final universal artifact repeats. |
| Signed package | Universal vision-only alpha.58 passed signing, notarization, stapling, Gatekeeper, packaged runtime and mounted-DMG installation checks. | Sign alpha.59 corrections and repeat failed real tasks on the final artifact. |
| Useful work | Alpha.57 saved a source-checked three-dinner plan and consolidated groceries after recovery; previews loaded. Native TextEdit Save failed. | Unattended browser recovery, native Save/reopen and the sourced outing (which also stopped on refused clicks). |
| Background/concurrency | Alpha.56 native editing progressed during slow browser observation. Stop during Save/readback showed cancellation within 1,149 ms including CUA; read-only recovery preserved saved work and browser access. Ten switches median 1,151 ms / worst 2,432 ms. | Final-artifact concurrency, contention/recovery repeats and clipboard preservation. |
| Setup/recovery | Alpha.56 explicit Chrome setup took 2.059 seconds and resumed the saved request. Outing reused it after native cancellation; new-context links recovered within the existing tab. | Final restart/expiry and clean-account setup. No fresh account or second Mac is available. |
| Physical use | Existing grants work on the QA Mac. | Keep-awake, lock/sleep and voice. This Mac refuses Sia and independent caffeinate display-awake assertions. |
| Cloud | October 30: 18 alarms OK, five Lambdas Active/Successful; anonymous protected requests return 401. Synthetic authenticated rating reached the report. | Recheck changed configuration before invitations. |
| Ownership | Source rights confirmed; Lawrence Jang owns support/incidents. | Private recipient list and final release decision before invitations. |
| iPhone | Build 31 Ready to Test internally; tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. |

See [exact artifact evidence](./public-release.md) for hashes, timings and retained failures.
Alpha.51 refuses known new-context link clicks before input, then explains existing-tab navigation
from observed URLs. It does not disable the focus guard or grant control of another tab.

Default Mac setup includes Chrome with a deliberate opt-out. Choosing a window authorizes its
explicit connection setup, including Chrome's exact prompt. Task tools cannot approve permission
dialogs. macOS grants remain person-owned. Expiry, revocation and restart need actionable recovery.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
