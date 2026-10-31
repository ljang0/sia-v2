# Release status

Updated October 31, 2026. **Distribution is not ready.** Alpha.42 is signed and notarized.
Direct-capture setup and Chrome recovery now work in internal alpha.43 QA; ordinary background
file organization, repeatable parallel GUI completion and responsiveness still block acceptance.
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
| Source | Alpha.43 source `a25bd7b` passed the full local pilot gate: 1,823 desktop unit, 46 Electron, 32 renderer, 72 phone-browser and 72 gateway tests. | Alpha.44 file-tool changes require new exact-source gates and signed-app acceptance. |
| Signed Mac package | Alpha.42 from `c50782a873455719ee12bc931248aa0ad4f5c1fd` passed universal signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded. | Live acceptance is failing; signature success is not product readiness. |
| Signed app continuity | Alpha.42 retained the QA profile, settings and history without a new Keychain prompt. | Physical and clean-account acceptance. |
| Everyday usefulness | Alpha.38 completed two real document tasks concurrently with five checked previews. Alpha.41 filed all six real documents correctly with matching hashes in 5m27s; six steps needed recovery. Alpha.42’s clipboard-free rerun got real screenshots but failed before filing. | Alpha.43 preserves the clipboard in the planning run but Finder filing fails. Verify the new file route, repeated useful workflows, parallel GUI results and responsiveness. |
| Browser | Alpha.40 read three official sources, saved a checked 751-word comparison and opened its preview in about 120 seconds with TextEdit active. | Alpha.43 reconnects the approved window and completes the real-source plan. Restart still required choosing the window; repeat/restart and parallel GUI acceptance remain open. Background new-tab creation remains unsupported. |
| New recipient | Alpha.36 with an empty app profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account; no fresh account or second Mac is currently available. |
| Cloud feedback | Ratings/account deletion deployed; a synthetic authenticated rating reached the report. October 30: 18 alarms OK with actions enabled, five Lambdas Active/Successful, anonymous catalog/report/release requests return 401. | Recheck if configuration changes before invitations. |
| iPhone follow-on | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed. | Deferred from this Mac-first handoff. Physical-device checks and external beta review remain. |
| Ownership | The owner confirmed ownership of the relevant Notch source rights. Provenance remains in THIRD_PARTY_NOTICES.md. Lawrence Jang is the support/incident owner. | Record the private recipient list and final release decision before invitations. |

## Current fixes and useful-work evidence

Alpha.43 source adds the pinned native Chrome consent patch, persistent connection errors,
a pre-input background Copy/Cut guard, fresh-reference guidance on task continuation, and
paused background decoration while a document preview is open. Its initial source pilot gate
passed (1,821 desktop units, 46 Electron, 31 renderer, 72 phone-browser and 72 gateway tests).
An internal signed arm64 build passed package/runtime/provenance checks, but it is not notarized.
The clipboard guard is deliberately not represented as a comprehensive
menu/clipboard sandbox.

The engineering probe recovered Chrome in 1.7 seconds instead of a 7.7-second repeated scan,
then completed a real-source CMU visitor plan with verified facts/arithmetic and a working
preview. TextEdit was active, typing survived and the clipboard canary matched afterward.
It needed one initial foreground-pause intervention, then ran for 4m04s; this is one useful
background-browser pass, not repeatability or parallel GUI acceptance. The probe is a modified
QA copy, not the notarized alpha.42 artifact or an alpha.43 release. See [exact evidence](./public-release.md).

Existing changes reserve individual physical windows, queue same-window work, and acquire GUI
ownership only when a task first uses it. Document-only concurrency passed on alpha.38; two
simultaneous native/browser tasks still need to complete on the exact candidate. The current Finder failure is a native file-drag limitation; window-level locking does not fix it.

The packaged alpha.43 rerun recovered Chrome and completed the practical visitor plan in 3m51s
without a browser intervention, alongside the Finder task. The plan's facts, budget, saved preview,
independent typing and clipboard canary passed. Finder created three folders but moved no files:
native macOS file drag-and-drop requires the hardware pointer. A follow-up permitting file tools
also failed because the background tools cannot traverse folders or move files. This is a product
gap, not a successful parallel GUI demo. Later source fixes explain the drag limitation, preserve
uncertainty after a partial drag, and stop an inline gradient animation from overriding pause
styles. Those fixes passed the full source pilot gate; final package acceptance remains pending.

Alpha.44 source adds listing/reading within ordinary subfolders and a `computer_move_file` action.
The existing signed native helper performs an exclusive rename, checks the observed revision and
reads back unchanged bytes. It never overwrites a destination or touches the clipboard. Gateway
checks use real temporary files and the compiled native helper, including competing moves and
edits. The capability is limited to ordinary UTF-8 txt/md/csv/tsv/json/ics files up to 256 KB within
the task’s working folder. This implementation is not yet a signed-app usefulness pass.

Default Mac setup includes Chrome with a deliberate opt-out. **Connect Chrome & continue**
preserves the saved request. Existing approval is reused only for the same process/window;
macOS and Chrome still own permission decisions. Clean-account setup remains unverified.

The [real-work demo guide](./demo.md) records useful prompts and independent checks. Earlier
per-version implementation details and superseded attempts remain in Git history and private
evidence; the table above and current artifact record determine readiness.

## Release decision

Complete the applicable checks with the exact signed artifact, then record a go/no-go decision
with the owner. Fake-service and simulator success do not establish live Mac acceptance.
The iPhone companion, preview engines, public connectors and research enrollment retain separate gates.

See [manual acceptance](./manual-acceptance.md), [artifact evidence](./public-release.md),
[release operations](./release.md) and the [pilot runbook](./cmu-pilot-runbook.md).
