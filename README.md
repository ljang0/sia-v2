# Sia

Sia is a local-first personal computer assistant for macOS. A release build starts with email sign-in,
then keeps agent history and local work available from the cached verified account while offline.
Sia includes a daily allowance for catalog-driven model labs (Muse Spark is one example); people may
alternatively use an existing Codex plan through Codex's official sign-in. Both choices run through
the Codex App Server harness. The optional research program uses an
audited AWS control plane for consented raw research sync, export, and deletion;
Gmail, Drive, Docs, Sheets, Slides, and Slack remain separately gated optional capabilities.

This repository is the clean v2 implementation. It intentionally does not contain the old visualization runtime, canvas, workflow engine, or provider-independent subagent system. Voice is a narrow, included, user-invoked ElevenLabs integration for dictation and concise read-aloud, with an optional voice per agent; it is not an autonomous voice-agent runtime and requires no user API key.

## Alpha contract

- macOS 14 or newer.
- When a release cloud is configured, first run requires Sia email sign-in before agent setup. A
  cloud-disabled development build goes directly to local setup and shows no unusable account
  controls. Research enrollment is optional and separate from the base account. Google Workspace
  and Slack are optional Settings connections, not
  an onboarding gate. **Connect Google** performs one Google-owned OAuth approval for Gmail, Drive,
  Docs, Sheets, and Slides; **Connect Slack** performs one separate Slack-owned approval. People can
  still choose which connected services Sia may use and can reconnect or disconnect later.
- Local execution requires Sia to be running and the Mac to remain awake.
- Local turns keep running when the Sia window is closed on macOS, and the Activity view preserves their status when the window is reopened. The agent can create, list, update, and delete persisted once/hourly/daily/weekly schedules after approval. They run only while the Sia process is open and the Mac is awake; they are not an always-on daemon or OS cron job.
- The cloud control plane handles sign-in, connected apps, authenticated live-verified model-lab relays,
  and consented research sync. Included Meta is advertised only after a signed-in user passes the live
  model, streaming, tool-capability, and local Codex-harness checks. The cloud does not yet provide a persistent remote
  computer, remote browser profile, or offline scheduled agent turns.
- Codex is a local provider through its official app-server protocol. It uses the person's existing
  ChatGPT Codex entitlement; API-billed logins are rejected. **Settings → AI → Sign in with
  ChatGPT** starts Codex App Server's official browser flow, then Sia checks `codex login status`.
  Sia never reads or imports Codex credentials. The alpha pins Codex CLI
  `>=0.147.0 <0.151.0`; inherited extensions are disabled and verified before a thread starts.
- Lab-funded models are included for signed-in Sia accounts through the Sia-owned AWS relay, so a person
  does not enter a model key. The desktop gives Codex only a random, model-scoped loopback capability;
  Sia identity and the lab's permanent API key remain outside the Codex process. The relay has
  per-account daily request/token limits, concurrency limits, and operator kill switches. Claude,
  Gemini, Grok, OpenCode, and Pi are not offered as new-agent choices in this release.
- Apple Messages works locally: reading recent iMessages needs Full Disk Access; sending is bound to
  an exact recipient and message. WhatsApp can use granted computer control. Slack uses its connected
  app path for dependable person lookup, DM resolution, message search, thread reads, and reviewed
  sends; desktop-window accessibility is not treated as a reliable Slack integration.
- Sia asks before host-side changes by default. A person can explicitly enable autonomous mode for
  eligible computer, browser, connector, message, upload, and schedule actions; those actions remain
  bounded to validated targets and are written to a per-thread local trajectory log for at most 90
  days or 128 MiB. Hard blocks for credential fields, private browser surfaces, and sensitive apps
  remain in every mode.
- Gmail, Drive, Docs, Sheets, and Slides share one optional Google Workspace connection in Settings;
  Slack remains a separate connection. Service toggles and per-app controls determine which tools
  Sia may use after the account grant. If an optional connector is absent, Sia can continue in a
  signed-in Chrome window through browser or computer use; connectors remain the reliable path for
  API and background access. Google and Slack are never represented as one blanket permission.
  Connection setup, provider-page opening, success, failure, timeout, and
  disconnection are recorded in the local trajectory and the consented encrypted AWS research
  stream without retaining OAuth URLs, codes, or tokens.
- Research capture is opt-in and separately entitled. Under the v3 raw consent, Sia queues
  the exact observed turn stream for AWS upload: prompts, responses, surfaced reasoning, provider
  events, commands and output, tool arguments/results, approvals, browser/computer events, connected-
  app results, paths/diffs, errors, and captured images. Bundles are organized by participant,
  thread, turn, sequence, and event type; authorized admins can inspect them in the audited Research
  archive. Sia still does not obtain provider credentials, Chrome cookies, Keychain contents, secure
  fields, or hidden credentials outside the task surface. Raw task content can contain private data
  or secrets, so the consent dialog must be read before joining. Alpha data is not used for training.
