# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.38 is signed and notarized.
Two real document workflows completed concurrently with all five result previews verified. The last
published Mac pilot is alpha.24; no new invitations or public download have been authorized.

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
| Source | Alpha.38 full local pilot gate passed: 1,779 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 66 action-gateway tests. [Artifact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41157278849) passed. | Re-run runtime gates after application changes. |
| Signed Mac package | Alpha.38 from `e0abb66ffa68f5560aa826b7e49c747ec51d39fa` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Any runtime change requires a new signed candidate. |
| Signed app continuity | Alpha.38 retained the QA profile, settings and history without a new Keychain prompt. After a full quit/relaunch, cancellation persisted and matrix/CSV previews reopened. | Physical and clean-account acceptance. |
| Everyday usefulness | Two real GPT-6-Astra tasks overlapped in separate default folders: a three-file reviewer packet and a two-file release plan. Contents and all previews checked; no corrective prompts. A later cancellation left the separate task working; foreground TextEdit typing was preserved. Ten thread switches: median 762.5 ms / worst 868 ms including CUA overhead. | Repeat fresh runs, real-source browser research and personal planning, foreground-user coexistence during GUI input, clipboard preservation, default browser setup/recovery and broader latency measurements. GUI loops still serialize. |
| Browser | Alpha.37 background IANA read/navigation and explicit same-window detach/reconnect passed. Alpha.38 adds default setup and in-conversation recovery with regression coverage. | Signed alpha.38 live setup/recovery and unexpected expiry. Native operator CUA Chrome inspection timed out; no suitable disposable window was identified in Sia's picker. Background new-tab creation is unsupported by driver 0.37.0. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes

Alpha.39 is in development to isolate each background turn's computer/browser grants and reserve
physical windows individually. Foreground takeover remains exclusive, same-window work queues,
and conflicting multi-window acquisition refuses instead of deadlocking. Focused regression checks
pass; full gates, a new signed artifact and live concurrent GUI acceptance are still required.
The installed and verified candidate remains alpha.38.

Alpha.38 includes Chrome in default Mac setup with an explicit opt-out, and adds a host-triggered
**Connect Chrome & continue** control to Mac conversations. Existing approved sessions are reused
only for the same process/window; revoked or expired access must be reconnected deliberately.
macOS and Chrome still own their permission decisions. The signed-app consent path remains unverified.

Real alpha.37 work exposed three additional problems: outside-workspace files needed Add files,
only one generated file received a preview, and document-only tasks unnecessarily held the whole GUI
lane. Alpha.38 explains attachments, adds controls for all validated output files, and acquires the
GUI lane only on the first GUI call. Its real document retest produced five checked files with five
working previews while both tasks overlapped. GUI calls still reserve the lane through completion;
parallel control of physical windows is unsupported.

The [real-work demo guide](./demo.md) records prompts, failures, interventions, measured outcomes
and limits. Fake-service regression checks and small Calculator/CSV smoke tasks remain useful but
are not everyday-use acceptance. No real-source browser research pass is claimed for alpha.38.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
