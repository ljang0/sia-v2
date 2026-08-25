# Sia `0.1.0-alpha.11` handoff

_Authoritative continuation state as of 2026-08-26 KST_

## Current state

The source implementation for the internal research release is complete, frozen, deployed, and
signed.
`alpha.11` makes the release invite-only, separates ordinary participants from connected-app
acceptance testers, and replaces the previous restrained-but-generic desktop with a more distinct
companion/room system. The yellowed paper tint identified during visual review has been replaced by
clean mineral-white surfaces.

The exact source is `ad2c127480a7fb38dd7260b3d1a4ef65be5816d8`, published on `origin/main` and
tagged `v0.1.0-alpha.11`. The `sia-alpha` stack is updated and drift-free, both release cohorts are
live, and the universal DMG/ZIP are Developer-ID signed and Apple-notarized. The private,
content-addressed distribution object was range-tested through a presigned URL.

This is ready for operator-only Wave 0 and named internal QA, but it is **not yet approved for
external research participants**. The release owner must supply the approved email list before any
cohort assignment; SES production access, clean/upgrade-account acceptance, human voice checks if
advertised, governance signatures, and the relevant live provider acceptance remain open.

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
- Tests: real screenshot assertions and nine committed macOS baseline files replace the prior
  non-asserting screenshot calls.

The required `alpha.10` Google superseded-token fix is included in the frozen `alpha.11` source.

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
- AWS: `sia-alpha` is `UPDATE_COMPLETE`; drift detection reports `IN_SYNC` with zero drifted
  resources; all 15 alarms are `OK` with actions enabled.
- Invite boundary: an unknown-address production probe returned generic acceptance and created no
  Cognito user.
- Public site: synchronized to the private origin and invalidated through CloudFront.
- Exact artifact: universal app and DMG passed deep code-sign verification, Gatekeeper, Apple
  notarization, and staple validation. DMG SHA-256 is
  `a53e767aa21917c6aeb12ee69f6bf4bef299a3073665e5e9dd4f96b652b147f8`; ZIP SHA-256 is
  `6e9b1a7c8e79a4210b93ec1b3edbf08a04d079737eccd81bd571b7cc04abb96c`.
- Distribution: private encrypted/versioned S3 object plus a tested seven-day presigned-link
  workflow. The bearer URL is never committed.

## Next operator actions, in order

1. Obtain the approved named recipient list. Assign those recipients to `Participants`, and only
   the separately approved connector subset
   to `ConnectorTesters`; run the disposable identity matrix in the evidence file.
2. Close SES production delivery, admin/research lifecycle, clean/upgrade-profile, and human
   sign-off gates before participant-only Wave 1. Close exact Google/Slack live acceptance before
   adding the separate ConnectorTester Wave 2 cohort.
3. Send only the private expiring link and recorded SHA-256 through the approved participant
   channel. Rotate the link if it escapes the recipient list.
4. Run wave 0, then the participant-only wave 1. Do not open connector access until its separate
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
  missing `alpha-release` environment and installs the required environment secrets. This release
  deliberately used the secured local Mac.
- Do not claim `alpha.11` is institutionally or participant-approved until the signed human records
  exist, even though its source, cloud stack, artifact, and private delivery path are now complete.

## Useful references

- [`release-evidence-2026-08-26-alpha.11.md`](./release-evidence-2026-08-26-alpha.11.md)
- [`handoff-2026-08-26-alpha.10.md`](./handoff-2026-08-26-alpha.10.md)
- [`release.md`](./release.md)
- [`manual-acceptance.md`](./manual-acceptance.md)
- [`research-release-signoff.md`](./research-release-signoff.md)
- [`ui-quality.md`](./ui-quality.md)
- [`connector-distribution-readiness.md`](./connector-distribution-readiness.md)
