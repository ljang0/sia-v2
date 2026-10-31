# Public distribution candidate

## Current decision — October 31, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.47 is signed and notarized; internal alpha.46 completed useful concurrent
browser/native work and verified filing. Final-candidate repeatability and physical acceptance remain incomplete. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Exact alpha.47 artifact and live result

Built from `61b3aacecc132ec4f3897c257d2e3b7445451a81`. The production source from `a36d0b6`
passed the complete local pilot gate (1,827 desktop units, 46 Electron, 33 renderer, 72 phone-web
checks); the final documentation-only split also passed formatting and the quality guard. The
universal app and DMG passed Developer ID signing, notarization, stapling, Gatekeeper and packaged
runtime/license/provenance checks. No artifact was published. The 120-line onboarding guide now
links detailed feature behavior from [the desktop reference](./desktop-reference.md).

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.47-universal.dmg` | `0f2c64466e728a0ff3cd4d62c58852c9b00287701ebe0519279b635740767a67` |
| `Sia-0.1.0-alpha.47-universal.zip` | `bd844cb1cee56b689c8e7e712eece1765be70864d286028d6ea15f8cddab4ea8` |
| Installed QA `app.asar`            | `96a31d592d50c372d90b3e8f32a54fb25c1f92935834eb4a4c5749bbf2b514b2` |
| Saved native proposal brief        | `365ae627124599fd4a91270e18c124acc669148dd584c4d99c1876a6caada395` |
| Saved control-tool comparison      | `7e19a9483c945bf54c74d885efbfa745eba4e69e4f0ba7964de8dd9a8d1a2385` |

The exact app reopened the QA profile/history without a Keychain prompt. A fresh research task
showed actionable inline Chrome recovery after restart. Selecting the approved public window
connected in 2.407 seconds and resumed the saved request, but Chrome remained foreground and the
background input guard paused the task. The operator activated Finder with CUA and pressed
Continue task. **This was an assisted run, not a restart/concurrency pass.**

Sia saved a 334-word brief using TextEdit's UI and a 768-word Cua/Browser Use/Playwright comparison
using current official sources. Independent inspection verified output bytes and the comparison's
main platform/setup/background/CDP claims. Recommendations remain judgments, not benchmarks. The
native brief faithfully preserves the source proposal's dated evidence; it is not a new readiness
certificate. Browser/native lifetimes overlapped, but the restart pause delayed browser mutations
until after native editing; no unassisted GUI-concurrency pass is claimed for this version.

A second agent requesting the same browser window visibly waited and sent no input. Stop caused
its pending snapshot to be refused before execution and terminal cancellation in 214 ms. The CUA
round trip was 5.857 seconds and still observed Stopping, so backend timing is not visible stop-to-idle
latency. The owner subsequently completed its report. Its later local trajectory is incomplete;
do not claim fully instrumented post-cancellation browser input. Same-folder queue cancellation
was checked separately and is not evidence of the window lock.

Sia again failed to create its real display-sleep assertion. New `caffeinate -d` and `-i` probes
also failed, although other processes had assertions. Sleep prevention remains unverified.
Private evidence is in `alpha47-artifacts/real-work`; original notarized alpha.42 and alpha.47
artifacts and earlier QA bundles are preserved.

Alpha.48 returns the existing Sia window to the front after **explicit** native connection setup,
before any saved task continues, and removes the contradictory “Click Allow” progress copy.
Automatic attachment/model actions cannot request that focus change. Twenty-four focused tests
passed; the complete gate and exact signed-candidate acceptance are pending.

## Current internal alpha.46 evidence

Internal arm64 Developer ID signed alpha.46 was built from
`6a2356b662fbdd31e3c82d3d90217984bb4ca11f`; it is **not notarized or accepted for distribution**.
App.asar SHA-256: `16ee5eb9ac26d56df6b41ec6f86ee40314eba060c53eb0ab04ef2ba514223adb`.
Strict signatures, package/runtime, native provenance and license checks passed. Profile/history
and an unsent draft survived upgrade without a Keychain prompt. The complete local pilot gate
passed: 1,827 desktop units, 46 Electron, 33 renderer, 72 phone-browser and 73 gateway tests.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41185786149) also passed, including
unsigned universal packaging.
The later alpha.47 package and its remaining live failure are recorded above.

### Useful work, independently checked

- **Concurrent public research and native editing:** a museum/meal/transit plan for a hypothetical
  CMU visitor and a 338-word brief condensed from the actual Arena proposal both completed with
  interleaved browser/TextEdit actions, without corrective task messages. Browser duration was
  about 152 seconds; native editing about 61 seconds. One browser checkpoint failed and recovered.
  The plan labels walking times, meal prices and date-specific availability as unverified; no
  booking, sign-in or communication occurred. The brief preserves the source draft's dated evidence.
- **Reviewer packet:** six actual repository documents moved into three requested folders in
  46 seconds / 26 steps. Independent SHA-256 checks matched all originals; Inbox remained empty
  and present. One step had a problem, but no corrective task message was needed.
- **Chrome setup:** three attach/detach attempts succeeded without an operator clicking Allow.
  The first native prompt scan/settlement finished in 2.09 seconds; warm repeats needed no new
  prompt. Only the explicitly approved public window was selected.
- **Responsiveness:** ten conversation switches during filing had median 815 ms / worst 1,068 ms
  including CUA observation; click acknowledgements were 29–96 ms. Two observations exceeded one
  second. These are control round trips, not isolated paint timings.

| Saved output | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| Visitor plan | `4d02a2e201646fab8f116d2ddba013acd64b00cacca82b5bd1038dc1f4eddca2` |
| Native brief | `b678f0a8ecc931a8434e6eeb6ef83339383ab3b69c45b9166cef2982bebf5ac3` |

Private prompts, trajectories, timings, screenshots and per-file hashes are retained in
`alpha46-artifacts/real-work`. A single successful pair does not establish general repeatability.
Current-candidate cancellation, same-window contention, restart recovery and physical checks remain.

### Fixes and earlier diagnostic evidence

Alpha.44 added bounded subfolder reads and exclusive revision-checked file moves. Two filing
repeats preserved all hashes; two native briefs were saved, with a final scroll refusal on the
second run. Its browser runs required reconnect and did not establish simultaneous GUI success.

Alpha.45 creates a supported Standard-mode browser lease during explicit connection setup:
fifteen-minute idle and eight-hour absolute limits, retaining revocation and restart recovery.
Its production Chrome setup failed three times. A signed diagnostic copy with content-free timing
logs completed two concurrent useful task pairs; the second fresh browser task worked after
343.590 seconds idle without reconnect. The second native run saved its brief but refused a final
scroll. Cancelling another read-only task took 221 ms to terminal cancellation; the browser pipeline
subsequently saved its output, although no post-cancellation browser input was established. A draft
typed while that pipeline ran was confirmed intact after reopening and restart; initial immediate
AX observation had missed the asynchronous typing. This is qualified diagnostic evidence, not
acceptance of the production alpha.45 package.

The native consent diagnostic measured 3.798 seconds scanning and 1.986 seconds confirming closure,
near/beyond the old four-second budget. Alpha.46 allows eight seconds while preserving exact prompt,
process, ambiguity and post-click checks. Its three successful setups are encouraging; they do not
prove that timing alone caused every prior failure.

Alpha.46 freezes the decorative backdrop in conversations and removes costly text/shadow animation.
Short process-CPU spot checks showed completed-conversation GPU median/max 5.1%/5.3% and renderer
6.0%/7.0%. With one browser task still active after native editing had finished, GPU was 4.7%/4.9%
and renderer 34.5%/36.4%. Alpha.45's earlier both-active sample was 64.6%/79.6% and 58.4%/70.6%.
These different task states are not a controlled benchmark; working renderer CPU remains elevated.

**Keep-awake is unverified on this Mac.** Sia's native call returned `kIOReturnNoMemory`, and separate
Apple `caffeinate -d` and `-i` probes also failed to create power assertions. No Sia display-sleep
assertion was present. The error does not establish a physical RAM diagnosis. Mocked tests cannot
certify real sleep prevention; no system service or personal app was restarted to hide the failure.

Earlier artifact hashes and failures remain in
[the prior record](https://github.com/ljang0/sia-v2/blob/121cf20/docs/public-release.md).

## Exact alpha.42 artifact and live result

Built from `c50782a873455719ee12bc931248aa0ad4f5c1fd`. The full local pilot gate passed:
1,814 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 action-gateway tests.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41171344097) passed. Universal
signing, app/DMG notarization/stapling, strict signatures, Gatekeeper and packaged-runtime checks
passed. App notarization `963caef5-b8a9-4798-ba39-51936ee4156e` and DMG notarization
`2863c540-1510-4ad3-ad5a-e3a24862a722` were Accepted.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.42-universal.dmg` | `53d6f8ed73a9530e2dfa969bac99817cb830ce979e8c806770a37ec11ffd39c2` |
| `Sia-0.1.0-alpha.42-universal.zip` | `570a3bde3a23306fa56a8523709fea5e36fdf98dc037b0c5cbd39194d0938f6d` |
| Installed QA `app.asar`            | `e13312de6a266b6634c0b41b217c61668dc2a2d8ac3b27e532afb0b982e7bff0` |

