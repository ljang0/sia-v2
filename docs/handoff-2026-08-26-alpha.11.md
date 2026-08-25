# Sia `0.1.0-alpha.11` handoff

_Authoritative continuation state as of 2026-08-26 KST_

## Current state

The source implementation for the internal research release is complete and locally verified.
`alpha.11` makes the release invite-only, separates ordinary participants from connected-app
acceptance testers, and replaces the previous restrained-but-generic desktop with a more distinct
companion/room system. The yellowed paper tint identified during visual review has been replaced by
clean mineral-white surfaces.

This is **not yet a distributable build**. The working tree is uncommitted on top of
`5a673af48c14485f1b831ae5220b0b7043b02dda`, the AWS changes have not been deployed, cohort
memberships have not been assigned, and no `alpha.11` app or DMG has been signed/notarized. The
existing signed `alpha.10` artifact predates these changes.

The live remote `main` is an ancestor of local `main`, which contains 30 unpublished commits before
the current working-tree changes. Review and publish that complete fast-forward chain deliberately;
do not pull/rebase the dirty release tree or assume the stale tracking ref proves publication.

The full evidence and go/no-go list are in
[`release-evidence-2026-08-26-alpha.11.md`](./release-evidence-2026-08-26-alpha.11.md).

## What changed

- Cognito groups: `Participants` and `ConnectorTesters`.
- Account bootstrap: only a pre-existing named invite may create/activate an identity; unknown
  addresses get the same generic response without account creation.
- Core release eligibility: research upload, hosted Meta, and schedules require `Participants`.
- Connected apps: connect/upload/execute/commit/retire require `ConnectorTesters` as well;
  connection status and disconnect remain available for safe cleanup.
- Desktop capabilities: cloud feature flags are identity-scoped and live tool lists are recalculated
  whenever sign-in/cohort state changes.
- UI: persistent room header, abstract living agent forms, stronger message/composer hierarchy,
  local-first onboarding, consolidated Google Workspace controls, and coordinated public-site
  chrome.
- Desktop navigation: a clean-room `Cmd/Ctrl+K` switcher across threads, agents, and common actions;
  shortcuts for search/new thread/Settings/sidebar; and message-copy confirmation. See
  [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md).
- Palette: deep evergreen dock plus mineral white/sage-neutral rooms. Saffron, coral, sky, and mint
  are identity accents rather than page backgrounds.
- Tests: real screenshot assertions and nine macOS baseline files replace the prior non-asserting
  screenshot calls. The baselines are currently part of the uncommitted working tree and must be
  included intentionally in the freeze commit.

The `alpha.10` Google superseded-token fix remains in this working tree and is still required. Do
not discard it while reviewing or freezing `alpha.11`.

## Verification already complete

- `pnpm check`: 469 passed, 1 opt-in smoke skipped; build, Prettier, quality guard, and type checks
  passed.
- Electron Playwright: 26 passed, 4 opt-in real-environment probes skipped.
- Strict parity: all 13 cases passed as part of Playwright.
- Accessibility/layout: keyboard focus, forced colors, reduced motion, 200% zoom, minimum viewport,
  and horizontal-overflow checks passed.
- Visual regression: nine macOS baselines passed after the mineral-neutral palette adjustment,
  including the new quick switcher.
- Manual app-control review: initial empty room and new-agent dialog were exercised in the running
  development app; the abstract form and primary creation path remained visible and keyboard
  addressable.
- Read-only live probes: Codex isolation, Codex no-turn, and macOS computer-use permission checks
  passed. Signed-in Chrome attach remains open.
- SAM lint: `infra/template.yaml` is valid.

## Next operator actions, in order

1. Review `git diff` carefully because it combines the intended `alpha.10` Google fix and this
   `alpha.11` release pass. Confirm no unrelated user changes are included.
2. Freeze the exact source in the private repository and record the commit in the release evidence.
   The current local history is 30 unpublished commits ahead of the live remote before the final
   freeze commit; review and push that entire fast-forward chain.
3. Review and deploy the CloudFormation change set. Confirm no retained resource replacement. The
   current deployed stack has only `Admins`; the two release cohorts are not live.
4. Assign the approved named recipients to `Participants`, and only the approved connector subset
   to `ConnectorTesters`; run the disposable identity matrix in the evidence file.
5. Close SES production delivery, admin/research lifecycle, alarms, clean-profile, and human
   sign-off gates before participant-only Wave 1. Close exact Google/Slack live acceptance before
   adding the separate ConnectorTester Wave 2 cohort.
6. Package from the frozen source with `pnpm package:mac`; verify signing, notarization, stapling,
   architecture, packaged cloud config, licenses, CUA, and MCP bridge. Record final hashes.
7. Run wave 0, then the participant-only wave 1. Do not open connector access until its separate
   acceptance matrix passes.

## Important operational cautions

- Existing Cognito accounts are not automatically trusted as participants. Assign groups
  deliberately after reconciling the approved recipient list.
- Do not enable broad public registration to compensate for a missing invite; that would reverse
  the release boundary enforced by the code.
- Do not add all participants to `ConnectorTesters`. Connected apps are intentionally a smaller
  test cohort.
- Do not automate through Google unverified-app warnings, permission grants, passwords, MFA, or
  other provider security boundaries.
- Do not claim every opt-in real-environment probe is closed. Codex isolation, Codex no-turn, and
  macOS computer-use permissions passed; signed-in Chrome attach and the real capability turn
  remain open.
- Do not use the manual GitHub signed-release job until an administrator creates/protects its
  missing `alpha-release` environment and installs the required environment secrets. The secured
  local Mac remains a viable explicit release path.
- Do not claim `alpha.11` is signed, notarized, deployed, or institutionally approved until the
  corresponding evidence exists.

## Useful references

- [`release-evidence-2026-08-26-alpha.11.md`](./release-evidence-2026-08-26-alpha.11.md)
- [`handoff-2026-08-26-alpha.10.md`](./handoff-2026-08-26-alpha.10.md)
- [`release.md`](./release.md)
- [`manual-acceptance.md`](./manual-acceptance.md)
- [`research-release-signoff.md`](./research-release-signoff.md)
- [`ui-quality.md`](./ui-quality.md)
- [`connector-distribution-readiness.md`](./connector-distribution-readiness.md)
