# Sia

Sia is a personal assistant for macOS that works in your apps for you. It is built for everyday
people without a technical background: you sign in with your email, connect an AI plan, and ask Sia
to do things on your Mac. The signed Mac candidate is in acceptance testing for a controlled pilot;
see [release status](./docs/release-status.md) before distributing it.

**Reviewing Sia for Arena?** Start with the [Computer Use Arena proposal](./docs/arena-proposal.md),
then the [real-work demo guide](./docs/demo.md) for useful tasks, recorded outcomes and remaining
checks. The developer fake-services setup below is only for inspecting the UI without an account.

New tasks run through the Codex App Server harness, using an available included model or the
person's existing ChatGPT plan. Settings → AI also offers an optional **Your own API key** route
for an OpenAI Responses-compatible endpoint. Setup does not require an API key.

## Defaults at a glance

- **Use my Mac, in the background.** New profiles start on Use my Mac with action approvals
  bypassed. Confirmations (**Ask before each action**) are an explicit opt-in for supervised
  testing. **On my screen** is the alternative for watching Sia work; press ⌃Esc (Control+Escape)
  to stop a task that is using the screen.
- **Your own encrypted phone follows your Computer setting.** Requests from trusted people and
  the plain-HTTP Wi-Fi link require confirmation on the Mac. See the exact remote boundaries in
  [the product contract](./AGENTS.md).
- **Sia-hosted tools block protected surfaces**, including password fields, sign-in screens,
  Keychain and password managers. Provider-native shell and file tools have their own boundary;
  see [architecture](./docs/architecture.md).
- **Default setup includes Chrome.** Choose its task window or explicitly continue without it;
  Chrome still owns its permission prompt. Google Workspace, Slack, Notion and GitHub are optional. Calendar, Tasks and Outlook connectors are disabled. **Use my Mac** requires its
  macOS grants before finishing setup: Accessibility, Screen Recording, Automation for installed
  supported apps, and Full Disk Access for Messages history. **Set up Sia** walks those grants
  in order; macOS still requires the person to approve them. **Connected apps only** does not
  require Mac permissions.
- **Schedules** repeat until paused or deleted; one-time schedules run once. Sia must stay open and
  the Mac awake for local tasks and schedules.
- **Research capture is off** unless a person separately agrees to it. The pilot is not a research
  release.

The full product contract, safety boundaries, and change rules are in [`AGENTS.md`](./AGENTS.md).

## Follow one task through the code

1. [`apps/desktop/src/renderer`](./apps/desktop/src/renderer) renders the conversation and uses
   the typed preload bridge; it does not receive provider secrets.
2. [`apps/desktop/src/main/controller`](./apps/desktop/src/main/controller) owns the task,
   pinned model/engine, cancellation, persisted state and final result.
3. [`packages/runtime`](./packages/runtime) runs the selected provider. Codex App Server is the
   released engine; other adapters retain their explicit admission gates.
4. [`packages/action-gateway`](./packages/action-gateway) validates and authorizes Sia-hosted
   actions; [`main/actions`](./apps/desktop/src/main/actions) executes scoped computer/browser
   operations. Provider-native tools have a separate boundary described in
   [architecture](./docs/architecture.md).
5. [`main/controller/ratings.ts`](./apps/desktop/src/main/controller/ratings.ts) records task
   feedback; [`packages/protocol/src/ratings.ts`](./packages/protocol/src/ratings.ts) defines
   the strict shared payload. [Arena ratings](./docs/arena-ratings.md) explains the report.

The Mac runs tasks. The optional AWS control plane handles accounts, hosted models, connectors
and feedback; it is not a remote desktop or an always-on task runner. The iPhone app is a companion.

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

## Try real work

The [demo guide](./docs/demo.md) has copyable requests for a real reviewer packet, release-week
plan, and codebase reading guide, with actual rehearsal outcomes and independent output checks.
It also states which browser, background and concurrent-use checks remain unfinished.

## Set up

Requirements: macOS 14+, Node 24+, pnpm 11+, Xcode command-line tools, and
[rustup](https://rustup.rs) for the pinned native driver build. The first build compiles the
driver; later builds reuse verified outputs. See [native provenance](apps/desktop/native/cua/README.md).

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