The separate QA copy retained its profile and history. Its driver reported
`direct_capture_consent_required` despite the existing TCC grants. **See your screen** correctly
stayed actionable; after its explicit setup action, the warning cleared and a real Finder task
received 1365×647 screenshots with pixel actions available. The operator's attempt to inspect
macOS UserNotificationCenter was refused by CUA; that app was not controlled or bypassed.

The fresh clipboard-free Finder task still **failed before filing**, after about 84 seconds.
Command-Up and two pointer actions were acknowledged without reaching the parent folder.
All six real project files remained in Inbox with matching hashes. The original clipboard canary
was independently pasted afterward and matched, but a failed task is not a successful
clipboard-preserving workflow. The initial app inventory did not establish TextEdit as foreground;
the later independent typing cannot establish simultaneous foreground work for this run.

Chrome recovery selected only the approved public Browser Harness window. The operator completed
its existing Chrome consent prompt, but native diagnostics reported `consent_not_settled`.
The pinned driver uses a four-second consent deadline and scans same-process Chrome windows;
ten windows were listed. The later engineering probe above confirmed repeated scanning exceeded the deadline. No settings
were changed, unrelated window attached, or browser restarted. Parallel GUI work and distribution
remain unaccepted. Exact prompts and private evidence are in the alpha.42 artifact folder.

