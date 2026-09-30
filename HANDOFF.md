# Sia handoff

The last signed, notarized pilot build is `0.1.0-alpha.24` (tag `v0.1.0-alpha.24`). Its exact
source, artifacts, and live-provider checks are in
[`docs/release-evidence-2026-08-28-alpha.24.md`](./docs/release-evidence-2026-08-28-alpha.24.md).
The dated operator handoff for that build, including its private download instructions, remains
at the release tag.

Start here:

- [`docs/cmu-pilot-runbook.md`](./docs/cmu-pilot-runbook.md) — five-minute setup and safe pilot
  defaults.
- [`docs/manual-acceptance.md`](./docs/manual-acceptance.md) — the remaining human acceptance pass.
- [`docs/README.md`](./docs/README.md) — documentation map.

## Remaining before broader release

These do not block a small named CMU product pilot with research collection off:

1. Rotate the Meta credential and Apple app-specific password that were previously pasted into
   chat, then update AWS Secrets Manager and the release Mac's Keychain profile.
2. Name the pilot support/incident owner and keep the approved recipient list outside the
   repository.
3. Complete the human acceptance pass for email OTP, OpenAI OAuth, Google/Slack read-only access,
   denial/cancel/reconnect, and the macOS permission prompts.
4. Before public connector distribution, complete Google's verification requirements, two fresh
   Google domains, two unrelated Slack workspaces, and separately approved synthetic write tests.
5. Before research recruitment, complete every owner/signature in
   [`docs/research-release-signoff.md`](./docs/research-release-signoff.md) and the deployed
   research/alarm rehearsal in [`docs/release.md`](./docs/release.md).

Do not put credentials, OAuth material, private download links, participant data, or local incident
bundles in this repository. Superseded release records remain available from Git history and their
release tags; they are intentionally not duplicated on `main`.
