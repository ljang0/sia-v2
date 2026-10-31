# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Universal notarized alpha.53 passed the full local gate and package
verification. Its background accordion click worked, but navigation/read stalls prevented both a
practical outing plan and a five-day dinner/grocery plan from finishing. Neither requested output
was saved. Alpha.54 addresses a separately proven parent CDP-session leak; the causal connection
to navigation stalls is not established. Its full local gate passed; signed-build verification
and live acceptance are pending.
Nothing was published; the last published Mac pilot remains alpha.24.

The owner selected **Mac first; iPhone follows**, confirmed the relevant Notch source rights,
and named Lawrence Jang as support/incident owner.

## Exact alpha.53 universal artifact

Built from `f119b8b123042bb9cc6216aa58c65169c9667fd6`. Universal app/DMG signing, notarization,
stapling, Gatekeeper and packaged runtime checks passed. The full local gate passed: 1,858 desktop
units, 46 Electron, 36 renderer and 72 phone-web checks, plus native/shared checks including 228
native browser regressions and 11 Chrome-consent tests.
[Source CI](https://github.com/ljang0/sia-v2/actions/runs/41203052121) was still running at this update.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.53-universal.dmg` | `d904298e58b1e5172b44147ed38c1589e66615cac9477fca6fa55a3d210a6573` |
| `Sia-0.1.0-alpha.53-universal.zip` | `de4d744390623c7a43fd46305f16e8e8530c6f2b8e24f2c5b4a37609471bb3f5` |
| Installed QA `app.asar`            | `dce4615ebb5c62d40c72987eefa7239df209c9c64e208198274b567c6eb75650` |

Two fresh assistants used the default GPT-6-Astra ChatGPT plan and separate default folders.
The outing requested a CMU/Pittsburgh afternoon on November 7, with current official hours, a
museum, meal, rain alternative and a $60 budget. Explicit Chrome reconnection took 2.951 seconds
and resumed the saved request. A stale window grant recovered through fresh inventory. The Hours
accordion click was delivered in the background while the operator edited a separate TextEdit note.
A ticket link then had uncertain delivery, and a bounded observation retry exhausted.

The independent CUA tool also timed out reading the same tab. A subsequent screenshot showed
the ticket calendar, and accessibility reading worked afterward. This sequence does not prove
what recovered Chrome. An operator clicked **Continue task**; it made progress but stalled again.
The operator then cancelled through **Stop**. This assisted continuation is not a first-run pass.

The household request asked for five real-recipe dinners, serving conversions, ingredient reuse,
a consolidated grocery list and a prep schedule. Its initial instruction reserved the browser for
the outing, but no separate public-web tool was available. After the outing stopped, the operator
allowed the already-approved browser window. Navigation/read then stalled on recipe research too.
Neither workflow produced its requested files. Their overlapping lifetimes do not establish two
successful concurrent GUI workflows.

The separate TextEdit note was typed, saved and independently checked. Clipboard preservation
passed and the original clipboard was restored privately. Ten conversation switches during the
outing continuation measured median 968.5 ms / worst 1,170 ms including CUA observation; click
acknowledgements were 37–136 ms. Stop showed **Task cancelled** within 819 ms including observation,
with a 112 ms click acknowledgement. These are bounded observations, not isolated render timings
or proof that all cancellation/concurrency gates passed. Private receipts are in
`alpha53-artifacts/real-work`; the notarized alpha.52 backup remains available.

## Follow-up fix and earlier evidence

Alpha.53 replaced `Element.closest`, which Chromium rejects under `throwOnSideEffect`, with a
bounded parent walk that retains side-effect rejection. Three real Chromium regressions execute
the exact native function. The live accordion click now worked; navigation remains unresolved.

Inspection then found that completed browser operations retained their parent CDP attachments.
A regression failed before an operation-owned cleanup guard and passed afterward, including a
failed screenshot while another validation remains live. A second regression preserves the single
registered dialog observer between operations. All 230 native browser tests passed
(one opt-in live test skipped). Alpha.54 also adds opt-in timeout diagnostics containing only the
protocol method, without URLs, parameters, page content or identities. These checks establish
resource cleanup, not that the signed app's navigation stall is fixed.

The [previous record](https://github.com/ljang0/sia-v2/blob/f119b8b123042bb9cc6216aa58c65169c9667fd6/docs/public-release.md)
retains exact alpha.52 hashes, its verified 431-word native brief and failed browser run, and links
to earlier evidence. Internal alpha.49 completed useful research, organization, visitor plans and
reviewer packets on an earlier signed arm64 build. Do not transfer those passes to a final candidate.

## Remaining acceptance and rollback

Alpha.54 passed its full local gate: 1,858 desktop, 46 Electron, 36 renderer and 72 phone-web
checks, plus native/shared checks including 230 browser regressions. It needs its signed build,
exact-source CI and useful-work repeats. Verify normal
navigation, known new-context refusal and observed-URL recovery; do not replay uncertain input.
Final GUI concurrency, contention/Stop, restart and responsiveness gates remain open. Do not run
live acceptance alongside automated Electron/renderer checks or package runtime verification.

This Mac refuses Sia's display-sleep assertion with `kIOReturnNoMemory`; independent Apple
`caffeinate` probes also failed, although other processes had assertions. Physical RAM is not an
established cause. Keep-awake, physical lock/sleep, voice and clean-account acceptance remain
unverified. No fresh macOS account or second Mac is available. Background new-tab creation and
Finder file drag remain unsupported. Retain notarized backups for rollback.

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

The alpha.53 installer, checksums, verification log and private real-work receipts remain local.
It is a failed acceptance candidate, not a published release. After the remaining
[release gates](./release-status.md) pass and the owner authorizes distribution, follow
[release operations](./release.md) and verify the recipient's downloaded hash. Research recruitment
retains its separate [sign-off](./research-release-signoff.md).
