# Sia `0.1.0-alpha.19` JY handoff

_Prepared 2026-08-27 ET_

## Outcome

Use `alpha.19`, not `alpha.18`. This build requires Sia email sign-in before any app access, including
when an older local agent already exists. It provides the included hosted Meta model after Sia
sign-in and an optional official ChatGPT login for a Codex plan.

The exact build is signed, Apple-notarized, stapled, Gatekeeper-accepted, tagged, pushed, privately
published, green locally and on hosted macOS, and verified on a fresh packaged-app profile.

## Give JY the build

The private recipient record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha19-download.json`, mode `0600`. Copy only its
`downloadUrl` into a direct message to `jingyuk@andrew.cmu.edu`. It expires
`2026-09-03T19:18:15.713Z`; do not commit or post it publicly.

JY should:

1. Download and install `Sia-0.1.0-alpha.19-universal.dmg`.
2. Enter his email, use the emailed sign-in code, then create an agent with only its name and
   instructions.
3. Run a short task with **Included model**. No model-lab key or provider setup is required.
4. To use his Codex plan, open **Settings → AI → Sign in with ChatGPT**, finish the official browser
   flow, and run one short Codex task.
5. Sign out once and confirm the whole app returns to the email screen; signing back in should restore
   his local agent.
6. Report only the visible error text and Codex version if either model path fails; never share
   provider credentials, Keychain contents, or the private download URL outside the direct handoff.

## Evidence

- Exact source/tag: `fb055631b3997868386d970ed8440ec814dec78d` / `v0.1.0-alpha.19`.
- Complete evidence:
  [`release-evidence-2026-08-27-alpha.19.md`](./release-evidence-2026-08-27-alpha.19.md).
- 549 runnable tests, 27 Electron E2E tests, a signed-package clean-profile authentication smoke,
  live Meta inference, real Codex authentication and custom-provider smokes, signed-package
  verification, private-manifest verification, and GitHub Actions run `33107703946` passed.
- JY is currently a member of both `Operators` and `MetaTesters`.
