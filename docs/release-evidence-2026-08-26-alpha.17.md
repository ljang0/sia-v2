# Sia 0.1.0-alpha.17 release evidence

_Prepared 2026-08-26 ET_

## Decision

`alpha.17` enables Claude Code as a production local provider for the approved internal cohort. The
exact source is pushed and tagged; the universal app is Developer ID signed, Apple-notarized,
stapled, Gatekeeper-accepted, privately published, and independently verified locally and on hosted
macOS.

This remains an operator/internal-QA release. It does not change or satisfy the separate external
research-participant or connector-distribution gates.

## Source and implementation

- Exact signed source: `f3a1366bb9929a3f583cfc8a7a158acd2e2e5a3e`.
- Annotated tag: `v0.1.0-alpha.17`; source and tag are pushed to `origin`.
- Claude Code is pinned to `>=2.1.238 <2.2.0` and discovered through the same bounded Finder-safe
  PATH used for Codex, including Homebrew, the standalone installer, and common version managers.
- Authentication is checked with `claude auth status --json`. Sia does not infer login from the
  existence of `~/.claude/.credentials.json`, read Claude credentials, or import provider tokens.
- Claude runs through official CLI print mode with streamed JSON, a sanitized environment,
  non-persistent sessions, empty inherited setting sources, strict MCP configuration, disabled
  slash commands and Chrome, and no provider-native tools.
- Only Sia's short-lived, session-bound MCP capability is advertised and auto-allowed. Tool actions
  still pass through the existing Sia action policy, scoping, approval posture, and trajectory path.
- System instructions and MCP configuration are written only to private mode-`0600` files in a
  mode-`0700` temporary directory. The per-turn system file is removed when the turn ends; user
  prompts and reconstructed conversation context travel over stdin and do not appear in process
  arguments. Provider session persistence is disabled.
- The default Claude model is the provider-maintained `sonnet` alias. Existing
  `claude-sonnet-4-5` agent records are normalized to `sonnet` at launch.

## GrokBot clean-room comparison

The reconstructed GrokBot code established that a small Claude route is practical: it resolves the
CLI, invokes Claude in non-persistent mode, applies strict MCP configuration, and exposes only a
routed tool namespace. Sia adopted that bounded shape but not its weaker checks:

- GrokBot checks a small path list; Sia reuses its broader, bounded Finder-safe provider path.
- GrokBot treats the presence of a Claude credential file or API-key environment variable as
  authenticated; Sia requires the CLI's live machine-readable auth result and strips ambient
  provider/API credentials from the child environment.
- GrokBot's adapter leaves more provider configuration implicit. Sia pins the CLI range and passes
  explicit flags for settings, tools, MCP, Chrome, skills, persistence, permissions, model, turn
  count, and stream format.
- Sia uses the installed official CLI directly and adds no Claude SDK dependency.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.17-universal.dmg` | 257,716,981 | `1ea2f62e090e6c802d14d7544b40fcc1b96e90f3ebc1853cea1b0cba5932e8b1` |
| `Sia-0.1.0-alpha.17-universal.zip` | 257,060,146 | `2ad5b178ad66ab473020fad066bdfc28e4169176b1b89006765a3311bdc8b6a7` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `41d3fded333fab3f6eabe92ea93e5e9bbe58b461`.
- App notarization: `65d217c5-c23e-40d2-a626-dbec2f340cd3`, accepted.
- DMG notarization: `3c126c61-6c5d-445b-b07d-e8e0a359f1b9`, accepted.
- Strict signing, Gatekeeper, staple validation, both native architectures, production cloud
  resource, release-key pinning, CUA runtime, MCP bridge, and bundled-license verification passed.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.17/1ea2f62e090e6c80/Sia-0.1.0-alpha.17-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.17/2ad5b178ad66ab47/Sia-0.1.0-alpha.17-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.17/9f9c3c9eeb32810120aa39ebbc81c5697d4bc8dc88081a5106e3cb83c2bcdf94.json`.
- Manifest SHA-256:
  `9f9c3c9eeb32810120aa39ebbc81c5697d4bc8dc88081a5106e3cb83c2bcdf94`.
- Latest and immutable manifests are byte-identical. The Ed25519 signature verifies against the key
  pinned in the app, and the signed artifact key, size, and hash match S3.
- The unauthenticated update request is denied with HTTP 401. The private recipient URL served a
  one-byte range request with HTTP 206 without exposing the URL.
- JY's mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha17-download.json`, expiring
  `2026-09-02T20:10:49.063Z`.

## Verification

- `pnpm check`: build, formatting, quality policy, type checks, and 503 runnable tests passed on the
  exact tagged source; the credential-dependent Codex and Claude isolation smokes remain opt-in in
  the aggregate run.
- `pnpm test:e2e`: 26 passed; four opt-in real-environment probes were skipped in the aggregate run.
- `SIA_CLAUDE_REAL_SMOKE=1`: the authenticated real Claude adapter completed a streamed model turn,
  invoked an allowlisted `mcp__sia__smoke_tool`, normalized tool start/completion and usage events,
  and left no Claude state in the workspace.
- GitHub Actions run `33009050275` passed the clean hosted-macOS build/quality, Electron E2E, and
  unsigned universal-package checks.
- Stack `sia-alpha` is `UPDATE_COMPLETE` and `IN_SYNC`; all 17 `sia-alpha-*` alarms are `OK`.
- JY remains scoped to `Operators` and `MetaTesters` only. Claude uses his local Claude Code account
  and requires no cloud cohort change.

## Remaining exact-machine acceptance

JY must install `alpha.17`, verify `claude --version` is in the pinned range and
`claude auth status --json` reports `loggedIn: true`, then use **Settings → Providers → Recheck**.
Claude should show ready without another sign-in. He should create a disposable Claude agent and run
one read-only Sia tool task. If detection fails, collect only `command -v claude`, `claude --version`,
and the redacted/non-secret fields from `claude auth status --json`; do not share credential files or
tokens.
