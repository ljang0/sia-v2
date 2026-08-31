# Manual pilot acceptance

Use this checklist on the exact signed artifact before adding a tester. Automated checks cover the
code and deterministic flows; these checks cover provider-owned login screens, macOS permissions,
and real accounts. Use disposable, non-sensitive fixtures and keep research sharing off.

For `0.1.0-alpha.24`, record the result in the private pilot log. The source and artifact hashes are
in [`release-evidence-2026-08-28-alpha.24.md`](./release-evidence-2026-08-28-alpha.24.md).

## Automated gate

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm package:mac:dir
```

The opt-in no-turn probe may verify installed Codex login and macOS permission reporting without
consuming a model turn:

```sh
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn
```

Run Chrome probing only with a dedicated visible test window and a unique
`SIA_REAL_BROWSER_WINDOW_MATCH` value.

## Fifteen-minute pilot pass

- [ ] Install the exact signed DMG on a fresh macOS profile. Gatekeeper accepts it and Sia shows
      email sign-in before every private surface.
- [ ] Complete email one-time-code sign-in with an invited CMU address. Sign out and relaunch; no
      agent, thread, provider, connection, schedule, browser, or computer control is visible until
      sign-in succeeds again.
- [ ] In **Settings → AI**, complete **Sign in with ChatGPT** in the provider-owned browser flow.
      Cancel once, retry, and confirm Sia becomes connected without displaying or storing an OAuth
      URL, code, token, or API key.
- [ ] Create an agent using only a name and one short instruction. Confirm Sia chooses its color and
      private folder and selects Codex first when it is available.
- [ ] Run one read-only Codex task, close and reopen the window, and confirm the thread and Activity
      state remain intact.
- [ ] If Included Meta is shown, run one short read-only prompt and one tool-capability smoke. If it
      is unavailable, confirm the UI explains the state and Codex remains usable.
- [ ] Open **Settings → Computer**. Grant only the requested macOS permission and confirm host-side
      changes ask before running. Secure fields, authentication windows, password managers,
      Keychain, terminals, and Sia itself must remain unavailable as generic computer targets.
- [ ] Create one bounded schedule. Confirm a one-time schedule stops after one run and a recurring
      schedule has a finite default. Quit Sia across a due time and confirm the UI does not claim it
      ran while the app was closed.

## Optional Google Workspace and Slack pass

Only named connector testers should run this section. The tester must complete every provider-owned
OAuth or administrator screen personally.

- [ ] Connect Google once and confirm the grant covers Gmail, Drive, Docs, Sheets, and Slides while
      individual service switches still control what Sia may use.
- [ ] Search/read one disposable Gmail thread and one disposable Drive file. Do not send, edit,
      share, or delete during the first pilot pass.
- [ ] Disconnect Google, restart Sia, reconnect, and confirm the selected service switches and
      visible account identity are correct.
- [ ] Connect an approved Slack test workspace, search a unique disposable phrase, and read one
      thread. Do not post during the first pass.
- [ ] Disconnect Slack, restart Sia, reconnect, and confirm the Google grant is unaffected.
- [ ] Deny or cancel each provider once. Sia must show a recoverable error and must not retain OAuth
      URLs, codes, tokens, cookies, or a local content mirror.

Public connector distribution additionally requires the independent evidence in
[`connector-distribution-readiness.md`](./connector-distribution-readiness.md).

## Browser, deletion, and recovery

- [ ] Attach one dedicated signed-in Chrome window. Approve Chrome's own remote-debugging prompt if
      it appears; Sia must not automate that prompt. Read a permitted page, then verify an incognito
      page, password field, authentication route, stale element reference, and unapproved origin are
      refused.
- [ ] Detach and reattach Chrome. Old origins and element references must remain invalid. Restart Sia
      and confirm attachment is not silently restored.
- [ ] Enter account deletion but stop before confirmation. The action must remain disabled until the
      exact phrase `DELETE ACCOUNT` is entered.
- [ ] With a disposable Sia identity, complete deletion and confirm cloud completion occurs before
      local Sia account state is cleared. Workspace files, provider CLI login, and macOS permissions
      must remain untouched. A failed or timed-out deletion must preserve local state for retry.
- [ ] Install over the intended previous build on a disposable account. Agents, threads, provider
      detection, and one read-only workflow must survive the upgrade.

## Evidence and stop conditions

Record the Sia version, macOS version, local time, feature/provider, action, and exact visible error.
Include a screenshot only when it contains no private data. Never include credentials, OAuth
material, cookies, Keychain content, private download links, or real workspace content.

Stop distribution if any sign-in wall can be bypassed, a credential appears in logs or UI, an
unapproved side effect occurs, deletion reports success before cloud completion, the signed artifact
fails Gatekeeper, or the current included-model sentinel fails without a clear Codex fallback.

Research recruitment is a separate release. It requires every approval in
[`research-release-signoff.md`](./research-release-signoff.md) and the deployed rehearsal in
[`release.md`](./release.md); completing this pilot checklist does not satisfy those gates.
