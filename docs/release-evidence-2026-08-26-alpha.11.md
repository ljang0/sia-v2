# Sia 0.1.0-alpha.11 release evidence

_Prepared 2026-08-26 KST_

## Decision

The exact `alpha.11` source is frozen, published, tagged, deployed, signed, notarized, stapled,
Gatekeeper-assessed, and available through a tested private expiring-link path. Automated local and
cloud engineering gates pass. The build is ready for operator-only Wave 0 and for named internal QA
after the release owner supplies the approved recipient list.

It is **not yet approved for external research-participant distribution**. Cohort membership must
not be inferred from existing accounts, SES production access remains denied, the exact approved
recipient list has not been supplied, and the human research/governance and advertised-capability
checks remain unsigned. Google and Slack acceptance remain separate gates for ConnectorTester Wave
2, not for participant-only Wave 1.

## Source state

- Version: `0.1.0-alpha.11` in the root and desktop package manifests.
- Exact source identity: `ad2c127480a7fb38dd7260b3d1a4ef65be5816d8`.
- Publication: source is on `origin/main`; annotated tag `v0.1.0-alpha.11` points to that exact
  commit and records both distribution hashes.
- Packaging path: secured local Mac, using the Developer ID identity and Keychain-held
  `notarytool-profile`. The absent GitHub `alpha-release` environment is therefore not part of this
  release's trust path.
- Previous signed rollback artifact: `0.1.0-alpha.10`; its hashes and notarization records remain in
  [`handoff-2026-08-26-alpha.10.md`](./handoff-2026-08-26-alpha.10.md).

## Signed distribution artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.11-universal.dmg` | 257,703,747 | `a53e767aa21917c6aeb12ee69f6bf4bef299a3073665e5e9dd4f96b652b147f8` |
| `Sia-0.1.0-alpha.11-universal.zip` | 257,030,917 | `6e9b1a7c8e79a4210b93ec1b3edbf08a04d079737eccd81bd571b7cc04abb96c` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- App bundle identifier: `ai.sia.desktop`; signed app CDHash
  `fcf2f3341d5ce782f0da36883bcc9b39bd34168b`.
- App notarization: `47daf657-1355-49d5-8ccd-f38751804ed2`, accepted.
- DMG notarization: `99f239e5-6544-4b7f-a31a-a363775757c9`, accepted.
- Deep codesign validation, app and DMG Gatekeeper assessment, DMG staple validation, universal
  architecture, packaged cloud configuration, license inventory, CUA packaging, and MCP bridge
  verification passed.
- Both immutable content-addressed objects are stored in the private, encrypted, versioned release
  bucket. A seven-day DMG URL was generated and a separate short-lived URL returned HTTP 206 for a
  1,024-byte range. The bearer URL is deliberately not committed to this repository.

## Implemented release boundary

### Named research access

- Unknown public registration requests remain enumeration-resistant and receive the generic
  accepted response, but no Cognito identity is created.
- Only an address with an existing named invite can activate an account.
- Invited identities are placed in the Cognito `Participants` group. The template creates both
  `Participants` and `ConnectorTesters`; the control Lambda has the narrowly required
  `AdminAddUserToGroup` permission.
- Research upload, schedules, and hosted Meta access require `Participants` (administrators are
  treated as participants for release operations).
- Google Workspace and Slack connection creation and connector execution require both
  `Participants` and `ConnectorTesters` (or `Admins`). Status and disconnect remain available so a
  person never loses the ability to remove an existing grant.
- The desktop receives identity-scoped feature flags and removes connector/schedule tools from new
  runtime capabilities when that identity is not eligible. A stale capability cannot be invoked
  through the action gateway after eligibility changes.

### Companion interface

- The desktop now uses a deep-evergreen dock, calm mineral-white rooms, Bricolage display type, and
  four abstract living agent forms tied to the existing hue identity slots.
- Agent name, presence, thread goal, workspace, model, and access controls form one persistent room
  header. The empty room, thread rail, conversation hierarchy, composer, settings, activity, and
  agent dialog share the same visual language.
- First run is a full-window local-first choice. **Start in local mode** is above the research form
  at compact laptop heights; invited research sign-in and the smaller connected-app test cohort are
  explained separately.
