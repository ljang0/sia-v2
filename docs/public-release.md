# Public distribution candidate

## Current decision — October 31, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.42 is signed and notarized; internal alpha.43 fixes Chrome reconnection.
Ordinary background file organization and parallel GUI acceptance remain incomplete. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Internal alpha.43 QA candidate

The current QA app is an **arm64 Developer ID signed internal build, not notarized or
accepted for distribution**, from `8180ddee65e7fd98ef2a191bff4b5a5e1670f498`.
Its app.asar SHA-256 is `9ee6429e718c0ce2165f17e5fcb7e5591f83e115715b83d6e89860841101490e`.
Strict signature, package/runtime, SDK provenance and license checks passed. The initial source
pilot gate passed 1,821 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 gateway
tests plus 11 native consent regressions. License additions then passed two focused tests and
both-architecture native builds. The QA profile/history survived the upgrade.

Chrome consent scanning now uses one native application walk instead of scanning every
same-process surface. The engineering probe measured 1,670 ms instead of 7,656 ms against a
four-second deadline; post-action verification took 215 ms. The patch preserves approved-process
ownership, exact consent identity, ambiguity/truncation refusal and the deadline. The packaged
alpha.43 app also reconnected the same approved public window successfully. An app restart still
requires selecting that window again. See [native build provenance](../apps/desktop/native/cua/README.md).

### Real work, independently checked

| Workflow                             | Result                                                                                                                                                                                                                         | Limits                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practical CMU visitor plan           | Read official museum/dining/transit sources and saved a readable itinerary with rain alternative, checked budget and explicit estimates. 3m51s, no browser intervention. Preview opened; typing and clipboard canary survived. | Hypothetical visitor scenario using real sources; no booking. One packaged alpha.43 run, following a separate engineering-probe pass.                 |
| Finder filing alongside browser work | Created Review packet, Planning and Evidence folders. All six source files retained their original hashes in Inbox.                                                                                                            | Failed: macOS drag-and-drop follows the physical pointer. Two initial operator activation/Continue interventions. This is not a parallel GUI success. |
| File-tool recovery                   | Explicit follow-up permitted file tools without GUI-only constraint.                                                                                                                                                           | Failed: current background tools only handle top-level files and cannot move files into folders. No additional file changes.                          |

Planning output SHA-256: `8c7e7d5ae83e65691914661894a884ef25b001160a60d0c1e29e76f17ba84b5f`.
Independent primary checks covered [museum hours/admission](https://carnegieart.org/visit/come-visit/),
[dining hours](https://carnegieart.org/visit/dine-with-us/) and
[transit fares](https://www.rideprt.org/fares-and-payment/). The $50 base plan plus $5.50 optional
transit reserve leaves $4.50 of the $60 limit. Food prices, walking times, weather and date-specific
availability were explicitly estimates or unknowns. Private exact prompts, timings, screenshots,
checks and interventions are retained in `alpha43-artifacts/real-work`.

Preview idle sampling still showed about 21% GPU-process and 5% renderer CPU, compared with about
1% in Settings (short `top` samples, not a controlled benchmark). A subsequent source fix removes
an inline gradient animation style that overrode pause CSS. The regression fails before the fix
and passes afterward; live package performance remains to be rechecked. Other subsequent changes
preserve uncertainty after partial native drags and explain the unsupported background filing
route instead of encouraging retries. Their focused 119-unit and renderer regression checks
passed; final exact-source and signed-artifact gates remain pending.

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
