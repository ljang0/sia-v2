# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.37 is signed and notarized,
and its background browser, file, Calculator and cancellation/restart rehearsals passed. The last
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
| Source | Alpha.37 full local pilot gate passed: 1,768 desktop unit, 46 Electron, 31 renderer and 72 phone-browser checks. The [artifact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41132056136), [merged-main CI](https://github.com/ljang0/sia-v2/actions/runs/41134874934) and 66 local documentation links passed. | Re-run the runtime gates if application code changes. |
| Signed Mac package | Alpha.37 from `a5cac3f188a23196bcb538319d01064b6b47e900` passed universal signing, app/DMG notarization and stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Any runtime change requires a new signed candidate. |
| Signed app tasks | Alpha.37 retained the QA profile and background settings without a new Keychain prompt, created and previewed the exact CSV (total 15), operated native Calculator (`29 × 17 = 493`), and cancelled a disposable task. After a full quit/relaunch, cancellation and the exact CSV preview persisted. | Physical and clean-account acceptance below. |
| Everyday usefulness | Basic signed-app smoke tests passed; they do not demonstrate everyday usefulness. | Real-source workflows, background work alongside user input, simultaneous tasks, measured responsiveness, and default browser setup/recovery acceptance. |
| Browser | Alpha.37 read the IANA title/heading through the default background Mac route, then followed the public link to IANA-managed Reserved Domains. Chrome independently confirmed the resulting page. Detach caused `browser_consent_required`; explicitly reconnecting the same window restored background reading. | Live unexpected expiry remains unverified. Background new-tab creation is unsupported by driver 0.37.0. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes

Alpha.38 is in development. Real-provider review-packet and codebase-guide attempts on alpha.37
stopped after 18 and 38 seconds because the source files were outside the task workspace. Adding
the five source documents through Add files let the review-packet retry finish in 39 seconds and
produce three documents. Only one received a Preview control, and the installation guide incorrectly
used the fake-service development route as its first-hour walkthrough. This is assisted partial
coverage, not a first-run or quality pass; no substantive concurrent task overlap was established.

The later assisted codebase-guide retry completed in 45 seconds; all linked source paths exist.
A review-packet revision corrected its setup path and citations, but still proposed an unspecified
fictional-data exercise. Two requests in the same folder visibly queued safely. Independent
background tasks then exposed the whole-task GUI lease even for document-only work. Alpha.38
defers that lease until the first GUI tool call; parallel physical-window control remains unsupported.

The next candidate includes Chrome in default Mac setup, adds host-triggered connection recovery
inside Mac conversations, gives all verified output files result controls, and explains Add files
for source documents. Full gates and new signed-app acceptance are required. Native Chrome inspection
through the operator CUA tool timed out during real-source browser preparation; browser research
and foreground-user concurrency remain unverified.


Alpha.35 clears a dead Chrome attachment instead of leaving Settings at Attached. A late failure
from an old session cannot revoke a new connection, and recovery does not automatically replay
input or select another window.

Live alpha.35 acceptance also exposed a tool-contract ambiguity: browser URL fields intentionally
show only origins, but the model interpreted one as a full page URL and stopped on a false path
mismatch. Reading the same tab after explaining the redaction succeeded. Alpha.36 labels that
redaction in results and tool descriptions while keeping private paths, queries and fragments hidden.
The signed alpha.36 retest read the page correctly without an operator explaining the redaction.

Alpha.37 reuses the explicitly approved Chrome session only for the same process and window.
The alpha.36 live test showed that creating a separate session made the default Mac route request
setup again, which driver 0.37.0 refused in the background. Detaching or replacing the connection
revokes Mac-route references; expiry requires reconnecting the chosen window. No foreground fallback
is added. Its full local gate, signed package checks, live background navigation and explicit
detach/reconnect passed. The earlier foreground pause was resumed; independent UI inspection
confirmed the completed navigation, Calculator result and CSV. CUA input errors delayed that
verification but did not establish an application failure.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