- Google Workspace is one connection group with five explicit service switches. Existing grants
  always retain visible disconnect controls even when new connector setup is unavailable.
- The public home, support, research, policy, and terms chrome uses the same identity and says
  plainly that account access is by named invitation.
- The initial cream/paper tint was removed after visual review. Light surfaces are mineral white
  with a faint sage-neutral cast; saffron remains only an agent identity accent.
- A clean-room desktop interaction pass added a `Cmd/Ctrl+K` switcher for threads, agents, and core
  actions; shortcuts for transcript search, new thread, Settings, and sidebar visibility; and a copy
  action on every transcript message. The behavioral comparison and deferred scope are recorded in
  [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md).

## Automated evidence

`pnpm check` passed on 2026-08-26 KST:

- build: all seven participating workspace projects passed;
- formatting: Prettier passed;
- quality guard: passed;
- type checking: all participating workspace projects passed;
- cloud: 114 passed;
- desktop: 300 passed;
- action gateway: 24 passed;
- runtime: 20 passed, 1 explicit real Codex-isolation smoke skipped by design;
- protocol: 3 passed;
- tool bridge: 8 passed;
- total: **469 passed, 1 skipped**.

`pnpm --filter @sia/desktop exec playwright test` passed:

- **26 passed, 4 skipped**;
- skipped tests are the opt-in real Codex, Chrome, and macOS computer-permission probes;
- coverage includes first run, persistence across relaunch, named connected-app selection,
  research consent, CSP/window lifecycle, minimum viewport, 200% zoom, forced colors, reduced
  motion, task presence, Activity, and the strict 13-case parity suite.

The visual suite now uses actual `toHaveScreenshot` assertions. Nine macOS baselines cover the
light workspace, quick switcher, providers, apps, agent dialog, Activity, compact dark workspace,
compact invited sign-in, and compact local choice. A 50-pixel tolerance is limited to font/shape
antialiasing; the suite separately asserts font load, design tokens, focus visibility, transition
coverage, and no horizontal overflow.

The fixture normalizes displayed transcript times before capture so a minute rollover cannot create
a false visual failure. The visual test then passed twice in isolation and again in the complete
Electron suite.

`sam validate --lint --template-file infra/template.yaml --region us-east-1` passed.

Current reproducible Lambda bundle hashes:

| Bundle | SHA-256 |
| --- | --- |
| control | `10d915db2069c92667c9b35185dbe50c6a04c62b7cc6c6d54a750a9e53dff771` |
| meta | `6e71e7d83c33c45c9bc63510402b4bd85b57b41dbceda3f392f94c1c74030ad2` |
| deletion | `f20b37a3566f709f0bfade155ce09ccdd965702570445a8c4e68ffdfa89c98de` |
| export | `d5c2d631eeb1f8320fa62fc0dc2752106e4a851b425fc1b3d64dcd5b7bb30077` |

These hashes describe the reproducible Lambda inputs packaged from the frozen source.

## Live environment evidence

Observed and exercised on 2026-08-26 KST:

- CloudFormation stack `sia-alpha` reports `UPDATE_COMPLETE`. The reviewed change set added
  `Participants`, `ConnectorTesters`, the private release bucket and bucket policy, plus the narrow
  `AdminAddUserToGroup` permission without replacing retained resources.
- Drift detection `b0d44670-a0c1-11f1-bf29-129b37054889` completed `IN_SYNC` with zero drifted
  resources.
- The deployed control role limits `AdminCreateUser`, `AdminGetUser`, and `AdminAddUserToGroup` to
  Cognito pool `us-east-1_D3F7ENYT5`.
- All 15 CloudWatch alarms are `OK` with actions enabled. The alarm topic has a confirmed email
  subscription.
- A unique unknown-address registration probe returned the enumeration-resistant `202`
  `{ "accepted": true }` response, while `AdminGetUser` failed before and after the request: no
  Cognito identity was created.
- The release bucket blocks all public access, reports `IsPublic: false`, uses AES-256 encryption,
  has versioning enabled, expires superseded versions after 30 days, and aborts incomplete uploads.
- SES reports `ProductionAccessEnabled: false`; the stack uses `COGNITO_DEFAULT`, with no configured
  SES source ARN or From address. The verified `superintelligentagents.ai` identity is healthy, but
  AWS previously denied production access; a repeat CLI request returned `ConflictException`.
