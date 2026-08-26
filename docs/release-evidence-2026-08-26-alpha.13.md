# Sia 0.1.0-alpha.13 release evidence

_Prepared 2026-08-26 KST_

## Decision

The exact `alpha.13` application source is committed, pushed, annotated, signed with Developer ID,
Apple-notarized, stapled, Gatekeeper-assessed, and stored under immutable content-addressed keys in
the private release bucket. A seven-day presigned DMG URL was generated and a separate range request
returned HTTP 206 for exactly 1,024 bytes.

This is ready for operator-only Wave 0 and named internal QA. It is **not approved for external
research-participant distribution**: the deployed `Participants` and `ConnectorTesters` groups are
both empty, the approved recipient list and human research sign-off are absent, and Cognito email
still lacks SES production access. Do not infer approval from the existence of a signed artifact or
download path.

## Source identity

- Version: `0.1.0-alpha.13`.
- Exact signed application source: `0ec2e8422b2a45d422d9a2e83c2b20665d8d413e`.
- Publication: pushed to `origin/main`; annotated tag `v0.1.0-alpha.13` points to the exact signed
  application source and records both distribution hashes.
- Later follow-up commits install Electron explicitly on fresh GitHub runners and expose provider
  discovery as a test boundary so unit tests do not depend on the runner's Codex installation.
  Production still defaults to the real CLI probe; the signed application runtime is represented by
  the tag above.
- Clean-room boundary and adopted interaction patterns are recorded in
  [`grok-clean-room-audit-2026-08-26.md`](./grok-clean-room-audit-2026-08-26.md).

## Signed distribution artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.13-universal.dmg` | 257,690,091 | `b539a12ea02b61365f306cb805cbc9ceb4e95fe9c6b6a6df0ac7ed908c22b98d` |
| `Sia-0.1.0-alpha.13-universal.zip` | 257,044,159 | `d1588de7728eba142da76022e528f892876bf8d14214133460d702985b5a75e7` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle identifier: `ai.sia.desktop`; app CDHash
  `81d223e574777654970acba737607928008a781d`.
- App notarization: `a300687c-646d-4390-84d0-aded09581480`, accepted.
- DMG notarization: `79005c89-cb90-43ee-ab64-3abf0403a3b0`, accepted.
- Deep packaged verification, Gatekeeper assessment, app and DMG staple validation, universal
  architecture, production cloud resource, license inventory, CUA packaging, and MCP bridge checks
  passed.
- Private bucket keys:
  - `releases/0.1.0-alpha.13/b539a12ea02b6136/Sia-0.1.0-alpha.13-universal.dmg`
  - `releases/0.1.0-alpha.13/d1588de7728eba14/Sia-0.1.0-alpha.13-universal.zip`
- The tested bearer URL expires 2026-09-02 00:53:32 UTC and is deliberately not recorded. Generate
  a fresh URL for each approved invitation batch.

## Automated and interactive evidence

- `pnpm check`: build, formatting, quality guard, types, and **482 runnable tests passed**; the
  opt-in Codex isolation smoke remained skipped in this aggregate command.
- `pnpm test:e2e`: **26 passed, 4 opt-in real-environment probes skipped**. The runnable suite
  includes strict parity, persistence, research consent, CSP/window lifecycle, accessibility,
  minimum viewport, and all committed visual baselines.
- `pnpm test:codex-isolation:real`: passed with the existing ChatGPT authentication retained and no
  inherited apps, plugins, skills, hooks, or MCP tools.
- Real no-turn probes: Codex authentication and macOS Accessibility/Screen Recording passed. Chrome
  reached exact-window selection and failed closed because Chrome's persistent **Allow remote
  debugging** control is off; no existing signed-in/private window was selected instead.
- Interactive 1220×780 review exercised room controls, message-level deep search, reviewed feedback,
  provider activity/update status, and in-thread find. The renderer reported no warnings or errors.
- The yellow/paper cast is absent: light surfaces remain cool mineral-neutral with evergreen
  navigation and the pending-approval surface uses storm blue.
- `sam validate --lint --template-file infra/template.yaml --region us-east-1`: passed.

## Live infrastructure evidence

- AWS account `677513020767`; `sia-alpha` is `UPDATE_COMPLETE`.
- Drift detection `417109e0-a0e8-11f1-9402-0affc515f60b` completed `IN_SYNC`.
- All 15 CloudWatch metric alarms are `OK` with actions enabled.
- The release bucket blocks all public access, uses AES-256 encryption, has versioning enabled,
  expires superseded versions after 30 days, and aborts incomplete multipart uploads after one day.
- The public home and support pages returned HTTP 200 with CSP, HSTS, frame, MIME, referrer, and
  permissions protections.
- The GitHub `alpha-release` environment now exists, is restricted to `main`, and holds the three
  production API/Cognito configuration secrets. Apple CI secrets are still absent; this release used
  the verified secured-local-Mac Keychain path.
- `Participants`: 0 users. `ConnectorTesters`: 0 users. This is safe pre-cohort state, not evidence
  that recipients were approved.
- SES reports `ProductionAccessEnabled: false`, `SendingEnabled: true`, and healthy enforcement.

## Open distribution gates

1. Supply and approve the exact named recipient list, then assign only that list to `Participants`
   and the smaller separately approved subset to `ConnectorTesters`.
2. Complete every named owner, approval, and signature in
   [`research-release-signoff.md`](./research-release-signoff.md).
3. Resolve Cognito production email delivery or document and test an approved alternative with an
   unrelated-domain recipient.
4. Complete clean/upgrade-account acceptance, advertised voice checks, and the exact signed-artifact
   mutation pass with human observation.
5. Enable Chrome's one-time remote-debugging permission only through Chrome's own visible control,
   then rerun attachment and real capability checks against a disposable page.
6. Keep Google Workspace and Slack limited to approved connector testers until their separate
   provider acceptance matrices pass.
7. Provision a persistent signed update-manifest endpoint and access policy before enabling update
   checks. `alpha.13` truthfully reports that no feed is configured.

Until these gates close, describe `alpha.13` as a signed, privately published operator/internal-QA
build—not as participant-approved or connector-general-availability software.
