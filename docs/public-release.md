# Public distribution candidate

## Current decision — October 31, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.42 is signed and notarized; internal alpha.44 passes repeated file organization.
Browser continuity and parallel GUI acceptance remain incomplete. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Internal alpha.44 QA candidate

The current QA app is an **arm64 Developer ID signed internal build, not notarized or accepted
for distribution**, from `9338a1b8824cca6751333b9b0149bc2b70025f63`.
App.asar SHA-256: `f799b6a4bd0323f37556cdf0324fbef447b4164ce8eb44ce272fe51bf01fc898`.
Strict signatures, package/runtime, SDK provenance and license checks passed. Profile/history
survived the upgrade without a Keychain prompt. Test-only follow-up `092006d119c56f564353cf4efa1b43a771182078`
passed the complete local pilot gate and [CI, including unsigned universal packaging](https://github.com/ljang0/sia-v2/actions/runs/41180267503).
The gate included 1,826 desktop units, 46 Electron, 32 renderer, 72 phone-browser and 73 gateway tests.

### Real work, independently checked

| Workflow                                                | Result                                                                                                                                                                                               | Limits                                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File organization, two fresh conversations              | Six actual project deliverables each moved into three correct folders; all hashes unchanged, both Inboxes empty. First run: 36 seconds / 19 steps. Independent typing and clipboard canary survived. | Uses bounded file tools, not Finder drag. Ordinary UTF-8 text formats only, at most 256 KB each.                                                                                        |
| TextEdit proposal editing, two fresh conversations      | Saved 327- and 332-word briefs from actual proposal copies using native UI. Content, limits and saved bytes checked. Finder was foreground.                                                          | Second run's final scroll was refused with same-process keyboard ambiguity; saved brief was independently verified.                                                                     |
| Public-source visitor planning, two fresh conversations | Both saved plans after recovery; museum/dining/fare claims and budget checked. Second preview opened.                                                                                                | First required restart connection and foreground recovery. Second failed after the native browser session expired, then finished after reconnect. Neither is an unassisted repeat pass. |
| Concurrent GUI work                                     | Browser and native task lifetimes overlapped.                                                                                                                                                        | Browser blocked until after native work finished. No interleaved successful browser/native GUI execution; concurrency is not accepted.                                                  |

The plan's $45.32 main spend plus $5.50 transit reserve leaves $9.18 of the $60 budget.
Primary checks: [museum](https://carnegieart.org/visit/come-visit/),
[dining hours](https://carnegieart.org/visit/dine-with-us/),
[menu](https://thecafecarnegie.com/menu.html), [fares](https://www.rideprt.org/fares-and-payment/).
Walking times, tax allowance and future availability remain explicitly estimated or unverified.
This is a hypothetical visitor request using real sources; no booking occurred.

| Saved output            | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| Visitor plan, first run | `46e32d9ff60292e60cda065f3b84652bf61cd4f492b01565a9ec1c754513b995` |
| Visitor plan, repeat    | `40a3ef51561736a5c6740ed93c3f646549e95158801d055e90c26bbf24f314ae` |
| Native brief, first run | `8c2a2983fb94365804739b3881e79dfec52ea4362c2473514b3bb9bfa2a7ecd6` |
| Native brief, repeat    | `83183e9da6ca420462fa49dc3b4efd3f258a20749d68e11de6a23e383fe1b746` |

Ten thread switches during filing measured 1,335 ms median / 2,345 ms worst, including CUA
observation overhead. Only filing was active; the browser had paused. This does not meet the
one-second observation target or establish pure UI latency. Settings clicks returned in
108–203 ms; observed total control round trips were 827–1,223 ms. Preview sampling (11 one-second samples after discarding the first) still showed elevated GPU/renderer CPU; see the correction below.
Exact private prompts, trajectories, timings, hashes, screenshots and interventions are retained
in `alpha44-artifacts/real-work`.

### Alpha.45 source correction under test

The browser repeat exposed the native implicit session's five-minute idle expiry. Sia configured
a fifteen-minute host idle limit but never created a host lease, so that limit did not apply.
The source now declares a Standard-mode browser lease through the supported SDK, only during
explicit connection setup. It retains the fifteen-minute idle/eight-hour absolute bounds; expiry,
revocation and app restart still require connection recovery. It does not poll pages or revive
expired authority. A real-runtime lifecycle/revocation probe and 89 focused tests passed.
The result preview also pauses covered shell animations, including presence pulses, which otherwise
keep repainting its full-window blur. A renderer regression confirms covered motion stops and
resumes on close. Live CPU must be remeasured on the new package. Full gates and exact signed-app
acceptance remain pending. The session fix does not solve restart recovery.

Earlier alpha.43 results and failed Finder/file-tool attempts remain in
[the previous record](https://github.com/ljang0/sia-v2/blob/092006d/docs/public-release.md).

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

The alpha.42 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep the original notarized alpha.42 backup available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
