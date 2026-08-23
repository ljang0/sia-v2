# Sia 0.1.0-alpha.5 release evidence

Recorded on 2026-08-24 KST. This record separates verified engineering results from remaining
provider and human approvals. It does not authorize distribution by itself.

## Frozen source and artifact

- Application source commit: `c23307d` (`release: prepare Sia 0.1.0-alpha.5`). The artifact was
  built from the same tracked file contents immediately before that commit was recorded.
- DMG: `apps/desktop/release/Sia-0.1.0-alpha.5-universal.dmg`
  - size: `257679605` bytes
  - SHA-256: `f28b85a92fac487e4c8b65fa10d0d8a6de3cf9ab1d9a3cdf199cb689e849c04d`
- ZIP: `apps/desktop/release/Sia-0.1.0-alpha.5-universal.zip`
  - size: `257012416` bytes
  - SHA-256: `e06f1da9a76a309050be052ade32d9043cefdc39a59efac3fcef8e35748a6bd4`
- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- The app and DMG both passed strict `codesign` verification, Gatekeeper assessment as Notarized
  Developer ID, and `stapler validate`.
- Apple accepted the app notarization through Electron Builder. Apple accepted the outer DMG under
  submission `ec4b6e2f-50dd-44fe-a756-8bd42a886d90`; the ticket was stapled and validated.
- The release verifier required universal Electron/app/helper binaries, the matching native CUA and
  UniFFI runtimes, complete third-party license material, a live packaged CUA probe, and the packaged
  MCP bridge. All checks passed.

## Automated and real-surface checks

- `pnpm check`: passed build, formatting, curated-tool quality guard, typechecking, and 435 tests:
  96 cloud, 285 desktop, 23 action-gateway, 20 runtime, 8 tool-bridge, and 3 protocol.
- `pnpm test:e2e`: 26 deterministic Electron flows passed; four explicitly real opt-in tests were
  skipped in that deterministic run.
- Real opt-in no-turn checks passed independently for authenticated Codex, Chrome window attachment,
  and granted macOS CUA accessibility/screen-recording permissions.
- Codex CLI `0.149.0` passed the real authenticated isolation smoke using ChatGPT subscription auth
  and an ephemeral app-server session without starting a model turn. The release range is now
  `>=0.147.0 <0.150.0`.
- The admin research archive now has an MFA-gated participant invitation form. IPC schemas validate
  the email, and only email/time/status—not Cognito subjects or administrator IDs—cross into the
  renderer. The code-sent state now says delivery occurs only for invited addresses and explicitly
  recommends checking Spam or requesting a new code.

## Deployed AWS control plane

- Account `677513020767`, stack `sia-alpha`, region `us-east-1`: `UPDATE_COMPLETE` after the alpha.5
  connector and stale-grant handling deployment.
- All nine operational/dead-letter alarms reported `OK` after deployment.
- The existing Meta and Composio credentials remained only in AWS Secrets Manager. No credential is
  included in source, evidence, or the signed cloud resource.
- Gmail tool schemas are pinned to `20260817_00`; Drive schemas are pinned to `20260821_00` after
  comparison with the live Composio catalog. Docs, Sheets, Slides, and Slack remain on their audited
  August 2026 versions.
- Both stored six-app connection sets reported `ACTIVE/ACTIVE` at the account-status endpoint. Live
  read execution found one expired administrator Google grant set: Gmail and Drive returned HTTP 410
  while Slack remained healthy. The production adapter now converts provider 403/410 execution
  failures into `connection_reconnect_required`, persists the grant as failed, audits the failure,
  and does not let a shallow ACTIVE status silently restore it. The five stale administrator Google
  records were marked failed; Slack was preserved. Recovery is the normal one-click Google reconnect.
- The healthy acceptance account passed live Gmail search, three Drive searches (Docs/Sheets/Slides
  MIME types), and Slack search with no writes or posts. That Drive grant contains no matching editor
  files, so actual Docs/Sheets/Slides content-read execution had no resource to test in this run.

## Invite and email delivery result

- `ljang@andrew.cmu.edu` was created as an invited, confirmed, email-verified Cognito participant and
  recorded in the alpha invite table. The invitation email arrived in CMU Gmail's Spam folder.
- Two real `USER_AUTH` requests returned `EMAIL_OTP` with email delivery selected. No sign-in-code
  message appeared in CMU Gmail, including Spam/Trash, during the acceptance window. Therefore full
  email-code sign-in is **not certified** by this release record.
- `superintelligentagents.ai` is a verified SES identity with successful Easy DKIM and account-level
  suppression enabled for bounces and complaints. SES production access is still disabled. The
  prior review case `178215835700668` is denied; a new API submission returns `ConflictException`,
  and the account has no premium Support API entitlement. Cognito intentionally remains on
  `COGNITO_DEFAULT` so an unapproved sandbox sender is not deployed.

## Distribution decision

**No-go for external distribution yet.** The signed artifact is technically valid, but release still
requires all of the following:

1. Appeal/obtain SES production access or otherwise prove reliable Cognito email-code delivery, then
   complete a fresh invited-account sign-in end to end.
2. Reconnect the main administrator's Google set and perform actual read-only Docs, Sheets, and Slides
   content checks using designated non-sensitive fixtures.
3. Finish the two-account/two-workspace Google and Slack acceptance matrices and the clean-profile
   signed-artifact isolation checks in `connector-distribution-readiness.md`.
4. Fill the named operational owners and obtain research, privacy/legal, security, support, and
   release signatures in `research-release-signoff.md`.

