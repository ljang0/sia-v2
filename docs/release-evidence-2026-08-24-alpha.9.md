# Sia 0.1.0-alpha.9 release evidence

## Decision

Alpha.9 is a signed, notarized build suitable for controlled tester distribution. Core Sia use does
not depend on Google or Slack, and the public site, signup guard, AWS control plane, schedules,
research archive controls, and packaged macOS application are deployed and verified. General public
Google/Slack availability is not approved yet; the external provider and human sign-off gates at the
end of this record remain mandatory.

## Source and artifacts

- Frozen application source commit: `64382db31b75a7898ce26c78cfc61405d1cce93e`
  (`feat: prepare progressive Google alpha.9`).
- Universal DMG: `apps/desktop/release/Sia-0.1.0-alpha.9-universal.dmg`
  - SHA-256: `d74ca5d02695445050b2a17e932281eed7bf76d7e4b46c43dab777cc3ada0b52`
  - Size: 257,673,112 bytes
- Universal ZIP: `apps/desktop/release/Sia-0.1.0-alpha.9-universal.zip`
  - SHA-256: `57a505aa1564bb793a7b0294984d2f5dee7cb6324385d560088a4f2c68b8febf`
  - Size: 257,019,580 bytes
- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Inner app notarization: `5a65a011-3bce-4b3e-bd7d-b5a6d309386d`, accepted.
- Final DMG notarization: `3bbfb423-12df-4a57-89c9-28fe1e1cd8ad`, accepted.
- The release pipeline and a separate post-build check passed strict deep code-sign verification,
  app execute assessment, DMG open assessment, and stapler validation. Gatekeeper reported
  `Notarized Developer ID` for both the app and DMG.
- The superseded alpha.8 artifacts remain recoverable under
  `apps/desktop/release-archive/alpha.8/`; they were not deleted.

## Implemented alpha.9 boundary

- Google now uses progressive authorization. **Connect Google** requests one read-only grant for
  Gmail, Drive, Docs, Sheets, and Slides. **Enable editing** requests a separate reviewed editor and
  Gmail-compose grant while preserving the working read grant until the replacement is verified.
- Tool-level access checks reject Google writes before approval or provider execution when the
  connection is read-only. Local service switches continue to select which of the five services Sia
  may use.
- Docs, Sheets, and Slides actions accept either the resource ID or a strict matching
  `https://docs.google.com/.../d/{id}` URL. Wrong hosts, credential-bearing URLs, malformed encoding,
  and resource-type mismatches are rejected. Sheets reads remain bounded.
- A Google action turn remains excluded in full from the local diagnostic trajectory and encrypted
  AWS research archive. OAuth URLs, codes, tokens, cookies, and client secrets are also excluded.
- The public site was rebuilt as a minimal private-release experience with dark/light appearance,
  restrained motion, responsive navigation, research disclosure, and direct policy/support routes.

## Automated and live verification

- Final `pnpm check` passed from the frozen source: build, Prettier, quality guard, type checking,
  108 cloud tests, 297 desktop tests, and 54 shared-package tests. Total: 459 passed; the one explicit
  Codex isolation smoke test remained skipped by design.
- The Google suites cover the exact read-only and editor scope sets, partial-scope rejection,
  read-only write refusal, safe upgrade handoff, old-grant cleanup, strict resource URL parsing, and
  the previously failing Sheets action path.
- `sam validate --lint --template-file infra/template.yaml --region us-east-1` passed.
- AWS account `677513020767`, stack `sia-alpha`, region `us-east-1` updated without replacement and
  returned `UPDATE_COMPLETE` at 2026-08-24 08:38 UTC. A post-deploy drift scan returned `IN_SYNC`.
- All 15 `sia-alpha` CloudWatch alarms were enabled and `OK`. The public registration endpoint
  rejected a missing research acknowledgment with the expected 400 contract, and the Google
  callback rejected a missing state with the expected safe 400 contract.
- The reproducible Node 22 Lambda manifest contains four bundles. The deployed control bundle build
  SHA-256 is `3354f48ec5f484f9ec7daa0bbefa9efda1b71e58e1703e6e61ae2a09c2e0648c`.
- CloudFront distribution `E3MFZH4OWO2B9C` completed invalidation
  `I2VEJTJDB7IB7CJY9Y0B7KOB4P`. The live `/`, `/research/`, `/privacy/`, `/terms/`, and `/support/`
  routes each returned 200 with CSP, HSTS, frame denial, content-type protection, and referrer
  policy intact.
- A live Chromium check at 1440 px and 390 px found no horizontal overflow, failed images, page
  errors, or console errors. The appearance toggle and mobile menu/Escape behavior passed.

## Open external-distribution gates

- In Google Auth Platform Data Access, add the complete progressive scope union recorded in
  `google-oauth-verification-packet.md`. Then use a dedicated synthetic account to record the
  two-stage reviewer video, submit scope verification, complete any required CASA assessment, and
  run the fresh two-domain account/revoke/reconnect matrix. The code and verification packet are
  ready, but Google must approve the production access; an unverified-app bypass is not a release
  result.
- Complete Slack read/revoke/reconnect acceptance in a second unrelated workspace. Before claiming
  writes are ready, also verify the exact recipient/message preview and one approved synthetic send.
- Cognito still uses its default email sender. It is appropriate only for a small controlled alpha;
  SES production sending, monitored deliverability, and an external-domain email-code check remain
  required before broad signup.
- Run the signed build from two fresh macOS profiles with independent Sia/provider identities and
  complete the documented cancellation, browser-close, offline, restart, revocation, admin-denial,
  export, deletion, and research-viewer acceptance matrix.
- Fill the named operational owners and obtain research, privacy/legal, security, support, and
  release-owner approval in `research-release-signoff.md`.

Do not advertise Google or Slack as universally available until their respective gates are closed.
Core Sia can be distributed to a controlled tester list now with connected apps labeled optional and
pre-release.
