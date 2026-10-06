# Working in Sia

This repository is preparing a controlled CMU pilot of the macOS desktop app. Keep changes small,
safe, and easy for a new contributor to verify.

## First 15 minutes

Requirements: macOS 14+, Node 24+, pnpm 11+, and Xcode command-line tools.

```sh
pnpm install --frozen-lockfile
pnpm --filter @sia/desktop signing:setup # once per Mac
pnpm onboard:check
SIA_FAKE_SERVICES=1 pnpm dev
```

Use `pnpm test:pilot` before handing off a pilot-facing change. It runs the build, formatting,
lint, quality, type, unit, deterministic desktop E2E, and renderer gates. See
[`docs/ra-onboarding.md`](./docs/ra-onboarding.md) for the first-day walkthrough.

## Product contract

- Design for everyday consumers without technical backgrounds. Use plain language, sensible
  defaults, and short setup flows. Keep advanced configuration and developer concepts out of the
  main path; introduce optional features when people need them.

- A release with cloud configured has no private app access before email sign-in.
- New agents offer an included model when live-verified or the user's existing Codex plan. Both use
  the Codex App Server harness. Codex is the default. An optional **Your own API key** in
  Settings → AI (never in onboarding) adds one OpenAI Responses-compatible model, also run through
  Codex App Server. That key is write-only from the renderer, stored encrypted outside the state
  JSON, and attached only by a loopback proxy; Codex, the renderer, IPC results, and logs never
  receive it.
- Use my Mac setup requires every macOS permission Sia uses: Accessibility, Screen Recording,
  Automation for each installed everyday app, and Full Disk Access for Messages history. One **Set
  up Sia** click walks them in order; macOS still approves each one, and Start using Sia stays off
  until all are on. Fn voice stays optional because it also needs a voice service. Google
  Workspace, Slack, GitHub, Notion, and signed-in Chrome stay optional, and the Connected apps only
  route needs no Mac permissions. Calendar, Tasks, and Outlook connectors remain disabled.
- Bypass (no per-action approvals) is the default for every route, including profiles that never
  chose; confirmations are an explicit opt-in (onboarding's Customize setup → Ask before each
  action, or Settings → Computer). Onboarding's initial selection is Use my Mac with bypass. Use my
  Mac works in the background by default (window control through the bundled Cua driver); On my
  screen is the explicit alternative. Use confirmations for supervised pilot testing. Approval
  cards offer Approve, Allow for this task (equivalent requests until that task ends), and Don't
  allow. Phone-remote turns always require confirmation, one request at a time. When text approvals are
  enabled, YES/NO binds only to the exact pending request shown to that trusted sender. Hard safety blocks apply in every mode: Sia-hosted tools block secure fields,
  authentication surfaces, Keychain, and password managers. Native shell execution follows the
  provider's approval boundary; the same restrictions in its prompt are not shell enforcement.
- Local turns and schedules require the Sia process to remain open and the Mac to stay awake. Sia
  keeps the display awake during Use my Mac tasks and pauses them if the Mac locks or sleeps.
- Research capture is off unless the user separately consents. A pilot is not a research release.

## Repository map

- `apps/desktop` — Electron main process, typed preload bridge, React renderer, and desktop tests.
- `apps/cloud` — AWS control-plane handlers and connector/model relays.
- `apps/site` — static public, privacy, support, and research pages.
- `packages/runtime` — provider/harness resolution and supervised provider processes.
- `packages/action-gateway` — authorization for Sia-hosted actions. Native tools use the provider boundary.
- `packages/tool-bridge` — capability-scoped transport for approved tools.
- `packages/protocol` — shared runtime event and request contracts.
- `infra` — deployable AWS and connector configuration.
- `docs` — current architecture, operations, pilot, and acceptance records.

The Claude, Gemini, Grok, OpenCode, and Pi seams are deliberate compatibility or evaluation paths.
They are not release choices. Do not delete them as “unused,” and do not expose them without the
admission checks in [`docs/harness-policy.md`](./docs/harness-policy.md).

## Change rules

- Prefer deleting obsolete paths over adding compatibility shims. Keep one canonical route per UI
  action and update its tests in the same change.
- Keep secrets and provider credentials out of the renderer, IPC payloads, logs, fixtures, commits,
  screenshots, and bug reports. Production secrets belong in AWS Secrets Manager or protected
  release automation.
- Extend the provider catalog, execution resolver, and signed harness registry when adding a model
  or harness. Do not scatter provider-name conditionals through the UI.
- Sia-hosted browser, computer, connector, Messages, and schedule actions must pass through
  `packages/action-gateway` and capability validation in the desktop main process. Use my Mac's
  native shell and file tools instead run through Codex's approval boundary, as documented in
  [`docs/architecture.md`](./docs/architecture.md).
- The renderer must use the typed preload bridge. Do not add generic IPC, raw CDP/JavaScript,
  cookie access, arbitrary shell tools, or a model-visible terminal.
- Preserve encrypted local state migrations and existing-thread routes. A new thread pins its
  resolved provider, model, harness, and credential source.
- Keep documentation current instead of adding dated duplicates. Historical evidence belongs in
  Git history or a release tag.

## Verification ladder

1. During development, run the nearest workspace test (`pnpm --filter <workspace> test`).
2. Before review, run `pnpm check`. It includes `pnpm lint` (type-aware ESLint).
3. For pilot-facing behavior, run `pnpm test:pilot`.
4. Run real-provider probes only with explicit environment flags and disposable test accounts. The
   no-turn probe must not consume a model turn or mutate a web account.
5. Packaging and notarization are release-operator tasks; follow [`docs/release.md`](./docs/release.md).

A change is done when its focused behavior is tested, `pnpm check` passes, user-facing docs match,
no credentials or generated release artifacts are staged, and the diff contains no unrelated churn.
