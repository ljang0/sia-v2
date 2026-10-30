# Public distribution candidate

## Current decision — October 30, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.37 is the signed acceptance candidate. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

The universal alpha.37 app, DMG and ZIP were built from
`a5cac3f188a23196bcb538319d01064b6b47e900`. The full local pilot gate passed: 1,768 desktop unit,
46 Electron, 31 renderer and 72 Chromium/WebKit phone checks. Hosted verification is tracked in
[PR #31 CI](https://github.com/ljang0/sia-v2/actions/runs/41132056136).
`pnpm package:mac` passed signing, app/DMG notarization and stapling, strict signatures, Gatekeeper
and packaged native/runtime verification. DMG notarization `33d86494-ed78-43d6-a333-74a7331c872c` was Accepted.

The alpha.36-to-.37 QA upgrade retained history and the default Use my Mac / Work in background /
Pause and tell me settings without a new Keychain prompt. After explicitly choosing the isolated
public Chrome window, a fresh task read IANA’s “Example Domains” title and first heading through
the default background Mac route. Native Chrome independently confirmed both. Alpha.36 had refused
this same route with `background_unavailable` even after explicit attachment; alpha.37 reuses the
approved session for that exact process/window instead of requesting a second session.

The subsequent public-link click paused because Chrome was foreground. CUA then returned
`noWindowsAvailable` for pointer input and `elementHasNoFrame` for Continue task. Navigation,
detach/reconnect, and the new CSV/Calculator rehearsal were not completed on alpha.37. This is a
recorded acceptance gap, not a claim that those actions succeeded. Live unexpected session expiry
also remains unverified; regression tests cover expiry, replacement and detachment.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.37-universal.dmg` | `df69fd3c4ada24afa6897673f8a7051261dd2bf7d79dd935944962fa421ad57d` |
| `Sia-0.1.0-alpha.37-universal.zip` | `caf309dd8a2056ace83852201865b834fbdcbe305a9204ca7c05685a566c4c85` |

Clean macOS-account acceptance is incomplete: the owner has no fresh account or second Mac
available. Voice/lock/sleep and the final owner release decision remain open. See
[release status](./release-status.md) for the exact remaining gates.

Alpha.36 is retained for rollback. Its DMG SHA-256 is
`12ce7e73c0b8252603a7bb7e160b758367af8695cada59893603b91242dfab66`.
Its [CI](https://github.com/ljang0/sia-v2/actions/runs/41089283694), signed packaging, connected-browser
read, exact CSV creation/preview (total 13), native Calculator (`17 × 23 = 391`), cancellation/restart,
and empty-profile sign-in wall passed. Alpha.34 separately passed safe IANA link navigation.
Earlier results do not establish acceptance of every behavior on the current artifact.

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

The alpha.37 handoff folder is prepared locally with the installer, checksums, proposal, setup
notes and third-party notices. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.36 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
