# Release status

Updated October 21, 2026. The next controlled product-pilot candidate is
`0.1.0-alpha.32` on `claude/demo-candidate` (PR #22). It is under verification;
**do not describe it as ready or send invitations until the acceptance record is complete**.
Alpha.30 and alpha.31 passed signing/notarization and upgrades retained the demo profile. Live file tasks
found missing result controls on plain-text and streamed provider replies; alpha.32 addresses both paths.
Native iPhone 0.1.0 (30) is ready for internal TestFlight testing. External beta review awaits contact details. The last published pilot remains alpha.24.

## Pilot scope

The owner selected a combined Mac pilot and native iPhone TestFlight release. The scope is a
small named cohort with research sharing off, Codex as the initial provider, and the encrypted
phone relay. PR #23 integrates the native iPhone shell with the current Mac candidate. No invitations or public download are authorized
by this status file. Keep the recipient list and private distribution links outside Git.

## Current engineering work

- Patched Vite to 7.3.7; the high-severity dependency gate now passes. One moderate advisory
  remains in the optional development packaging logger `sprintf-js` (the registry still offers
  only 1.1.3); it is not shipped as an app runtime dependency.
- Task ratings now save their record and report totals atomically, including delivery retry and
  competing edits. A private account reference supports deleting notes and report contributions.
- Local result links in final replies now create validated result controls, including persistent
  preview/open/reveal and phone download grants. Out-of-scope paths remain refused.
- Source, deterministic desktop/phone, signing, cloud and exact-artifact live checks are being
  recorded in the private operator evidence directory. Incomplete checks remain incomplete.

## Acceptance before inviting testers

1. Complete source/CI and signed/notarized packaging for the exact candidate; retain alpha.29.
2. Cloud ratings deployed successfully: both code hashes match, anonymous routes return 401,
   and all 18 alarms are OK. Authenticated app feedback still needs acceptance.
3. Rehearse signed-app file work, native computer use, phone relay, voice and texting.
4. Pass native iPhone tests, device acceptance, signed archive and TestFlight processing.
5. Complete clean macOS-account signup/permissions and previous-release upgrade acceptance.
6. Confirm a named support/incident owner, recipient list and redistribution permission for
   third-party native sources whose license is not recorded in this repository.

Research enrollment, public connector distribution, preview-harness admission,
APNs notifications, arbitrary user-added MCP connectors and always-on cloud execution are
separate gates; they are not implied by this controlled product pilot.

See [manual acceptance](./manual-acceptance.md), [pilot runbook](./cmu-pilot-runbook.md),
[release notes](./release-notes.md), and [public release](./public-release.md).
