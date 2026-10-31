# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Universal notarized alpha.50 fixed the native-document failure,
but a public link opened a new tab and interrupted background browser work. Alpha.51 adds a
pre-click check for known links targeting another browsing context. Its focused native and desktop
checks pass; the complete gate and signed live acceptance are pending. No artifacts were published
or invitations sent. The last published Mac pilot remains alpha.24.

The owner selected **Mac first; iPhone follows**, confirmed the relevant Notch source rights,
and named Lawrence Jang as support/incident owner.

## Exact alpha.50 universal artifact

Built from `3aeb38dff18f9b57ecb1ded4552354db58bf4353`. Universal signing, app/DMG notarization,
stapling, strict signatures, Gatekeeper and packaged runtime checks passed. The complete local
pilot gate passed: 1,849 desktop units, 46 Electron, 33 renderer and 72 phone-web checks, plus
native/shared-package checks. [Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41196040578)
was still running at this evidence update.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.50-universal.dmg` | `d696ed0c84aa984971454a8d073b3783cae3d1889b9f30c5ca7023024c92ebfe` |
| `Sia-0.1.0-alpha.50-universal.zip` | `188dd4b5aa129ddccb691319ccfd659fb1e31207c39758592055b9a879d6d28d` |
| Installed QA `app.asar`            | `8b55b52db2183d2bd110fd78ee3e84926010064b3f4a5b09b872b5c74bee8984` |
| Saved native brief                 | `9c4969ac80626e4284cfd20aaf12a19b1adc47195d4cd7fe80b8cb0ab1f9ee16` |

The app retained its QA profile and history without a new Keychain prompt. Chrome recovery settled
in 1.916 seconds, returned to Sia and resumed automatically. Native TextEdit editing produced a
faithful 419-word technical-review brief in activity groups of 18 and 56 seconds, with no failed
action. It saved through Command-S and inspected the result, including prose about sign-in. The
saved bytes and visible document were independently checked; this verifies the alpha.49 false-positive fix.

The browser task read official visitor information, then clicked “Fossil Fuels.” Its public anchor
has `target="_blank"`; a new dining tab appeared just before the focus guard paused input. No
operator app switch preceded that click. The new-tab behavior is the likely trigger, supported by
the DOM attributes, tab timestamps and action trace. The plan did not complete. The extra public
test tab was inspected and closed only after the pause; the failed task was not continued.

Six conversation switches while both tasks were active took median 1,088.5 ms / worst 1,294 ms,
including CUA observation; click acknowledgements were 39–88 ms. Native editing was composing its
final reply during these samples. An unsent operator draft survived. This run did not include a
clipboard canary, and it does not pass background browser or full concurrent-work acceptance.
Private receipts, action traces, saved output and a native screenshot are under `alpha50-artifacts`.

## Internal alpha.49 useful-work rehearsals

These used the earlier Developer ID signed **arm64, non-notarized** QA build from `8576717`,
with installed asar `ba63bdab4a39e4319a2993674c5270e9d22a0ceec4ade3da280c6a11eeb5c66f`.
Do not transfer these passes to the universal artifact.

- Two sourced control comparisons (688/664 words, 181/172 seconds) and native proposal briefs
  (338/342 words) were saved and independently checked. One native run refused its final scroll
  after saving; the repeat verified its save. No corrective task messages were needed.
- Two six-document filing runs preserved every hash and emptied the input folder in 27/31 seconds.
- Two practical CMU visitor plans used official museum, dining and transit sources. The 1,513/1,286-word
  reports completed in 252/104 seconds, with one recovered problem step each. The repeat used a
  fresh conversation but could read the first report; it was not an independent fresh-workspace trial.
- Two full reviewer packets each produced a brief, first-hour checklist and open-decision list with
  valid portable links. The first incorrectly described Full Disk Access as optional. README and
  architecture were clarified; the fresh repeat correctly described required setup. Both runs
  recovered tool errors. The second took 160 seconds across two activity groups, including five
  problem steps. They were not error-free runs.
- A waiting task cancelled visibly within a 672 ms CUA round trip while the browser owner completed.
  Ten switches during filing measured median 826 ms / worst 1,301 ms including observation.

Later technical-research trajectories were filtered, limiting complete interleaved-GUI and
post-cancellation instrumentation. The older browser transport stall did not recur; its cause
remains unproven. Private results are in `alpha49-artifacts/real-work`.

## Remaining acceptance and rollback

Alpha.51 needs its complete gate, signed build and useful-work repeats. The native patch refuses
known new-context links before input; the agent can read observed destinations and navigate the
existing tab. It neither rewrites the webpage nor silently changes a click into navigation.
Unknown preflight results refuse. JavaScript can still cause unexpected effects, so the existing
post-input focus guard remains necessary. See the [native patch rationale](../apps/desktop/native/cua/README.md).

The successful native fix still needs a fresh repeat. Alpha.50's exact-tab navigation change also
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

The alpha.50 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep prior notarized backups available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
