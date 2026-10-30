# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.36 is signed and notarized,
and its core signed-app rehearsal passed. The last published Mac pilot is
alpha.24; no new invitations or public download have been authorized.

The owner selected **Mac first; iPhone follows**. Research sharing stays off and Codex App Server
is the initially admitted engine. The [Arena proposal](./arena-proposal.md) describes a bounded
technical review and invited pilot, without claiming a partnership or validated model ranking.

## Evidence and remaining gates

| Area | Verified evidence | Still required |
| --- | --- | --- |
| Source | Alpha.36 full local pilot gate passed: 1,761 desktop unit, 46 Electron, 31 renderer and 72 phone-browser checks. The [artifact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41089283694), developer prerequisite check and relative documentation links passed. | Re-run the runtime gates if application code changes. |
| Signed Mac package | Alpha.36 from `86c8add784b9fc7a3f572b1a7322ce3a098ac8e0` passed universal signing, app/DMG notarization and stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Any runtime change requires a new signed candidate. |
| Signed app tasks | Alpha.36 retained the QA profile without a Keychain prompt, created and previewed the exact CSV (total 13), operated native Calculator (`17 × 23 = 391`), and cancelled a disposable task. After a full restart, cancellation and the exact file preview persisted. | Finish the remaining live rows below. |
| Browser | Alpha.36 attached the isolated public Chrome window and read the correct IANA title/heading without corrective prompting. Chrome independently confirmed the page. The model accurately stated the origin-only URL limitation. Alpha.34 passed safe link navigation. | Live expiry recovery remains unverified. Default Mac-route browser acceptance awaits Chrome inactive/consent state verification. Background new-tab creation is unsupported by driver 0.37.0. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes

Alpha.35 clears a dead Chrome attachment instead of leaving Settings at Attached. A late failure
from an old session cannot revoke a new connection, and recovery does not automatically replay
input or select another window.

Live alpha.35 acceptance also exposed a tool-contract ambiguity: browser URL fields intentionally
show only origins, but the model interpreted one as a full page URL and stopped on a false path
mismatch. Reading the same tab after explaining the redaction succeeded. Alpha.36 labels that
redaction in results and tool descriptions while keeping private paths, queries and fragments hidden.
The signed alpha.36 retest read the page correctly without an operator explaining the redaction.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
