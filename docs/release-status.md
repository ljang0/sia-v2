# Release status

The last signed, notarized pilot build is `0.1.0-alpha.24` (tag `v0.1.0-alpha.24`). Its exact
source, artifacts, and live-provider checks are in
[`release-evidence.md`](./release-evidence.md).
The dated operator handoff for that build, including its private download instructions, remains
at the release tag.

Start here:

- [`cmu-pilot-runbook.md`](./cmu-pilot-runbook.md) — five-minute setup and safe pilot defaults.
- [`manual-acceptance.md`](./manual-acceptance.md) — the remaining human acceptance pass.
- [`release-notes.md`](./release-notes.md) — tester-facing notes for the next build.

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
   [`research-release-signoff.md`](./research-release-signoff.md) and the deployed
   research/alarm rehearsal in [`release.md`](./release.md).

Do not put credentials, OAuth material, private download links, participant data, or local incident
bundles in this repository. Superseded release records remain available from Git history and their
release tags; they are intentionally not duplicated on `main`.
