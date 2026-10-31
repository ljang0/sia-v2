# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.39 is signed and notarized, but real GUI acceptance failed.
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
| Source | Alpha.39 exact-source full pilot gate passed: 1,786 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 action-gateway tests. [CI](https://github.com/ljang0/sia-v2/actions/runs/41162128134) passed. | Alpha.40 source changes require fresh gates and signing. |
| Signed Mac package | Alpha.39 from `741745bace345c2c28dac8a01d758315128022f2` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Live acceptance is failing; signature success is not product readiness. |
| Signed app continuity | Alpha.39 retained the QA profile, settings and history without a new Keychain prompt, including a full quit/relaunch. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.38 completed two real document tasks concurrently with five checked previews. Alpha.39's Finder filing task left all six input hashes unchanged and created no destination folders. | Fix native GUI delivery and repeat useful workflows; prove foreground ownership, clipboard preservation, parallel GUI results and responsiveness. |
| Browser | Alpha.39 attached the designated public Chrome window through the picker; Mac access showed ready. Research read the first official source. | Navigation lost its acknowledgement; subsequent reads returned `authorization_host_failed`. Restart and exact-window reconnect restored Attached but did not restore research. No report was created. Background new-tab creation remains unsupported. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes

Alpha.39 isolates each background turn's computer/browser grants and reserves physical windows
individually. Foreground takeover remains exclusive, same-window work queues with a visible waiting
state, and conflicting multi-window acquisition refuses instead of deadlocking. Automated gates
pass, but the signed real Finder/browser tasks did not complete; no concurrent GUI pass is claimed.

Alpha.40 source work corrects stale native window titles, explains authorization-host failures
without suggesting website sign-in or blind replay, and adds content-free callback diagnostics.
The SDK and both Mac libraries move together to stable Cua 0.38.0, which includes native prefetch
and input fixes. This is not yet a verified fix for the observed authorization failure. The installed
candidate remains alpha.39 until a new exact artifact passes its gates.

Alpha.38 includes Chrome in default Mac setup with an explicit opt-out, and adds a host-triggered
**Connect Chrome & continue** control to Mac conversations. Existing approved sessions are reused
only for the same process/window; revoked or expired access must be reconnected deliberately.
macOS and Chrome still own their permission decisions. The alpha.39 existing-profile picker path passed; clean-account consent and expiry recovery remain unverified.

Real alpha.37 work exposed three additional problems: outside-workspace files needed Add files,
only one generated file received a preview, and document-only tasks unnecessarily held the whole GUI
lane. Alpha.38 explains attachments, adds controls for all validated output files, and acquires the
GUI lane only on the first GUI call. Its real document retest produced five checked files with five
working previews while both tasks overlapped. Alpha.39 changes that ownership model, but real parallel GUI acceptance remains open.

The [real-work demo guide](./demo.md) records prompts, failures, interventions, measured outcomes
and limits. Fake-service regression checks and small Calculator/CSV smoke tasks remain useful but
are not everyday-use acceptance. No complete real-source browser research pass is claimed for alpha.39.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