- The coordinated public site was rebuilt, synchronized to its private origin, and invalidated
  through CloudFront distribution `E3MFZH4OWO2B9C`.
- Real no-turn probes passed for Codex authentication and macOS computer-use permissions. Real
  Codex runtime isolation also passed. Signed-in Chrome attach remains unrun because no intended
  visible Chrome window was selected.

## Required deployment and cohort rehearsal

Complete the remaining human/cohort steps against the deployed stack before participant release:

1. Add every approved named recipient to `Participants`. Add only the smaller acceptance list to
   `ConnectorTesters`. Do not infer cohort membership from an existing account.
2. Using disposable approved addresses, verify:
   - the already-passing unknown-email no-identity result remains stable;
   - a named invitation activates and receives `Participants`;
   - a participant can use core research/Meta/schedules but cannot start Google or Slack;
   - a connector tester can start and execute connectors;
   - removing `ConnectorTesters` removes connector tools on the next session refresh;
   - both cohorts can still disconnect an existing grant.
3. Re-run admin MFA, invite, archive, export, research deletion, account deletion, outbox recovery,
   feature-switch, and alarm probes on the deployed source.

## Rollout shape

- Wave 0: operators only; verify install, local mode, rollback, and cohort assignment.
- Wave 1: up to three named participants without `ConnectorTesters`; observe sign-in delivery,
  consent, outbox health, export/deletion, crashes, and support load for at least one working day.
- Wave 2: add the pre-approved connector acceptance testers only after the live Google/Slack matrix
  below passes. Keep the total invitation ceiling at 20.
- Stop the rollout on any consent mismatch, identity/cohort leak, unsynced research-data loss,
  connector access outside the tester group, repeated sign-in-delivery failure, or untriaged crash.
- Roll back with the preserved signed `alpha.10` artifact only if its older access model is still
  acceptable for the affected operator accounts; never use it to bypass the new cohort policy.

## Open gates before participant distribution

- **Approved recipients/cohorts:** supply the exact approved email list, assign only those people,
  and complete the named-invite/participant/connector-tester/removal matrix. Existing accounts are
  not evidence of approval.
- **Exact artifact profiles:** install the signed DMG on clean and upgrade macOS accounts and run the
  short acceptance pass. Packaging, signing, notarization, Gatekeeper, stapling, cloud config and
  the private download path already pass.
- **Email:** Cognito still needs monitored SES production delivery plus an unrelated-domain
  passwordless-code test. AWS denied the prior production-access request and a new CLI request
  conflicts with that closed request, so this now requires AWS support/console review rather than a
  repository change.
- **Google, before ConnectorTester Wave 2:** finish fresh read-only consent, bounded reads, editor
  upgrade, draft/Doc/Sheet/Slides write and read-back, revoke/reconnect, metadata-only audit review,
  reviewer video, verification, and any required CASA work. Never bypass Google's warning through
  automation. This does not block participant-only Wave 1 because the server and desktop remove
  connector tools for identities outside `ConnectorTesters`.
- **Slack, before ConnectorTester Wave 2:** complete read/revoke/reconnect in a second unrelated
  workspace and one human-approved benign send with an exact recipient/message preview.
- **Research governance:** every owner, checklist item, and signature in
  [`research-release-signoff.md`](./research-release-signoff.md) is still blank.
- **Voice:** complete a human microphone/playback check on the exact signed artifact. Voice is not a
  release gate unless it is advertised to the participant cohort; otherwise label it experimental.
- **Live probes:** Codex isolation, Codex no-turn, and macOS permission probes pass against the
  frozen source on this Mac. Signed-in Chrome attach remains open because Chrome currently has no
  visible window to select; the real capability turn also remains open. Deterministic-suite skips
  are intentional and are not evidence of completion.
- **Release automation follow-up:** the secured-local-Mac path produced this exact release. Create
  and protect the GitHub `alpha-release` environment before relying on CI for a later release; do
  not remove the workflow environment boundary to make the job green.

Until the human and recipient-specific gates close, describe `alpha.11` as a signed, deployed
operator/internal-QA build—not a participant-approved research release.
