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
  `Operators`, `MetaTesters`, `Participants`, or `Admins`, creates a 15-minute S3 URL, and returns a
  signed manifest. `Operators` have no participant, research-upload, schedule, connector, hosted
  model, or archive capability. `MetaTesters` add only the hosted Meta preview while remaining
  non-participants. The desktop verifies the Ed25519 signature, exact version/size/hash, and decoded
  S3 object key before opening the URL. It does not silently install an update.
- For a recipient's first install, the release owner can use the seven-day operator URL in the
  mode-`0600` local record `/Users/lawrencejang/.sia-release/alpha14-publish.json`. Do not copy that
  URL into Git, a public page, analytics, or a broad channel. Generate a fresh URL for each approved
  invitation batch.
- One confirmed internal cofounder account is enrolled in `Operators` and the separately scoped
  `MetaTesters` cohort. `Participants` and `ConnectorTesters` remain empty, so the internal model
  test does not grant research, schedule, connector, or archive access.

## AWS and email state

- Stack `sia-alpha` is `UPDATE_COMPLETE`; drift detection is `IN_SYNC` with zero drifted resources.
- All 17 `sia-alpha-*` alarms are `OK`, have actions enabled, and include the new SES bounce and
  complaint reputation alarms.
- The release route returns HTTP 403 without a Cognito bearer token. Unit/integration coverage
  proves `Operators`, `MetaTesters`, `Participants`, and `Admins` can receive it while an
  authenticated user outside those groups is denied. The model tester's deployed session response
  remains non-participant with research uploads, schedules, connectors, and archive disabled.
- The exact `auth@superintelligentagents.ai` address forwards through Namecheap to the operator
  Gmail account. A dedicated control message and the fresh SES verification message both arrived;
  the exact address now reports SES `VerificationStatus: SUCCESS` and
  `VerifiedForSendingStatus: true`.
- Cognito remains on managed `COGNITO_DEFAULT` delivery and now uses the verified exact
  `auth@superintelligentagents.ai` `SourceArn`, with no `From` override. A reviewed no-replacement
  change set completed successfully, and post-change drift detection is `IN_SYNC`.
- A new real `EMAIL_OTP` challenge arrived from `auth@superintelligentagents.ai` at the existing
  acceptance alias. Gmail reported `mailed-by: amazonses.com`,
  `signed-by: superintelligentagents.ai`, and TLS; no code or session was retained and no Cognito
  identity or group membership was created.
- SES production access is still denied. The account is healthy and sending-enabled, but remains in
  the sandbox. This is an external scale gate rather than an internal-cohort blocker: the live
  Cognito-managed branded email path is working inside the current service limits.

## Closed engineering gates

- `pnpm check`: complete build, formatting, quality, type, and 491 runnable tests passed; the
  credential-dependent isolation smoke is opt-in and passed separately.
- `pnpm test:e2e`: 26 passed, four opt-in real probes skipped.
- Post-release test-only commit `3029846` corrected the stale compact outline baseline and its full
  hosted-macOS workflow (`32931248588`) passed quality, Electron E2E, and unsigned universal
  packaging. The signed app remains the exact `d9dfb52` artifact.
- Real Codex isolation passed. The real no-turn Codex and CUA probes passed. The initially skipped
  Chrome path was then exercised manually with the exact signed app: it attached to the explicitly
  selected disposable window, performed the requested dated navigation only there, and detached.
- `sam validate --lint`: passed.
- Signed universal app and DMG: Apple accepted both submissions; codesign, Gatekeeper, stapling,
  universal-native, cloud-config, CUA, MCP bridge, and license checks passed.
- Private latest/immutable manifests are byte-identical; the manifest SHA-256 and Ed25519 signature
  were recomputed after download and passed. Both S3 artifact sizes and SHA-256 metadata match.
- The protected route, narrow S3 IAM access, immutable publisher, downgrade/conflict refusal,
  release-key pinning, and inert attachment previews have regression coverage.
- A no-replacement post-release stack update created `MetaTesters` and changed only Lambda code and
  API wiring in place. Cloud tests passed 116/116. A deployed capability probe for that group
  returned the configured Meta model with streaming and tools enabled, while the deployed session
  response remained non-participant with all research, schedule, connector, and archive flags off.
- The exact signed app was restarted through Computer Use; the ordinary profile survived and its
  updater returned live HTTP 403 for the signed-in acceptance account outside every allowed release
  cohort. This closes the authenticated non-cohort branch while preserving the empty research
  cohorts.

## Remaining human/external gates

1. Fill the named owners and signatures in
   [`research-release-signoff.md`](./research-release-signoff.md), approve the exact recipient list,
   and only then add those people to `Participants`.
2. Have the approved operator complete OTP sign-in, then verify the live protected update route
   returns a signed manifest and working 15-minute artifact URL. The live unauthenticated denial and
   all access-policy branches are automated; this final positive path requires the operator's inbox
   code.
3. Complete clean-account and prior-build install/upgrade acceptance, advertised voice checks, and
   the remaining exact packaged computer-use mutation cases with a human observer. The disposable
   Chrome attach/navigation/detach gate is closed.
4. Keep Google Workspace and Slack limited to a separately approved `ConnectorTesters` cohort until
   their provider-specific acceptance matrix and external review are complete.

## Reference

See [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md) for the reference
comparison and clean-room boundary. No reconstructed repository code was merged into Sia.
