# Release status

Updated October 31, 2026. **Distribution is not ready.** Alpha.42 is signed and notarized.
Internal signed alpha.46 completed concurrent public research and native proposal editing, plus
verified filing. Final-candidate repeats, restart recovery and physical acceptance remain open.
The last published Mac pilot is alpha.24; no new invitations or public download have been authorized.

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
| Source | Alpha.46 `6a2356b` passed the complete local pilot and CI gates, including unsigned universal packaging. | Alpha.47 full gate and exact-source CI. |
| Signed Mac package | Alpha.42 from `c50782a873455719ee12bc931248aa0ad4f5c1fd` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Build and accept the final candidate; signature success is not product readiness. |
| Signed app continuity | Alpha.42 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.46: sourced plan and native brief with interleaved GUI actions; six-file packet with unchanged hashes. | Repeat, cancellation isolation and same-window contention on the final candidate. |
| Browser | Alpha.46 connected three times and completed sourced planning; diagnostic alpha.45 survived 343.590 seconds idle. | Restart recovery and expiry UX on final candidate. Background new-tab creation remains unsupported. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes and useful-work evidence

Alpha.44 added bounded subfolder operations and exclusive file moves. Alpha.45 fixed the mismatch
between the configured browser lifetime and the native implicit five-minute lease. Alpha.46 increased
the exact Chrome-prompt settlement budget and reduced decorative conversation repainting. Three
live connection attempts succeeded; a sourced visitor plan and saved native proposal brief completed
with interleaved actions. Filing six actual project documents preserved every hash. The complete
alpha.46 local pilot gate passed. Alpha.47 makes connection authorization explicit in setup copy;
its full gate and exact distribution package are pending.

Ten switches during filing measured median 815 ms / worst 1,068 ms including CUA observation.
GPU load improved in short spot checks, but working renderer CPU remains elevated; task conditions
were not matched. Earlier diagnostic alpha.45 completed a fresh browser task after 343.590 seconds
idle without reconnect. Its second native run saved successfully but refused a final scroll.
See [artifact evidence](./public-release.md) for exact versions, hashes and qualifications.

Default Mac setup includes Chrome with a deliberate opt-out. Choosing a window authorizes its
explicit connection setup, including Chrome's exact prompt. Task tools cannot approve permission
dialogs. macOS grants remain person-owned. Expiry, revocation and restart require actionable recovery.

This Mac currently refuses power assertions from both Sia and Apple's `caffeinate`; physical
keep-awake/sleep behavior remains unverified. No fresh macOS account or second Mac is available.
The [real-work demo guide](./demo.md) specifies useful prompts and independent checks; fake-service
tests remain regression coverage, not proof of desktop usefulness.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
