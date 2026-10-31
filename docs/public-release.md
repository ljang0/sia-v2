# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Internal signed arm64 alpha.56 completed real household planning,
a sourced outing, native TextEdit editing, and Stop/recovery during native Save/readback while
browser work remained independent. The full local pilot gate and exact-source CI passed. Universal
alpha.56 is notarized, but its real-work repeat needed operator recovery. The owner now requires
vision-only control throughout Sia; alpha.56 uses assisted control and cannot validate that default.
Vision implementation, exact-artifact repeats and physical acceptance remain open. Nothing new was published; the last
published Mac pilot is alpha.24. The owner selected **Mac first; iPhone follows**, confirmed the
relevant Notch source rights and named Lawrence Jang as support/incident owner.

## Universal alpha.56 baseline

Source `75c38b7fad786f69669a63fb572ca1a422eb6a08`; exact-source CI run `41214640627` passed.
Signing, app/DMG notarization, stapling, Gatekeeper and packaged runtime checks passed. The QA
copy was installed directly from the read-only mounted DMG and its signature and ASAR compared.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `f3dc08cfe45ef29093606071fa6a0fd84381f815ff7479fe8f97af9926eee0d8` |
| Universal ZIP  | `7ca0810c9351f006c6c27ee463529ad8427f3fc34c93981ae111da7d7cd6db30` |
| Installed ASAR | `429bc08676aaf9e2cf1af86e091223ccbade8d92896c3fabc9ab5c22457e06bf` |

Both public-browser tasks initially paused on observation timeouts. The operator recovered the
existing public tab, resumed the outing and sent the household continuation. A café link opened
a secondary public tab and the focus guard paused correctly; another continuation reconciled
the page. The outing finished at 15:52:33 UTC. Household work switched to Good Food recipes and
finished at 15:58:29. Saved plans and grocery arithmetic were read independently; independent
recipe-source and result-preview checks remain incomplete. These are recovered runs, not
unattended acceptance passes.

A native TextEdit task saved a checked 304-word review brief while browser actions interleaved.
Ten UI switches measured median 1,268 ms / worst 1,390 ms including CUA observation. The browser
focus interruption prevents an uninterrupted-concurrency claim. Clipboard preservation remains
inconclusive: browser clipboard API values did not establish an OS pasteboard baseline. Its
temporary canary was restored; a later native paste probe was cancelled without overwriting
the original OS clipboard. No restoration is pending.

Receipts, deliverable hashes and traces remain privately in
`alpha56-artifacts/universal-real-work/result.json`. This baseline uses DOM/accessibility
assistance and does not count toward vision-only acceptance.

## Exact alpha.56 internal artifact

Source: `9a82f49c0b7e8e8e708fbe09cba2552628f063dd`.
Installed `app.asar` SHA-256:
`1320c11a2e1c557fdb0f1494841258976a1547c7e1edb38f441602f74ed322af`.
Strict Developer ID signature, packaged runtime, installed signature and ASAR equality passed.
This arm64 app is **not notarized**. The full local gate passed: 1,864 desktop, 46 Electron,
36 renderer, 72 phone-web and native/shared checks, including 235 browser regressions and
11 Chrome-consent tests. The subsequent universal source's CI also passed, as recorded above.

Fresh assistants used default GPT-6-Astra through the ChatGPT plan and separate working folders.
Browser scope remained the chosen public Chrome window and its existing tab. No buying, booking,
sign-ins, messages or publication occurred. All three planning files were independently read,
source/quantity checked, and opened successfully in Sia's result preview:

| Deliverable            | Bytes | SHA-256                                                            |
| ---------------------- | ----- | ------------------------------------------------------------------ |
| Dinner plan            | 9,154 | `2ddbc6cf0f5cf3bfbff65a243e3d52ea99dbdadbf4b1f701e1437063d8f84af7` |
| Consolidated groceries | 6,681 | `1b171e28195634fc9f6ba5de3f75eb2660b71c13ec36f9d5a88be02c0df96dde` |
| Pittsburgh outing      | 7,542 | `4b1717f72df17d9746cb527b0e685ff8e04864e180942a952d04ef842db0e679` |

The household plan checked five published recipes for November 2–6, two adults, ingredient reuse,
serving adjustments, active/elapsed cooking time and a consolidated list. It explicitly budgets
six freezer quesadillas and two future chicken/rice portions. Totals reconcile, including six
garlic cloves, five eggs, eight ounces spinach, six cooked cups rice and sixteen ounces broccoli.
Freezer capacity is required; cooking time and rice yield are estimates. No meals were cooked.

