# Release gate

Local CI intentionally builds an unsigned universal `.app` only to exercise both native architectures. That artifact is not distributable and must never be presented as signed or notarized.

An external alpha release must be created with `pnpm package:mac`. The command fails unless all of the following are present:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for a Developer ID Application certificate, or `CSC_NAME` for
  an installed certificate on a secured release Mac;
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for notarization, or an
  `APPLE_KEYCHAIN_PROFILE` previously validated with `xcrun notarytool store-credentials`;
- `SIA_RELEASE_API_BASE_URL`, including its API Gateway stage path;
- `SIA_RELEASE_COGNITO_REGION` and `SIA_RELEASE_COGNITO_CLIENT_ID` from the same deployed stack.

The release command writes a strict non-secret `sia-cloud.json` resource before signing. Production ignores process-environment API/Cognito destinations, so the bearer-token destination is covered by the application signature. It generates a deterministic license corpus from the installed pnpm store and copies Electron and Chromium's unmodified distribution licenses. It then builds a universal macOS 14+ app and DMG, signs both with Developer ID, notarizes and staples both, and verifies the app with `codesign --deep --strict` plus execute assessment and the DMG with strict signature plus open assessment. `xcrun stapler validate` must pass for both the app and DMG before distribution.

Packaged verification uses `file` and `lipo` to require both architectures in the main executable, Electron framework, crash handler, and all four helper executables. It checks the appropriate architecture in each CUA and UniFFI native runtime, verifies the full MPL-2.0 body and Electron/Chromium resources, dynamically probes CUA on the CI host architecture, and runs the packaged MCP bridge in Electron's Node mode. Static architecture checks do not claim to execute the non-host architecture.

The manual `signed-release` GitHub Actions job uses the protected `alpha-release` environment and uploads artifacts only after those checks pass. Missing Apple/cloud credentials are a hard blocker; the unsigned CI package must never be relabeled or distributed as a release.

The protected CI environment uses the certificate and Apple-ID variables. A secured local release
Mac may instead use `CSC_NAME` plus `APPLE_KEYCHAIN_PROFILE`; neither the app-specific password nor a
certificate export needs to be written into the repository or shell environment.

With current Electron Builder, `CSC_NAME` must omit the certificate-class prefix. For the installed
Sia identity use `CSC_NAME='Lawrence Jang (DXYJ578DD4)'`; Electron Builder resolves it to
`Developer ID Application: Lawrence Jang (DXYJ578DD4)`.

Before deploying the control plane, install a current AWS SAM CLI and run:

The release Mac may authenticate `aws` and `sam` through the standard AWS CLI profile/credentials
chain. Those credentials must remain on the secured operator Mac: do not add them to `.env`, the
packaged cloud resource, Electron storage, CI artifacts, or application code. Confirm the intended
account with `aws sts get-caller-identity` before every deployment.

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
    AlarmNotificationTopicArn="$SIA_DELETION_ALARM_TOPIC_ARN"
```

The cloud build emits bundled Node 22 Lambda entrypoints and a SHA-256 manifest under `apps/cloud/lambda/`. `aws cloudformation validate-template` is a useful syntax check when SAM is unavailable, but it does not replace SAM linting or package the local Lambda directories for deployment. Deploy only after the deletion dead-letter alarm has an operator-monitored SNS destination and after the deployed Meta streaming route is verified unbuffered.

The template uses DynamoDB on-demand capacity, SQS-backed deletion, 90-day research-object
retention, configurable Lambda concurrency reservations, and monitored alarms for backlog, errors,
and throttling. Before increasing the invite cap or concurrency parameters, use the AWS CLI to
check the account's regional Lambda quota and confirm every alarm action points to a confirmed,
operator-monitored SNS subscription.

Do not reuse the legacy `sia-cloud` sync/backup stack. The release client requires the outputs from
the `sia-alpha` control-plane template in this repository. After deployment, replace the placeholder
Meta and Composio secret values, verify the deletion alarm has a confirmed subscription, and map
`ApiBaseUrl`, `CognitoRegion`, and `DesktopClientId` to the three `SIA_RELEASE_*` variables.

Before distribution, install the signed artifact on both a clean macOS account and an account that
has run the previous Sia build. Complete `docs/manual-acceptance.md`, prepare release notes, confirm
the support path, and keep the prior signed artifact available for rollback. Alpha updates are manual;
this repository does not ship an automatic-update feed.
