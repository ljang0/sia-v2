# Release status

Updated October 31, 2026. **Distribution is not ready.** Universal notarized alpha.50 passed the
native-document task, but a new-tab link interrupted background browser research. Alpha.51 adds a
pre-click check for that case; focused native/desktop tests pass, with the full gate and signed
live acceptance pending. The last published Mac pilot is alpha.24; no new invitations or public
download have been authorized.

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
| Source | Alpha.50 passed the complete local pilot gate. Alpha.51 passed 71 native browser tests and 25 focused desktop tests. | Alpha.51 complete gate and CI. |
| Signed package | Universal alpha.50 passed signing, notarization, stapling, Gatekeeper and packaged runtime checks. | Exact alpha.51 build and live acceptance. |
| Useful work | Alpha.50 saved and verified a faithful 419-word native brief with no failed action. Internal alpha.49 completed repeated research, organization, visitor plans and reviewer packets. | Final-artifact repeats and complete action instrumentation. |
| Background/concurrency | Alpha.50 preserved an unsent draft; native editing passed while browser work was active. A new-tab link then paused the browser task. | Verify alpha.51 recovery, navigation during app switching, contention/Stop and responsiveness. |
| Setup/recovery | Alpha.50 retained profile/history; explicit Chrome recovery returned to Sia and resumed automatically. | Final-candidate restart/expiry recovery and clean-account setup. No fresh Mac account or second Mac is available. |
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
