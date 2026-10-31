# Release status

Updated October 31, 2026. **Distribution is not ready.** Internal signed arm64 alpha.56 completed
real dinner/grocery planning, a sourced Pittsburgh outing and native TextEdit revision. Native
work progressed during a slow browser read; Stop during Save/readback preserved completed work,
and continuation verified it without repeating input. The next browser task retained its connection.
Outputs and previews were independently checked. Initial browser timeouts recovered automatically;
this does not establish zero-timeout reliability. Full local pilot checks, universal notarization
and exact-source CI passed. The universal real-work repeat required operator recovery. The new
vision-only default, its exact-artifact repeats and physical acceptance remain open.
The last published Mac pilot is alpha.24; no new distribution is authorized.

The owner selected **Mac first; iPhone follows**. Research sharing stays off and Codex App Server
is the initially admitted engine. The [Arena proposal](./arena-proposal.md) describes a bounded
technical review and invited pilot, without claiming a partnership or validated model ranking.

## Expanded release goal

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
are staged behind a host-only `visionOnly` option. They require an image, omit semantic content
and targets, skip text/OCR helpers, reject semantic input and revoke stale/failed image authority.
The background browser now has staged image-only responses, verified screenshot-to-viewport
coordinates, pointer delivery and text insertion into a visually focused field. It rechecks page
protection before input and refuses stale/mismatched images or unknown delivery without replay.
A host-only token binds capture and input to the live frame/loader identities and CSS viewport
state (scroll position, pan offsets, size, scale and reported zoom). Reloads, including same-URL
reloads, and viewport changes before input or during focus emulation revoke the old image. Capture
checks its protection snapshot identity and viewport before and after the image; no identity token
or semantic content is exposed to the model.
Host-side DOM inspection remains for protection and new-tab guards; it supplies no model targets.
Browser keyboard commands are not migrated yet. Semantic snapshot traversal also remains internally,
so this change does not establish latency improvement. This option is **not enabled in the shipping
host yet**: browser keyboard support, bounded capture/protection timing, foreground runtime/tool
isolation, model schemas and prompts, all-route regression checks and signed real-task acceptance
must land before cutover.
The current staged implementation passed `pnpm test:pilot`: build, formatting, lint, quality,
types, native/shared checks, 1,899 desktop tests, 46 desktop end-to-end tests, 36 renderer tests
and 72 Chromium/WebKit phone tests. These automated transport/authorization and UI checks are not
evidence of visual task skill. Continue also retires obsolete Chrome setup markers from the
previous execution while retaining its history. No new signed artifact contains these changes yet;
the post-cutover pilot gate and signed real-task acceptance remain required before handoff.

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
| Source | Alpha.55 full local gate passed: 1,858 desktop, 46 Electron, 36 renderer, 72 phone-web and native/shared checks including 235 browser regressions. Alpha.56 full local gate passed with 1,864 desktop tests and the same E2E/native counts; exact-source CI passed. | Vision-only source gate and final universal artifact repeats. |
| Signed package | Universal alpha.56 passed signing, notarization, stapling, Gatekeeper, packaged runtime and mounted-DMG installation checks. | Signed vision-only candidate and live acceptance. |
| Useful work | Alpha.56 saved checked five-dinner plan, consolidated groceries and $60 outing; previews loaded. Alpha.55 also completed these and a shopping checklist. | Repeat on the final universal artifact. |
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
