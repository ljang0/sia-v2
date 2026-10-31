# Public distribution candidate

## Current decision — October 30, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.39 is the signed acceptance candidate; its real GUI tests failed. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Exact alpha.39 artifact

Built from `741745bace345c2c28dac8a01d758315128022f2`. The full local `pnpm test:pilot`
gate passed: 1,786 desktop unit, 46 Electron, 31 renderer, 72 Chromium/WebKit phone and
72 action-gateway tests. Expected live opt-in tests were skipped. [Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41162128134) passed.

Universal signing, app/DMG notarization and stapling, strict signatures, Gatekeeper and packaged
native/runtime verification passed. App notarization `39473ad8-b12e-4bd6-9a0b-0b95b154485c`
and DMG notarization `63d5b9e8-c183-48dc-8462-8adbbbe18369` were Accepted.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.39-universal.dmg` | `17272571ebaeee93c2c3cf13a822e8a2319232d9846009890dce783115f4f617` |
| `Sia-0.1.0-alpha.39-universal.zip` | `2f7d9f7b9e1091d4198b36845ab1de90c8b8252435b7dda338d76f6034b80319` |
| Installed `app.asar`               | `b12e93575b6345fefe6757da1ed913bc8c8c39a314d1389d1946926ac516ec40` |

The existing QA profile reopened with settings/history intact and no new Keychain prompt.
Mac access showed ready; the already-approved public Chrome window attached through the picker.
This was a separate window in the existing profile, not an isolated browser profile or clean-account
onboarding. The verified alpha.38 app remains the local rollback copy.

## Alpha.39 real GUI failures

Two requests started 11.84 seconds apart using GPT-6-Astra through Codex App Server, strict
background mode and automatic action approval. Finder was asked to organize six actual public
project deliverables into three folders through its GUI. After 72 seconds it stopped: background
shortcuts did not navigate reliably. Independent checks confirmed all six original hashes remained
in Inbox and no destination folders existed. AX Back changed the folder, but Sia's top-level title
remained stale; that source bug is corrected for the next candidate.

The other task was to compare official Cua, Browser Use and Playwright documentation and save a
short report. It read Cua's page. Two navigation attempts paused because Chrome remained active
despite operator attempts to activate TextEdit. After the operator hid Chrome, navigation lost its
acknowledgement and the next read returned `authorization_host_failed`. A full Sia restart and
reconnection of the same approved window restored Attached, but another read failed the same way.
The report file does not exist. No website sign-in failure was established.

The TextEdit canary retained its text, but foreground ownership was not proved and the clipboard
was not tested. Neither useful GUI request completed, so overlapping starts do not establish
concurrent computer-use acceptance. Exact prompts, input hashes, traces, screenshots and results
remain in the private alpha.39 artifact folder. These failures block distribution.

## Prior alpha.38 document results

Both tasks used GPT-6-Astra through Codex App Server and the operator's actual ChatGPT plan,
Use my Mac / Work in background / Pause and tell me, with automatic action approval. Sources were
actual public project documents attached before the initial request. Each assistant used its
separate default folder. No corrective follow-up was required for either initial task.

| Workflow                | Independently checked result                                                                                                                                                                       | Observed UI work segments                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Technical-review packet | Three saved Markdown files; 484-word brief; real signed-app/ChatGPT-plan walkthrough; portable source paths; version-specific evidence and unresolved gates; all three previews opened.            | 5 seconds / 1 step, then 3 minutes 3 seconds / 10 steps.                                                                             |
| Five-day release plan   | Markdown plan plus CSV; 12 unique tasks, valid dependency IDs, requested owner, 35 labeled estimated hours, November 2–6 dates, unavailable clean-account execution blocked; both previews opened. | 17 seconds / 3 steps, then 2 minutes 36 seconds / 7 steps. One task-tracking step failed then recovered; writes/readbacks completed. |

The packet started at 02:06:44 UTC October 31 (10:06 PM EDT October 30); the plan started at
02:07:19 UTC. Both showed substantive ongoing work together, then completed at about 02:09 and
02:10 UTC. Their attachments intentionally contained the pre-acceptance release record; reporting
alpha.37 evidence rather than inventing alpha.38 passes was correct. Exact inputs, output hashes,
UI captures and timing records remain in the private local artifact folder.

A later planning task was cancelled while a separate evidence-review task continued. The app showed
Ready and Task cancelled in 807 ms. The surviving task completed a saved evidence matrix,
with a working preview, after UI work segments of 7 seconds and 3 minutes 17 seconds. Ten conversation switches during that work measured median
762.5 ms and worst 868 ms. These are CUA click-to-accessibility-observation times, including tool
overhead, not isolated app latency or internal dispatch-cutoff measurements. Exact TextEdit canary
text remained intact while the document task ran. GUI/browser-input coexistence and clipboard
preservation were not established. After a full quit/relaunch, the cancellation persisted and
the evidence matrix and planner CSV previews reopened without a new Keychain prompt.

These are useful document workflows, each with one fresh-conversation run on alpha.38. They do
not close repeatability, real-source browser research, practical public-source outing planning,
default Chrome setup/recovery, unexpected expiry, parallel GUI control, clean macOS-account signup
and provider retry, or physical voice/lock/sleep acceptance. Native Chrome inspection through the
operator CUA tool timed out, and Sia's picker did not identify the isolated research window; no
unrelated window was selected. Alpha.39 changes GUI ownership, but its live acceptance failed; background new-tab creation remains unsupported.

## Prior candidate evidence and rollback

Alpha.37 established background IANA read/navigation, explicit same-window detach/reconnect,
Calculator, exact CSV and cancellation/restart smoke checks. Its fuller real-document attempts
exposed the outside-workspace attachment gap, missing result previews and unnecessary document-task
serialization fixed in alpha.38. See the [demo guide](./demo.md) for failed and assisted attempts.
Earlier passes are not transferred to the new artifact.

The verified alpha.37 rollback app is retained locally. Its DMG SHA-256 is
`df69fd3c4ada24afa6897673f8a7051261dd2bf7d79dd935944962fa421ad57d` and ZIP SHA-256 is
`caf309dd8a2056ace83852201865b834fbdcbe305a9204ca7c05685a566c4c85`.
The [alpha.37 acceptance record](https://github.com/ljang0/sia-v2/blob/b7093362720dda05473c89e55754f7a69cfd1893/docs/public-release.md)
contains its exact source and scope. See [release status](./release-status.md) for remaining gates.

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

The alpha.38 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.37 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
