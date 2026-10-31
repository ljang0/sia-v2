# Public distribution candidate

## Current decision — October 31, 2026

**Distribution is not ready.** Alpha.49 is signed, universal and notarized, but its real-work
acceptance exposed two failures: document prose triggered an authentication-control block, and
switching to another app paused background browser navigation. Alpha.50 contains targeted fixes;
its complete automated gate, signed build and live acceptance are pending. No artifacts were
published or invitations sent. The last published Mac pilot remains alpha.24.

The owner selected **Mac first; iPhone follows**, confirmed the relevant Notch source rights,
and named Lawrence Jang as support/incident owner.

## Exact alpha.49 universal artifact

Built from `68312a4f13e5479499ddaee6fc667891b25c9649`. Universal signing, app/DMG notarization,
stapling, strict signatures, Gatekeeper and packaged runtime checks passed. Behavioral source
`857671735fefe2669fa40a5a3a2b5d49afd84ef2` passed the full local pilot gate and
[CI run 41192133254](https://github.com/ljang0/sia-v2/actions/runs/41192133254): 1,832 desktop
units, 46 Electron, 33 renderer and 72 phone-web checks, plus native/shared-package checks.
The intervening source changes were documentation only.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.49-universal.dmg` | `1b67c649a92e5fb1af2c5eae2c9388e978affadcc9b3551b4e608f3387869715` |
| `Sia-0.1.0-alpha.49-universal.zip` | `8effb8a6a4e08674fad02cc73740098a4183a79507f8badb597c18a95fd8ab12` |
| Installed QA `app.asar`            | `48b7808712faf8e396418cef76aaed34b903c2352fc9470178d2184ff9132169` |

The installed universal app retained the QA profile, settings and history without a new Keychain
prompt. Launch to observed readiness was at most 12.468 seconds including CUA round trips; this
is not an isolated startup benchmark. Restart Chrome recovery settled in 1.761 seconds, returned
to Sia and resumed automatically, without a corrective task message or extra Continue click.

The native proposal task wrote a faithful 381-word brief, but Command-S was refused after the
brief's sign-in prose was mistaken for an authentication control. The file independently existed
on disk; Sia correctly reported that it could not verify its save. The concurrent visitor-planning
task paused during navigation when the operator opened a separate TextEdit note. Chrome remained
in the background. This is a failed concurrency acceptance, not a completed visitor plan.

Foreground typing was preserved exactly. A Unicode clipboard canary survived, and the original
clipboard was restored. Ten conversation switches took median 802.5 ms / worst 882 ms including
CUA observation (click acknowledgements 27–83 ms), while native editing was active and browser
work was waiting for connection. These measurements do not establish two-active-task responsiveness.
Private receipts and traces are recorded under `alpha49-artifacts/real-work/universal-*`.

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

Alpha.50 needs the full gate and exact-artifact repeats, including useful browser/native work
while the person switches apps, contention/Stop, restart recovery and measured responsiveness.
The TextEdit fix distinguishes a duplicated multiline document-body label from actual authentication
controls. The navigation fix accepts only the pinned driver's successful receipt for the exact
connected tab when another non-browser app becomes active. Unknown delivery and native input
conflicts still pause; no action is replayed automatically.

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

The alpha.49 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep prior notarized backups available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
