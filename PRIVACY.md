# Sia private-alpha privacy notice

_Effective for 0.1.0-alpha.1. This notice describes the implemented product behavior; it is not a
substitute for organization-specific legal review._

## Local data

Sia stores agents, thread configuration, transcripts, approval history, connection identifiers,
tokens, and research state in a local SQLite database whose record payloads are encrypted with
macOS Keychain-backed `safeStorage`. Workspace files remain in their existing locations. Persisted
attachment records contain names, kinds, and sizes; temporary file capabilities expire and are not
reusable arbitrary-file access.

Sia can be used without a Sia account or configured cloud. Research collected in this mode is
marked local-only. Adding cloud later does not make an existing local batch eligible for upload;
only new eligible captures created after cloud sign-in may sync.

Provider prompts and responses are sent to the provider selected for the thread under that
provider's account, terms, and billing. Sia does not copy provider credential files or silently log a
provider in or out.

## Browser and computer access

Chrome attachment is explicit and limited to observed top-level HTTP(S) origins in one approved
ordinary window. Sia does not copy cookies or attach to incognito, authentication, password, or
secure browser surfaces. Computer access requires macOS Accessibility and Screen Recording and an
explicitly granted non-sensitive window. Browsers, terminals, password managers, Sia itself,
Keychain, and security settings are excluded from generic computer targets.

The Apple Messages entry point only asks macOS to open Messages. Sia does not read the private
Messages database or copy an account credential. If the user later grants a visible Messages window
to computer use, its contents are processed only for that task under the computer-access boundary;
an outgoing action still requires explicit approval.

## Optional cloud data

The configured release control plane may process an invite-only email identity, opaque connected-app
identifiers, action previews and approval records, deletion state, quotas, and explicitly consented
research batches. Gmail, Drive, and Slack access is mediated by the configured connector provider;
exact writes require approval. The desktop receives no AWS credentials.

Research capture is off by default. Sia asks local users after they create their first agent and
asks cloud users after sign-in to review the current consent. Capture starts only after the user
explicitly joins, and a decline is remembered until the consent version changes. The v2 consent may
retain prompts and responses, content-free
coding trajectory metadata (tool name, phase, presentation kind, counts, and outcome), and at most
one size-bounded screenshot from an explicitly permitted, read-only, non-sensitive native-app
snapshot in an eligible completed turn. It excludes browser and connected-app turns,
authentication surfaces, mutations, provider reasoning, tool arguments/results, command text and
output, diffs, paths, and recognized bearer tokens, private keys, JWTs, and provider-style API keys.
Other secrets may not be detected; do not place secrets or capture private documents in a
research-consented conversation. Alpha research data is not used for training.

## Export, deletion, and retention

Research can be paused, exported, or deleted from Settings. Account deletion revokes connected apps,
removes the cloud identity and cloud research data, and clears Sia's local agents, threads, and auth
only after the cloud deletion job succeeds. Workspace files, provider CLI accounts, and macOS
permissions remain. Current cloud research objects expire after 90 days and non-current versions
after up to 30 days. Local-only and unsynced records are retained and never retroactively uploaded;
synced local copies expire after 90 days
or may be evicted oldest-first when encrypted research storage reaches 128 MiB or 500 batches. Logs
have 30-day retention. Deletion-queue failures remain for up to 14 days and raise an
operator-monitored alarm; backlog, Lambda errors/throttles, and DynamoDB throttling are also
monitored.

For access, deletion, or privacy questions, use the private alpha invitation/support channel in
`SUPPORT.md`. Never send passwords, API keys, tokens, Keychain exports, or private workspace files in
a support report.
