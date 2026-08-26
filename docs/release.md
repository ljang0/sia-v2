# Release gate

The current signed-artifact evidence and remaining release gates are recorded in
[`release-evidence-2026-08-26-alpha.14.md`](./release-evidence-2026-08-26-alpha.14.md). Signing and
private publication authorize operator/internal QA only; they do not establish recipient or
research approval.
Named research, privacy, security, support, and release approval is recorded in
[`research-release-signoff.md`](./research-release-signoff.md).

Local CI intentionally builds an unsigned universal `.app` only to exercise both native architectures. That artifact is not distributable and must never be presented as signed or notarized.

An external alpha release must be created with `pnpm package:mac`. The command fails unless all of the following are present:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for a Developer ID Application certificate, or `CSC_NAME` for
  an installed certificate on a secured release Mac;
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization, or an
  `APPLE_KEYCHAIN_PROFILE` previously validated with `xcrun notarytool store-credentials`;
- `SIA_RELEASE_API_BASE_URL`, including its API Gateway stage path;
- `SIA_RELEASE_COGNITO_REGION` and `SIA_RELEASE_COGNITO_CLIENT_ID` from the same deployed stack.
- `SIA_RELEASE_UPDATE_MANIFEST_URL`, set to the stack API's `/v1/releases/macos` route, and
  `SIA_RELEASE_UPDATE_MANIFEST_PUBLIC_KEY`, set to the pinned base64url Ed25519 SPKI public key.

The release command writes a strict non-secret `sia-cloud.json` resource before signing. Production ignores process-environment API/Cognito destinations, so the bearer-token destination is covered by the application signature. It generates a deterministic license corpus from the installed pnpm store and copies Electron and Chromium's unmodified distribution licenses. It then builds a universal macOS 14+ app and DMG, signs both with Developer ID, notarizes and staples both, and verifies the app with `codesign --deep --strict` plus execute assessment and the DMG with strict signature plus open assessment. `xcrun stapler validate` must pass for both the app and DMG before distribution.

Packaged verification uses `file` and `lipo` to require both architectures in the main executable, Electron framework, crash handler, and all four helper executables. It checks the appropriate architecture in each CUA and UniFFI native runtime, verifies the full MPL-2.0 body and Electron/Chromium resources, dynamically probes CUA on the CI host architecture, and runs the packaged MCP bridge in Electron's Node mode. Static architecture checks do not claim to execute the non-host architecture.

The manual `signed-release` GitHub Actions job uses the protected `alpha-release` environment and uploads artifacts only after those checks pass. Missing Apple/cloud credentials are a hard blocker; the unsigned CI package must never be relabeled or distributed as a release.

The protected CI environment uses the certificate and Apple-ID variables. A secured local release
Mac may instead use `CSC_NAME` plus `APPLE_KEYCHAIN_PROFILE`; neither the app-specific password nor a
certificate export needs to be written into the repository or shell environment.

With current Electron Builder, `CSC_NAME` must omit the certificate-class prefix. For the installed
Sia identity use `CSC_NAME='Lawrence Jang (DXYJ578DD4)'`; Electron Builder resolves it to
`Developer ID Application: Lawrence Jang (DXYJ578DD4)`.

The release Mac may authenticate `aws` and `sam` through the standard AWS CLI profile/credentials
chain. Those credentials must remain on the secured operator Mac: do not add them to `.env`, the
packaged cloud resource, Electron storage, CI artifacts, or application code. Confirm the intended
account with `aws sts get-caller-identity` before every deployment. Before deploying the control
plane, install a current AWS SAM CLI and run:

```sh
pnpm --filter @sia/cloud build
sam validate --lint --template-file infra/template.yaml --region us-east-1
sam deploy \
  --template-file infra/template.yaml \
  --stack-name sia-alpha \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    BootstrapAdminEmail="$SIA_BOOTSTRAP_ADMIN_EMAIL" \
    AlarmNotificationTopicArn="$SIA_OPERATOR_ALARM_TOPIC_ARN" \
    EnableResearchUploads=true \
    EnableResearchArchive=true \
    EnableConnectors=true \
    EnableSchedules=true \
    EmailSendingAccount=COGNITO_DEFAULT \
    SesSourceArn="$SIA_SES_SOURCE_ARN" \
    FromEmail=
```

For `COGNITO_DEFAULT`, `SIA_SES_SOURCE_ARN` must identify the verified sender email address itself;
the `FromEmail` property is omitted because Cognito rejects it on the managed delivery path.
`COGNITO_DEFAULT` with the verified custom sender is the reviewed small-cohort alternative while
SES production access remains pending. Switch to `DEVELOPER` only after SES reports
`ProductionAccessEnabled: true` in `us-east-1`. See
[`ses-production-access-request.md`](./ses-production-access-request.md) for the resubmission wording
and the required unrelated-domain human delivery check.

