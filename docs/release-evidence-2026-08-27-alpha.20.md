# Sia 0.1.0-alpha.20 release evidence

_Prepared 2026-08-27 ET_

## Decision

`alpha.20` is ready for controlled distribution to JY as an internal operator, hosted-model tester,
research-eligible participant, and connector acceptance tester. It replaces `alpha.19` for this
recipient. It does not authorize general-public Google Workspace or Slack availability, and it does
not enable research capture until JY separately opts in from Privacy.

The separate named approvals in
[`research-release-signoff.md`](./research-release-signoff.md) remain incomplete.

## Changes from alpha.19

- Schedules now follow ordinary signed-in base access instead of research participation. Legacy and
  operator-only identities still fail closed.
- Connections shows one compact availability state: **Available for this account**, **Sign in to
  connect**, or **Not enabled for this account**. The same surface explains that a Google or Slack
  workspace administrator may need to approve access.
- JY is enrolled in `Participants` and `ConnectorTesters` in addition to his existing `MetaTesters`
  and `Operators` memberships. A deployed session probe resolves hosted models, connectors, and
  schedules to enabled; research archive and hosted voice remain disabled.

## Google Workspace and Slack boundary

- A production-stack smoke created a disposable Google read-only link and received HTTP 201 with an
  `accounts.google.com` authorization URL containing the seven reviewed identity/read-only scopes.
  The simulated user denial was consumed by the callback, returned the expected cancellation status,
  and the connection record was deleted.
- A disposable Slack link returned HTTP 201 through the Sia-owned custom Composio configuration at
  `connect.composio.dev`, then disconnected and deleted successfully.
- The disposable subject retained zero connection records and zero Google OAuth-state records after
  cleanup. No JY provider account, OAuth code, token, file, thread, or message was accessed.
- Google and Slack remain **internal alpha only**. JY must complete the provider-owned OAuth pages
  personally. The unchecked fresh-domain, second-workspace, administrator-denial, revoke/reconnect,
  and approved synthetic-write gates in
  [`connector-distribution-readiness.md`](./connector-distribution-readiness.md) remain open.

## Source and CI identity

- Exact signed source: `68108b7c48b0bdb5f058a7b67cc06d89df423255`.
- Annotated tag: `v0.1.0-alpha.20`.
- Branch and tag are pushed to `origin`.
- GitHub Actions run
  [`33132237793`](https://github.com/ljang0/sia-v2/actions/runs/33132237793) passed for the exact
  source.
- The unrelated local `codex_incident_019fb85c/` bundle was not committed or packaged.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.20-universal.dmg` | 257,723,708 | `4b411bef4589676f5c154a2356876e3b469f3bd6638ad9d98607e6a67e41c0f1` |
| `Sia-0.1.0-alpha.20-universal.zip` | 257,068,377 | `079cbfd1acd9c179fa9a278039b199b607117bd770bcb45335fc6366769c55bb` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `a80174420685a2016dc54438d1c6784ddc683559`.
- App notarization: `1cc17156-66df-40f2-9131-0f853619e109`, accepted.
- DMG notarization: `230bfa2c-60ab-4dd1-85bd-54d6fee756d0`, accepted.
- The app and DMG are stapled and Gatekeeper-accepted as Notarized Developer ID. The release verifier
  passed strict nested signatures, hardened runtime, universal Electron/helper binaries, both CUA
  and UniFFI native architectures, packaged runtime probes, licenses, and the signed cloud/update
  configuration.

## Automated and live verification

- `pnpm check` passed build, formatting, policy, type checks, and 550 runnable tests; three
  credential-dependent runtime smokes remain opt-in in the aggregate command.
- `pnpm test:e2e` passed 27 scenarios; four opt-in real-device cases were skipped.
- The exact signed package passed a fresh isolated-profile launch: version `0.1.0-alpha.20`, email
  sign-in as the only entry path, no local-mode bypass, and computer access denied before sign-in.
- The real no-turn probe passed Codex authentication and CUA permission checks. The Chrome-window
  test was skipped because no test window was selected.
- Background activity, relaunch recovery, schedules, two parallel worktrees, and persisted-state
  isolation passed the Electron suite.
- The live hosted-model capability route returned `super_nova_ext` with streaming and tool support.
- AWS stack `sia-alpha` is `UPDATE_COMPLETE`; all 17 monitored alarms report `OK`.
- The authenticated release route returns the signed `alpha.20` manifest and its exact artifact
  metadata. The recipient URL remains outside source and logs.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.20/4b411bef4589676f/Sia-0.1.0-alpha.20-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.20/079cbfd1acd9c179/Sia-0.1.0-alpha.20-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.20/9d2fcca4eab2c6e8e5c287b806be5278b0444c0fcbe0d8da5e7397cbe9405587.json`.
- JY's mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha20-download.json` and expires
  `2026-09-04T01:24:29.883Z`.

The Apple app-specific password previously supplied in chat must be revoked. Future notarization
should continue through a fresh Keychain-held credential rather than a password in chat or source.
