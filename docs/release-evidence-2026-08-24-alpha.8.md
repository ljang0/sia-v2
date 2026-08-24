# Sia 0.1.0-alpha.8 release evidence

## Source and artifact

- Application source commit: `0305255` (`feat: prepare self-service alpha.8 release`).
- Universal DMG: `apps/desktop/release/Sia-0.1.0-alpha.8-universal.dmg`
  - SHA-256: `d516cddd2557a556f723d2968aeaa8de25c95e8b3b2080e6d8a09a75c3a09018`
  - Size: 257,668,842 bytes
- Universal ZIP: `apps/desktop/release/Sia-0.1.0-alpha.8-universal.zip`
  - SHA-256: `104da1b48ef4796a8adb4be929ed03668d6039c688d92976b1c94e2e114f02c9`
  - Size: 257,019,110 bytes
- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Inner app/ZIP notarization submission: `84436cd5-48aa-42a7-b4b3-6eba05d617c7`, accepted.
- Final DMG notarization submission: `81289aa7-26df-4275-8ca4-5443abd105aa`, accepted.
- Stapler validation, Gatekeeper app/DMG assessment, strict code-sign verification, and the
  packaged-app release verifier passed.

## Implemented release boundary

- A public, rate-limited registration endpoint silently creates a Cognito participant only after
  the adult research-alpha acknowledgment. The desktop registers before requesting Cognito's
  passwordless `EMAIL_OTP`; the response remains enumeration-resistant.
- The sign-in surface now presents one research acknowledgment, clear Terms/Privacy links, and a
  **Join & email me a code** action. Local use remains available without a Sia account.
- One Sia-owned Google authorization-code + PKCE grant covers Gmail, Drive, Docs, Sheets, and
  Slides, with service-level switches after connection. Legacy per-service grants migrate through
  one **Upgrade Google** action. Slack remains an independent one-click browser OAuth connection.
- A Google callback that receives only a subset of the requested Workspace scopes now revokes the
  partial token best-effort, stores no connection, marks the attempt failed, and returns a readable
  retry page. It no longer leaves the desktop indefinitely in `link_pending` or exposes raw error
  JSON to the participant.
- Google Workspace action turns remain excluded from diagnostic trajectories and AWS research
  uploads. OAuth URLs, authorization codes, tokens, cookies, and client secrets are excluded from
  lifecycle records.

## Verification completed

- `pnpm check` passed the build, formatting check, quality guard, type checking, 105 cloud tests,
  294 desktop tests, and 54 shared-package tests: 453 tests passed and one opt-in Codex isolation
  smoke test remained skipped by design.
- A focused cloud test proves a granular-consent response missing any selected Google scope is
  revoked, never stored, and never used to call Google userinfo.
- AWS CloudFormation stack `sia-alpha` is `UPDATE_COMPLETE` and `IN_SYNC` in account
  `677513020767`, region `us-east-1`. The deployed Google OAuth secret has non-empty client ID and
  client-secret fields without printing either credential.
- The dedicated `Sia Production` Google Web OAuth client uses the deployed callback. A live attempt
  reached Google account selection and consent for `ljang@andrew.cmu.edu`; declining some granular
  permissions failed closed as designed. The fresh all-scope read-only acceptance pass is still
  open.
- The public CloudFront invalidation completed and `https://superintelligentagents.ai` serves the
  self-enrolled research-alpha copy. Public registration accepted a valid acknowledgment, rejected
  an invalid acknowledgment, and Cognito delivered an `EMAIL_OTP` to the CMU test address.
- A repository scan found none of the previously supplied Meta or Apple credential literals.

## Open external-distribution gates

- Finish the fresh Google consent pass by selecting every requested Workspace permission, then
  validate Gmail, Drive, Docs, Sheets, and Slides read-only, service switches, revoke, and reconnect.
- Google sensitive/restricted-scope verification, reviewer video, and any required CASA assessment
  remain mandatory before claiming seamless general Google availability. Until approval, Google
  displays its unverified-app warning and only approved testers can be treated as supported.
- Complete the documented Slack install/read/revoke/reconnect matrix in a second unrelated
  workspace before claiming universal cross-workspace readiness. Do not post during read-only
  acceptance.
- Cognito is still using its default email sender. It is adequate for a small controlled test but
  SES production access and monitored deliverability are required before broad external signup.
- Complete the named research, privacy/legal, security, support, and release-owner sign-offs in
  `docs/research-release-signoff.md` before sending the artifact to external participants.

The signed artifact is suitable for controlled internal alpha acceptance. It is not yet approved
for unqualified external Google/Slack distribution.
