# Release status

Updated October 30, 2026. **Distribution is not ready.** Alpha.34 is the source candidate;
alpha.33 is the latest signed and notarized artifact. The last published Mac pilot is alpha.24.
No new invitations or public download have been authorized.

The [Arena proposal](./arena-proposal.md) proposes a small Mac-first evaluation. The existing
owner-selected release scope is a combined invited Mac pilot and native iPhone TestFlight release;
changing that scope still needs the owner's decision. Research sharing stays off and Codex App
Server is the initially admitted engine. Preview engines and public connector distribution have
separate gates.

## Evidence and remaining gates

| Area | Verified evidence | Still required |
| --- | --- | --- |
| Source | PR #26 merged at `3dcb214`. Its [final head CI](https://github.com/ljang0/sia-v2/actions/runs/41000626957) passed the pilot gate and unsigned universal package. | Alpha.34 local pilot gate passed: 1,756 desktop unit, 46 Electron, 31 renderer and 72 phone checks. PR #27 CI/review remains pending. |
| Signed Mac package | Alpha.33 from `03f7e5e95e24ea0d52ff8c4e3b95dbacaf28cf55` passed universal signing, app/DMG notarization and stapling, Gatekeeper, strict signatures and packaged runtime checks. | Sign and verify alpha.34, retain exact hashes. |
| Signed app tasks | Alpha.33 created and previewed the exact synthetic CSV, retained it after restart, cancelled a task, and operated native Calculator with independently observed `19 × 21 = 399`. The alpha.32-to-.33 upgrade retained the QA profile without another Keychain prompt. | Rehearse the new signed candidate. |
| Browser | Development-app reads of an inactive public tab and its safe link passed. Signed alpha.33 stopped safely at `browser_consent_required` / `background_unavailable`. | Verify alpha.34's explicit connection flow and subsequent background read/navigation on the signed app. Background new-tab creation is unsupported by driver 0.37.0. |
| New recipient | Alpha.33 with an empty profile showed only email sign-in, with no private app content. | Clean macOS-account signup, permissions, provider login cancel/retry, lock/sleep and voice acceptance. An empty profile is not a clean OS account. |
| Cloud feedback | Ratings/account deletion deployed; both code hashes matched, anonymous routes returned 401 and all 18 alarms were OK. A synthetic authenticated rating reached the aggregate report. | Recheck service health before invitations. |
| Native iPhone | Build 31 is Ready to Test in internal Pilot QA with zero testers. Eight native tests, signed archive, upload and Apple processing passed. Simulator pairing survived restart; revocation returned it to pairing. | Physical camera pairing, file Save, Wi-Fi/cellular reconnect and microphone. Mirroring was blocked by “iPhone in Use.” External TestFlight also needs review contacts and Apple beta review. |
| Release ownership | Third-party notices identify the copied native sources and their pinned revision. | Record redistribution permission for sources without a recorded license; name the support/incident owner and invited recipients. |

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
with the owner. The combined release also requires physical iPhone acceptance. Do not substitute
fake-service or simulator success for live acceptance, and do not distribute copied sources or
compiled components until their redistribution permission is established.

Use [manual acceptance](./manual-acceptance.md) for the steps, [public release](./public-release.md)
for artifact hashes and prior live evidence, and [release operations](./release.md) for packaging.
The [pilot runbook](./cmu-pilot-runbook.md) covers support and incident response. Research enrollment,
preview-engine admission, APNs, arbitrary user-added MCP connectors and always-on cloud execution
remain outside this pilot.
