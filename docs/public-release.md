# Public distribution candidate

## Current decision — October 30, 2026

The owner selected **Mac first; iPhone follows** on October 30 for the first Arena handoff.
The owner also confirmed ownership of the relevant Notch source rights. Mac alpha.34 is the
current signed candidate. **External pilot release is not yet complete.** No artifacts were
published or invitations sent; the last published Mac pilot remains alpha.24.

The universal alpha.34 app, DMG and ZIP were built from
`75073741f3cf3f0756721c809501dc391574906b`. The full local pilot gate passed: 1,756 desktop
unit tests, 46 Electron checks, 31 renderer checks and 72 Chromium/WebKit phone checks.
`pnpm package:mac` passed signing, app/DMG notarization and stapling, strict signatures,
Gatekeeper and packaged native/runtime verification. The current dependency audit reports no
known vulnerabilities. [PR #27 code-head CI](https://github.com/ljang0/sia-v2/actions/runs/41003296786) passed
the full pilot gate and unsigned universal packaging.

The isolated QA profile survived the alpha.33-to-.34 upgrade without a new Keychain prompt. A new
synthetic CSV containing apples=5 and oranges=8 was created and read back; the reply reported total
13 and the preview showed the exact saved content, including after a full quit/relaunch. Native
Calculator input passed with independently observed `23 × 19 = 437`. Cancellation returned Ready
and remained cancelled after restart. The new Chrome setup disclosure is present in
the signed app. The owner approved Chrome setup for the disposable public test window; the live
check is currently blocked by the operator tool reporting `noWindowsAvailable`. Clean macOS-account
acceptance remains incomplete. Physical-phone acceptance belongs to the follow-on iPhone release. See
[release status](./release-status.md) for the remaining gates.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.34-universal.dmg` | `c1a438180f164161eb702e4b581587a71bde6fd8c2bd05da382ce5e0c0b0bc69` |
| `Sia-0.1.0-alpha.34-universal.zip` | `dc8e6c54400ee26db24d11f4f2c248a0de5cbbde1d3c87e51c95a63dd5177829` |

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

The alpha.34 handoff folder is prepared locally with the installer, checksums, proposal, setup
notes and third-party notices. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.33 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
