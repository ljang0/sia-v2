# Release status

Updated October 31, 2026. **Distribution is not ready.** Alpha.42 is signed and notarized.
Internal signed alpha.44 passes repeated useful file organization and saves native proposal edits.
Browser continuity, simultaneous native/browser completion and responsiveness still block acceptance.
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
| Source | Alpha.44 production source plus test-only `092006d` passed full local pilot and CI gates, including unsigned universal packaging. | Alpha.45 session-lifetime fix needs its full gate and signed-app acceptance. |
| Signed Mac package | Alpha.42 from `c50782a873455719ee12bc931248aa0ad4f5c1fd` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Live acceptance is failing; signature success is not product readiness. |
| Signed app continuity | Alpha.42 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.44: two file-organization repeats with all six hashes intact; two saved native proposal briefs; typing and clipboard preserved during filing. | Second native run had a final scroll refusal. Browser recovery prevented concurrent GUI acceptance. Repeat on the final candidate. |
| Browser | Alpha.44 saved two sourced, checked visitor plans after recovery. | Restart requires reconnect; five-minute implicit session expiry broke the fresh repeat. Alpha.45 declares the configured host lifetime; restart and simultaneous GUI acceptance remain open. Background new-tab creation is unsupported. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes and useful-work evidence

Alpha.44 adds bounded subfolder listing/reading and exclusive, revision-checked file moves through
the signed native helper. Both real filing repeats passed without corrective input. This supports
ordinary UTF-8 txt/md/csv/tsv/json/ics files up to 256 KB inside the task folder; background Finder
file drag remains unsupported. Native TextEdit editing produced two saved briefs, with a final
scroll limitation in the repeat. The exact hashes and qualifications are in [artifact evidence](./public-release.md).

Both browser planning attempts needed recovery. The second exposed a five-minute native implicit
session lifetime despite Sia's fifteen-minute host configuration. Alpha.45 source creates a
Standard-mode host lease during explicit connection setup, retaining expiry and revocation.
A real native-runtime probe confirmed the declared lifetime and terminal revocation; full source
and signed-app gates remain pending. This does not establish restart persistence.

Browser/native task lifetimes overlapped, but successful GUI actions did not interleave. Ten
thread switches during filing measured 1,335 ms median / 2,345 ms worst including CUA observation;
this misses the one-second observation target and is not a pure paint-latency measurement.
Cancellation isolation, same-window contention and preview CPU still need current-candidate checks.

Default Mac setup includes Chrome with a deliberate opt-out. **Connect Chrome & continue**
preserves the saved request. macOS and Chrome still own permission decisions; no program can
silently pre-grant those OS permissions. Clean-account setup remains unverified.

The [real-work demo guide](./demo.md) records useful prompts and independent checks. Earlier
per-version details and failed attempts remain in Git history and private evidence; the current
artifact record determines readiness.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