- Research participants may pause research while retaining accepted consent. Unsynced records remain in the
  encrypted outbox until AWS acknowledges them; Sia will not silently discard them to satisfy a
  cache limit or during sign-out. Signed-in export is prepared asynchronously from the complete
  uploaded archive, while local-only export contains locally retained batches. Research deletion
  removes the active cloud copy when configured, clears the local copy, and resets consent.
- Signed-in users can delete their Sia cloud account directly from Connected apps. Sia requires the exact phrase `DELETE ACCOUNT`, waits for the account-scope cloud job to report `completed`, and only then clears local Sia state and sign-in. It does not delete workspace files, provider CLI accounts, or macOS permissions.
- The Codex CLI is separately installed and is not bundled with Sia. A personal Codex plan remains
  authenticated by Codex; Sia detects the official login and does not copy it. The included model
  catalog instead requires a signed-in Sia account but no ChatGPT login or user API key. Sia
  does not inject a visualization or canvas tool into the prime agent. Its added surface
  is the fixed browser, computer, Gmail, Drive, Docs, Sheets, Slides, Slack, Messages, and scheduling
  gateway.
- The Apps page also exposes local Chrome and Apple Messages entry points. Chrome reuses only an
  explicitly selected signed-in window and never copies cookies. The Messages button opens the
  account already configured in Apple Messages; Sia does not read `chat.db`, copy message history,
  or silently send messages.

## Local workspace surface

The desktop app now includes the local workflow needed for long-running coding work: native file
attachments, per-thread Codex model and reasoning controls, archive/fork/transcript search, goals,
app-open schedules, Activity and interruption recovery, native completion notifications, Git diff
review with stage/confirmed restore, an intentionally one-shot workspace terminal, and detached Git
worktrees for parallel forks. Terminal access is a user-operated UI capability; it is not added to
Sia's model-visible action gateway.

The terminal is deliberately scoped rather than a persistent interactive PTY. Browser attachment
reuses a signed-in Chrome window — the frontmost one automatically in trusted mode, or one you pick
in ask mode — for the current process; ask mode also limits actions to observed HTTP(S) origins. Neither browser grants nor local schedules become a cloud or login-time background service.

## Development

Requirements: Node 24+, pnpm 11+, Xcode command-line tools, and macOS.

```sh
pnpm install
pnpm dev
```

Quality gates:

```sh
pnpm check
pnpm test:e2e
pnpm test:e2e:parity:strict
pnpm package:mac:dir
```

`pnpm check` builds every workspace before static checks and tests, so it also works from a clean checkout with no generated package output.

Set `SIA_FAKE_SERVICES=1` for deterministic local development. The strict parity suite exercises the
complete local workflow contract, including real temporary Git repositories and concurrent detached
worktrees. The opt-in real-service smoke probes Codex authentication, Chrome attachment, and macOS
computer permissions without consuming a model turn or changing a web account:

```sh
SIA_REAL_CODEX_E2E=1 \
SIA_REAL_BROWSER_ATTACH_E2E=1 \
SIA_REAL_CUA_E2E=1 \
pnpm test:e2e:real:no-turn
```

Authenticated-site actions and foreground computer mutations still require the disposable-account
manual acceptance pass below before an external alpha release.

`pnpm package:mac` is the external-release gate, not a local development command. It requires an enabled packaged cloud configuration plus Apple Developer ID/notarization credentials, then verifies the hardened signature, Gatekeeper assessment, notarization staple, macOS 14 minimum, universal app/helper binaries, packaged CUA/UniFFI runtimes, license resources, and tool bridge. See [`docs/release.md`](./docs/release.md).

Architecture, security boundaries, provider and [harness policy](./docs/harness-policy.md), the
local/cloud product boundary, and manual acceptance checks are indexed in
[`docs/README.md`](./docs/README.md).
Start with [`docs/cloud-computer.md`](./docs/cloud-computer.md) and the dated
[`cloud-provider-decision.md`](./docs/cloud-provider-decision.md) before adding remote execution or
an always-on cloud scheduler.

Before inviting anyone, complete the authenticated-Chrome and deletion checklists in [`docs/manual-acceptance.md`](./docs/manual-acceptance.md). Account deletion is a signed-in, user-initiated flow under Settings → Apps; it does not require an operator to impersonate the user or submit the request for them.

Private-alpha operators should also review [`RELEASE_NOTES.md`](./RELEASE_NOTES.md),
[`PRIVACY.md`](./PRIVACY.md), [`SUPPORT.md`](./SUPPORT.md), and
[`docs/rollback.md`](./docs/rollback.md) before distributing a build.
