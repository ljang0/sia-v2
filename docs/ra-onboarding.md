# RA onboarding

This is the shortest path from a fresh clone to a useful first contribution. It uses fake services,
so it does not need AWS access, a model API key, a CMU account, or a paid model turn.

## 1. Prepare the Mac

Install macOS 14 or newer, Node 24+, pnpm 11+, Git, and Xcode command-line tools. Then clone the
repository and run:

```sh
pnpm install --frozen-lockfile
pnpm onboard:check
```

Do not create a personal `.env` for the normal fake-services path. Never copy a credential from chat,
email, a bug report, or another developer's machine into this repository.

## 2. Run Sia locally

```sh
SIA_FAKE_SERVICES=1 pnpm dev
```

In this mode, walk through first-run setup, create an agent with a name and a short instruction, send
a read-only prompt, and open Settings → Apps and Settings → Computer. A local build without cloud
configuration intentionally skips email sign-in and labels cloud features unavailable. Fake services
are deterministic; they are for UI and lifecycle development, not proof that an external provider is
healthy.

Read these files in order when you need more context:

1. [`AGENTS.md`](../AGENTS.md) — scope, boundaries, repository map, and definition of done.
2. [`architecture.md`](./architecture.md) — process and trust boundaries.
3. [`cmu-pilot-runbook.md`](./cmu-pilot-runbook.md) — the tester experience we are shipping.
4. The focused policy for your change, usually [`provider-policy.md`](./provider-policy.md),
   [`harness-policy.md`](./harness-policy.md), or [`ui-quality.md`](./ui-quality.md).

## 3. Make and verify a change

Keep the first contribution narrow: one bug, one visible behavior, and its focused test. Search before
adding a new helper or component; this repository favors a small canonical path over parallel
abstractions.

```sh
pnpm --filter @sia/desktop test
pnpm check
```

For a change that affects first run, sign-in, agents, providers, connections, computer access,
background behavior, or persisted state, finish with:

```sh
pnpm test:pilot
```

`test:pilot` is deterministic and may take several minutes. It does not replace the manual checks on
the signed artifact in [`manual-acceptance.md`](./manual-acceptance.md).

## 4. Test real capabilities safely

Only a named pilot tester should use real Codex, Google Workspace, Slack, Chrome, or macOS computer
access. Use a disposable account and non-sensitive fixtures. Provider-owned OAuth and macOS
permission prompts must always be completed by the tester, never automated or bypassed.

The opt-in no-turn probe checks only the capabilities named in its environment flags:

```sh
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn
```

Do not enable browser probing unless a dedicated Chrome test window is open and uniquely selected.
Do not run real connector sends, edits, shares, or deletes as an onboarding exercise.

## Bug report template

Include:

- Sia version and commit
- macOS version and Mac architecture
- fake or real service path
- feature/provider and exact action
- expected result, visible result, and exact visible error
- smallest reproducible sequence

Attach a screenshot only after checking it contains no private data. Never attach tokens, OAuth
codes or URLs, cookies, Keychain content, API keys, real workspace content, incident bundles, or
private release links.

If a sign-in wall is bypassed, a secret appears, an unapproved side effect occurs, or account deletion
reports success before cloud completion, stop testing and notify the pilot owner immediately.
