# Release status

Updated October 31, 2026. **Distribution is not ready.** Internal signed alpha.49 completed two
real research/native pairs, two verified filing runs and a responsive live Stop check. Alpha.48
remains the latest notarized package. Final-artifact, broader workflow and physical acceptance
remain open. The last published Mac pilot is alpha.24; no new invitations or public download
have been authorized.

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
| Source | Alpha.49 `8576717` passed the complete local pilot gate; alpha.48 exact-source CI passed. | Alpha.49 exact-source CI and signed live acceptance; complete alpha.49 local gate passed. |
| Signed Mac package | Alpha.48 from `d07060a6a8edf469905f30b21698282dbe808dfd` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Build and accept the final candidate; signature success is not product readiness. |
| Signed app continuity | Alpha.48 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.49: two sourced comparisons/native briefs and two six-file packets with matching hashes. | Personal planning/full reviewer-packet repeats and fully instrumented final-artifact concurrency. |
| Browser | Alpha.49: explicit connection returned to Sia, auto-resumed research, then a fresh conversation reused the connection. | Restart recovery and expiry UX on final candidate. Background new-tab creation remains unsupported. |
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
alpha.46 local pilot gate passed. Alpha.47 passed its full local gate and universal notarization, but live restart recovery still
needed operator continuation because Chrome remained foreground. Alpha.48 returns to Sia after
explicit setup before resuming, and corrects the remaining progress copy. Its complete local gate and universal notarization passed.
Live explicit setup returned to Sia and resumed automatically; native editing saved a faithful
343-word brief while foreground typing and the clipboard survived. Browser navigation then lost
its acknowledgement and origin/access checking failed, twice including an assisted continuation.
The same public page also briefly stopped answering independent CUA reads. Root cause is unproven.
A waiting browser task sent no input and cancelled execution in 202 ms, but the cancellation notice
took 30.112 seconds. Alpha.49 removes that provider-reply delay from Stop and deduplicates native
interruptions; it adds content-free browser transport/origin diagnostics. The complete alpha.49
local gate passed (1,832 desktop units, 46 Electron, 33 renderer, 72 phone-web); exact-source CI
and final universal-artifact checks remain pending. Internal signed live evidence is below.

Alpha.49 live Stop showed cancellation within a 672 ms CUA round trip while the browser owner
continued and completed. Ten switches during real filing measured median 826 ms / worst 1,301 ms,
including observation; click acknowledgements were 30–88 ms. Two research/native pairs completed
without corrective task messages, but later browser traces were filtered, limiting action-by-action
concurrency claims. One native final scroll refused after saving; the fresh repeat verified its save.
The earlier browser stall did not recur when the operator avoided claiming the same Chrome tab;
its cause remains unproven. See [artifact evidence](./public-release.md) for exact qualifications.

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
