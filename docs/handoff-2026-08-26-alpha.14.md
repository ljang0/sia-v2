# Sia `0.1.0-alpha.14` operator/internal-QA handoff

_Prepared 2026-08-26 KST. Exact release evidence is linked below._

## Outcome

`alpha.14` matches the useful interaction breadth and information density identified in the
clean-room Grok Bot review without importing its code, dependencies, assets, copy, or visual
identity. It adds a compact conversation outline, bounded schedule-run history, and safe inert
previews for text, code, diff, CSV, and TSV attachments. These build on `alpha.13`'s room controls,
deep search, unread state, contextual starts, provider activity, notifications, drag/drop, and
feedback handoff.

The interface remains distinctly Sia: cool mineral canvas, deep evergreen navigation, quiet
typography, restrained storm-blue approval state, and no yellow paperback tint. The outline is a
temporary edge popover rather than a permanent third column, so density increases without reducing
the writing surface.

The exact candidate is signed, Apple-notarized, stapled, verified, pushed, and privately published.
Its authenticated update endpoint and pinned Ed25519 public key are embedded in the signed app.
Describe it as ready for operator/internal QA, not as participant-approved.

## Release and access path

- Exact signed application source: `d9dfb521263de8dc05edf5fe3d1dc576716ece07`.
- Release evidence:
  [`release-evidence-2026-08-26-alpha.14.md`](./release-evidence-2026-08-26-alpha.14.md).
- The DMG and ZIP are private S3 objects under immutable, content-addressed keys. The signed latest
  manifest is also private and byte-identical to its immutable versioned copy.
- The desktop calls `GET /v1/releases/macos` with its Cognito ID token. The cloud allows only
  `Participants` or `Admins`, creates a 15-minute S3 URL, and returns a signed manifest. The desktop
  verifies the Ed25519 signature, exact version/size/hash, and decoded S3 object key before opening
  the URL. It does not silently install an update.
- For a recipient's first install, the release owner can use the seven-day operator URL in the
  mode-`0600` local record `/Users/lawrencejang/.sia-release/alpha14-publish.json`. Do not copy that
  URL into Git, a public page, analytics, or a broad channel. Generate a fresh URL for each approved
  invitation batch.
- `Participants` and `ConnectorTesters` both remain empty. No recipient was invited or enrolled
  during release verification.

## AWS and email state

- Stack `sia-alpha` is `UPDATE_COMPLETE`; drift detection is `IN_SYNC` with zero drifted resources.
- All 17 `sia-alpha-*` alarms are `OK`, have actions enabled, and include the new SES bounce and
  complaint reputation alarms.
- The release route returns HTTP 403 without a Cognito bearer token. Unit/integration coverage
  proves `Participants` and `Admins` can receive it while an authenticated user outside those groups
  is denied.
- Cognito remains on `COGNITO_DEFAULT`. A real `EMAIL_OTP` challenge was accepted for the existing
  acceptance alias; no new Cognito identity or group membership was created.
- SES production access is still denied. The account is healthy and sending-enabled, but remains in
  the sandbox. The internal cohort can continue using Cognito-managed delivery within Cognito's
  lower daily quota.
- `auth@superintelligentagents.ai` is verified for SES sending through the domain, but its exact
  email-address verification is still `PENDING`. Cognito will not accept it as a managed custom
  sender until the exact identity reports `VerificationStatus: SUCCESS`. Until then the deployed
  user pool deliberately uses Cognito's default sender.

## Closed engineering gates

- `pnpm check`: complete build, formatting, quality, type, and 491 runnable tests passed; the
  credential-dependent isolation smoke is opt-in and passed separately.
- `pnpm test:e2e`: 26 passed, four opt-in real probes skipped.
- Post-release test-only commit `3029846` corrected the stale compact outline baseline and its full
  hosted-macOS workflow (`32931248588`) passed quality, Electron E2E, and unsigned universal
  packaging. The signed app remains the exact `d9dfb52` artifact.
- Real Codex isolation passed. The real no-turn Codex and CUA probes passed; the Chrome probe stayed
  skipped because the user-controlled browser permission was not enabled.
- `sam validate --lint`: passed.
- Signed universal app and DMG: Apple accepted both submissions; codesign, Gatekeeper, stapling,
  universal-native, cloud-config, CUA, MCP bridge, and license checks passed.
- Private latest/immutable manifests are byte-identical; the manifest SHA-256 and Ed25519 signature
  were recomputed after download and passed. Both S3 artifact sizes and SHA-256 metadata match.
- The protected route, narrow S3 IAM access, immutable publisher, downgrade/conflict refusal,
  release-key pinning, and inert attachment previews have regression coverage.
- The exact signed app was restarted through Computer Use; the ordinary profile survived and its
  updater returned live HTTP 403 for the signed-in acceptance account outside both allowed groups.
  This closes the authenticated non-cohort branch while preserving the empty-cohort state.

## Remaining human/external gates

1. Fill the named owners and signatures in
   [`research-release-signoff.md`](./research-release-signoff.md), approve the exact recipient list,
   and only then add those people to `Participants`.
2. Observe the requested SES verification and Cognito OTP in the intended inbox, record delivery
   time and sender/authentication headers, and complete the exact email-address verification. Then
   deploy the branded `SourceArn` through another reviewed no-replacement change set.
3. With one approved account, complete the OTP and verify the live protected update route returns a
   signed manifest and working 15-minute artifact URL. The live unauthenticated denial and both
   access-policy branches are already automated; this final positive path requires the inbox code.
4. Complete clean-account and prior-build install/upgrade acceptance, advertised voice checks, and
   the exact packaged computer-use mutation pass with a human observer.
5. Enable Chrome's one-time visible remote-debugging control only if the release owner accepts that
   test, then rerun the exact-window attachment probe against a disposable page.
6. Keep Google Workspace and Slack limited to a separately approved `ConnectorTesters` cohort until
   their provider-specific acceptance matrix and external review are complete.

## Reference

See [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md) for the reference
comparison and clean-room boundary. No reconstructed repository code was merged into Sia.
