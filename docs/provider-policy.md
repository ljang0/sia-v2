# Provider policy

Provider availability is a legal and product boundary as well as an engineering choice.

- **Codex:** official app-server ChatGPT OAuth or user API key. This uses the person's existing Codex
  entitlement rather than importing a plan or credential into Sia. The external alpha accepts CLI
  versions `>=0.147.0 <0.150.0` and treats the CLI as unavailable until `codex login status`
  confirms either ChatGPT or API-key authentication. Never inspect or copy Codex auth files.
- **Meta:** relay implementation with the credential exclusively in AWS Secrets Manager. The client
  fails closed and marks Meta ready only after a signed-in session completes the authenticated live
  capability check against the deployed relay and the configured model appears in the provider's
  live model list. Configuration plus sign-in alone never counts as readiness.
  The participant-facing contract is **included for invited Sia alpha accounts**, with a two-turn
  per-account concurrency limit plus any upstream preview limits. Do not market the hosted API as
  permanently free; the participant supplies no Meta key, but Sia owns the shared provider account.
  Internal model acceptance uses the separate `MetaTesters` Cognito group. That group grants the
  signed release and Meta relay only; it must not imply participant, research-upload, schedule,
  connector, or archive access.
- **Google Workspace:** use Sia's production Web OAuth client with authorization code + PKCE.
  Connect Google with the fixed read-only Gmail/Drive/Docs/Sheets/Slides scopes first; request the
  fixed editor/sender scopes only after the person chooses **Enable editing**. Encrypt refresh
  tokens with AWS KMS in the dedicated credential vault, never return them to the desktop, remove
  the superseded read credential only after the editor grant succeeds, and allow calls only to the
  fixed Google API origin set. Local service switches are enforced before an opaque connection ID
  can reach the action adapter. Google turns remain excluded from local trajectories and research
  uploads.
- **Grok Build:** protocol tests only in the external alpha. The official ACP process currently has no comprehensive, auth-preserving switch to exclude inherited plugins, skills/instructions, and MCP servers. Do not redirect `GROK_HOME`, copy credentials, or start it from production until upstream offers a verifiable isolation boundary.
- **Gemini CLI:** paid Gemini API, Vertex AI, or organizational Code Assist only, using a CLI release that advertises standard ACP session config options. Leave authentication inside the CLI; fail closed if the requested model cannot be selected and confirmed.
- **Claude:** enabled through the user's installed, authenticated Claude Code CLI. Sia requires a pinned CLI release, checks `claude auth status --json`, starts non-persistent print-mode sessions, ignores inherited settings and MCP configuration, disables provider-native tools/skills/Chrome, and exposes only the short-lived Sia MCP capability. Credentials remain owned by Claude Code and are never imported by Sia.
- **Slack:** use the Sia-owned manifest in `infra/slack-app-manifest.yaml`, never Composio's broad
  managed Slack grant. The user-token scopes are limited to workspace search (`search:read`), person
  lookup without email access (`users:read`), opening one-to-one DMs (`im:write`), reviewed sends
  (`chat:write`), and the four conversation-history scopes needed by the explicit thread-read tool.
  Do not add administrative, file, profile-write, channel-write, or email-directory scopes.

Provider settings disclose billing, the detected CLI version and account when the provider reports them, and any active restriction. Codex's supported range is pinned above and enforced by the main process. Authentication and sign-out remain in the provider's own CLI or service; Sia links to those supported setup flows and never silently installs, updates, or logs a provider out.

Provider CLIs remain separate user-installed products under their own authentication, billing, and license terms. Sia preserves each approved provider's native protocol/runtime boundary, while its own model-visible additions are limited to the curated browser, computer, Gmail, Drive, Docs, Sheets, Slides, Slack, Messages, and scheduling tools. Sia does not expose a visualization, canvas, raw-CDP, cookie-store, shell, or terminal tool through that added gateway.
