# Security policy

Sia controls shell processes, local files, signed-in browser sessions, and connected applications. Treat a renderer compromise and model prompt injection as expected threat boundaries, not exceptional cases.

## Product invariants

- The Electron renderer has no Node.js access and cannot invoke shell, filesystem, Keychain, CUA, connector, or cloud APIs directly.
- All Sia-hosted browser, computer, and connector actions pass through the ActionGateway. Provider-native shell, file, public-web, image-inspection, and subagent tools remain inside each official CLI's sandbox and approval boundary; Sia does not claim to enforce those native tools.
- Sia credentials remain in macOS Keychain-backed storage or AWS Secrets Manager; provider authentication remains inside each official CLI. Credentials are never placed in a transcript, tool result, provider-visible environment variable, or renderer state.
- AWS CLI credentials are release-operator credentials only. The desktop never reads the AWS shared
  credentials/config files, receives IAM keys, or exposes the operator's AWS profile through IPC.
- Browser mutations are bound to an attached profile, native window, tab capability, and fresh snapshot (plus an approved origin in confirmation mode). Ambiguity and stale references refuse. In default autonomous mode, eligible computer, browser, connector, message, upload, and schedule actions skip in-app confirmation and are written to the local trajectory log. Confirmation mode restores exact, expiring approvals. Chrome's own security prompts are never automated.
- Sia itself, detected credential/password-manager apps, Keychain, protected credential fields, known dedicated authentication routes/origins, incognito/private windows, and security settings are denied Sia-hosted computer/browser targets. These are layered deny rules, not a universal classifier for every third-party login UI.
- Connected-app mutations are prepared, previewed, and committed using an expiring digest and idempotency key.
- Under `alpha-research-v3-raw`, exact observed turn events — including Google Workspace, Slack, Apple
  Messages, browser, computer, command, and image results — are encrypted locally and uploaded to
  the KMS-encrypted research bucket. Cloud reads require the Cognito `Admins` group and are audited.
  This consent does not weaken the credential, private-window, secure-field, Keychain, or sensitive-
  path denials above.
- Raw research objects are integrity-bound by byte length and SHA-256. Admin archive routes require
  both Cognito `Admins` membership and a configured software-token authenticator; allowed, denied,
  and failed access attempts write metadata-only records to a KMS-encrypted Object-Locked bucket.
- Research uploads, archive reads, connectors, and schedules have independent server-side feature
  switches. Disabling uploads keeps the encrypted desktop outbox intact; it does not silently
  downgrade a signed-in participant to unrecorded use.
- Apple Messages uses dedicated host capabilities. Read tools access bounded rows from `chat.db`
  only after macOS Full Disk Access; sends remain exact-recipient-and-text bound and follow the
  autonomous/confirmation setting. Sia does
  not treat the user's Apple account as an application credential.
- Model-created schedules are limited to persisted once/hourly/daily/weekly Sia tasks, scoped to the
  current thread, and mutations follow the autonomous/confirmation setting. They do not expose arbitrary cron expressions or
  shell commands and run only while Sia is open and the Mac is awake. A durable run claim and stable
  run id prevent a restart from dispatching the same claimed occurrence twice.

## Reporting

Do not open public issues containing credentials or private task data. For the invite alpha, report security concerns directly to the maintainer address supplied with the invitation. Rotate any exposed provider credential immediately.
