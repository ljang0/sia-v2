# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Internal signed arm64 alpha.55 completed the real household,
outing and native-document workflows below. Alpha.56 adds browser/desktop runtime isolation,
late-authorization rejection and a result-link rendering fix. Its full local pilot gate passed; exact-source CI and signed acceptance
remain pending. No new version was published; the last published Mac pilot is alpha.24.

The owner selected **Mac first; iPhone follows**, confirmed the relevant Notch source rights,
and named Lawrence Jang as support/incident owner.

## Exact alpha.55 internal artifact

Source: `e190e48766df8be15d645cf4c8f4ca92e4e82b17`.
Installed `app.asar` SHA-256:
`febb649f352e83c70716e20c92f1a6b8d573564246da780fe20b02f7e46e0885`.
Developer ID strict signature, packaged runtime, installed signature and ASAR equality passed.
This arm64 build is internal QA and **not notarized**. Its full local pilot gate passed:
1,858 desktop, 46 Electron, 36 renderer, 72 phone-web and native/shared checks, including
235 browser regressions (one opt-in live test skipped) and 11 Chrome-consent tests.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41209741237) passed.

Fresh assistants used default GPT-6-Astra through the ChatGPT plan and separate working folders.
The only browser scope was the approved public Chrome window; no purchases, bookings, sign-ins,
messages or publication were performed. The following files were independently read and checked,
and their Sia result previews loaded:

| Deliverable            | Bytes  | SHA-256                                                            |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| Dinner plan            | 11,803 | `aa4904ca60438f2b2e7fef9e404c4ddbf852f0eb611f6911802d445259d76634` |
| Consolidated groceries | 7,920  | `36f36fe14fbf28765613c15fe619c2a927da80827f5df8f0ac7e329100d5466f` |
| Shopping checklist     | 3,074  | `521d8ee6e3066442bef5d65f5c5c8a6c1df0966227b727cd5d7f6bff8f96e357` |
| Pittsburgh outing      | 8,186  | `e1b5c41816e3448430d3f21970e8ac32df5a382db7740aa6091bfc8465767dd7` |

The household task checked six published recipe pages, serving conversions, active versus elapsed
cooking time, a prep schedule and consolidated ingredient totals for two adults. It completed about
7m12s after explicit Chrome connection (native setup 3.729 seconds), which resumed the saved request.
The recipes were not physically cooked; cooking estimates remain estimates.

The outing task planned Saturday November 7, 1–7 pm from CMU, with a museum, meal and rain option.
Official admission, hours, transit fares and the date-specific ticket listing were independently
checked. The $60 arithmetic includes explicit meal/tax/walking estimates and contingency. One
operator clarification corrected a numeric tab ID from the external test tool: the model then used
its own identifier for the already-approved public page. Resumed activity was about 5m1s. The task
reused the existing Chrome connection and recovered a 404 through fresh observation. This is an
assisted run; no actual trip or reservation was made.

## Background work, cancellation and responsiveness

A native TextEdit brief was first saved at 340 words, then revised to 303 words while the outing
was active. The final file hash is
`aac695987b5e5b0f8b4f7af93ddca51f590839370510be74f3b32ec8b795b794`.
Its source was the proposal before this acceptance update; its older readiness statements reflect
that input, rather than current release status. Successful actions actually interleaved on October 31 UTC:

| Time         | Observed action             |
| ------------ | --------------------------- |
| 14:36:11.441 | Browser navigation          |
| 14:36:11.796 | Native TextEdit replacement |
| 14:36:18.209 | Browser click               |
| 14:36:19.187 | Native TextEdit save        |

A separate operator TextEdit note remained intact after both native edits. Ten conversation/activity
switches during browser work measured median 1,062 ms / worst 1,502 ms including CUA observation;
click acknowledgements were 88–149 ms. These are observed interaction timings, not render benchmarks.
No browser CDP timeout was observed during these alpha.55 runs.

The shopping-checklist task was stopped through Sia while the outing kept running. The click
acknowledged in 106 ms and **Task cancelled** appeared within 828 ms including observation.
The outing subsequently saved its plan and finished. An explicit continuation produced the checklist,
retaining all 25 grocery items and 11 pantry checks; original dinner/grocery hashes remained unchanged.
This tests a file-task cancellation, not native in-flight cancellation. A native Stop attempt
arrived after completion and delivered no Stop; it is not counted as a pass. Clipboard preservation
was not tested on alpha.55. Private traces, screenshots and `result.json` are retained in
`alpha55-artifacts/real-work` outside the repository.

## Follow-up and retained failures

Alpha.56 focused tests reproduced stalled-browser blocking and late callback authority inheritance
before the fixes. Browser and desktop work now have separate runtimes, queues, timeout clocks and
authorization contexts. Cancellation retires only the affected runtime; retired callbacks and
approvals arriving after cancellation fail closed. Physical-window leases and focus guards remain.
The full local pilot gate passed: 1,864 desktop tests, 46 Electron, 36 renderer, 72 phone-web
and native/shared checks including 235 browser regressions. Signed live proof remains pending.

Alpha.55 namespaced frame-local snapshot ids, bounded cyclic parent traversal, preserved subtree
frame identity through pagination and refused stale documents. Three regressions failed before
those fixes. They establish real defects; they do not prove the sole cause of prior Chrome stalls.
Alpha.53/.54 failed useful planning runs despite passing automated/package checks. Exact prior
artifact hashes, timeouts, interventions and the corrected Quit observation remain in the
[previous record](https://github.com/ljang0/sia-v2/blob/e190e48766df8be15d645cf4c8f4ca92e4e82b17/docs/public-release.md).
Notarized alpha.53 and signed alpha.54 backups are retained; older passes do not transfer to a new candidate.

## Remaining acceptance and rollback

Complete alpha.56's exact-source CI and signed isolation/cancellation acceptance, then
final universal notarization and repeated useful tasks on that exact artifact. Verify contention,
restart/expiry, response times and clipboard preservation. Live acceptance must not overlap
automated Electron/renderer checks or packaged runtime verification.

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