## Historical evidence and rollback

Earlier alpha.38 document concurrency, alpha.40 browser research, alpha.41 filing and their exact
artifact hashes remain in the [prior record](https://github.com/ljang0/sia-v2/blob/d56cb3a/docs/public-release.md).
Those results apply only to their named versions. They do not establish current repeatability,
parallel GUI completion, clean-account setup or physical voice/lock/sleep acceptance. The original
notarized alpha.42 QA backup and DMG/ZIP remain unchanged locally.

## Cloud and follow-on iPhone evidence

Cloud ratings/account-deletion changes from `bd32d980635b6cf894ae56c4bb2504cfadfaead7` were
deployed to `sia-alpha`. The deployment verified both package hashes, atomic retries/rerating and
account-deletion isolation. A synthetic authenticated app rating reached the aggregate report.
The October 30 health recheck found all 18 alarms OK with actions enabled and all five Lambdas
Active/Successful. Anonymous catalog, ratings-report and release requests returned 401.

Native iPhone 0.1.0 (31) is Ready to Test in the internal Pilot QA group, with zero testers at the
last acceptance check. Native tests, signed archive, upload and Apple processing passed. Physical
pairing, file Save, reconnect and microphone acceptance, and external beta review remain open.
The owner selected iPhone as a follow-on release, so those checks do not gate this Mac-first handoff.

## Earlier evidence

Earlier artifact hashes, source commits, cloud deployments and live rehearsals remain available in
the [prior acceptance record](https://github.com/ljang0/sia-v2/blob/c81bb40c483c92f5d483c5980352408caa3ed5c7/docs/public-release.md).
They apply to the versions named there; they do not establish current-artifact acceptance.
The last published alpha.24 pilot remains recorded in [release evidence](./release-evidence.md).

## Publication

The alpha.47 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep the original notarized alpha.42 backup available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
