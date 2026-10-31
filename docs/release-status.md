# Release status

Updated October 31, 2026. **Distribution is not ready.** Alpha.42 is signed and notarized.
Direct-capture setup now works; real Finder filing, clipboard-safe completion and Chrome recovery still block acceptance.
On alpha.38, two real document workflows completed concurrently with all five result previews verified. The last
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
| Source | Alpha.42 exact-source full pilot gate passed: 1,814 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 action-gateway tests. [CI](https://github.com/ljang0/sia-v2/actions/runs/41171344097) passed. | Further native input/reconnect work requires new exact-source acceptance. |
| Signed Mac package | Alpha.42 from `c50782a873455719ee12bc931248aa0ad4f5c1fd` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Live acceptance is failing; signature success is not product readiness. |
| Signed app continuity | Alpha.42 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.38 completed two real document tasks concurrently with five checked previews. Alpha.41 filed all six real documents correctly with matching hashes in 5m27s; six steps needed recovery. Alpha.42’s clipboard-free rerun got real screenshots but failed before filing. | Fix the observed clipboard overwrite; repeat useful workflows and verify parallel GUI results and responsiveness. |
| Browser | Alpha.40 read three official sources, saved a checked 751-word comparison and opened its preview in about 120 seconds with TextEdit active. | Alpha.41 stopped before reading sources; alpha.42 recovery reports native consent_not_settled. Inline recovery showed the picker, but the approved public window still failed to reconnect after Chrome consent. Fix recovery and repeat real work. Background new-tab creation remains unsupported. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes

Alpha.39 isolates each background turn's computer/browser grants and reserves physical windows
individually. Foreground takeover remains exclusive, same-window work queues with a visible waiting
state, and conflicting multi-window acquisition refuses instead of deadlocking. Automated gates
pass, but the signed real Finder/browser tasks did not complete; no concurrent GUI pass is claimed.

Alpha.40 corrects stale native window titles, explains authorization-host failures
without suggesting website sign-in or blind replay, and adds content-free callback diagnostics.
The SDK and both Mac libraries move together to stable Cua 0.38.0, which includes native prefetch
and input fixes. Its first browser research run passed with a newly prepared ordinary Chrome window; that does not
isolate the cause of the earlier authorization failure. Alpha.41 corrects Sia over-refusing exact-element typing and exact-window keyboard validation
when generic process keyboard input is ambiguous. Its signed Finder run completed the real filing
task, but exposed shared-clipboard interference. Native target checks and refusals remain authoritative.
Alpha.42 corrects misleading Chrome reconnect guidance and adds content-free proof-failure
diagnostics, including requested screenshots omitted by the driver. A clipboard-free filing
attempt stopped because it had no usable pixel targets, despite Accessibility and Screen Recording
reporting Allowed. The separate QA app location lacks macOS’s additional direct-capture approval.
Alpha.42 also keeps See your screen actionable when the driver identifies this missing approval,
and requests it only from explicit setup. Signed-app setup cleared the warning and provided real
Finder screenshots. The filing rerun still failed before moving files; neither browser recovery
nor a completed clipboard-preserving workflow is established.

Alpha.38 includes Chrome in default Mac setup with an explicit opt-out, and adds a host-triggered
**Connect Chrome & continue** control to Mac conversations. Existing approved sessions are reused
only for the same process/window; revoked or expired access must be reconnected deliberately.
macOS and Chrome still own their permission decisions. The alpha.40 existing-profile picker path passed; alpha.41 recovery failed despite selecting the same approved public window. Clean-account consent remains unverified.

Real alpha.37 work exposed three additional problems: outside-workspace files needed Add files,
only one generated file received a preview, and document-only tasks unnecessarily held the whole GUI
lane. Alpha.38 explains attachments, adds controls for all validated output files, and acquires the
GUI lane only on the first GUI call. Its real document retest produced five checked files with five
working previews while both tasks overlapped. Alpha.39 changes that ownership model, but real parallel GUI acceptance remains open.

The [real-work demo guide](./demo.md) records prompts, failures, interventions, measured outcomes
and limits. Fake-service regression checks and small Calculator/CSV smoke tasks remain useful but
are not everyday-use acceptance. Alpha.40 has one browser research pass and alpha.41 has one Finder filing pass. Shared-clipboard interference, browser recovery and parallel GUI work remain unaccepted.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
