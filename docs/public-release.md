# Public distribution candidate

## Current decision — October 30, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Alpha.36 is the signed acceptance candidate. **External pilot release is not complete.**
No new artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

The universal alpha.36 app, DMG and ZIP were built from
`86c8add784b9fc7a3f572b1a7322ce3a098ac8e0`. The full local pilot gate passed: 1,761 desktop unit,
46 Electron, 31 renderer and 72 Chromium/WebKit phone checks. Hosted verification is tracked in
[PR #30 CI](https://github.com/ljang0/sia-v2/actions/runs/41089283694).
`pnpm package:mac` passed signing, app/DMG notarization and stapling, strict signatures, Gatekeeper
and packaged native/runtime verification. DMG notarization `b30583e5-7200-47cd-9e6d-b674b5eb7f20` was Accepted.

The alpha.35-to-.36 QA upgrade retained history without a new Keychain prompt. The signed app:

- Attached the approved isolated Chrome window and read IANA’s “Example Domains” title and first
  heading, independently verified in Chrome. It accurately explained that origin-only URLs cannot
  prove an exact path, without needing a corrective follow-up.
- Created `alpha36-check.csv` with exactly `item,count`, `apples,5`, and `oranges,8`; reported total 13;
  and displayed the exact saved content in its file preview.
- Entered `17 × 23` in native Calculator; independent app inspection showed `391`.
- Cancelled a disposable task and returned Ready. After a full quit/relaunch, it stayed cancelled
  and the saved CSV preview retained its exact content.
- Showed only email sign-in in a new empty app profile. This is not a clean macOS-account test.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.36-universal.dmg` | `12ce7e73c0b8252603a7bb7e160b758367af8695cada59893603b91242dfab66` |
| `Sia-0.1.0-alpha.36-universal.zip` | `69ef41bba484e93c79a72a7116029c034ccd46e9e61b12521e5b9b880b9c635d` |

Default Mac-route browser acceptance and live browser-session expiry recovery remain unverified.
Clean macOS-account acceptance is also incomplete: the owner has no fresh account or second Mac
available. Voice/lock/sleep and the final owner release decision remain open. See
[release status](./release-status.md) for the exact remaining gates.

Alpha.35 is retained for rollback. Its DMG SHA-256 is
`3790e532ba818ed2687153f7b11cb14f4bb76bb95a1916b4871b180c76c7ca43`.
Its [CI](https://github.com/ljang0/sia-v2/actions/runs/41085610970), signed packaging, QA upgrade,
attachment and connected page read passed; the read needed an operator explanation of URL redaction.
Alpha.34 separately passed safe IANA link navigation. Earlier results do not establish acceptance
of every behavior on the current artifact.

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

The alpha.36 handoff folder is prepared locally with the installer, checksums, proposal, setup
notes and third-party notices. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep alpha.35 available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
