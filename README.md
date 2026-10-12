# Sia

Sia is a personal assistant for macOS that works in your apps for you. It is built for everyday
people without a technical background: you sign in with your email, connect an AI plan, and ask Sia
to do things on your Mac. This repository is being prepared for a controlled CMU pilot.

New tasks run through the Codex App Server harness, using an available included model or the
person's existing ChatGPT plan. Settings → AI also offers an optional **Your own API key** route
for an OpenAI Responses-compatible endpoint. Setup does not require an API key.

## Defaults at a glance

- **Use my Mac, in the background.** New profiles start on Use my Mac with action approvals
  bypassed. Confirmations (**Ask before each action**) are an explicit opt-in for supervised
  testing. **On my screen** is the alternative for watching Sia work; press ⌃Esc (Control+Escape)
  to stop a task that is using the screen.
- **Phone requests always require approval**, one request at a time, even with local approvals
  bypassed. Review in Sia, or reply YES/NO to a complete approval sent to your trusted messaging
  account when text approvals are enabled.
- **Sia-hosted tools block protected surfaces**, including password fields, sign-in screens,
  Keychain and password managers. Provider-native shell and file tools have their own boundary;
  see [architecture](./docs/architecture.md).
- **Connections are optional.** Google Workspace, Slack, Notion, GitHub and signed-in Chrome can
  be added later. Calendar, Tasks and Outlook connectors are disabled. **Use my Mac** requires its
  macOS grants before finishing setup; **Connected apps only** does not require Mac permissions.
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
| `pnpm test:pilot`                | Pilot-facing behavior: `check` plus desktop E2E, renderer and phone tests    |
| `pnpm test:remote`               | Focused phone-browser checks in Chromium and WebKit                          |
| `pnpm audit:dependencies`        | Registry advisory check; fails on high or critical findings                  |

Install the browser engines for the renderer and phone checks once with
`pnpm --filter @sia/desktop exec playwright install chromium webkit`.

Real provider and connector tests are opt-in, need explicit environment flags, and must use
disposable accounts; see [`docs/manual-acceptance.md`](./docs/manual-acceptance.md). Packaging and
notarization (`pnpm package:mac`) are release-operator tasks that need protected signing and cloud
configuration; see [`docs/release.md`](./docs/release.md).

## Documentation

- [`docs/README.md`](./docs/README.md) — every document, grouped by audience.
- [`AGENTS.md`](./AGENTS.md) — product contract, safety boundaries, and the definition of done.
- [`SECURITY.md`](./SECURITY.md), [`PRIVACY.md`](./PRIVACY.md), [`SUPPORT.md`](./SUPPORT.md), and
  [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
