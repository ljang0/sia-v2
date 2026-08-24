# Sia 0.1.0-alpha.7 release evidence

## Source and artifact

- Application source commit: `233e776` (`feat: unify Google Workspace OAuth for alpha.7`).
- Universal DMG: `apps/desktop/release/Sia-0.1.0-alpha.7-universal.dmg`
  - SHA-256: `a569124580cf8618661d7d5ddc833bea776408fbcb0facd31cbe281b5d5d7214`
  - Size: 257,678,840 bytes
- Universal ZIP: `apps/desktop/release/Sia-0.1.0-alpha.7-universal.zip`
  - SHA-256: `292518a393eb75f8ee0bedaa63011c5303f1b6738536175b16a913c6ddeed81f`
  - Size: 257,018,518 bytes
- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Final DMG notarization submission: `f861699b-1863-4aae-a88c-a11a6d1ff0c3`, accepted.
- Stapler validation, Gatekeeper assessment, and the packaged-app release verifier passed.

## Implemented release boundary

- One Sia-owned Google authorization-code + PKCE grant now covers Gmail, Drive, Docs, Sheets, and
  Slides. The callback consumes one-time state, the refresh token is encrypted with AWS KMS using a
  per-user/per-connection encryption context, and the desktop receives only an opaque grant ID.
- The direct Google adapter uses fixed Google API origins, bounded request/response handling, scoped
  Drive staging, hash/size verification, and cleanup. Historical per-service Composio Google grants
  are migration-only and are revoked when the unified connection replaces them.
- Settings has independent **Connect Google** and **Connect Slack** actions. After one Google grant,
  Gmail, Drive, Docs, Sheets, and Slides can be switched on or off independently. The controller
  refuses to resolve an opaque grant for a disabled service.
- Slack continues through its separate Sia-owned Composio OAuth configuration and does not depend on
  the desktop Slack app, a plugin, a user API key, or developer-console access.
- Google Workspace action turns remain excluded from diagnostic trajectories and AWS research
  uploads. OAuth URLs, authorization codes, tokens, cookies, and client secrets are excluded from
  lifecycle records.

## Verification completed

- `pnpm check` passed build, formatting, quality guard, type checking, 102 cloud tests, 292 desktop
  tests, and 54 shared-package tests. One opt-in Codex isolation smoke test remained skipped by
  design.
- The focused connected-app E2E suite passed all three first-run, all-services, and selected-service
  cases. The visual-polish suite passed both light/dark, compact, motion, sign-in, and local-choice
  cases against the same service-switch implementation.
- The deployed callback at
  `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha/v1/oauth/google/callback` returned a
  no-store HTTP 400 `invalid_request` response without authentication when state was absent, proving
  that the public callback route is reachable and fails closed.
- AWS CloudFormation stack `sia-alpha` is `UPDATE_COMPLETE` in account `677513020767`, region
  `us-east-1`. The signed package embeds the stack's API base, Cognito region, and desktop client ID.
- A repository credential-literal scan found none of the previously supplied Meta or Apple
  credential patterns.

## Open external-distribution gates

- The dedicated Google Web OAuth client must still be created while signed in as
  `superintelligentagents@gmail.com`, with the exact AWS callback above. The deployed
  `GoogleSecret` resource intentionally has no `AWSCURRENT` value, so unified Google connection is
  fail-closed until the client ID and secret are installed.
- After installation, complete one fresh read-only acceptance pass with `ljang@andrew.cmu.edu` across
  Gmail, Drive, Docs, Sheets, and Slides; verify per-service off switches; revoke and reconnect once.
- Google sensitive/restricted-scope verification, reviewer video, and any required CASA assessment
  remain mandatory before claiming general Google availability. A fresh two-domain matrix remains
  open.
- Slack still needs the documented second unrelated-workspace install/revoke/reconnect matrix before
  claiming universal cross-workspace readiness.
- Complete the named research, privacy/legal, security, support, and release-owner sign-offs in
  `docs/research-release-signoff.md` before sending the artifact to external participants.

The signed artifact is suitable for continued internal alpha acceptance. It is not yet approved for
unqualified external Google/Slack distribution.
