# Sia `0.1.0-alpha.18` JY handoff

_Prepared 2026-08-27 ET_

## Outcome

`alpha.18` is ready for JY's controlled internal use. It provides the included hosted Meta model by
default and an optional official ChatGPT login for a Codex plan. First run is intentionally small:
sign in, name the agent, and describe the work.

The exact build is signed, Apple-notarized, stapled, Gatekeeper-accepted, tagged, pushed, privately
published, and green locally and on hosted macOS.

## Give JY the build

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha18-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-03T18:30:03.487Z`; do not commit or post it publicly.

JY should:

1. Download and install `Sia-0.1.0-alpha.18-universal.dmg`.
2. Sign in to Sia with his invited email and create an agent using only its name and instructions.
3. Run a short task with **Included model**. No model-lab key or provider setup is required.
4. To use his Codex plan, open **Settings → AI → Sign in with ChatGPT**, finish the official browser
   flow, and run one short Codex task.
5. Report only the visible error text and Codex version if either path fails; never share provider
   credentials, Keychain contents, or the private download URL outside the direct handoff.

## Evidence

- Exact source/tag: `b59b9a5bee76ce14a6d0b4229361a4e83d96a892` / `v0.1.0-alpha.18`.
- Complete evidence:
  [`release-evidence-2026-08-27-alpha.18.md`](./release-evidence-2026-08-27-alpha.18.md).
- 548 runnable tests, 26 Electron E2E tests, live Meta inference, real Codex authentication and
  custom-provider smokes, signed-package verification, private-manifest verification, and GitHub
  Actions run `33102673721` passed.
- JY is currently a member of both `Operators` and `MetaTesters`.
