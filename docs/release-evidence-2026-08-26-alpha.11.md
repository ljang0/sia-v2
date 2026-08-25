# Sia 0.1.0-alpha.11 release evidence

_Prepared 2026-08-26 KST_

## Decision

The `alpha.11` source candidate is ready for controlled internal QA, but it is **not yet approved
for participant distribution**. Local builds, unit/integration checks, the fake-service Electron
suite, accessibility checks, visual regression, strict parity, and SAM lint all pass. The deployed
AWS stack, named Cognito cohort memberships, signed/notarized artifact, live provider checks, and
human research approvals have not been refreshed for this source and remain hard gates.

Do not distribute an older `alpha.10` artifact as `alpha.11`; it does not contain the cohort
enforcement or the redesigned interface described below.

## Source state

- Version: `0.1.0-alpha.11` in the root and desktop package manifests.
- Base commit: `5a673af48c14485f1b831ae5220b0b7043b02dda`.
- Exact source identity: **not frozen**. The intended `alpha.10` work and the `alpha.11` changes are
  still uncommitted in this working tree.
- Publication: local `main` contains 30 commits not present on the live remote `main`; the remote is
  an ancestor, so the reviewed history plus the eventual freeze commit must be pushed as one
  intentional fast-forward. Do not rely on the stale tracking-ref status alone.
- Distribution artifact: **not built or signed** for `alpha.11`.
- Previous signed rollback artifact: `0.1.0-alpha.10`; its hashes and notarization records remain in
  [`handoff-2026-08-26-alpha.10.md`](./handoff-2026-08-26-alpha.10.md).

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

These hashes describe local bundles only; they are not a claim about the currently deployed stack.

## Read-only live environment observations

Observed on 2026-08-26 KST without changing AWS or GitHub state:

- CloudFormation stack `sia-alpha` reports `UPDATE_COMPLETE`, and all 15 CloudWatch alarms are `OK`
  with actions enabled. The alarm topic has a confirmed email subscription.
- The deployed stack predates `alpha.11`: Cognito contains `Admins`, but neither `Participants` nor
  `ConnectorTesters`; deployed control IAM also lacks `AdminAddUserToGroup`. Three enabled users
  exist and none has the new cohort assignment.
- SES reports `ProductionAccessEnabled: false`; the stack uses `COGNITO_DEFAULT`, with no configured
  SES source ARN or From address. This does not satisfy the monitored delivery gate.
- The local Developer ID identity and `notarytool-profile` are usable. Release preflight passes when
  supplied the known cloud outputs, and the preserved signed `alpha.10` rollback artifacts still
  pass hash, codesign, Gatekeeper, and stapling checks. No `alpha.11` artifact has been created.
- The workflow references a protected `alpha-release` GitHub environment, but the repository
  currently has no environments or environment-scoped release secrets. The manual signed-release
  job will fail preflight until an administrator creates/protects that environment and adds the
  seven required secrets, or the release is explicitly run on the secured local Mac.
- Real no-turn probes passed for Codex authentication and macOS computer-use permissions. Real
  Codex runtime isolation also passed. Signed-in Chrome attach remains unrun because no intended
  visible Chrome window was selected.

## Required deployment and cohort rehearsal

Complete these steps against the intended AWS account before packaging:

1. Review the CloudFormation change set. It must add the two Cognito groups and the single
   `cognito-idp:AdminAddUserToGroup` permission without replacing the user pool or retained data.
2. Deploy the validated template with `InviteLimit=20`. Confirm stack `UPDATE_COMPLETE`, drift
   `IN_SYNC`, all alarm actions enabled, and every alarm `OK` after the observation window.
3. Add every approved named recipient to `Participants`. Add only the smaller acceptance list to
   `ConnectorTesters`. Do not infer cohort membership from an existing account.
4. Using disposable addresses, verify:
   - an unknown email receives the generic registration response and creates no Cognito user;
   - a named invitation activates and receives `Participants`;
   - a participant can use core research/Meta/schedules but cannot start Google or Slack;
   - a connector tester can start and execute connectors;
   - removing `ConnectorTesters` removes connector tools on the next session refresh;
   - both cohorts can still disconnect an existing grant.
5. Re-run admin MFA, invite, archive, export, research deletion, account deletion, outbox recovery,
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

- **Source/artifact:** review and commit the exact source, record the commit, build `alpha.11` with
  the release cloud configuration, then sign, notarize, staple, Gatekeeper-assess, and hash both the
  app and DMG. Test the exact artifact on clean and upgrade macOS profiles.
- **AWS/cohorts:** deploy this template and complete the cohort rehearsal above.
- **Email:** Cognito still needs monitored SES production delivery plus an unrelated-domain
  passwordless-code test. A default-sender success is not broad-release evidence.
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
- **Live probes:** Codex isolation, Codex no-turn, and macOS permission probes pass on this Mac.
  Re-run them against the frozen build; signed-in Chrome attach and the real capability turn remain
  open. Deterministic-suite skips are intentional and are not evidence of completion.
- **Release automation:** create and protect the `alpha-release` GitHub environment with its seven
  signing/cloud secrets, or record the explicit decision to package on the already-provisioned
  secured local Mac. Do not remove the workflow environment boundary to make the job green.

Until those gates close, describe `alpha.11` as a locally verified internal QA candidate—not a
signed, deployed, or participant-approved release.
