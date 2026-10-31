# Sia development handoff

Updated October 31, 2026. **The Mac distribution is not ready.** Start with
[release status](./release-status.md), then [exact artifact evidence](./public-release.md).
Those records own candidate versions, hashes, test results and remaining gates; this guide does
not duplicate them. The owner selected Mac first, with iPhone following later. Lawrence Jang is
the support and incident owner. No new distribution or Arena outreach is authorized.

## Pick up the work

1. Read [AGENTS.md](../AGENTS.md), then follow [RA onboarding](./ra-onboarding.md) for the toolchain
   and first development run. Fake services let a reviewer inspect the UI; they do not prove live usefulness.
2. Read the short [Arena proposal](./arena-proposal.md), [architecture](./architecture.md),
   [ratings contract](./arena-ratings.md) and [model integration](./arena-model-harness.md).
3. Use the [real-work demo](./demo.md) and [manual acceptance](./manual-acceptance.md) against the
   exact signed candidate. Verify saved outputs, sources, timing, cancellation and recovery. Keep
   failed attempts and operator corrections in the evidence.
4. Follow [release operations](./release.md) only after the acceptance gates and owner decision.
   Packaging, notarization and a green automated suite alone do not establish readiness.

The release target is an everyday assistant that completes useful work while the person keeps
using their Mac. Rehearse sourced research, document/file preparation and practical planning;
run independent tasks together and test shared-window contention. Measure progress, responsiveness
and Stop separately from model/network time. Do not overlap live GUI acceptance with automated
Electron/renderer suites or package runtime verification: their app launches can change focus.

## Execution boundaries

Electron main owns credentials, persistence, execution and authorization; React uses a typed
preload bridge. `DesktopController` coordinates conversations and `RuntimeCoordinator` selects
and pins the model/harness. Sia-hosted actions pass through `packages/action-gateway` and approved
tools through `packages/tool-bridge`. Codex App Server is the initially admitted engine; other
provider seams need separate live admission. See [harness policy](./harness-policy.md).

Production defaults to **Use my Mac**, background operation and bypass for per-action approvals.
Supervised pilots can explicitly opt into confirmations. Default Mac setup guides all required
OS grants and Chrome connection, with a deliberate Chrome opt-out. macOS grants remain the
person's decision; task tools cannot approve permission dialogs. Connected apps only needs no Mac
permissions. Public connectors, sponsor models and research recruitment retain separate gates.

Sia-hosted tools block protected authentication and credential surfaces. Native shell/file tools
follow the provider's sandbox/approval boundary; prompt instructions are not OS enforcement.
Local tasks and schedules require Sia open and the Mac awake. Do not imply always-on cloud
execution or use a simulated receipt as evidence of a real purchase, message or cancellation.

## Evidence and unresolved work

Use designated disposable profiles, files and browser windows. Do not reset the person's Mac
permissions, inspect unrelated private conversations or enumerate Keychain contents. Keep raw
private traces, recipient details, tokens and download links outside Git. Historical fixtures and
fictional-data demos establish only their stated scope, not live account coverage or product parity.

Final-artifact workflow repeats, concurrent work, restart and physical acceptance remain governed
by release status. No fresh macOS account or second Mac is currently available; do not claim a
clean-install pass from an existing profile. Earlier credential-rotation checks have no verified
completion receipt in this handoff; the owner must resolve them before public distribution without
placing credentials in the repository. Do not deploy a longer refresh lifetime without separate approval.

The [prior handoff](https://github.com/ljang0/sia-v2/blob/a9a49a41976f4b2c0d4d4bef420ead2c73592555/docs/handoff.md)
retains the historical demo, deployment and artifact records. Consult it as history, not current status.
