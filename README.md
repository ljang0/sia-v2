# Sia

Sia is a personal assistant for macOS that works in your apps for you. It is built for everyday
people without a technical background: you sign in with your email, connect an AI plan, and ask Sia
to do things on your Mac. This repository is being prepared for a controlled CMU pilot.

Every task runs through the Codex App Server harness, using either an included model that comes with
the Sia account or the person's existing ChatGPT plan. Nobody pastes a model API key into Sia.

## Defaults at a glance

- **Use my Mac, in the background.** New profiles start on Use my Mac with action approvals
  bypassed. Confirmations (**Ask before each action**) are an explicit opt-in for supervised
  testing. **On my screen** is the alternative for watching Sia work; press ⌃Esc (Control+Escape)
  to stop a task that is using the screen.
- **Phone requests always ask on the Mac**, one request at a time, even with approvals bypassed.
- **Hard safety blocks apply in every mode.** Sia never types into password fields, sign-in
  screens, Keychain, or password managers.
- **Connections are optional.** Google Workspace, Slack, signed-in Chrome, Apple Messages, and
  computer use never block first-run setup.
- **Schedules** repeat until paused or deleted; one-time schedules run once. Sia must stay open and
  the Mac awake for local tasks and schedules.
- **Research capture is off** unless a person separately agrees to it. The pilot is not a research
  release.

The full product contract, safety boundaries, and change rules are in [`AGENTS.md`](./AGENTS.md).

## Repository map

| Path                                                   | What lives there                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| [`apps/desktop`](./apps/desktop)                       | Electron main process, typed preload bridge, React renderer, native helpers |
| [`apps/cloud`](./apps/cloud)                           | AWS control plane: sign-in, connectors, hosted model and voice relays       |
| [`apps/site`](./apps/site)                             | Static public, privacy, support, and research pages                         |
| [`packages/runtime`](./packages/runtime)               | Provider and harness resolution, supervised provider processes              |
| [`packages/action-gateway`](./packages/action-gateway) | Authorization and argument schemas for Sia-hosted actions                   |
| [`packages/tool-bridge`](./packages/tool-bridge)       | Capability-scoped transport for approved tools                              |
| [`packages/protocol`](./packages/protocol)             | Shared runtime event and request contracts                                  |
| [`infra`](./infra)                                     | Deployable AWS and connector configuration                                  |
| [`scripts`](./scripts)                                 | Repository checks behind `pnpm onboard:check` and `pnpm quality:guard`      |
| [`docs`](./docs)                                       | Architecture, operations, pilot, and policy documentation                   |

## Set up

Requirements: macOS 14+, Node 24+, pnpm 11+, and Xcode command-line tools.

```sh
pnpm install --frozen-lockfile
pnpm --filter @sia/desktop signing:setup # once per Mac; keeps permissions across dev launches
pnpm onboard:check
SIA_FAKE_SERVICES=1 pnpm dev
```

`SIA_FAKE_SERVICES=1` runs Sia against fake cloud and model services, so you need no AWS access,
API key, or paid model turn. The first-day walkthrough is
[`docs/ra-onboarding.md`](./docs/ra-onboarding.md).
The dev command builds workspace dependencies before launching; no separate build is needed.

## Test

| Command                          | When                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm --filter <workspace> test` | While developing, for the workspace you changed                              |
| `pnpm lint`                      | ESLint across every workspace (also part of `check`)                         |
| `pnpm check`                     | Before review: build, formatting, lint, quality guard, types, and unit tests |
| `pnpm test:pilot`                | Pilot-facing behavior: `check` plus desktop E2E and renderer tests           |

Real provider and connector tests are opt-in, need explicit environment flags, and must use
disposable accounts; see [`docs/manual-acceptance.md`](./docs/manual-acceptance.md). Packaging and
notarization (`pnpm package:mac`) are release-operator tasks that need protected signing and cloud
configuration; see [`docs/release.md`](./docs/release.md).

## Documentation

- [`docs/README.md`](./docs/README.md) — every document, grouped by audience.
- [`AGENTS.md`](./AGENTS.md) — product contract, safety boundaries, and the definition of done.
- [`SECURITY.md`](./SECURITY.md), [`PRIVACY.md`](./PRIVACY.md), [`SUPPORT.md`](./SUPPORT.md), and
  [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
