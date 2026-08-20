# Sia

Sia is a local-first personal computer assistant for macOS. Creating agents, running Codex, working
with files and Git, using signed-in Chrome, controlling explicitly granted Mac apps, and running
app-open background work require neither a Sia account nor cloud credits. It keeps the interface
small while preserving the native strengths of supported provider CLIs. An optional audited cloud
gateway can add Gmail, Drive, Slack, and research sync later.

This repository is the clean v2 implementation. It intentionally does not contain the old visualization runtime, canvas, workflow engine, or provider-independent subagent system. Voice is a narrow, user-invoked ElevenLabs integration for dictation and concise read-aloud, with an optional voice per agent; it is not an autonomous voice-agent runtime.

## Alpha contract

- macOS 14 or newer.
- When a release cloud is configured, first run offers Sia sign-in before agent setup and keeps a
  clear **Continue locally** path. A cloud-disabled build goes directly to local setup and shows no
  unusable account controls.
- Local execution requires Sia to be running and the Mac to remain awake.
- Local turns keep running when the Sia window is closed on macOS, and the Activity view preserves their status when the window is reopened. Local schedules run only while the Sia process is open and the Mac is awake; they are not an always-on daemon.
- The cloud control plane handles sign-in, connected apps, the implemented-but-not-yet-live-verified Meta relay, and consented research sync. Meta stays unavailable in the alpha client until an authenticated capability check exists. The cloud does not yet provide a persistent remote computer, remote browser profile, or offline scheduled agent turns.
- Codex is the default provider through its official app-server protocol. The alpha pins Codex CLI `>=0.147.0 <0.149.0`; inherited extensions are disabled and verified before a thread starts.
- The Meta adapter targets the Sia cloud relay but remains production-disabled until an authenticated live check is implemented. Gemini, Grok, and Claude also remain production-disabled until their compatibility, isolation, and product-policy gates are satisfied.
- Apple Messages works locally: reading recent iMessages needs Full Disk Access; sending always
  passes an exact-recipient approval. WhatsApp and Slack desktop apps are readable and operable
  through granted computer use.
- Connected-app writes require an exact, expiring approval. Sia-hosted browser/computer changes run without per-action approval in the default trusted local mode (every action is bound to a live window/tab/snapshot and written to the local trajectory log); `Settings → Computer → Ask before every action` restores approvals. Read-only inspection stays background-capable and never steals focus.
- Gmail, Drive, and Slack each have an individual connection button as well as one guided sequence.
  Provider-owned OAuth consent remains separate: Google and Slack are never represented as one
  blanket permission.
- Research capture is opt-in. Local users are asked after creating their first agent, and signed-in
  users are asked after authentication, but capture remains off until they explicitly join;
  declining is remembered for that consent version. Local captures are encrypted on the Mac and
  are never made eligible for retroactive upload if cloud is added later. Only new eligible captures
  created after cloud sign-in may sync. Capture may retain prompts/responses, content-free coding
  trajectory metadata, and one bounded screenshot from an explicitly permitted non-sensitive
  read-only native-app snapshot. Browser/connected-app turns, authentication surfaces, mutations,
  reasoning, arguments/results, command output, diffs, paths, and recognized secret patterns are
  excluded. Do not paste other secrets or capture private documents in a research-consented
  conversation. Alpha data is not used for training.
- Pausing research stops collection but retains the accepted consent. The current export contains locally retained research batches only. Research deletion requests deletion of the synced cloud copy when configured and signed in, clears the local copy, and resets consent.
- Signed-in users can delete their Sia cloud account directly from Connected apps. Sia requires the exact phrase `DELETE ACCOUNT`, waits for the account-scope cloud job to report `completed`, and only then clears local Sia state and sign-in. It does not delete workspace files, provider CLI accounts, or macOS permissions.
- Provider CLIs are separately installed and authenticated by the user; they are not bundled with Sia. Sia does not inject a visualization or canvas tool into the prime agent. Its added surface is the fixed browser, computer, Gmail, Drive, and Slack gateway.
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

Architecture, security boundaries, provider policy, the local/cloud product boundary, and manual acceptance checks are documented under [`docs/`](./docs/). Start with [`docs/cloud-computer.md`](./docs/cloud-computer.md) and the dated [`cloud-provider-decision.md`](./docs/cloud-provider-decision.md) before adding remote execution or an always-on cloud scheduler.

Before inviting anyone, complete the authenticated-Chrome and deletion checklists in [`docs/manual-acceptance.md`](./docs/manual-acceptance.md). Account deletion is a signed-in, user-initiated flow under Settings → Apps; it does not require an operator to impersonate the user or submit the request for them.

Private-alpha operators should also review [`RELEASE_NOTES.md`](./RELEASE_NOTES.md),
[`PRIVACY.md`](./PRIVACY.md), [`SUPPORT.md`](./SUPPORT.md), and
[`docs/rollback.md`](./docs/rollback.md) before distributing a build.
