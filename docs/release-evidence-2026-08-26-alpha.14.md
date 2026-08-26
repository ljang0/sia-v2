# Sia 0.1.0-alpha.14 release evidence

_Prepared 2026-08-26 KST_

## Decision

The exact `alpha.14` application source is committed and pushed. The universal app and distribution
files are Developer ID signed, Apple-notarized, stapled, Gatekeeper-assessed, and privately stored
under immutable content-addressed S3 keys. The app embeds the authenticated manifest endpoint and
pins the release Ed25519 public key.

This closes the prior signed-update deployment blocker and is ready for operator/internal QA. It is
**not approved for external research-participant distribution**: both recipient cohorts remain
empty, named research/privacy approval is absent, and the positive live manifest request still
needs an approved user's completed email-code session.

## Source identity

- Version: `0.1.0-alpha.14`.
- Exact signed application source: `d9dfb521263de8dc05edf5fe3d1dc576716ece07`.
- Source is pushed to `origin/main`.
- Release manifest key ID: `sia-release-2026-01`.
- Pinned base64url Ed25519 SPKI public key:
  `MCowBQYDK2VwAyEA1xI_aYDA1INnElNJPtksAsHOdr9uzORqRwpRTeAuGF8`.
- The private Ed25519 key remains outside Git at mode `0600` on the secured release Mac.

## Signed distribution artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.14-universal.dmg` | 257,722,997 | `2810e358e1e95f1e1bb49215843884f8de6db2666e6a787f89197b18b5c35089` |
| `Sia-0.1.0-alpha.14-universal.zip` | 257,052,074 | `5303a8090d0748f05eb927f328a68b196fd975c896e5da394027dc498545365a` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle identifier: `ai.sia.desktop`; app CDHash
  `c4dd9a4963a910e7e173ec9bdbc2e117569660b3`.
- App notarization: `7d147ae4-9313-4f2c-983e-40fa0fc5ae0a`, accepted.
- DMG notarization: `c20450a0-b8f2-440f-b5e9-20482800e8e1`, accepted.
- Deep signature verification, Gatekeeper assessment, app/DMG staple validation, universal native
  architecture, production cloud resource, signed-update config, CUA packaging, MCP bridge, and
  license inventory checks passed.
- Private artifact keys:
  - `releases/0.1.0-alpha.14/2810e358e1e95f1e/Sia-0.1.0-alpha.14-universal.dmg`
  - `releases/0.1.0-alpha.14/5303a8090d0748f0/Sia-0.1.0-alpha.14-universal.zip`
- The operator URL expires 2026-09-02 02:27:22 UTC and is deliberately not recorded here. Its
  mode-`0600` local record is `/Users/lawrencejang/.sia-release/alpha14-publish.json`.

## Signed update publication

- Authenticated endpoint:
  `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha/v1/releases/macos`.
- Immutable manifest key:
  `manifests/macos/0.1.0-alpha.14/4ec429b9ccd9dd28b9902350327f9b35c8f3ec14940c7414dbdb41f000ffc951.json`.
- Manifest SHA-256:
  `4ec429b9ccd9dd28b9902350327f9b35c8f3ec14940c7414dbdb41f000ffc951`.
- `latest.json` and the immutable object were downloaded and compared byte-for-byte.
- The downloaded body hash matched the recorded value and the Ed25519 signature verified against
  the key pinned in the app.
- The signed DMG key and hash match S3's content length and `sha256` metadata exactly. The ZIP's
  length and metadata also match.
- An unauthenticated live request returned HTTP 403. Cloud tests prove only `Operators`,
  `Participants`, and `Admins` receive the manifest and authenticated non-cohort users are rejected.
  Operators receive no participant, research-upload, schedule, connector, or archive capability. A
  positive live request remains pending until the approved operator completes email-code sign-in.
- After restarting the exact signed `alpha.14` app, the existing local profile, agents, threads,
  cloud sign-in, and provider configuration survived. Its **Check now** control made a live request
  with the pre-existing acceptance account and displayed `Release feed returned HTTP 403.` That
  account is outside `Operators`, `Participants`, and `Admins`, so this closes the live authenticated
  non-cohort denial branch without enrolling a test identity. It does not replace the approved
  operator positive path.

## Automated and real-runtime evidence

- `pnpm check`: build, formatting, quality guard, type checks, and **491 runnable tests passed**;
  one opt-in credential-dependent Codex isolation test was skipped in this aggregate invocation.
- `pnpm test:e2e`: **26 passed, 4 opt-in real-environment probes skipped**.
- A post-release test-only correction at `30298466b805bfa5e5e7b5f84a922ecdfa50b415`
  waits for the released thread-outline control before the compact visual baseline. GitHub Actions
  run `32931248588` then passed the complete quality, Electron E2E, and unsigned universal-package
  job on hosted macOS. This correction changes no application source and does not supersede the
  signed `d9dfb52` artifact or tag.
- `pnpm test:codex-isolation:real`: **1 passed** with the existing ChatGPT authentication retained
  in a verified ephemeral session.
