# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.34 is the latest signed and notarized candidate. The last published Mac pilot is alpha.24.
No new invitations or public download have been authorized.

The owner selected **Mac first; iPhone follows** for the first Arena handoff on October 30.
The [Arena proposal](./arena-proposal.md) uses that scope. Research sharing stays off and Codex
App Server is the initially admitted engine. iPhone acceptance, preview engines and public
connector distribution have separate gates and do not block this Mac-first handoff.

## Evidence and remaining gates

| Area                      | Verified evidence                                                                                                                                                                                                                                                                                     | Still required                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                    | Alpha.34 local pilot gate passed: 1,756 desktop unit, 46 Electron, 31 renderer and 72 phone checks. PR #27 merged at `c81bb40`; its [final head](https://github.com/ljang0/sia-v2/actions/runs/41005231317) and [merged-branch CI](https://github.com/ljang0/sia-v2/actions/runs/41005278904) passed. | No source-check blocker on this code.                                                                                                                                             |
| Signed Mac package        | Alpha.34 from `75073741f3cf3f0756721c809501dc391574906b` passed universal signing, app/DMG notarization and stapling, strict signatures, Gatekeeper and packaged runtime checks. [Exact hashes](./public-release.md) are recorded.                                                                    | Retain these artifacts; any runtime change requires a new signed candidate.                                                                                                       |
| Signed app tasks          | Alpha.34 retained the QA profile without a Keychain prompt, created/read back a CSV (total 13), and retained its exact preview after restart. Cancellation passed; native Calculator input independently showed `23 × 19 = 437`.                                                                      | Browser and new-recipient checks below.                                                                                                                                           |
| Browser                   | Alpha.34 setup disclosure is visible. The owner approved connection setup for the disposable Example Domain window.                                                                                                                                                                                   | Complete signed connection and background read/navigation; the operator tool currently reports `noWindowsAvailable`. Background new-tab creation is unsupported by driver 0.37.0. |
| New recipient             | Alpha.33 with an empty profile showed only email sign-in, with no private app content.                                                                                                                                                                                                                | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account.                                |
| Cloud feedback            | Ratings/account deletion deployed and a synthetic authenticated rating reached the report. October 30 recheck: all 18 alarms OK with actions enabled, five Lambdas Active/Successful, and anonymous catalog/report/release requests return 401.                                                       | Recheck if service configuration changes before invitations.                                                                                                                      |
| Native iPhone (follow-on) | Build 31 is Ready to Test in internal Pilot QA; native tests, signed archive and Apple processing passed.                                                                                                                                                                                             | Deferred from the Mac-first release. Physical pairing, Save, reconnect and microphone checks plus external beta review remain for iPhone distribution.                            |
| Release ownership         | The owner confirmed on October 30 that they own the relevant Notch source rights; provenance remains in THIRD_PARTY_NOTICES.md.                                                                                                                                                                       | Name the support/incident owner and invited recipients before invitations.                                                                                                        |

## What alpha.34 changes

- Build/test dependencies are patched to Vitest 4.1.12 and fast-uri 3.1.9. The current registry
  audit reports no known vulnerabilities.

- Explicit Connect Chrome/window selection explains that Chrome may appear during setup and
  permits that setup. Automatic attachment stays in background mode and cannot grant foreground
  permission. The user reviews any Chrome permission prompt.
- A refused prepare or fresh browser read leaves the connection in an error state. Structured
  refusal codes are recognized even when their names do not contain “error” or “denied.”
- The README includes the task's code path, and the Arena proposal states the pilot's scope,
  feedback model and limits without implying a partnership or a validated ranking.

## Release decision

Complete the applicable rows above using the exact signed artifact, then record a go/no-go decision
with the owner. The iPhone companion follows under its own acceptance and distribution decision.
Do not substitute fake-service or simulator success for live Mac acceptance.

Use [manual acceptance](./manual-acceptance.md) for the steps, [public release](./public-release.md)
for artifact hashes and prior live evidence, and [release operations](./release.md) for packaging.
The [pilot runbook](./cmu-pilot-runbook.md) covers support and incident response. Research enrollment,
preview-engine admission, APNs, arbitrary user-added MCP connectors and always-on cloud execution
remain outside this pilot.
