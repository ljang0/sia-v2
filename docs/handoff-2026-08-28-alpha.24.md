# Sia `0.1.0-alpha.24` CMU pilot handoff

_Prepared 2026-08-28 ET_

## Outcome

Use `alpha.24`. It supersedes `alpha.22` and the unpublished `alpha.23` candidate. This is the
current signed, notarized, privately published CMU pilot build. Its clean-source CI, deterministic
Electron flows, exact packaged-app authentication wall, real Codex login probe, real computer-use
probe, and Codex custom-model harness smoke passed.

The technical build is ready for a small named CMU product pilot with research collection off.
It is not approved for public distribution or external research recruitment. The pilot owner must
still maintain the invited-recipient list and a support contact.

Do not present the included Meta model as available. Its last live upstream sentinel timed out
without model output. Codex is the recommended and tested pilot path until Meta passes a fresh live
sentinel.

## Give JY the build

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha24-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-04T22:38:43.604Z`; do not commit or post it publicly.

## Five-minute setup

1. Install `Sia-0.1.0-alpha.24-universal.dmg` and sign in with the code emailed to the invited CMU
   address. There is no signed-out or local-mode path into Sia.
2. Open **Settings → AI**, select **Sign in with ChatGPT**, and complete OpenAI's browser flow.
   Never paste an OpenAI or model-lab API key into Sia.
3. Create an agent with a name and one short instruction. Sia chooses its color and private folder;
   Codex is selected first when it is ready.
4. Run a short read-only task. Computer changes ask for confirmation by default.
5. Connect Google Workspace, Slack, Chrome, or macOS permissions only if the test requires them.

The concise pilot procedure and failure-report format are in
[`cmu-pilot-runbook.md`](./cmu-pilot-runbook.md).

## Google Workspace and Slack

JY may test both connectors with his own approved accounts. Each provider-owned OAuth screen must
be completed by JY; Sia cannot bypass a CMU or workspace administrator approval.

- Start Google read-only. Search/read disposable Gmail and Drive fixtures, disconnect, restart Sia,
  and reconnect. Do not send mail, edit, or share files in the first pass.
- In an approved Slack test workspace, search a disposable phrase and read one thread, then
  disconnect/restart/reconnect. Do not post in the first pass.
- Keep research sharing off for connector acceptance. Google Workspace turns are excluded from the
  research archive by policy, but the pilot should not depend on research capture.

## Computer use and background work

- Grant only the macOS permission needed for the test. Secure/authentication fields remain
  user-controlled, and every host-side change crosses Sia's action gateway.
- Confirmation is the default. Autonomous mode requires an explicit user choice.
- One-time schedules default to one run; recurring schedules default to ten. Sia must remain open
  for local schedules to run. This build does not claim always-on cloud computer execution.

## Evidence

- Exact source/tag: `92609ad628b55fdf9547fad9251dfbae749a731c` / `v0.1.0-alpha.24`.
- Complete evidence:
  [`release-evidence-2026-08-28-alpha.24.md`](./release-evidence-2026-08-28-alpha.24.md).
- Clean CI run `33217083496` passed quality gates, all default Electron flows, and unsigned
  universal package verification.
