# Sia `0.1.0-alpha.22` JY handoff

_Prepared 2026-08-27 ET_

## Outcome

Use `alpha.22`, not `alpha.20` or `alpha.21`. This is the current signed, notarized internal-testing
build with email sign-in as the only entry path. JY can test his ChatGPT/Codex plan, computer use,
app-open schedules, Google Workspace, and Slack.

Do not present the included Meta model as available right now. Meta's endpoint returned no output in
the release smoke. Sia now stops cleanly after 45 seconds and directs the user to Codex, but a fresh
successful sentinel is required before included-model testing resumes.

Google and Slack are not approved for general release. JY is the named internal connector tester,
and he must complete each provider's OAuth screen himself.

## Give JY the build

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha22-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-04T02:15:07.596Z`; do not commit or post it publicly.

## Minimal setup

1. Install `Sia-0.1.0-alpha.22-universal.dmg` and enter the code emailed to
   `jingyuk@andrew.cmu.edu`. There is no signed-out or local-mode path into the app.
2. Open **Settings → AI → Sign in with ChatGPT** and complete the official browser flow. Never paste
   an OpenAI or model-lab API key into Sia.
3. Create an agent with only a name and instructions; Sia chooses its color and private workspace.
   Choose Codex and run one short read-only task.
4. Check macOS permissions before a computer-use task. Sia can use only the surfaces JY explicitly
   grants; secure/authentication fields remain user-controlled.
5. Schedules work while Sia's local process remains active. Quitting Sia stops local schedules; the
   alpha does not claim always-on cloud computer execution.
6. Leave research disabled unless JY separately opts in after reviewing Privacy.

## Google Workspace test

1. Open **Settings → Connections** and confirm **Work apps — Available for this account**.
2. Select **Connect Google** and finish Google's page with JY's own account. If an administrator must
   approve access, stop and record only the visible error text.
3. Keep the initial connection read-only. With disposable fixtures, search/read one Gmail thread,
   one Drive file, one Doc, one Sheet, and one Slides presentation. Turn one service off and confirm
   its tool becomes unavailable, then turn it back on.
4. Cancel one connection attempt, disconnect the successful grant, restart Sia, and reconnect. The
   app must not loop, expose a token, or retain a misleading connected state.
5. Do not choose **Enable editing** in the initial pass. Gmail send, sharing, file edits, or new
   document tests require separate approval and disposable content.

## Slack test

1. Select **Connect Slack** and choose a workspace where JY may install the Sia app. If a workspace
   administrator must approve it, stop and record only the visible error text.
2. Use disposable content to find JY's test identity, search a unique phrase, and read one thread.
3. Disconnect, restart Sia, and reconnect. Confirm Google remains independent throughout.
4. Do not open a DM or post a message in the initial pass. A write test requires an approved
   synthetic recipient and exact message preview.

For either provider, report the Sia version, provider, action, and visible error text. Never share
OAuth codes, tokens, cookies, Keychain data, workspace secrets, or the private download URL.

## Evidence

- Exact source/tag: `9ede0bec8a4d3ff2d49333b6b5876dc696c5a6aa` /
  `v0.1.0-alpha.22`.
- Complete evidence:
  [`release-evidence-2026-08-27-alpha.22.md`](./release-evidence-2026-08-27-alpha.22.md).
- Exact-source CI, the default Electron suite, exact notarized-package authentication smoke, live
  Google/Slack link-and-cleanup smokes, real Codex/CUA no-turn checks, Codex isolation, signed-package
  verification, and authenticated private-manifest verification passed.
- JY is a member of `Participants`, `MetaTesters`, `ConnectorTesters`, and `Operators`.
