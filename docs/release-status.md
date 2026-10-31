# Release status

Updated October 31, 2026. **Distribution is not ready.** Alpha.40 is signed and notarized.
Real browser research passed once; Finder filing and parallel GUI acceptance remain unresolved.
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
| Source | Alpha.40 exact-source full pilot gate passed: 1,791 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 action-gateway tests. [CI](https://github.com/ljang0/sia-v2/actions/runs/41165497718) passed. | Alpha.41 input-route changes require fresh gates, signing and live acceptance. |
| Signed Mac package | Alpha.40 from `39795b8c3553797e330bf2f7d8f1a08e03e49243` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Live acceptance is failing; signature success is not product readiness. |
| Signed app continuity | Alpha.40 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.38 completed two real document tasks concurrently with five checked previews. Alpha.40 Finder filing failed, leaving six unchanged files in Inbox and one empty untitled folder. | Fix native GUI delivery and repeat useful workflows; prove foreground ownership, clipboard preservation, parallel GUI results and responsiveness. |
| Browser | Alpha.40 read three official sources, saved a checked 751-word comparison and opened its preview in about 120 seconds. TextEdit was confirmed active during browser input and its text survived. | Repeat in a fresh conversation; verify clipboard and actual concurrent GUI work. Driver and window setup both changed from alpha.39, so causality is unproved. Background new-tab creation remains unsupported. |
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
isolate the cause of the earlier authorization failure. Alpha.41 source work corrects Sia
over-refusing exact-element typing and exact-window keyboard validation when generic process
keyboard input is ambiguous. Native target checks and refusals remain authoritative; live retesting is required.

Alpha.38 includes Chrome in default Mac setup with an explicit opt-out, and adds a host-triggered
**Connect Chrome & continue** control to Mac conversations. Existing approved sessions are reused
only for the same process/window; revoked or expired access must be reconnected deliberately.
macOS and Chrome still own their permission decisions. The alpha.40 existing-profile picker path passed; clean-account consent and expiry recovery remain unverified.

Real alpha.37 work exposed three additional problems: outside-workspace files needed Add files,
only one generated file received a preview, and document-only tasks unnecessarily held the whole GUI
lane. Alpha.38 explains attachments, adds controls for all validated output files, and acquires the
GUI lane only on the first GUI call. Its real document retest produced five checked files with five
working previews while both tasks overlapped. Alpha.39 changes that ownership model, but real parallel GUI acceptance remains open.

The [real-work demo guide](./demo.md) records prompts, failures, interventions, measured outcomes
and limits. Fake-service regression checks and small Calculator/CSV smoke tasks remain useful but
are not everyday-use acceptance. Alpha.40 has one complete real-source browser research pass; Finder and parallel GUI work remain unaccepted.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
