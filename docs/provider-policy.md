# Provider policy

Provider availability is a legal and product boundary as well as an engineering choice.

- **Codex:** official app-server ChatGPT OAuth only. This uses the person's existing Codex
  entitlement rather than importing a plan or credential into Sia. The external alpha accepts CLI
  versions `>=0.147.0 <0.154.0` plus the exact builds listed in `CODEX_SUPPORTED_VERSIONS`
  (`packages/runtime/src/providers/codex-versions.ts`) and treats the personal-plan path as unavailable until `codex login status`
  confirms ChatGPT authentication; API-billed sessions fail closed. Never inspect or copy Codex auth files.
  Sia selects the newest supported installed Codex from PATH or the official macOS app bundle,
  then uses that exact executable for sign-in checks, the live model catalog and every turn.
  GPT-6 Astra appears when that installation and account advertise it; reasoning options come
  from the same catalog. No model entitlement is invented and existing threads keep their pinned model.
- **Included model labs:** Catalog-driven OpenAI Responses or Chat Completions relays with every lab credential exclusively in AWS Secrets Manager. Muse Spark is an example entry. The cloud normalizes
  each admitted model to a Responses stream for Codex App Server. A loopback, model-scoped capability
  keeps both Sia identity and the lab key outside Codex configuration. The client
  fails closed and marks Meta ready only after a signed-in session completes the authenticated live
  capability check against the deployed relay and the configured model appears in the provider's
  live model list. Configuration plus sign-in alone never counts as readiness.
  The user-facing contract is **included for signed-in Sia accounts**, with daily request/token
  allowances, a two-turn per-account concurrency limit, and operator kill switches. The user
  supplies no Meta key; Sia owns the shared provider account.
  Internal model acceptance uses the separate `MetaTesters` Cognito group. That group grants the
  signed release and hosted-model relay only; it must not imply participant, research-upload, schedule,
  connector, or archive access.
- **Google Workspace:** use Sia's production Web OAuth client with authorization code + PKCE.
  Connect Google with the fixed read-only Gmail/Drive/Docs/Sheets/Slides scopes first; request the
  fixed editor/sender scopes only after the person chooses **Enable editing**. Each grant also
  requests Calendar and Tasks (`calendar.events.readonly` and `tasks.readonly` when connecting,
  `calendar.events` and `tasks` when enabling editing). Those scopes are optional: grants saved
  before they existed stay connected at their current level, and only the Calendar or Tasks tools
  fail, before calling Google, with a plain-language reconnect message. Encrypt refresh
  tokens with AWS KMS in the dedicated credential vault, never return them to the desktop, remove
  the superseded read credential only after the editor grant succeeds, and allow calls only to the
  fixed Google API origin set. Local service switches are enforced before an opaque connection ID
  can reach the action adapter. Google turns remain excluded from local trajectories and research
  uploads.
- **Grok Build:** protocol tests only in the external alpha. The official ACP process currently has no comprehensive, auth-preserving switch to exclude inherited plugins, skills/instructions, and MCP servers. Do not redirect `GROK_HOME`, copy credentials, or start it from production until upstream offers a verifiable isolation boundary.
- **Gemini CLI:** paid Gemini API, Vertex AI, or organizational Code Assist only, using a CLI release that advertises standard ACP session config options. Leave authentication inside the CLI; fail closed if the requested model cannot be selected and confirmed.
- **Claude:** retained for existing-thread compatibility but not offered as a new-agent choice in
  the initial release. Credentials remain owned by Claude Code and are never imported by Sia.
- **ElevenLabs voice:** Sia keeps the long-lived restricted key in AWS Secrets Manager. The desktop
  receives only native single-use tokens for batch transcription, realtime transcription, or TTS;
  a user cannot enter an ElevenLabs key and the credential is never exposed to the renderer or agent.
- **Slack:** use the Sia-owned manifest in `infra/slack-app-manifest.yaml`, never Composio's broad
  managed Slack grant. The user-token scopes are limited to workspace search (`search:read`), person
  lookup without email access (`users:read`), opening one-to-one DMs (`im:write`), reviewed sends
  (`chat:write`), and the four conversation-history scopes needed by the explicit thread-read tool.
  Do not add administrative, file, profile-write, channel-write, or email-directory scopes.

- **Outlook, Notion, and GitHub:** connected from the Mac, not the control plane, using public
  OAuth clients with no shipped secret. Outlook uses a Sia-owned Microsoft Entra app (personal and
  work accounts) with authorization code + PKCE on a loopback redirect and the delegated
  `offline_access User.Read Mail.ReadWrite Mail.Send` scopes, calling only Microsoft Graph. Notion uses
  its hosted MCP server (`https://mcp.notion.com/mcp`) with OAuth dynamic client registration and
  PKCE; Notion's page picker decides what Sia can see. GitHub uses a Sia-owned OAuth app with the
  device flow and the `repo read:user` scopes, calling only `api.github.com`. Client ids live in
  `apps/desktop/src/main/connectors/clients.ts`; an empty id hides that app's Connect button. Tokens
  are encrypted with the Keychain-held safeStorage key in one file per connection and never reach the
  renderer or model. Only the curated tools in `packages/action-gateway` are exposed; Notion's wider
  MCP tool list is never forwarded.

Provider settings keep the release choice to included access or a Codex plan. Codex's supported
range is pinned above and enforced by the main process. Sia starts the official App Server ChatGPT
browser flow, accepts only trusted OpenAI/ChatGPT HTTPS authorization URLs, waits for Codex's login
completion event, and re-verifies the ChatGPT plan. Credentials and sign-out remain owned by Codex;
Sia never silently installs, updates, or logs a provider out.

Provider CLIs remain separate user-installed products under their own authentication, billing, and license terms. Sia preserves each approved provider's native protocol/runtime boundary, while its own model-visible additions are limited to the curated browser, computer, Gmail, Calendar, Drive, Docs, Sheets, Slides, Tasks, Slack, Outlook, Notion, GitHub, Messages, and scheduling tools. Sia does not expose a visualization, canvas, raw-CDP, cookie-store, shell, or terminal tool through that added gateway.
