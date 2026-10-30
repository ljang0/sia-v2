# Public distribution candidate

## Current decision — October 30, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.35 is the signed candidate; alpha.36 is validating clearer browser URL
redaction labels. **External pilot release is not complete.** No new artifacts were published or
invitations sent; the last published Mac pilot remains alpha.24.

The universal alpha.35 app, DMG and ZIP were built from
`cc2a94317e5c08ca6d71cee9ab4985495e5a2b21`. The full local pilot gate passed: 1,761 desktop unit,
46 Electron, 31 renderer and 72 Chromium/WebKit phone checks. [PR #29 CI](https://github.com/ljang0/sia-v2/actions/runs/41085610970)
passed the full gate and unsigned universal packaging. PR #29 merged at `f922de9`.
`pnpm package:mac` passed signing, app/DMG notarization and stapling, strict signatures, Gatekeeper
and packaged native/runtime verification. DMG notarization `5dbf49ab-e797-4adc-95ea-09cae63ad54f` was Accepted.

The alpha.34-to-.35 QA upgrade retained history without a new Keychain prompt. Explicit attachment
of the isolated public Chrome window passed. A connected-browser read returned the IANA page title
and first heading, both “Example Domains,” independently verified in Chrome. Initially the model
misread an origin-only URL as the full page location; the read succeeded after explaining the
redaction. Alpha.36 makes that distinction explicit in the tool contract. The alpha.35 stale-session
fix passed focused regression tests; live session-expiry recovery is not yet verified. Default
Mac-route browser acceptance remains blocked by Chrome foreground/consent state.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.35-universal.dmg` | `3790e532ba818ed2687153f7b11cb14f4bb76bb95a1916b4871b180c76c7ca43` |
| `Sia-0.1.0-alpha.35-universal.zip` | `db882fe6b385e8f0b0e65f6fdfe1a4c451738bbef16de1196fc78214f7637c2e` |

Alpha.34 from `75073741f3cf3f0756721c809501dc391574906b` passed signed packaging, CSV creation and
exact preview (apples=5, oranges=8, total=13), restart, cancellation, native Calculator input
(`23 × 19 = 437`), Chrome attachment and safe IANA link navigation in Connected apps mode.
Its DMG SHA-256 is `c1a438180f164161eb702e4b581587a71bde6fd8c2bd05da382ce5e0c0b0bc69`.
It remains retained for rollback. Prior results do not substitute for final-artifact acceptance.
Clean macOS-account acceptance remains incomplete: the owner currently has no fresh account or
second Mac available. See [release status](./release-status.md) for remaining gates.

## Alpha.33 evidence

Alpha.33 from `03f7e5e95e24ea0d52ff8c4e3b95dbacaf28cf55` passed signed universal packaging,
notarization and stapling. Its isolated-profile upgrade, CSV creation/preview, full restart,
cancellation, native Calculator input (`19 × 21 = 399`) and fresh-profile sign-in wall passed.
Signed background browser setup was refused by the driver. Physical-phone and clean macOS-account
acceptance were incomplete. Alpha.33 remains retained for rollback.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.33-universal.dmg` | `caac425d7de5f4f852a0bec1caa1dcbc7163a9331037a536dd85578463929b2d` |
| `Sia-0.1.0-alpha.33-universal.zip` | `0d755ad4c0003942db23dc73ae5c166cd2f766a1207c6438b8ee0ea0c83143af` |

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

The alpha.35 handoff folder is prepared locally with the installer, checksums, proposal, setup
notes and third-party notices. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.34 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
