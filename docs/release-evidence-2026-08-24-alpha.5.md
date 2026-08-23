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
- The exact signed app was also launched from a temporary clean user-data profile. **Continue
  locally**, required workspace selection, first-agent creation, first-thread creation, quit, and
  relaunch all completed. The same agent and active thread were restored after relaunch; the
  temporary profile and workspace were removed after the check. Its packaged renderer also passed a
  960x640 Dark/reduced-motion media check of Settings and the full six-app connection copy with no
  horizontal clipping; this automated check does not replace the outstanding human appearance
  review.

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
- The running signed artifact exposed the participant-facing Activity viewer with cross-agent
  transcript search, active/all filters, per-thread status, and unread/background state. Its Computer
  settings showed the enabled per-thread local trajectory log, 90-day/128-MiB limits, Finder access,
  and the Google Workspace exclusion copy. The healthy acceptance identity was not offered the
  administrator-only raw research archive, as intended.
- The acceptance profile's trajectory directory contained seven per-thread/app JSONL logs (1.8 MiB)
  with user/assistant timeline, action result, approval, connector lifecycle, consent, capability,
  and turn-finished event classes. Only event-class counts were inspected; task-visible payloads were
  not copied into this record.

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
- A fresh control-table audit confirmed that the acceptance identity still owns six connected
  grants while the separate administrator identity owns only its working Slack grant plus five
  failed Google grants. No record moved between subjects. The exact signed app displayed the
  acceptance identity and all six independently disconnectable apps.
- All 15 deployed operational, archive, research-upload/export, and dead-letter alarms report `OK`.
  The research and immutable-audit buckets remain KMS-encrypted with full S3 public-access blocking;
  research objects expire after 90 days, while audit records use 365-day Governance Object Lock and
  expire after 400 days. A live acceptance batch was read by schema only and contained the expected
  `raw_v1` / `alpha-research-v3-raw` envelope and connector-lifecycle events. No task content was
  copied into this evidence record.

## Invite and email delivery result

- `ljang@andrew.cmu.edu` was created as an invited, confirmed, email-verified Cognito participant and
  recorded in the alpha invite table. The invitation email arrived in CMU Gmail's Spam folder.
- Two real `USER_AUTH` requests returned `EMAIL_OTP` with email delivery selected. No sign-in-code
  message appeared in CMU Gmail, including Spam/Trash, during the acceptance window. Therefore full
  email-code sign-in is **not certified** by this release record.
- `superintelligentagents.ai` is a verified SES identity with successful Easy DKIM and account-level
  suppression enabled for bounces and complaints. SES production access is still disabled. The
  prior review case `178215835700668` is denied. A new AWS Support appeal was submitted as case
  `178752302500538` with the live public site, transactional-only OTP use case, consent and
  suppression details, low expected volume, and the stale SES review-state evidence; it is currently
  awaiting assignment. Cognito intentionally remains on `COGNITO_DEFAULT` so an unapproved sandbox
  sender is not deployed.

## Distribution decision

**No-go for external distribution yet.** The signed artifact is technically valid, but release still
requires all of the following:

1. Obtain a favorable response to AWS Support case `178752302500538`, switch Cognito to the approved
   SES sender, and complete a fresh invited-account email-code sign-in end to end.
2. Reconnect the main administrator's Google set and perform actual read-only Docs, Sheets, and Slides
   content checks using designated non-sensitive fixtures.
3. Finish Google's reviewer video/data-access verification and CASA work when requested, then pass
   the two-fresh-non-tester-account matrix on different domains.
4. Pass Slack in a second unrelated workspace, including exact-recipient preview, an approved
   synthetic send, revocation, and reconnect.
5. Complete the second clean macOS profile with separate Sia/provider identities plus the remaining
   human Dark/MFA/archive/outbox, Dictate/audio, and disposable-account upgrade checks.
6. Fill the named operational owners and obtain research, privacy/legal, security, support, and
   release signatures in `research-release-signoff.md`.