After relaunch, explicit Chrome setup took 2.059 seconds and resumed the saved request. Initial
Page.navigate and Page.getFrameTree timeouts recovered automatically through fresh observation,
without replaying uncertain navigation or operator continuation. The household task finished
about 6m43s after connection. This is successful recovery, **not zero-timeout reliability**.

The outing checked official museum/dining hours, admission, actual café menu prices and PRT fares.
Independent CUA inspection confirmed the $16 club sandwich with fries. Admission, meal, estimated
tax and tip total $45.32; $5.50 transit reserve plus $9.18 contingency bring the allocation to $60.
The walking plan returns around 5:30 p.m., with an indoor rain alternative. Specific bus departures,
seating and November 7 ticket availability remain unverified and are labeled accordingly. The
roughly five-minute run required no operator correction or renewed Chrome setup after native Stop.
New-context links were refused before input and recovered via observed destinations in the same
tab; a stale transit link and unsupported route selector were reported rather than invented away.

## Native work, concurrency and Stop

TextEdit first saved a faithful 316-word proposal brief, then a 289-word revision with a proposed
45-minute review agenda and two concrete decisions. The final file SHA-256 is
`d98b3bb9422ede7b547ef13523d153ad91b79e519726c39cfa0746b6d02eebfe`.
Saved bytes, word count, factual qualifications and absence of an unsaved marker were checked.
The brief reflects the proposal supplied before this acceptance update.

Actual operations interleaved: native replacement completed at 15:08:49.033 UTC while a browser
observation was pending until 15:08:50.288; native Save completed at 15:08:55.656, followed by a
browser observation at 15:08:59.221. Native work continued while the browser recovered from its
slow read, establishing more than overlapping task lifetimes.

During revision, the native Save/readback action started at 15:11:21.158. Stop was clicked at
15:11:21.547, acknowledged in 128 ms and visibly cancelled within 1,149 ms including CUA observation.
The key had been delivered but its follow-up observation was unavailable. Continuation inspected
the exact document using inventory and a snapshot only: it preserved the saved changes and sent
no repeated input. The outing subsequently navigated successfully at 15:14:23.362 with the existing
browser grant. Same-window browser work waited for the preceding household turn to release it.

Ten conversation/Activity switches during browser work measured median 1,151 ms / worst 2,432 ms
including CUA observation; click acknowledgements were 88–147 ms. These are observed interactions,
not isolated renderer benchmarks. An external CUA clipboard read timed out before any backup or
write; no clipboard was changed, and clipboard preservation is **not** a pass on this candidate.
Private traces, screenshots and `result.json` remain in `alpha56-artifacts/real-work` outside Git.

## Changes and retained failures

Browser and native work now use separate runtimes, queues, authorization contexts and timeout
clocks. Cancellation retires only its runtime; retired callbacks and approvals arriving after
cancellation fail closed. Physical-window leases and focus guards remain. Focused regressions
failed before the fixes and passed afterward. Spaced Markdown destinations now render correctly,
verified in the signed app against an earlier malformed dinner-plan link.

Alpha.55 completed the same two everyday scenarios, native editing and file-task Stop/resume.
Its full gate and [source CI](https://github.com/ljang0/sia-v2/actions/runs/41209741237) passed.
Earlier alpha.53/.54 browser failures, exact artifacts and interventions are retained through the
[previous record](https://github.com/ljang0/sia-v2/blob/9a82f49c0b7e8e8e708fbe09cba2552628f063dd/docs/public-release.md).
Frame-scoping, bounded traversal and CDP cleanup defects were independently reproduced and fixed;
they are not established as the sole cause of browser timeouts. Notarized alpha.53 installers and
signed alpha.55 app backups are retained and checksummed.

## Remaining acceptance and rollback

Complete the vision-only migration, full source gate, signing/notarization and repeated useful tasks
on that exact new artifact, including clipboard preservation, restart/expiry and responsiveness. Do not overlap
live acceptance with automated Electron/renderer checks or packaged runtime verification.

This Mac refuses Sia's display-sleep assertion with `kIOReturnNoMemory`; independent Apple
`caffeinate` probes also failed. Physical RAM is not an established cause. Keep-awake, physical
lock/sleep, voice and clean-account acceptance remain unverified. No fresh macOS account or second
Mac is available. Background new-tab creation and Finder file drag remain unsupported.

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

## Publication

Installers, verification logs and private real-work receipts remain local. After the remaining
[release gates](./release-status.md) pass and the owner authorizes distribution, follow
[release operations](./release.md) and verify the recipient's downloaded hash. Research recruitment
retains its separate [sign-off](./research-release-signoff.md).