- `SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn`: **2 passed, 1 Chrome probe
  skipped**. Real Codex authentication and real macOS CUA permissions passed without a model turn.
- In a follow-up pass, the exact signed `alpha.14` app attached to the explicitly selected
  disposable Chrome window, reported `Attached to Chrome window 2`, navigated only that window from
  the dated Example Domain probe ending in `20260817` to `20260826`, and detached cleanly. Chrome's
  visible automation banner and Sia's ready/attached state were observed throughout.
- `sam validate --lint --template-file infra/template.yaml --region us-east-1`: passed.
- The production renderer build transformed 4,688 modules; the main renderer chunk is 1,548.38 kB.
- The visual suite protects the cool mineral/evergreen system, compact/minimum layouts, keyboard
  focus, reduced motion, and the new outline trigger. No yellow paperback tint was introduced.

## Live infrastructure evidence

- AWS account `677513020767`, region `us-east-1`; stack `sia-alpha` is `UPDATE_COMPLETE`.
- The original release deployment used change set
  `arn:aws:cloudformation:us-east-1:677513020767:changeSet/samcli-deploy1787710053/2aa4b723-232a-4ff6-9d23-8fae80573e50`.
  The reviewed follow-up change set `branded-cognito-sender-20260826-0514` updated the user pool in
  place to the exact verified sender; every listed resource had `Replacement: false`.
- Change set
  `arn:aws:cloudformation:us-east-1:677513020767:changeSet/samcli-deploy1787722342/f4e7ec23-2728-4246-8e88-61650d3c9486`
  added the narrow `Operators` group and updated release authorization in place; every existing
  resource again had `Replacement: false`.
- Drift detection completed `IN_SYNC` with zero drifted resources.
- All 17 `sia-alpha-*` CloudWatch alarms are `OK`, have actions enabled, and include bounce and
  complaint monitoring.
- The release bucket remains private. Lambda can read only `manifests/macos/*` and `releases/*`.
- `Operators`: 1 confirmed internal cofounder account. `Participants`: 0. `ConnectorTesters`: 0.
  The operator is not a research participant or archive administrator.

## AWS email evidence

- Namecheap now has the dedicated forwarder
  `auth@superintelligentagents.ai` → `superintelligentagents@gmail.com`. A separately generated SES
  control message sent to the exact `auth@` address arrived in the destination Gmail inbox, proving
  the forwarding path rather than inferring it from DNS or configuration.
- The fresh SES verification message arrived addressed to `auth@superintelligentagents.ai`; its
  exact-identity link was opened and the AWS success page was observed. SES now reports
  `VerificationStatus: SUCCESS`, `VerifiedForSendingStatus: true`, and a narrowly scoped
  `CognitoSend` policy for only the production account and user pool.
- Cognito is deployed with `EmailSendingAccount=COGNITO_DEFAULT`,
  `SourceArn=arn:aws:ses:us-east-1:677513020767:identity/auth@superintelligentagents.ai`, and no
  `From` override. The reviewed change set completed at `2026-08-26T05:14:28Z`; the stack returned
  to `UPDATE_COMPLETE` without failed events or replacement, and a subsequent drift detection
  completed `IN_SYNC` with zero drifted resources.
- A live `USER_AUTH` request with preferred `EMAIL_OTP` for the pre-existing acceptance alias
  returned `ChallengeName: EMAIL_OTP` and `AvailableChallenges: [EMAIL_OTP]`. The new message arrived
  in Gmail from `auth@superintelligentagents.ai` with subject `Your authentication code`; Gmail
  reported `mailed-by: amazonses.com`, `signed-by: superintelligentagents.ai`, and TLS. No code,
  token, or Cognito session is recorded here.
- SES reports `ProductionAccessEnabled: false`, `SendingEnabled: true`, enforcement `HEALTHY`, a
  sandbox quota of 200 messages/day and 1 message/second, and account suppression for bounces and
  complaints.
- The production-access resubmission API returned `ConflictException`; the previous case remains
  denied and programmatic Support case creation requires a paid support subscription.
- Both the Sia domain and the exact sender identity report SES DKIM `SUCCESS` with signing enabled.
  The live Gmail message's aligned `signed-by` result provides delivered-message DKIM evidence;
  Gmail's explicit raw SPF/DMARC result panel was not archived in this pass.

## Remaining distribution gates

1. Approve the exact named recipient list and complete all named owners/signatures in
   [`research-release-signoff.md`](./research-release-signoff.md).
2. Have the approved operator complete OTP sign-in, then verify the live protected update route and
   its working 15-minute artifact URL. Do not add the operator to `Participants` or `Admins` merely
   to manufacture this evidence.
3. Complete clean-account and prior-build installer acceptance, advertised voice checks, and the
   remaining exact signed-app computer-use mutation cases with a human observer. The disposable
   exact-window Chrome attach/navigation/detach gate is closed.
4. Keep Google Workspace and Slack limited to an approved `ConnectorTesters` subset until their
   external provider and unrelated-account/workspace acceptance gates pass.

Until these gates close, describe `alpha.14` as a signed, privately published operator/internal-QA
candidate with deployed signed-update controls—not as participant-approved software.
