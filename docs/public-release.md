# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Universal notarized alpha.52 passed the full local gate and package
verification, but its browser task refused a click and then stalled during navigation/observation.
Its native document task saved a verified result. Alpha.53 fixes the proven click-preflight defect:
Chromium rejects `Element.closest` under `throwOnSideEffect`; a bounded parent walk preserves that
restriction and works in real Chromium regression tests. Navigation stalls remain unresolved.
Alpha.53 passed its full local gate: 1,858 desktop units, 46 Electron, 36 renderer and 72 phone-web checks, plus native/shared checks. It needs its signed build and live acceptance. Nothing was published; the last
published Mac pilot remains alpha.24.

The owner selected **Mac first; iPhone follows**, confirmed the relevant Notch source rights,
and named Lawrence Jang as support/incident owner.

## Exact alpha.52 universal artifact

Built from `a9a49a41976f4b2c0d4d4bef420ead2c73592555`. The later `886f993` commit changes only the
handoff document. Universal app/DMG signing, notarization, stapling, Gatekeeper and packaged runtime
checks passed. The complete local gate passed: 1,858 desktop units, 46 Electron, 33 renderer,
72 phone-web, 71 native browser regressions and other native/shared checks.
[Source CI](https://github.com/ljang0/sia-v2/actions/runs/41200510552) was still running at this update.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.52-universal.dmg` | `e647c06133a3359c7797a8b9ef34a93314a32415fb6787f41d419de341f1121d` |
| `Sia-0.1.0-alpha.52-universal.zip` | `3ecd199758cd722e1b41c565bc292b7ec837434898406e74419985354f9737dc` |
| Installed QA `app.asar`            | `47a7a7ba556c7bc1a7384d7ea2768daaf83d0929143c90e7e5f1743890e4a640` |
| Saved native brief                 | `fb43f5ce088e7ad819c4ff01da76b13a10af5e87f86ae1626ea01b35c2ffaaf7` |

Two fresh assistants used the default ChatGPT plan and separate private folders. The browser
started on the official museum homepage. Explicit Chrome setup took 1.794 seconds and resumed the
request automatically. It read public information, refused a click with `browser_action_unavailable`,
then attempted an observed-URL navigation. Navigation timed out; one bounded read retry also timed
out. The new loading error correctly distinguished this from permission denial. No plan was
produced. The original public tab still showed the homepage afterward; no navigation was replayed.

The concurrent TextEdit task saved a faithful 431-word review brief in activity groups totaling
118 seconds. Saved bytes and the visible document were independently checked. Native actions
succeeded; one task-checkpoint step failed and recovered. The queued native read was delayed while
the browser read timed out. This is not an error-free task or a successful paired workflow.

Ten conversation switches measured median 1,066.5 ms / worst 1,323 ms including CUA observation;
click acknowledgements were 26–106 ms. These are not isolated rendering latencies. An unsent draft
survived. The clipboard canary survived and the original clipboard was restored privately.
Private receipts, outputs and traces are under `alpha52-artifacts/real-work`.

A subsequent isolated Chromium test reproduced the click defect with the exact shipped preflight:
ordinary links, nested links and buttons all raised `Possible side-effect in debug-evaluate`.
Replacing `closest` with a bounded parent walk passed the same tests, including inherited base
targets and rejection of a side-effectful getter. Temporary remote-object cleanup is now admitted
by the existing-profile method policy. All 228 native browser tests passed (one opt-in live test
skipped), plus 11 native consent tests. These alpha.53 checks do not establish live Mac readiness
or resolve the separate navigation stall.

## Earlier evidence

The [pinned previous record](https://github.com/ljang0/sia-v2/blob/886f993/docs/public-release.md)
retains exact alpha.50/51 hashes, verified native edits, failed browser runs and their timings.
An operator-assisted alpha.51 continuation read the page successfully, but its next click coincided
with an automated Electron test launching another app. That continuation is contaminated evidence,
not proof of spontaneous focus stealing. Never overlap live GUI acceptance with automated UI tests
or package runtime verification.

The same history preserves internal alpha.49 sourced comparisons, document filing, visitor plans,
reviewer packets, cancellation and recovered errors. Those used an earlier signed arm64 build;
do not transfer their passes to the final universal candidate. Historical fictional-data demos
are smoke/decision checks, not proof of live personal-account coverage.

## Remaining acceptance and rollback

Alpha.53 needs its signed build, exact-source CI and useful-work repeats. The native patch refuses
known new-context links before input; the agent can read observed destinations and navigate the
existing tab. It neither rewrites the webpage nor silently changes a click into navigation.
Unknown preflight results refuse. JavaScript can still cause unexpected effects, so the existing
post-input focus guard remains necessary. See the [native patch rationale](../apps/desktop/native/cua/README.md).

Native editing passed on alpha.51 and produced a verified alpha.52 result with one recovered checkpoint error. Alpha.50's exact-tab navigation change also
needs an observed navigation during operator app switching; its failed browser run reached a click
instead. Do not infer that live pass from the unit tests. Contention/Stop, restart recovery and
responsiveness remain final-candidate gates.

This Mac refuses Sia's display-sleep assertion with `kIOReturnNoMemory`; independent Apple
`caffeinate` probes also failed, although other processes had assertions. Physical RAM is not an
established cause. Keep-awake, physical lock/sleep, voice and clean-account acceptance remain
unverified. No fresh macOS account or second Mac is available. Background new-tab creation and
Finder file drag remain unsupported.

Earlier exact artifacts and failed acceptance are retained in the
[pinned alpha.48/49 history](https://github.com/ljang0/sia-v2/blob/bf709c87caa99878c51b5d488a888e1c61b10338/docs/public-release.md).
Notarized packages and isolated QA backups remain local for rollback.

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

The alpha.52 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep prior notarized backups available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
