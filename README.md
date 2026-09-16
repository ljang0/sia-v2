# Sia

Sia is a local-first personal computer assistant for macOS. This repository contains the focused v2
implementation for a controlled CMU pilot.

The release experience has two AI paths: an included, live-verified model-lab allowance for signed-in
Sia accounts, or the user's existing Codex plan through Codex's official ChatGPT sign-in. Both run
through the Codex App Server harness. Users do not paste model API keys into Sia.

Google Workspace, Slack, signed-in Chrome, Apple Messages, computer use, and app-open schedules are
optional capabilities. Onboarding offers confirmation and full-bypass modes, with Use my Mac + full
bypass selected initially. Choose confirmations for supervised testing. Research capture is a
separate opt-in program and is not enabled by joining the pilot.

## Start developing

Requirements: macOS 14+, Node 24+, pnpm 11+, and Xcode command-line tools.

```sh
pnpm install --frozen-lockfile
pnpm onboard:check
SIA_FAKE_SERVICES=1 pnpm dev
```

New contributors should follow [`docs/ra-onboarding.md`](./docs/ra-onboarding.md). Repository rules,
the package map, safety boundaries, and the definition of done are in [`AGENTS.md`](./AGENTS.md).

## Verify a change

```sh
pnpm check
pnpm test:pilot
```

`pnpm check` builds every workspace, checks formatting and policy, type-checks, and runs unit tests.
`pnpm test:pilot` adds the deterministic desktop E2E suite. Real provider and connector tests are
opt-in and must use disposable accounts; see [`docs/manual-acceptance.md`](./docs/manual-acceptance.md).

Packaging and notarization are release-operator tasks:

```sh
pnpm package:mac
```

That command requires protected cloud and Apple signing configuration. Local contributors should not
need release credentials.

## Current release boundary

- A cloud-configured release blocks all private app surfaces until email sign-in succeeds.
- Codex uses the official app-server protocol and keeps ChatGPT credentials in Codex.
- Included model-lab credentials stay in AWS Secrets Manager; the desktop receives only scoped,
  short-lived capabilities.
- Google Workspace and Slack are separate optional connections. Chrome and Messages reuse accounts
  already configured on the Mac without copying cookies or provider credentials.
- Local work continues after the window closes, but Sia must remain running and the Mac awake.
- Claude, Gemini, Grok, OpenCode, and Pi are compatibility or evaluation paths, not new-agent choices
  in this release.

The documentation index is [`docs/README.md`](./docs/README.md). Start with the
[`CMU pilot runbook`](./docs/cmu-pilot-runbook.md), [`architecture`](./docs/architecture.md), and
[`release process`](./docs/release.md).
