# Release status

Updated October 31, 2026. **Distribution is not ready.** Universal notarized alpha.53 passed its
full local gate and package checks. A background accordion click worked, but both outing and
meal-planning research stalled during navigation/read recovery. Alpha.54 fixes a proven CDP-session
leak; its relationship to those stalls is unproven. The full local gate passed; signed-build
verification and live acceptance remain pending. The last published Mac pilot is alpha.24; no new distribution is authorized.

The owner selected **Mac first; iPhone follows**. Research sharing stays off and Codex App Server
is the initially admitted engine. The [Arena proposal](./arena-proposal.md) describes a bounded
technical review and invited pilot, without claiming a partnership or validated model ranking.

## Expanded release goal

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
| Source | Alpha.54 full local gate passed: 1,858 desktop, 46 Electron, 36 renderer, 72 phone-web and native/shared checks including 230 browser regressions. | Exact-source CI. |
| Signed package | Universal alpha.53 passed signing, notarization, stapling, Gatekeeper and packaged runtime checks. | Exact alpha.54 build and live acceptance. |
| Useful work | Earlier signed builds saved verified research and native briefs. Alpha.53 tried practical outing and dinner/grocery planning; neither produced its output because browser work stalled. | Complete and independently verify both everyday tasks, then repeat on the final artifact. |
| Background/concurrency | Alpha.53 delivered an accordion click while a separate TextEdit note was edited. Note/clipboard preserved; ten switches median 968.5 ms, Stop visible within 819 ms including CUA. | Reliable navigation, paired GUI work, contention/cancellation, responsiveness and repeats. |
| Setup/recovery | Alpha.53 retained profile/history; explicit Chrome setup resumed the saved request in 2.951 seconds. | Final-candidate restart/expiry recovery and clean-account setup. No fresh Mac account or second Mac is available. |
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
