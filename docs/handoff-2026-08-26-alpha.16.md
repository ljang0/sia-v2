# Sia `0.1.0-alpha.16` Codex-detection hotfix handoff

_Prepared 2026-08-26 ET_

## Outcome

`alpha.16` makes Codex login detection robust for JY and other Finder-launched macOS users. It finds
common shell/version-manager installations without executing shell configuration and recognizes a
successful CLI login without depending on one exact English status message. Explicit logged-out
responses still fail closed, and the tested Codex protocol range remains pinned.

The exact build is signed, Apple-notarized, stapled, tagged, pushed, privately published, and green
locally and on hosted macOS. It also includes all `alpha.15` Meta, research-policy, and Notes fixes.

## Give JY the replacement

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha16-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-02T19:44:23Z`; do not commit or post it publicly.

After replacing the old app, JY should open **Settings → Providers** and select **Recheck** for
Codex. He should not need to log in again if `codex login status` already succeeds in Terminal under
the same macOS account.

## Evidence

- Exact source/tag: `8730e0575c4e14d7bdf22ac054ec454b20860d42` / `v0.1.0-alpha.16`.
- Complete evidence: [`release-evidence-2026-08-26-alpha.16.md`](./release-evidence-2026-08-26-alpha.16.md).
- 500 runnable tests, 26 deterministic Electron E2E tests, the real authenticated no-turn Codex
  probe, signed-package verification, manifest verification, and GitHub Actions run `33006154771`
  passed.
- The only remaining check is JY's exact-machine **Recheck** and one disposable Codex task. Hosted
  Meta remains available independently if his local CLI version is outside Sia's tested range.
