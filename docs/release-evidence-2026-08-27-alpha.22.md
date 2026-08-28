# Sia 0.1.0-alpha.22 release evidence

_Prepared 2026-08-27 ET_

## Decision

`alpha.22` is ready for controlled internal distribution to JY for email authentication, Codex,
computer-use, schedules, and Google Workspace/Slack connector acceptance. It supersedes
`alpha.20` and `alpha.21`.

It is **not a full external-release approval**. During final live verification, Meta's configured
inference endpoint accepted connections but returned no response bytes. Sia now stops that request
after 45 seconds, emits a readable `meta_upstream_timeout` stream event, tells the user to retry or
use their Codex plan, and releases the concurrency lease. The included model must not be described
as working out of the box until a fresh live sentinel receives model output. The named approvals in
[`research-release-signoff.md`](./research-release-signoff.md) and the public connector gates also
remain incomplete.

## Changes from alpha.20

- Hosted-model capability discovery has a 10-second upstream deadline and inference has a
  45-second deadline.
- Upstream timeouts and availability failures are converted to actionable, recoverable stream
  errors instead of a five-minute wait or API Gateway 502.
- The Lambda writes and flushes a valid HTTP 200 SSE error frame even when failure happens before
  the model emits its first token.
- An expired DynamoDB concurrency lease can be recovered safely after an interrupted invocation.
- The provider credential remains server-side in AWS Secrets Manager and is never requested by or
  stored in the desktop app.

## Live hosted-model result

- The authenticated capability route returns `super_nova_ext` with streaming and tool support.
- A disposable user in `Users` and `MetaTesters` submitted the same authenticated SSE request shape
  used by the desktop.
- Result: HTTP 200 in 45 seconds with `meta_upstream_timeout` and the user-facing fallback “Try
  again or use your Codex plan.”
- The user's quota record returned to `active = 0`; the disposable Cognito user and its quota/usage
  records were deleted.
- Direct streaming and non-streaming probes of the configured upstream had likewise received zero
  bytes. This isolates the remaining failure to the model provider rather than Sia authentication,
  API Gateway framing, or quota cleanup.

## Google Workspace and Slack boundary

- A production-stack smoke created a disposable Google read-only link and received HTTP 201 with an
  `accounts.google.com` authorization URL containing the seven reviewed identity/read-only scopes.
  Cancellation was handled and all connection/OAuth-state records were removed.
- A disposable Slack link returned HTTP 201 through the Sia-owned Composio configuration at
  `connect.composio.dev`; disconnect and record cleanup succeeded.
- No JY provider account, OAuth code, token, file, thread, or message was accessed. JY must complete
  both provider-owned OAuth pages personally.
- Google and Slack remain internal alpha only. Fresh-domain, second-workspace,
  administrator-denial, revoke/reconnect, and approved synthetic-write gates in
  [`connector-distribution-readiness.md`](./connector-distribution-readiness.md) remain open.

## Source and CI identity

- Exact signed source: `9ede0bec8a4d3ff2d49333b6b5876dc696c5a6aa`.
- Annotated tag: `v0.1.0-alpha.22`.
- Branch and tag are pushed to `origin`.
- GitHub Actions run
  [`33134534489`](https://github.com/ljang0/sia-v2/actions/runs/33134534489) passed for the exact
  source.
- The unrelated local `codex_incident_019fb85c/` bundle was not committed or packaged.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.22-universal.dmg` | 257,727,028 | `e2a49b65173c93917425824c080ce6a99cb28661627de8e8fd8916d64ef7cddd` |
| `Sia-0.1.0-alpha.22-universal.zip` | 257,068,294 | `93b57afa313b8954d6400bdc07879d0a3ec688b40f80ff85e94a1c8157111d8b` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `44cf4e8d29a05986f28f27059237103e00d55134`.
- DMG notarization submission: `85dc062e-9a0e-4c69-a1fb-cb43d8715172`, accepted.
- The DMG is stapled and Gatekeeper-accepted as Notarized Developer ID. The release verifier passed
  strict nested signatures, hardened runtime, universal Electron/helper binaries, both CUA and
  UniFFI native architectures, packaged runtime probes, licenses, and signed cloud/update config.

## Automated and live verification

- `pnpm check` passed build, formatting, policy, type checks, and 552 runnable tests before the
  final stream-flush change; targeted cloud tests/type checks and exact-source CI passed afterward.
- `pnpm test:e2e` passed all 27 default Electron scenarios; four opt-in real-device scenarios were
  skipped in that aggregate run.
- The exact notarized package passed a separate fresh-profile launch: version
  `0.1.0-alpha.22`, email sign-in as the only entry path, no local-mode bypass, no signed-out agent
  data, and computer access denied before sign-in.
- The real no-turn suite passed installed Codex authentication and CUA permission checks. Chrome
  attachment was skipped because no test window was selected.
- The real Codex isolation smoke passed.
- Background activity/relaunch recovery, local app-open schedules, parallel worktrees, and
  persisted-state isolation passed the Electron suite. Quitting Sia stops this alpha's local
  schedules; always-on cloud execution is not claimed.
- AWS stack `sia-alpha` is `UPDATE_COMPLETE`; all 17 monitored alarms were `OK` at the release
  check.
- A disposable signed-in user fetched the authenticated `alpha.22` update manifest. Its signed
  artifact hash exactly matched the DMG, and a byte-range request to the private artifact returned
  HTTP 206.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.22/e2a49b65173c9391/Sia-0.1.0-alpha.22-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.22/93b57afa313b8954/Sia-0.1.0-alpha.22-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.22/37f5d8746cf207cedc3d74b7c3de74668420f7efb565d64c72e24585371b08e7.json`.
- JY's mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha22-download.json` and expires
  `2026-09-04T02:15:07.596Z`.

The Apple app-specific password previously supplied in chat must be revoked. Future notarization
should continue through a fresh Keychain-held credential rather than a password in chat or source.
