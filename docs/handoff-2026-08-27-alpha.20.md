# Sia `0.1.0-alpha.20` JY handoff

_Prepared 2026-08-27 ET_

## Outcome

Use `alpha.20`, not `alpha.19`. This is a signed, notarized internal-testing build with email sign-in
as the only entry path. JY can use the included hosted model, connect his official ChatGPT/Codex
plan, and test Google Workspace and Slack from the simplified Connections screen.

Google and Slack are not yet approved for general release. JY is the named internal connector
tester, and he must complete each provider's OAuth screen himself.

## Give JY the build

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha20-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-04T01:24:29.883Z`; do not commit or post it publicly.

## Minimal setup

1. Install `Sia-0.1.0-alpha.20-universal.dmg` and enter the code emailed to
   `jingyuk@andrew.cmu.edu`.
2. Create one agent with only a name and instructions. Run one short task with **Included model**;
   no model-lab key is required.
3. If desired, open **Settings → AI → Sign in with ChatGPT** and complete the official browser flow
   to use the Codex plan. Never paste a provider API key into Sia.
4. Confirm schedules are available without joining research. Leave research disabled unless JY
   explicitly chooses to participate after reviewing Privacy.

## Google Workspace test

1. Open **Settings → Connections** and confirm **Work apps — Available for this account**.
2. Select **Connect Google** and finish Google's page with JY's own account. If Google reports that
   an administrator must approve access, stop and record only the visible error text.
3. Keep the initial connection read-only. With disposable fixtures, search/read one Gmail thread,
   one Drive file, one Doc, one Sheet, and one Slides presentation. Turn at least one service off and
   confirm its tool becomes unavailable, then turn it back on.
4. Cancel one connection attempt, disconnect the successful grant, restart Sia, and reconnect. The
   app must not loop, expose a token, or retain a misleading connected state.
5. Do not choose **Enable editing** in the initial pass. Any Gmail send, share, file edit, or new
   document test needs separate approval and disposable content.

## Slack test

1. Select **Connect Slack** and choose a workspace where JY is allowed to install the Sia app. If a
   workspace administrator must approve it, stop and record only the visible error text.
2. Use disposable content to find JY's test identity, search a unique phrase, and read one thread.
3. Disconnect, restart Sia, and reconnect. Confirm Google remains independent throughout.
4. Do not open a DM or post a message in the initial pass. A write test requires an approved
   synthetic recipient and exact message preview.

For either provider, report the Sia version, the provider, the action, and visible error text. Never
share OAuth codes, tokens, cookies, Keychain data, workspace secrets, or the private download URL.

## Evidence

- Exact source/tag: `68108b7c48b0bdb5f058a7b67cc06d89df423255` /
  `v0.1.0-alpha.20`.
- Complete evidence:
  [`release-evidence-2026-08-27-alpha.20.md`](./release-evidence-2026-08-27-alpha.20.md).
- 550 runnable tests, 27 Electron E2E tests, exact signed-package authentication smoke, live
  Google/Slack link-and-cleanup smoke, live hosted-model capability check, real Codex/CUA no-turn
  checks, signed-package verification, private-manifest verification, and GitHub Actions run
  `33132237793` passed.
- JY is a member of `Participants`, `MetaTesters`, `ConnectorTesters`, and `Operators`.
