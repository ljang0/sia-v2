# Alpha release evidence — 2026-08-22

This record contains operational metadata only. It intentionally excludes prompts, raw trajectory
content, participant identifiers, authentication codes, bearer tokens, provider keys, and the
administrator's TOTP seed.

## Source and artifact

- Frozen source commit: `7b239c32610e8beb6ff8a6e2a6c21666994b19c2`
- Version: `0.1.0-alpha.1`
- Bundle identifier: `ai.sia.desktop`
- Signing authority: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`
- Team identifier: `DXYJ578DD4`
- Hardened runtime: enabled (`Runtime Version=26.4.0`)
- DMG SHA-256:
  `4bf61ee6803316393fb62bd6ce361d5d750fa99e04297cb853f5756550c32fac`
- ZIP SHA-256:
  `731653a776d76c4aff174b6c8f640ae77a005d5d5a43bc47a8d55b2574cf834f`
- DMG size: 256,788,732 bytes
- ZIP size: 256,105,826 bytes
- Apple app submission: `581c90e4-ea35-4b96-8e69-49bf128a7a1c` — Accepted
- Apple DMG submission: `edcbbcac-c802-4e99-aaca-c637c67a36e2` — Accepted
- `codesign --verify --deep --strict`, Gatekeeper execute assessment, DMG open assessment, and
  `stapler validate` passed for the app and DMG. The packaged verifier also passed universal binary,
  native-runtime, license, cloud-resource, and MCP bridge checks.

The signed resource points to the deployed `sia-alpha` API stage and Cognito desktop client in
`us-east-1`. No AWS or provider credentials are embedded in the resource.

## Integration work included in this artifact

- The Sia Production Google project now has the Docs, Sheets, and Slides APIs enabled. Its OAuth
  data-access list adds the app-specific `documents`, `spreadsheets`, and `presentations` scopes while
  retaining `drive.file` instead of broad Drive access.
- The first-run and Settings experience now presents Google Workspace as one guided five-service
  connection and Slack as a separate connection. Advanced per-app controls remain available for
  recovery and selective disconnects.
- Disconnect requests now carry the opaque grant ID visible when the action was initiated. The
  controller rejects a delayed request if that app has since received a replacement grant. A
  regression test covers this stale-disconnect race.
- The connector control endpoint now treats disconnect as idempotent when a saved connection record
  is already absent. The focused cloud suite passed 85/85, and the updated control Lambda is active.
- A live in-app Gmail read completed successfully for the approved tester after a full app rebuild
  and relaunch. The corresponding Drive tools authenticated and executed; the limited `drive.file`
  grant returned no pre-existing files, as expected until Sia creates or is explicitly given a file.
- The two live read turns uploaded organized `raw_v1` research batches containing ordered user,
  activity, provider-tool, assistant, usage, action-result, completion, and capture-finished event
  kinds. The newest object was present in the research bucket as JSON with customer-managed KMS
  encryption.
- One expired Docs attempt and one unapproved Slack attempt were soft-deleted from Composio and
  removed from the connection index. Neither reached a provider grant; their already-uploaded raw
  lifecycle research batches were retained.
- The deployed Slack tool surface supports finding a person by name, opening or reusing that exact
  person's DM, and passing the returned channel ID to the reviewed send action. The provider mapping
  is pinned to exact `SLACK_FIND_USERS` and `SLACK_OPEN_DM` schemas; names are never accepted where an
  opaque Slack user ID is required. The Sia-owned app requests exactly eight reviewed user scopes,
  its custom Composio config permits exactly five Slack tools, and unlisted public distribution is
  active for cross-workspace alpha installation.
- A live Russ Lab acceptance run connected through the Sia OAuth route and successfully executed
  person lookup, message search, DM open/reuse, and thread read through the deployed Lambda. No
  message was sent. The disposable connection was revoked after the test.
- Desktop type checking and all 274 desktop unit/integration tests pass for these changes. The action
  gateway passes 23/23, the cloud suite passes 90/90, and the full Electron E2E passes 24 scenarios
  with four opt-in real-provider/hardware probes skipped. A universal unsigned package with the
  deployed alpha cloud configuration also passed the packaged-app verifier.
- The release packaging command now verifies signing, notarization, and cloud environment variables
  before deleting the previous `release` directory. This prevents a failed preflight from erasing a
  known-good build.

## Deployed stack

- AWS account: `677513020767`
- Region: `us-east-1`
- Stack: `sia-alpha`
- Final status: `UPDATE_COMPLETE`
- Consent: `alpha-research-v3-raw`
- Final features: research uploads on; research archive on; schedules on; connectors on for invited
  internal acceptance
- The editor connector code was deployed as a scoped control-Lambda update. The existing
  CloudFormation template was then reused for a parameter-only update, preserving the manually
  managed secret while reconciling `EnableConnectors=true`; the stack returned `UPDATE_COMPLETE`.
  A future full-template deployment must preserve the current secret version rather than applying
  the template's placeholder secret body.
- DynamoDB: on-demand, KMS-encrypted, deletion protection on, 30-day point-in-time recovery, TTL on,
  and `GSI1` active
- Research S3: customer-KMS encryption, public-access block, versioning, 90-day current-object
  expiration, 30-day noncurrent expiration, and incomplete multipart cleanup
- Audit S3: customer-KMS encryption, public-access block, versioning, Governance Object Lock for 365
  days, and 400-day expiration
- Cognito: deletion protection active; optional software-token MFA enabled
- Lambda: Node 22 arm64; reserved concurrency is 20 control, 10 Meta, 2 deletion, and 2 export
- Deletion and export event-source mappings are enabled. Both queues and dead-letter queues are KMS
  encrypted and use the intended redrive policy.
- Every alarm action targets the confirmed operator SNS subscription.
- API Gateway's Meta route uses the Lambda response-streaming invocation URI. The Meta secret remains
  disabled and placeholder-only, so Meta is not exposed in this alpha.

## Live rehearsal

- Unauthenticated API access returned 401 from the API authorizer.
- `/v1/session` returned the expected release policy.
- Archive access returned `admin_mfa_required` before enrollment, 200 for the enrolled administrator,
  and `admin_required` for a disposable non-admin. Allowed and denied reads wrote metadata-only
  Object-Locked audit objects.
- The administrator's TOTP seed is stored only in the macOS login Keychain under service
  `Sia Alpha Cognito TOTP`; it was not written to this repository or artifact.
- Enrolling TOTP removed passwordless email as an eligible first factor for the bootstrap admin.
  A permanent high-entropy admin password is stored only in the macOS login Keychain under service
  `Sia Alpha Cognito Admin Password`. The final desktop detects Cognito's password-only challenge
  choice and proceeds password → software-token MFA. A fresh live session completed that sequence
  and returned 200 from the admin archive; no password, TOTP seed, code, or token was logged.
- A disposable participant uploaded ordered `raw_v1` batches covering large multi-batch content,
  success, failure, cancellation, and a PNG image. Admin list/read reconstructed the exact scope and
  payload lengths.
- Export completed at 6,081,262 bytes. Its S3 ETag ended in `-2`, proving a two-part multipart upload;
  a signed byte-range request returned 206. Source and export DLQs were initially empty.
- The legacy filtered-format secret probe returned `sensitive_research_data`. Raw v1 deliberately
  preserves task-visible content exactly; hidden authentication surfaces and credentials are blocked
  before they enter the raw event stream.
- Upload, archive, connector, and schedule kill switches were exercised together. The session policy
  reflected every pause, APIs returned their stable disabled codes, and the release policy recovered
  after restoration.
- Gmail, Google Drive, and Slack connector start routes each returned a valid provider-owned HTTPS
  OAuth URL for a diagnostic subject after enablement; every diagnostic connection was then deleted
  and revoked. No provider grant was completed.
- Managed, zero-connection Composio configs now exist for Google Docs (`ac_P7HVBoWxSLxM`), Sheets
  (`ac_IsvcBHAlC-oU`), and Slides (`ac_UG0AMCzDpzjK`). The KMS-encrypted runtime secret maps all six
  apps and pins all twenty-one connector slugs to exact per-tool versions.
- Google Docs, Sheets, and Slides start routes each returned `201` with a provider-owned HTTPS OAuth
  URL and returned `200` on cleanup; a post-CloudFormation Docs repeat did the same. Final diagnostic
  connection counts were zero. All ten new tool slugs passed runtime-key authorization and reached
  the expected `404` nonexistent-account boundary without a provider grant or data access.
- The signed desktop was exercised through Computer Use against Gmail, Drive, and Docs. Each reached
  Google's provider-owned page, where `ljang@andrew.cmu.edu` was rejected with `403 access_denied`
  because the OAuth application is still in Testing and the account is not an approved tester. One
  Composio response briefly reported Docs as connected without an account identity; the control
  adapter now requires the top-level and nested OAuth states to agree before accepting `ACTIVE`, and
  fails closed on a nested terminal state. The focused cloud suite passed 84/84 after the change,
  the updated control Lambda was deployed, and a signed-app repeat stayed Connecting until cancel.
  All six Composio configs again ended at zero connections.
- Sanitized inspection of the encrypted research bucket confirmed that the same acceptance run
  uploaded raw lifecycle batches for setup start, authorization opened, timeout/connection state,
  and disconnect. OAuth URLs, codes, tokens, account identifiers, and raw payloads were not printed
  during verification.
- The managed editor configs remain internal-only. Their actual Google consent scopes and a complete
  disposable-account read/write cycle are still required before external distribution.
- The archive-failure and research-upload-failure alarms entered ALARM and delivered through the
  monitored topic, then recovered according to their missing-data policy.
- A disposable account deletion completed through API, SQS, and the deletion worker. The Cognito
  identity and research/export S3 prefix were removed, the deletion DLQ stayed empty, and only the
  completed deletion receipt remained in DynamoDB.
- A controlled invalid export job failed five worker deliveries, moved to the export DLQ, and drove
  its monitored alarm to `ALARM`. Its exact message ID and fixture body were validated before only
  that receipt was deleted. The source and DLQ are empty, the source visibility timeout is 360
  seconds, the event-source mapping is enabled, the alarm recovered to `OK`, and all stack alarms
  are now `OK`.

## Local and packaged verification

- Build, formatting, policy guard, type checking, and 418 unit/integration tests passed after the
  final source audit. One intentionally opt-in Codex-isolation smoke stayed skipped in the default
  suite.
- Strict parity: 13/13 passed.
- Full Electron E2E: 24 passed; four opt-in real-provider/hardware probes skipped.
- Separate live no-turn probes passed for the authenticated Codex session and macOS
  Accessibility/Screen Recording status. The Chrome-window probe stayed opt-in because no intended
  release window was selected for that run.
- The local plain trajectory store now prunes inactive thread directories after 90 days and evicts
  the oldest inactive thread directories before exceeding 128 MiB. Age, byte-budget, active-thread,
  and symlink-boundary tests pass. This is separate from the encrypted research outbox.
- Automated first-run coverage verifies sign-in → raw consent (step 1) → guided six-app connection
  setup (step 2), including the visible recording state. Controller coverage verifies connection
  lifecycle events enter both the local trajectory and raw AWS upload queue, excludes the OAuth URL,
  and rejects signed-in setup before the provider call when raw recording is unavailable.
- Real authenticated Codex isolation passed on CLI 0.148.0 with a no-turn ephemeral session.
- The current signed app passed the packaged universal-binary, native-runtime, license,
  cloud-resource, signature, notarization, and MCP bridge verifier. The exact artifact reached cloud
  sign-in on a fresh isolated profile, completed **Continue locally**, exposed the one-click and
  selective six-app setup, and rendered the 90-day/128-MiB local-log policy. The isolated profile was
  moved to Trash.
- Opening the exact artifact on the ordinary prior-build profile preserved all existing agents,
  threads, sign-in, and the Gmail/Drive grants. The guided setup appeared once with the existing two
  grants intact and a **Set up later** path. A read-only Gmail action then succeeded with 20 results.
  Its matching local trajectory contained the full seven-event lifecycle, and AWS received the
  organized 50,552-byte raw batch under customer-managed KMS encryption.
- The notarized DMG was mounted and installed to `/Applications/Sia.app`; the prior installed app was
  archived under `_old-builds`. Gatekeeper accepted the installed copy as Notarized Developer ID and
  the app launched with the preserved profile.
- The quieter evergreen shell, horizontal Settings hierarchy, selected-agent treatment, scheduling
  form, keyboard-accessible controls, and privacy copy rendered without clipping at 960 × 640. The
  admin-only Release review now groups live system signals, direct links, and locally persisted human
  checks. Automated E2E separately covers the minimum viewport, 200% zoom, keyboard navigation, and
  reduced motion.

## Final frozen-release live audit

- AWS identity was rechecked against account `677513020767`. The `sia-alpha` stack is
  `UPDATE_COMPLETE`; a fresh drift run returned `IN_SYNC`; all fifteen alarms are `OK` with actions
  enabled; and the deletion/export source and dead-letter queues are empty.
- The control, Meta, deletion, and export Lambdas were updated from frozen commit `7b239c3` without a
  full-template deployment, preserving the manually managed secrets. All four deployed bundles then
  matched their local `index.cjs` byte-for-byte; all alarms remained `OK`.
- Composio lists enabled Sia-owned custom OAuth configs for Gmail, Drive, Docs, Sheets, Slides, and
  Slack. The post-freeze acceptance subject retains one Docs, Sheets, Slides, and Slack grant; it
  lists no Gmail or Drive connection. Pre-existing Gmail/Drive Composio counts belong to earlier
  isolated acceptance identities and are not presented as cross-subject connections in Sia.
- The Google Auth Platform project has the reviewed scopes and `ljang@andrew.cmu.edu` is an approved
  test user. Publishing remains `Testing`; the homepage, privacy-policy, and terms links are blank;
  verification has not started. The superseded August 17 OAuth client secret was disabled, the
  August 22 replacement completed a fresh Docs token exchange and read, and only then was the old
  secret permanently deleted. The replacement remains enabled. Google is internal-test-only until
  the publishing and verification gates are resolved.
- Slack's Manage Distribution page confirms public distribution is active with the exact eight
  reviewed user scopes. A Russ Lab grant is retained for acceptance; the installation counter still
  reports zero because Slack documents that counter as updating daily.

## Post-freeze connector acceptance (2026-08-23 KST)

- Provider consent used the deployed control Lambda, the production Composio auth configs, and the
  existing Sia acceptance subject. Google consent selected `ljang@andrew.cmu.edu`; the Sia cloud
  identity remained separate. This exercised the same provider and cloud-control path as the signed
  desktop without exposing OAuth URLs, codes, tokens, connection IDs, or provider response bodies in
  the evidence log.
- Google Docs connected after the superseded client secret was disabled. Cloud reconciliation
  returned `connected`, then `docs.read` succeeded against an existing test document. That fresh
  code exchange and API read were the deletion gate for the old secret.
- Google Sheets and Slides each completed their own consent and reconciled to `connected`.
  `sheets.read` and `slides.read` then succeeded against Google's public API sample artifacts; no
  spreadsheet, presentation, or document mutation ran.
- Slack connected to Russ Lab and reconciled to `connected`. The only Slack tool execution was
  `slack.find_users`; no DM was opened or created and no message was drafted or posted.
- The immutable audit bucket contains four corresponding `connector.read` records—Docs, Sheets,
  Slides, and Slack—with `allowed` outcomes. No `connector.write` object was created during the
  acceptance window. Composio reports one active connection on each of the four custom auth configs.
- This operator-assisted acceptance does not replace the remaining signed-desktop, second-profile,
  second-Google-domain, and second-Slack-workspace matrix. Automated desktop coverage still proves
  that normal in-app connection lifecycle events enter both the local trajectory and encrypted
  `raw_v1` upload queue; this direct control-plane run produced immutable cloud audit metadata, not a
  fabricated desktop trajectory.

## Human-only, provider, or still-open gates

Do not distribute the artifact until these are completed and recorded:

- Confirm the intended recipient list and send the raw-research/local-only/separate-provider-consent
  notice. Keep connectors internal-only until the OAuth scope audit is complete.
- Obtain named research/privacy/legal approval for the exact consent, 90-day retention, deletion,
  support, and incident-response policy.
- Complete audible Dictate/voice comparison and microphone-denial checks with a human speaker.
- Repeat the successful clean-profile and prior-profile checks from the installed DMG under a
  separate disposable macOS account.
- Complete the signed-app administrator sign-in/MFA/archive UI pass. API enforcement and the renderer
  are verified independently, but entering live OTP/TOTP values into the UI requires the release
  operator's direct participation.
- Confirm the external support path and rollback owner.
- Add a public homepage/privacy/terms surface, complete Google publishing/verification, and run the
  remaining fresh-account/workspace connector matrix before describing Google or Slack as generally
  available.

## Public-site and Google-verification staging (2026-08-23 KST)

- A greenfield Sia product site now includes a public homepage, participant notice, privacy policy,
  terms, support troubleshooting, `security.txt`, sitemap, self-hosted display font, and the 120 by
  120 OAuth logo. The policy states the raw task-visible research boundary, local alternative,
  connected-service handling, Google Limited Use commitment, retention, administrator review,
  export, deletion, and no-model-training policy.
- CloudFormation stack `sia-public-site` created a private, encrypted, versioned S3 origin and
  CloudFront distribution `E3MFZH4OWO2B9C`. Only that distribution can read the bucket. Hosted
  responses redirect to HTTPS and include CSP, HSTS, framing, content-type, referrer, permissions,
  and cross-origin-opener controls. The staging URL is recorded in `public-site-launch.md`.
- Hosted desktop and 390 px mobile browser passes covered the hero, collapsed navigation, policy
  content, clean URL rewriting, and console. The final Lighthouse run scored 99 performance and 100
  for accessibility, best practices, and SEO, with 2.0 s LCP, zero CLS, zero blocking time, and no
  console errors.
- ACM certificate `c49d6024-56b4-4d0c-99b0-f4643cedf266` covers the apex and `www` names and is
  pending the two exact Namecheap validation records in `public-site-launch.md`. Existing Namecheap
  email-forwarding MX/SPF records remain untouched; the domain still has no public apex or `www` web
  record.
- Google Auth Platform project `sia-production-connectors` was re-audited under
  `superintelligentagents@gmail.com`. It remains External, Testing, one of 100 users consumed, with
  blank public URLs and `composio.dev` as its only current authorized domain. The exact non-sensitive,
  sensitive, and restricted scopes match the reviewed connector contract.
- `google-oauth-verification-packet.md` now records each scope justification, Google-data handling,
  Limited Use statement, exact public identity fields, reviewer video shot list, and submission
  order. Gmail read and compose remain restricted scopes, so release still requires Google review
  and the annual CASA assessment Google initiates after the other verification steps pass.
- `pnpm check` passed after adding the site workspace: all builds, formatting, quality guard,
  typechecks, and tests completed successfully. No connector grant or Google/Slack write was run as
  part of the public-site staging work.
