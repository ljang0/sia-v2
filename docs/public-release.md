# Public distribution candidate

## Current decision — October 31, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.42 is signed and notarized. It repairs missing direct-capture setup, but
real Finder filing and Chrome reconnection still fail. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Next candidate: source work and engineering probe

Alpha.43 is being prepared; it is **not yet a signed or accepted release**. The local pilot
gate passed: 1,821 desktop unit, 46 Electron, 31 renderer, 72 phone-browser and 72 gateway tests,
plus 11 native consent regressions. Subsequent license-packaging additions passed two focused
notice-coverage/refusal tests, both-architecture builds, formatting, lint and the quality guard. The isolated QA
app currently uses the alpha.42 JavaScript bundle with an experimental arm64 native SDK,
re-signed for internal testing. The retained alpha.42 DMG/ZIP are unchanged.

Native diagnostics confirmed the Chrome failure: the first native AX walk found the consent
sheet, but scanning 12 same-process surfaces took 7,656 ms against a four-second deadline.
A single native application walk, excluding web content and the menu bar, found it in 1,670 ms;
post-action verification took 215 ms and the app showed Attached. The source patch preserves
approved-process ownership, exact consent identity, ambiguity/truncation refusal and the deadline.
Its reproducible build and provenance are described in [native/cua](../apps/desktop/native/cua/README.md).
The experimental Finder named-arrow change is excluded from this candidate because it has no
live proof of benefit.

A fresh practical planning request then read four official museum/transit pages, saved a
CMU visitor itinerary, and opened a working preview. Independent source checks confirmed the
published admission, Saturday hours and transit fares; the meal allowance and walking times
were explicitly estimates. The $45 plan, $15 contingency and rain alternative met the stated
constraints. Output SHA-256: `2c9778b7ebf056152fbb23aba74cab000d3e7b944dda26ac584f0999eb4b7ac9`.
This was an assumed visitor scenario, not an actual booked trip or a synthetic website.

The initial 29-second segment paused because Chrome was foreground. The operator opened the
independent TextEdit document through Finder and pressed Continue once; no corrective prompt was
sent. Sia then confirmed TextEdit active, navigated/read the approved existing browser tab, and
completed in a displayed 4m04s / 23 steps / three problem steps. Independent text and the pasted
clipboard canary survived. The whole recorded request lasted about 4m55s including the pause.
Two stale-reference recovery calls and a task-tracking failure remain in the evidence. This is
**one useful background browser pass on an engineering probe**, not repeatability, parallel GUI
acceptance or an exact alpha.43 release pass.

Pending host changes block background Copy/Cut shortcuts before driver input, retain Chrome's
connection error next to its retry control, refresh window references in resumed-task guidance,
and pause decorative GPU animation behind file previews. The clipboard shortcut guard does not
claim to detect every menu-mediated clipboard operation; completion still needs a live canary check.
The earlier native Finder probe failed with `window_not_key`; all six input hashes remained intact.
Exact prompts, interventions, timings and screenshots are retained privately in `native43-probe`.

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

## Prior alpha.41 artifact

Built from `084878875dcae00fa561b015bc49691a85948fe8`. The full local `pnpm test:pilot`
gate passed: 1,803 desktop unit, 46 Electron, 31 renderer, 72 Chromium/WebKit phone and
72 action-gateway tests. Expected live opt-in tests were skipped.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41168497120) passed.

Universal signing, app/DMG notarization and stapling, strict signatures, Gatekeeper and packaged
native/runtime verification passed. App notarization `d0324b60-28d4-4625-98ec-e976c2990986`
and DMG notarization `f7eba0a1-fd9d-4741-8d10-732a65ff0774` were Accepted.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.41-universal.dmg` | `679b8aa70a201b07cf9571a63e14d9f21dec178e330fa41959b70320a039c894` |
| `Sia-0.1.0-alpha.41-universal.zip` | `f36be08e36024e4a4107c1f907a5a744a2215c119224294861a75a81e9b31945` |
| Installed and QA-copy `app.asar`   | `1e6910074593c65e3ecb89fdd89a14ec6e08eea55902d3a69975bb8f69b75027` |

The QA profile retained settings/history without a new Keychain prompt. A separate default-profile
instance existed at the same app path, so the operator used an identically signed `Sia QA.app`
copy with explicit QA user data. CUA verified the intended agents/history before any test request.
No task was submitted in the other profile. Alpha.40 remains a local rollback copy.

## Alpha.41 real GUI results

GPT-6-Astra through Codex App Server organized six actual public project deliverables using
Finder in strict background mode. It created Review packet, Planning and Evidence, moved the
correct 3/2/1 files, and left Inbox empty. Independent disk checks confirmed all six destination
hashes matched the originals. No corrective prompt was needed. The app reported **5m27s,
67 steps and six problem steps**; this demonstrates recovery, not a fast or frictionless workflow.
Sia's inventory confirmed TextEdit was active, and foreground typing remained intact.

**Clipboard preservation failed.** Finder's copy-and-move commands replaced the text canary with
three filenames. The operator pasted that clipboard into the test document after completion,
recorded it, and then restored the canary. A fresh filing request that forbade shared-clipboard commands stopped before filing because
requested snapshots supplied no usable pixel targets. All six new input files remained unchanged.

The overlapping browser research task stopped after 29 seconds without reading its sources or
saving a report. It showed **Connect Chrome & continue**. The operator chose only the previously
approved public window and completed Chrome's approval prompt, but reconnection still returned
`browser_wrong_target_refused`, including an immediate prompt-handling attempt. No Chrome settings
were changed and no browser was restarted. The current error guidance wrongly treats this proof
failure as a permission problem; source changes correct that explanation and add content-free
diagnostics. The underlying reconnect cause remains unverified.

The separate QA app location is absent from macOS’s direct-capture approval record, although the
original install is present. Alpha.42 source exposes this additional setup requirement when the
driver reports it, keeps See your screen actionable, and requests capture only from explicit setup.
This is not yet a signed-app capture or clipboard-preservation pass.

Browser input never started, so this is not a parallel-GUI pass. Exact prompts, output hashes,
trajectories, screenshots and interventions remain in the private alpha.41 artifact folder.

## Prior alpha.40 browser result

One fresh-conversation comparison read official Playwright, Cua and Browser Use documentation,
saved a checked 751-word report and opened its preview in about 120 seconds. TextEdit was confirmed
active during browser input and its typed canary survived. The operator had prepared a new ordinary
Chrome window in the existing profile; no corrective prompt followed. Output SHA-256:
`827c99f65f600e24331040e09b02922f735158c168eb8022d7bc9da9a952625b`.
Both the driver version and window setup changed from alpha.39, so causality was not established.
The alpha.41 reconnect failure prevents a repeatability claim. Historical artifact hashes remain
in Git history and the private alpha.40 evidence folder.

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

The alpha.42 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.37 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
