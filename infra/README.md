# Sia cloud control plane

This stack is intentionally a relay/control plane. The desktop presents the Cognito ID token to the API Gateway user-pool authorizer; Cognito access tokens are not used as API bearer credentials. The desktop never receives AWS, Meta, or Composio credentials and has no direct S3 or DynamoDB permission.

Configure the desktop with the complete API output URL, including its stage path (for example, `/alpha`). Local development may inject an ID token with `SIA_DEV_ID_TOKEN`; never ship or persist that override.

## Build and deploy

1. Run `pnpm --filter @sia/cloud build`. This compiles TypeScript and creates three self-contained, content-hashed Node 22 Lambda bundles under `apps/cloud/lambda/`; CloudFormation points only at those generated directories.
2. Validate with `sam validate --lint --template-file infra/template.yaml --region us-east-1`. A successful `aws cloudformation validate-template` is only a syntax check and does not replace SAM linting.
3. Deploy with `sam deploy --guided --template-file infra/template.yaml --stack-name sia-alpha --region us-east-1 --capabilities CAPABILITY_IAM`, passing `BootstrapAdminEmail` for the first deployment, verified SES settings for a user-facing alpha, and `AlarmNotificationTopicArn` for an operator-monitored SNS topic. The stack creates alarms for deletion backlog/DLQ, Lambda errors and throttles, and DynamoDB throttling; every subscription must be confirmed before release.
4. Replace the two placeholder Secrets Manager values. Do not put either API key in CloudFormation parameters, Lambda environment variables, desktop configuration, CI logs, or source control.
5. Revoke and rotate the Meta credential that was previously pasted into chat before enabling the relay.
6. Map the deployed outputs exactly: `ApiBaseUrl` to `SIA_RELEASE_API_BASE_URL`, `CognitoRegion` to `SIA_RELEASE_COGNITO_REGION`, and `DesktopClientId` to `SIA_RELEASE_COGNITO_CLIENT_ID`. A packaged app ignores mutable `SIA_API_*` environment values and accepts cloud destinations only from its code-signed `sia-cloud.json` resource.

Research captures expire from S3 after `ResearchRetentionDays` (90 by default), while noncurrent
versions expire after 30 days. DynamoDB is on-demand and the three Lambda concurrency reservations
are deployment parameters, so raise them only after checking the regional Lambda quota and the
error/throttle alarms. The desktop bounds a local research batch below the API's 4 MiB limit and
keeps at most one eligible screenshot per turn. It retains unsynced batches, prunes synced copies
after 90 days, and evicts only the oldest synced copies if encrypted local research storage reaches
128 MiB or 500 batches.

The Meta secret schema is:

```json
{
  "enabled": true,
  "apiKey": "stored-only-in-secrets-manager",
  "endpoint": "private-entitlement-base-url",
  "model": "private-entitlement-model",
  "sessionHeader": "x-session-id",
  "allowedModels": ["private-entitlement-model"]
}
```

The Composio secret contains `apiKey`, `baseUrl`, a dated `toolVersion`, the managed OAuth `authConfigIds` for `gmail`, `google_drive`, and `slack`, and an exact `toolSlugs` mapping for the eleven canonical Sia tools. Use a scoped project key that can link/revoke accounts and execute only those reviewed tool slugs. The application does not query or expose Composio's raw catalog.

API Gateway body tracing is disabled. Lambda logging is metadata-only by code contract. Keep this invariant when adding telemetry: request bodies, provider responses, prompt content, email/file/message bodies, authorization headers, and OAuth URLs must never enter logs.

API Gateway REST response streaming requires a current AWS SAM/CloudFormation toolchain that preserves `responseTransferMode: STREAM` and the Lambda `/response-streaming-invocations` URI. Verify after deployment with `curl --no-buffer`; a buffered response is a deployment failure, not an acceptable fallback.