The cloud build emits bundled Node 22 Lambda entrypoints and a SHA-256 manifest under `apps/cloud/lambda/`. `aws cloudformation validate-template` is a useful syntax check when SAM is unavailable, but it does not replace SAM linting or package the local Lambda directories for deployment. Deploy only after the deletion dead-letter alarm has an operator-monitored SNS destination and after the deployed Meta streaming route is verified unbuffered.

The template uses DynamoDB on-demand capacity, SQS-backed deletion and research export, multipart
S3 export, 90-day research-object retention, a versioned Object-Locked audit bucket, configurable
Lambda concurrency reservations, and monitored alarms for upload/archive failures, queue backlog,
dead letters, errors, and throttling. Before increasing the invite cap or concurrency parameters,
use the AWS CLI to check the account's regional Lambda quota and confirm every alarm action points
to a confirmed, operator-monitored SNS subscription.

Do not reuse the legacy `sia-cloud` sync/backup stack. The release client requires the outputs from
the `sia-alpha` control-plane template in this repository. After deployment, replace the placeholder
Meta and Composio secret values, verify the deletion alarm has a confirmed subscription, and map
`ApiBaseUrl`, `CognitoRegion`, and `DesktopClientId` to the three `SIA_RELEASE_*` variables.

Before distribution, install the signed artifact on both a clean macOS account and an account that
has run the previous Sia build. Complete `docs/manual-acceptance.md`, prepare release notes, confirm
the support path, and keep the prior signed artifact available for rollback.

The control-plane stack includes a separate private, encrypted, versioned release-artifact bucket.
After the exact DMG and ZIP pass signed-package verification, create an offline Ed25519 key, keep the
private PEM outside the repository with mode `0600`, and publish with:

```sh
SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE=/secure/path/sia-release-ed25519.pem \
SIA_RELEASE_MANIFEST_KEY_ID=sia-release-2026-01 \
pnpm release:publish-link
```

The script uses content-addressed artifact and manifest keys, refuses conflicting object or
same-version feed replacement, verifies the uploaded size and SHA-256 metadata, and signs canonical
manifest payload bytes. It returns the stable authenticated API URL and pinned public key for the
next signed desktop package, plus a seven-day operator distribution URL. The API serves the manifest
only to `Operators`, `MetaTesters`, `Participants`, or `Admins` and creates a fresh 15-minute S3 URL.
`Operators` receive no research-participant, hosted-model, or research-archive capability;
`MetaTesters` add only hosted Meta access. The desktop verifies the Ed25519
signature and requires that URL's AWS S3 object path equal the signed artifact key before opening
it. It does not install updates automatically.

Never place the private signing key or a bearer URL in Git, a public site, analytics, CI output, or a
shared channel. Generate a fresh operator URL only for an approved invitation batch and send it only
through the approved participant-contact path. Rotate the pinned public key only in a newly signed
application release; retain the old key while any package that pins it remains supported.

## Required live research rehearsal

The source checks are necessary but do not certify a deployed stack. Before inviting participants:

1. Confirm the deployed stack has the expected research, audit, deletion, and export queues/buckets;
   KMS encryption, public-access blocks, versioning, Object Lock, lifecycle rules, deletion
   protection, event-source mappings, reserved concurrency, and all alarm actions must match this
   template.
2. Enroll the bootstrap administrator's authenticator. Verify a non-admin receives `403`, an admin
   without MFA receives `admin_mfa_required`, and the enrolled admin can list participants, list
   batches, and read one disposable raw bundle. Confirm allowed, denied, and failed attempts appear
   as metadata-only objects in the audit bucket.
3. With a disposable participant, accept `alpha-research-v3-raw` and complete successful, failed,
   cancelled, image-bearing, and multi-batch turns. Disconnect the network long enough to create an
   outbox, reconnect, and verify every batch is acknowledged exactly once and reconstructs in order.
4. Request an export large enough to use multiple S3 parts. Verify queued → processing → completed,
   the 15-minute link, byte-length/SHA checks, worker retry, DLQ alarm, and deletion of the export
   when the participant deletes research/account data.
5. Exercise each feature switch in a non-production stack. Upload pause must retain the desktop
   outbox, archive pause must deny reads, connector pause must deny connector operations, and
   schedule pause must prevent new scheduled dispatches.
6. Trigger and recover every new alarm with disposable data. Record the stack change set, test
   identity, timestamps, alarm delivery, and cleanup in the private release log; do not place raw
   participant content in that log.

Do not mark the research release ready until this rehearsal and `docs/manual-acceptance.md` pass on
the exact deployed stack and exact signed artifact.
