# Sia 0.1.0-alpha.6 release evidence

Recorded on 2026-08-24 KST. This record separates verified engineering results from remaining
provider and human approvals. It does not authorize distribution by itself.

## Frozen source and artifact

- Application source commit: `702cfac` (`release: prepare Sia 0.1.0-alpha.6`). The signed artifact
  was built from that clean tracked tree.
- DMG: `apps/desktop/release/Sia-0.1.0-alpha.6-universal.dmg`
  - size: `257678109` bytes
  - SHA-256: `0045a63d7dbe0a84c9bb9127e282e067c76b756b70305c411d822e6153abb530`
- ZIP: `apps/desktop/release/Sia-0.1.0-alpha.6-universal.zip`
  - size: `257013123` bytes
  - SHA-256: `24be636dfce0592612eafe882f53f1b7736e056cf7873c0a8a502af665bbd95f`
- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`; bundle identifier
  `ai.sia.desktop`.
- Apple accepted the app submission `ef3c8df1-e78c-470f-84bf-e8cdca98f1b7` and outer DMG
  submission `b78aea63-69df-40d2-8434-9d9e43d1d025`. Both tickets are stapled and validated.
  Gatekeeper reports `Notarized Developer ID`.
- The release verifier passed the hardened signature, minimum macOS version, universal app and
  helper binaries, architecture-matched CUA and UniFFI runtimes, packaged live CUA probe, complete
  license resources, signed cloud binding, and packaged MCP bridge.
- The previous alpha.5 release remains recoverable under
  `apps/desktop/_old-builds/release-alpha5-before-alpha6-20260824-0806`.

## Automated and packaged checks

- `pnpm check` passed the build, formatting, curated-tool quality guard, typechecking, and 441
  tests: 98 cloud, 289 desktop, 23 action-gateway, 20 runtime, 8 tool-bridge, and 3 protocol. The
  separate real Codex isolation test remained explicitly skipped in the deterministic run.
- The focused reconnect suite passed 142 tests across the cloud client, action backend, controller,
  and Settings flows.
- `pnpm --filter @sia/desktop test:e2e` passed 26 deterministic Electron flows; four explicitly real
  opt-in tests were skipped.
- The exact signed alpha.6 app passed a disposable clean-user-data launch. **Continue locally**
  opened the core app, and Settings → Apps rendered Gmail, Drive, Docs, Sheets, Slides, and Slack at
  960×640 in Dark/reduced-motion mode with no horizontal overflow or renderer error; the main
  transition correctly resolved to `none`.

## Expired-grant correction and live editor result

- The acceptance account's first real Docs, Sheets, and Slides fixture-creation attempts reached all
  three deployed editor tools. Each provider call returned a nested Google 401
  `UNAUTHENTICATED` inside Composio's successful HTTP transport. Sia initially surfaced HTTP 502;
  its automatic retries then received the existing 409 `connection_reconnect_required` response.
- Composio execution logs confirmed the exact approved non-sensitive inputs and no returned resource
  IDs. No Doc, Sheet, or Slides fixture was created, and no content-read call ran; retrying the same
  fixture names after reconnect will not create duplicates.
- The deployed AWS adapter now recognizes provider authentication failures nested under
  `auth_refresh_required`, `status_code`, `mercury_last_http_status_code`, or `data.status_code` for
  401/403/410. It immediately marks only the exact grant failed, records the action failure as
  `connection_reconnect_required`, and returns a recoverable 409 rather than a misleading initial
  502.
- The alpha.6 desktop consumes only the safe error code, immediately changes the corresponding Apps
  row to **Needs attention**, explains the expired authorization in the task, and offers one
  **Reconnect** button. That button revokes the exact stale saved grant and opens a fresh provider
  OAuth flow; healthy grants remain unchanged.

## Deployed AWS state

- Account `677513020767`, stack `sia-alpha`, region `us-east-1`: `UPDATE_COMPLETE` after the nested
  provider-authentication deployment. All 15 matching CloudWatch alarms are `OK`.
- The stack remains on `EmailSendingAccount=COGNITO_DEFAULT`; the Meta and Composio credentials
  remain only in AWS Secrets Manager and are not present in source, evidence, or the signed cloud
  resource.
- SES is healthy with account-level bounce/complaint suppression, but
  `ProductionAccessEnabled=false`. AWS Support case `178752302500538` was submitted previously; the
  Support API is unavailable on this account without a premium Support subscription, so this run
  makes no newer case-assignment claim.

## Distribution decision

**No-go for external distribution yet.** Alpha.6 is signed, notarized, and technically verified, but
release still requires all of the following:

1. Obtain SES production access, deploy the approved SES sender, and complete a fresh invited-user
   email-code sign-in end to end.
2. With explicit user authorization, reconnect the acceptance account's Docs, Sheets, and Slides
   grants, create the three named private fixtures, and read them back through Sia.
3. Complete Google's reviewer video/data-access verification and CASA work when requested, then pass
   the two-fresh-non-tester-account matrix on different domains.
4. Pass Slack in a second unrelated workspace, including exact-recipient preview, an approved
   synthetic send, revocation, and reconnect.
5. Complete the second clean macOS profile/provider-identity matrix plus the outstanding human
   Dark/MFA/archive/outbox, Dictate/audio, and disposable-account upgrade checks.
6. Fill the named operational owners and obtain research, privacy/legal, security, support, and
   release signatures in `research-release-signoff.md`.
