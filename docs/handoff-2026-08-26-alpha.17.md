# Sia `0.1.0-alpha.17` Claude-provider handoff

_Prepared 2026-08-26 ET_

## Outcome

`alpha.17` makes an existing Claude Code login usable inside Sia with the same Finder-safe discovery
approach added for Codex. Claude is now a real streamed local provider with Sia tools, bounded
conversation continuity, cancellation, attachments-by-path, usage events, and no provider session
persistence.

The exact build is signed, notarized, stapled, tagged, pushed, privately published, and green locally
and on hosted macOS. The real Claude isolation smoke completed both inference and an allowlisted Sia
MCP tool call.

## Give JY the replacement

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha17-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-02T20:10:49.063Z`; do not commit or post it publicly.

After replacing the old app, JY should:

1. Run `claude --version` and update Claude Code if it is outside `>=2.1.238 <2.2.0`.
2. Run `claude auth status --json`; `loggedIn` must be `true`.
3. Open **Sia → Settings → Providers** and choose **Recheck** for Claude.
4. Create a Claude agent using model `sonnet` and run one disposable read-only task.

Claude uses the account and billing already configured in Claude Code. Sia neither bundles Claude
Code nor copies its credentials.

## Evidence

- Exact source/tag: `f3a1366bb9929a3f583cfc8a7a158acd2e2e5a3e` / `v0.1.0-alpha.17`.
- Complete evidence:
  [`release-evidence-2026-08-26-alpha.17.md`](./release-evidence-2026-08-26-alpha.17.md).
- 503 runnable tests, 26 deterministic Electron E2E tests, the real authenticated Claude+MCP smoke,
  signed-package verification, manifest verification, and GitHub Actions run `33009050275` passed.
- The only Claude-specific remaining gate is JY's exact-machine Recheck and one disposable task.
  Hosted Meta and local Codex remain available independently.
