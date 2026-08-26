# Sia handoff

_Updated: 2026-08-26 KST_

> **Current handoff:** [`docs/handoff-2026-08-26-alpha.14.md`](./docs/handoff-2026-08-26-alpha.14.md)
>
> That document is the authoritative continuation state for the signed, notarized, privately
> published `alpha.14` operator/internal-QA build, its interaction-density work, and its deployed
> signed private update path. It is not approved for a participant cohort. The exact evidence is in
> [`docs/release-evidence-2026-08-26-alpha.14.md`](./docs/release-evidence-2026-08-26-alpha.14.md).
> The material below is retained as historical context and contains stale release versions,
> artifact hashes, test counts, and open-item descriptions. Do not use it to make a current
> distribution decision.

## Read this first

Sia is a local-first macOS desktop assistant (Electron + pnpm monorepo). The source of truth is
now Git: **https://github.com/ljang0/sia-v2** (private, `main`). `ljang0/sia` is the older v1
canvas app and is unrelated; do not push there. This working tree (`~/sia_new`) is that clone.

State on 2026-08-22:

- **Product**: Codex app-server harness (threads, workspaces, file edits, review, subagents,
  compaction, recovery, per-thread model/reasoning, goals, schedules, Git review, terminals,
  worktrees), macOS computer use, signed-in Chrome, optional ElevenLabs voice, and cloud
  Gmail/Drive/Docs/Sheets/Slides/Slack connectors, research sync, and account deletion.
- **UI**: a quiet evergreen shell with persisted agent hues, bundled Bricolage Grotesque headings,
  restrained controls, muted accents, subtle shadows, and reduced ambient motion. Settings now use
  one horizontal section rail instead of a second sidebar; account dialogs and local-mode setup are
  flatter; selected agents stay in the shell; and authenticated admins get a focused Release review.
  Signed-in first run is now explicitly two steps: raw-research consent, then one guided six-app
  connection dialog before agent setup (with a visible defer path).
  Core first-run, agent, conversation, Settings, and scheduling states were inspected at 960×640.
- **Trust mode (new)**: eligible computer, browser, connector, message, upload, and schedule actions
  run **without per-action approval by
  default** and Chrome **auto-attaches to the frontmost window** the first time the browser is
  needed; macOS Accessibility/Screen Recording are requested once at first launch. Every action
  is still exact-target/snapshot-bound and hard safety denials still apply (sensitive apps, secure
  fields, private windows, non-http navigation, sensitive upload paths). `Settings → Computer →
Confirm before changes` restores previews. Implementation: `DefaultActionAuthorizationPolicy`
  `trustLocalActions` (`packages/action-gateway/src/gateway.ts`), `DesktopController.computerTrust`
  / `ensureBrowserAttachedForActions` / `isBrowserOriginAllowed` / auto `authorizeComputer`
  (`apps/desktop/src/main/controller.ts`), `DesktopActionBackend.ensureBrowserAttached`.
- **Local trajectory log (default on)**: `TrajectoryRecorder`
  (`apps/desktop/src/main/trajectory-recorder.ts`) appends every timeline item, the finished turn
  transcript, every action result with arguments/outcome/data, every automatic authorization,
  browser attachments, connected-app lifecycle events, and every returned image
  (screenshots/snapshots as files) to
  `<userData>/trajectories/<threadId>/events.jsonl`. Complete thread directories roll off after 90
  days or when the local trajectory store exceeds 128 MiB, oldest first. The exact plain files are
  local only. With
  `alpha-research-v3-raw` consent, equivalent observed turn events are separately chunked into
  encrypted research batches and uploaded to AWS. Connection records exclude OAuth URLs, codes, and
  tokens; signed-in setup fails before the provider call when raw recording is unavailable. Toggle + "Show in Finder" in
  `Settings → Computer`; research capture is controlled separately.
- **Research release (2026-08-21)**: signed-in users must accept the v3 raw consent or sign out.
  Completed, failed, and cancelled turns upload provider events, prompts/replies, surfaced reasoning,
  command/action inputs and results, approvals, browser/computer/connector events, paths/diffs,
  errors, and images. Cloud admin routes list participants/batches and read raw S3 objects only for
  Cognito `Admins`, with audited access. The desktop Research archive groups batches by turn and
  reconstructs chunked events.
- **Agent-authored schedules (2026-08-21)**: ActionGateway exposes approved
  `schedule_create`, `schedule_list`, `schedule_update`, and `schedule_delete`. These call the
  existing controller-owned persisted scheduler; there is no arbitrary crontab/shell surface and
  runs still require Sia to be open and the Mac awake.
- **Gates on this source**: `pnpm check` (build, prettier, quality guard, typecheck, 418 unit and
  integration tests across the workspace) passes;
  `pnpm test:e2e` 24/24 (parity is strict by default now); real Codex auth probe and real CUA
  permission probe pass on the release Mac (`SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1
npx playwright test tests/e2e/real-no-turn.spec.ts`).
- **Artifact**: the universal app and DMG in `apps/desktop/release/` were freshly signed, notarized,
  stapled, and verified on 2026-08-22. Deployment, artifact hashes, and live rehearsal results are
  recorded in `docs/release-evidence-2026-08-22.md`. It remains blocked from distribution by the
  human/provider gates listed there. Packaged source is frozen at commit `7b239c32610e8beb6ff8a6e2a6c21666994b19c2`.
- Sixteen superseded builds live under `apps/desktop/_old-builds/` (README inside); nothing in
  the repo references them; they are gitignored.

Never copy credentials from conversation history into this file, source code, logs, shell history,
or test fixtures. Secret pointers are documented below; secret values are not.

## How to work on it

```sh
pnpm install
pnpm dev                       # electron-vite dev (renderer HMR)
pnpm check                     # build + prettier + quality guard + typecheck + unit tests
pnpm test:e2e                  # Electron Playwright, fake services, strict parity
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 SIA_REAL_BROWSER_ATTACH_E2E=1 \
  SIA_REAL_BROWSER_WINDOW_MATCH="<chrome window title fragment>" \
  npx playwright test tests/e2e/real-no-turn.spec.ts   # real probes, no model turn
```

Design/UI rules: `docs/ui-quality.md` (enforced in part by `src/renderer/uiPolicy.test.ts` —
contrast math, no gradients/`!important`, display face only on names/headings, hue slots).
Tokens live in `src/renderer/tokens.css`; all styling in `src/renderer/ui.module.css`. Approval,
capture and trust code paths are mapped in `docs/architecture.md`.

## Known gaps / suggested next work

1. **Auto Chrome attach visibility**: `list_windows` only returns windows on the current Space;
   from an automated session it reported no visible window even with one open. If the model's
   first browser call lands while Chrome is on another Space, attach fails with "Open a visible
   Chrome window" — surface _why_ (Space/minimized) and offer a one-click retry.
2. Approvals (ask mode) have no visual preview of the target; a small screenshot crop with the
   ref highlighted would help.
3. No inline artifact/diff viewer for files the agent produces.

## Credential pointers

AWS account `677513020767`, region `us-east-1`:

- Composio runtime secret
  - name: `ComposioSecret-8Zpz8CwQ6R3c`
  - ARN:
    `arn:aws:secretsmanager:us-east-1:677513020767:secret:ComposioSecret-8Zpz8CwQ6R3c-aSxajr`
  - dashboard key: `sia-alpha-runtime-20260817-release`
  - `AWSCURRENT`: `f91c99f0-1c8f-4953-923f-d65901a4ac6c`
  - consumed by the control and deletion Lambda roles through exact-ARN IAM grants
- ElevenLabs operator vault
  - name: `sia-alpha/elevenlabs/operator-key`
  - ARN:
    `arn:aws:secretsmanager:us-east-1:677513020767:secret:sia-alpha/elevenlabs/operator-key-6H2UIW`
  - dashboard key: `sia-alpha-20260817-release`
  - `AWSCURRENT`: `feb87098-577b-418e-8486-04024d42eec7`
  - JSON field: `apiKey`
  - operator-only; no deployed Sia Lambda role can read it
  - this is a secure handoff vault, not a cloud runtime integration; the desktop still stores a
    connected voice key locally in its Keychain-backed encrypted repository
- KMS key used by both secrets:
  `arn:aws:kms:us-east-1:677513020767:key/cb0b9ce3-840e-414f-81ae-dc26cd088eba`

The ElevenLabs secret has no resource-based policy, so access remains controlled by IAM's implicit
deny plus explicitly granted operator permissions. Do not add it to the Lambda template or broaden
the existing exact-secret IAM resources.

## Current release state

The current 2026-08-22 deployment and artifact evidence is in
`docs/release-evidence-2026-08-22.md`. Older 2026-08-17 observations below remain useful migration
and provider history but do not supersede that record.

### Desktop and local harness

- All eight original high-severity resilience findings are fixed and regression-covered.
- Codex app-server is the shipping coding harness. It supports native commands, file changes, web
  events, images, review, compaction, subagents, recovery, attachments, per-thread model/reasoning,
  goals, schedules, Activity, Git review, scoped persistent terminals, snapshots, and detached
  worktrees.
- Local mode requires no Sia account or cloud credits. Codex, workspaces, Git, terminal, app-open
  schedules/background work, signed-in Chrome attachment, and explicitly granted computer use work
  locally while Sia remains running and the Mac stays awake.
- Signed-in Chrome is bound to an explicitly selected window/tab and approved origins. It does not
  import cookies or persist browser window identifiers.
- Direct programmatic browser downloads are not advertised in this alpha. The embedded CUA SDK
  cannot accept the MCP-host-only download-approval attestation through its public application API;
  Sia fails closed instead of showing an approval for an operation that cannot complete. Users can
  still download normally in Chrome outside Sia automation.
- Native computer use is exact-app/window/snapshot-bound, autonomous by default, background-capable,
  and excludes auth/security surfaces and unsafe targets. When Electron/canvas apps expose no
  accessibility elements, typing, keys, and scrolling may use the already focused control in the
  exact bound window; clicks and value-setting still require a fresh element ref.
- Real model turns can retain their host-minted native app/window grant for up to ten minutes;
  every action still revalidates the live process, exact window, and latest snapshot. Confirmation
  mode additionally requires the exact interactive approval. This replaces the one-minute grant
  that expired during legitimate model reasoning.
- Every Chrome attachment now receives a fresh opaque CUA session id. Detach still revokes all
  origins/refs and ends the driver session, while a later explicit reattach no longer reuses a
  terminal session name.
- Optional ElevenLabs voice supports realtime dictation, read-aloud, per-agent voices, interruption,
  bounded narration, in-memory audio, and Keychain-backed secret storage. It is not a free-running
  voice-agent loop.
- Gmail, Drive, Docs, Sheets, Slides, and Slack are enabled for invited internal-alpha acceptance.
  Provider-owned OAuth consent remains mandatory once per account; subsequent reads and writes
  follow Sia's autonomous mode and remain exactly account-bound and logged. Do not offer them to
  external recipients until the hosted scopes are replaced or audited and the live scope review
  passes.
- Local research capture remains optional. Signed-in research-release use requires versioned v3 raw
  consent and includes all exact task-surface events described above; credential stores, cookies,
  Keychain, secure fields, private windows, and hidden authentication surfaces remain unavailable.
- Alpha.4 replaces the confrontational dark light-mode shell and rounded toy-like controls with a
  warm-neutral workspace rail, one muted action color, mineral identity accents, native display
  typography, tighter radii, editorial tabs, and composed opacity/color motion. Deterministic
  screenshots cover the core workspace, providers, apps, agent creation, Activity, sign-in, local
  choice, compact light/dark layouts, keyboard focus, overflow, transitions, and reduced motion.

### Settled-source automated baseline

These passed on frozen `0.1.0-alpha.4` application source on 2026-08-23.

- `pnpm check`: build, formatting, quality guard, typecheck, and 431 tests passed.
- `pnpm test:e2e`: 26 enabled Electron Playwright tests passed; four opt-in real tests skipped as
  expected in the baseline invocation.
- `pnpm test:e2e:parity:strict`: 13/13 passed.
- The most recent real-machine baseline remains the alpha.2 pass: Codex isolation and the three
  no-turn auth/Chrome/CUA probes passed, and a constrained real capability turn called
  `browser_tabs` and `computer_list` without mutation. Alpha.4 changes only renderer styling,
  native background paint, and visual regression coverage.
- The alpha.4 visual audit reported zero renderer errors or true layout overflows at 1220x780 and
  960x640 in light, dark, and reduced-motion modes.

### Signed macOS artifact

- Current artifact: `apps/desktop/release/mac-universal/Sia.app`
- Distribution files:
  - `apps/desktop/release/Sia-0.1.0-alpha.4-universal.dmg`
  - `apps/desktop/release/Sia-0.1.0-alpha.4-universal.zip`
- Installed signing identity:
  `Developer ID Application: Lawrence Jang (DXYJ578DD4)`
- Notary profile: `notarytool-profile`
- The current app was rebuilt from frozen commit `5f917f61c7ac5b09c9f9286e08e265b5a6d366de` and
  rechecked on 2026-08-23:
  - `codesign --verify --deep --strict`: pass
  - Gatekeeper `spctl --assess`: accepted, Notarized Developer ID
  - `xcrun stapler validate`: pass
  - app notary submission `abadcc1b-318c-49c0-afda-55d00c58ded4`: accepted
  - DMG notary submission `a806277d-5b0f-4463-a3a5-cf74147a2ee6`: accepted
  - DMG SHA-256: `9e0af7a8b6152fec977f1a827dca0c96498313b63313379aba45b3b4bd032365`
  - ZIP SHA-256: `d8fd368551676d2f0f93b0867f8c80ea38cf0eb36b0e069c6d21a56ac4290ea6`
- Rollback artifact:
  `apps/desktop/_old-builds/release-alpha3-before-alpha4-20260823-1817/`
- Contained upgrade simulation: the notarized
  `apps/desktop/_old-builds/release-signed-ux-final-v2/mac-universal/Sia.app` created an `Upgrade fixture v2`
  agent and completed thread in a fresh temporary profile. Opening the final signed artifact against
  that same profile preserved the agent, thread, provider/model settings, and original reply; Codex
  remained installed/authenticated and a new read-only exact-reply workflow completed. This is strong
  migration evidence but does not replace the final installer pass under a disposable macOS account.
- The binary is technically distributable for the invite-only core research alpha. Do not claim
  universal all-app readiness until the Google verification/CASA, unrelated-account/workspace,
  approved synthetic-write, and named human signoff gates below pass. Rebuild and notarize again
  after any packaged source change.

## AWS release stack

- AWS account: `677513020767`
- Region: `us-east-1`
- Stack: `sia-alpha`
- Stack status checked 2026-08-22: `UPDATE_COMPLETE`, drift status `IN_SYNC`
- API base URL: `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha`
- Cognito region: `us-east-1`
- Desktop Cognito client ID: `331ej6ep7pojlil9k944v4fn7d`
- Bootstrap admin authentication material stays in the macOS login Keychain only:
  - TOTP service: `Sia Alpha Cognito TOTP`
  - permanent-password service: `Sia Alpha Cognito Admin Password`
  - account for both: `superintelligentagents@gmail.com`
- Alarm email subscription for `superintelligentagents@gmail.com` is confirmed.
- All fifteen `sia-alpha-*` alarms have actions enabled and target the confirmed operator topic.
  Rehearsal-induced alarms and recovery are recorded in the current evidence file.
- The real account-deletion API -> SQS -> deletion-Lambda success path previously passed and left no
  synthetic Cognito user behind.
- A controlled synthetic export message failed five worker deliveries, reached the DLQ, triggered
  the monitored alarm and operator email, and was removed by exact body match. The alarm recovered
  naturally to `OK`; both queues are empty and the source visibility timeout is restored to 360s.
- Still required: the user-visible failing/stalled deletion acceptance case with a disposable signed-in
  account, so local data/sign-in retention can be observed in the desktop UI.

Release environment variables can be assembled without Apple passwords in the repository:

```sh
export CSC_NAME='Lawrence Jang (DXYJ578DD4)'
export APPLE_KEYCHAIN_PROFILE='notarytool-profile'
export SIA_RELEASE_API_BASE_URL='https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha'
export SIA_RELEASE_COGNITO_REGION='us-east-1'
export SIA_RELEASE_COGNITO_CLIENT_ID='331ej6ep7pojlil9k944v4fn7d'
```

## Composio status

**Connector decision (updated 2026-08-22):** `EnableConnectors` defaults to `true`, and the live
CloudFormation parameter is now reconciled to `true`. Gmail, Drive, Docs, Sheets, Slides, and Slack
start URLs were smoke-tested and the diagnostic connections were revoked. The runtime and encrypted
AWS secret now map twenty-three exact pinned tool slugs. Custom Sia-owned auth configs are live for
all six providers. Slack unlisted public distribution is active; Google remains limited to approved
test users until its production publishing, domain, and verification gates are complete.

### Completed

- CLI installed at `~/.local/bin/composio`, version `0.3.3`.
- CLI login succeeds for the `ljang_workspace` organization.
- Official Codex skill installed at `~/.codex/skills/composio`.
- AWS secret: `ComposioSecret-8Zpz8CwQ6R3c` (KMS encrypted; full pointer in
  **Credential pointers**).
- Base URL: `https://backend.composio.dev`
- Pinned toolkit version: `20260721_00`
- Auth configs are enabled and mapped as follows:
  - Gmail custom: `ac_8IHyxAWRWbts`
  - Google Drive custom: `ac_88SW6Q8pleGi`
  - Google Docs custom: `ac_szGE2xbi8e5_`
  - Google Sheets custom: `ac_LjsJ7EQe-Y6J`
  - Google Slides custom: `ac_peHwngwT-6s_`
  - Slack custom: `ac_fcZCuByASLWP`
- The AWS secret contains the reviewed 23-tool canonical-to-provider contract.
- The configured project key passed the least-privilege contract:
  - connected accounts: allowed (`200`)
  - tool/file execution: allowed (`200`)
  - auth-config administration: denied (`403`)
  - tool catalog: denied (`403`)
  - toolkit administration: denied (`403`)
- The Sia runtime key was rotated on 2026-08-17. Its project permissions are limited to connected
  account read/write and tool execution write; auth-config administration and catalog/toolkit access
  remain denied. The replacement is `sia-alpha-runtime-20260817-release`; the exposed predecessor
  was revoked and now returns `401` while `AWSCURRENT` returns `200` on its permitted read path.
- A real deployed Lambda invocation created a Gmail hosted OAuth link (`201`) with a valid redirect
  contract, proving the Lambda reads the current secret and the scoped key can create links.
- Pending-link cancellation is fixed and deployed. A revoke `409` is recoverable only after the
  provider reports a known never-authorized pending/terminal state; active, disabled, and unknown
  states remain fail-closed.
- Regression tests cover pending cancellation, active revoke-then-delete ordering, fail-closed active
  revoke failure, provider `INITIALIZING` mapping, and removal of the local pending row.
- The deployed create -> cancel smoke returned `201` then `200`; the exact DynamoDB row was absent and
  the provider returned `404` for the synthetic connection. At the time of that three-connector
  smoke, Gmail/Drive/Slack connection counts were all zero.
- After the key cutover, a direct invocation of the deployed control Lambda created a Gmail hosted
  link (`201`), cancelled it (`200`), and confirmed the provider-side account was gone (`404`).
- After the custom Google config cutover, fresh deployed control-Lambda invocations created hosted
  Gmail and Drive links (`201` for each) and cancelled both (`200` for each). Composio then reported
  no remaining Gmail or Drive connections.
- In the exact signed artifact, the disposable Sia identity reached the provider-owned Gmail, Drive,
  and Slack OAuth pages. Gmail and Drive were cancelled from Sia; Slack was denied on Slack's page
  and its failed placeholder was disconnected. Sia returned to `0 of 3 connected`, and guided setup
  did not advance to a later provider after cancellation.

### Historical managed-config findings

The original managed provider URLs inspected on 2026-08-17 requested excessive scopes:

- Gmail requests 11 scopes, including full `https://mail.google.com/` access plus unrelated contacts,
  addresses, birthday, phone-number, language, and profile/email scopes.
- Google Drive requests full `https://www.googleapis.com/auth/drive` access plus `userinfo.email`.
- Slack requests dozens of user scopes, including calls, files, reminders, reactions, pins, links,
  profile/workspace writes, and other capabilities outside Sia's three allowlisted Slack actions.
  Slack also labels the managed Composio app as not approved by Slack.

All three managed configs have been replaced in the deployed AWS mapping. The server-side action
allowlist still remains a separate defense from the provider consent scopes. None of this is
required for local Chrome/native computer use.

On 2026-08-22, managed Composio configs were created for Google Docs (`ac_P7HVBoWxSLxM`), Sheets
(`ac_IsvcBHAlC-oU`), and Slides (`ac_UG0AMCzDpzjK`). They have zero connections and must remain
internal-only until their live consent scopes are inspected and accepted or replaced with reviewed
custom configs. The code pins ten purpose-built editor slugs and toolkit versions; it does not expose
raw Slides batch requests or unbounded Sheets writes.

Custom-provider setup advanced on 2026-08-17 but is not yet ready for user consent:

- Google Cloud project `Sia Production` (`sia-production-connectors`) exists with Gmail API and
  Google Drive API enabled. Google Auth Platform is initialized for an External audience with app
  name `Sia`, the operator support/developer-contact email, and the Google API Services User Data
  Policy accepted.
- Google Data Access is saved with exactly `userinfo.email`, `drive.file`, `gmail.readonly`, and
  `gmail.compose`. `drive.file` intentionally limits Sia
  to files a user selects for or creates with Sia; arbitrary existing-Drive search is not available
  without a broader restricted Drive scope or a Google Picker flow.
- Google Web OAuth client `Sia Production - Composio` is created. Its credential values were entered
  directly into Composio and were not written to this repository or handoff. The client authorizes
  the current callback `https://backend.composio.dev/api/v3.1/toolkits/auth/callback` and the legacy
  callback still shown by Composio's live dashboard,
  `https://backend.composio.dev/api/v1/auth-apps/add`.
- Custom Gmail config `ac_8IHyxAWRWbts` requests only `userinfo.email`, `gmail.readonly`, and
  `gmail.compose`, and its execution allowlist contains only Sia's four Gmail tool slugs. Custom
  Drive config `ac_88SW6Q8pleGi` requests only `userinfo.email` and `drive.file`, and its execution
  allowlist contains only Sia's four Drive tool slugs. Both are enabled and have zero connections.
- The Google branding record still lacks a homepage, privacy policy, terms URL, logo, and authorized
  domain. Search Console has no verified property. Public all-user access is therefore blocked until
  Sia has an operator-controlled custom domain, public policy/support pages on that domain, Search
  Console ownership verification, and Google's restricted-scope verification (plus any security
  assessment Google requires for server-side restricted Gmail data handling).
- Slack created four duplicate `Sia` app records in the earlier RLC session even though each combined
  **Create and Install** operation reported that installation had not completed. The three zero-user
  duplicates `A0BQQB0QMA8`, `A0BQQDA724C`, and `A0BQNJVC09X` were permanently deleted after operator
  confirmation. The remaining RLC record `A0BQJMCB3D4` is not distributed and has zero authorized
  users. The operator explicitly rejected RLC as the target; do not use that app.
- The `Sia` app `A0BQQJLG328` in the intended `Russ Lab` workspace has the two reviewed Composio
  callbacks and exactly eight user scopes: `search:read`, `users:read`, `im:write`, `channels:history`,
  `groups:history`, `im:history`, `mpim:history`, and `chat:write`. It has no bot scopes.
- Custom Composio Slack config `ac_fcZCuByASLWP` stores the app credentials and permits exactly
  `SLACK_SEARCH_MESSAGES`, `SLACK_FIND_USERS`, `SLACK_OPEN_DM`,
  `SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION`, and `SLACK_SEND_MESSAGE`. The credentials were
  entered directly in the provider UI and were not written to this repository.
- The deprecated Slack verification token exposed during inspection was regenerated. Slack triggers
  remain disabled and the verification-token field is not configured in Composio.
- Unlisted public Slack distribution is active. A live Russ Lab OAuth acceptance passed person
  lookup, message search, DM open/reuse, and thread read through the deployed Lambda; no message was
  sent, and the disposable connection was revoked after the run. A second unrelated-workspace pass
  and an explicitly approved send remain open acceptance items.

The Composio dashboard also currently lists `sia_production_runtime` and `Getting Started` as **Full
access** project keys alongside the scoped `sia-alpha-runtime-20260817-release` key. The dashboard offers a
permanent **Revoke** action for both. Reconcile their consumers and revoke them with an operator
handoff before distribution; do not assume that the earlier rejected predecessor-token probe proves
these two dashboard rows are harmless.

## Cloud-connector acceptance

Run this with designated disposable accounts and benign fixtures; never substitute an operator or
maintainer account. Connector start URLs are enabled for invited internal acceptance, but do not
continue past a provider consent screen until the overbroad OAuth configs below have been replaced.

1. Launch the cloud-enabled signed Sia build with a disposable profile.
2. Sign into Sia with the disposable email and complete the Cognito email OTP.
3. In Settings -> Apps, choose **Connect work apps**.
4. Complete Gmail, Drive, Docs, Sheets, Slides, then Slack consent using the intended disposable identities.
5. Verify the UI shows the exact connected identity for all six.
6. Run one read per provider.
7. Run one exact write per provider using non-sensitive fixtures.
8. Disconnect all six and verify provider-side revocation and no remaining Composio account.
9. Repeat once with cancellation in the middle; no later provider should open.

Before any future connector-enabled alpha or public distribution, use branded custom Google and Slack
OAuth applications, request only reviewed scopes, and complete required Google verification/quota
work. Do not fall back to the managed Slack config.

## ElevenLabs status

- The Sia key `sia-alpha-20260817-release` was rotated on 2026-08-17. It is limited to Text to
  Speech, Speech to Text, and Voices Read, has a 10,000-credit limit, expires after 30 days, and has
  leak auto-disable enabled. The exposed predecessors were disabled and direct API checks now return
  `401` for them; the current key returns `200` for Voices and `401` for the intentionally denied
  User endpoint.
- The replacement is stored in the KMS-encrypted operator vault documented in **Credential
  pointers**. It is not in the repository, test fixtures, packaged resources, or any Lambda
  environment/secret grant. The vault has no resource policy and no deployed Sia Lambda role can
  read it.
- The exact signed artifact connected the restricted key, selected `Adam - Dominant, Firm` as the
  default, survived a full restart without redisplaying the key, and refreshed the voice list after
  the predecessor keys were disabled.
- Read aloud was exercised end to end in the signed artifact: the UI moved through loading to
  `Speaking...`, exposed the Stop control, stopped cleanly, and returned to idle. A scan found no
  persisted audio file in the workspace or Sia application-data directory.
- Two signed-artifact agents now use explicit voices (`Alice - Clear, Engaging Educator` and
  `Bella - Professional, Bright, Warm`); a third remains on `Default (Adam - Dominant, Firm)`. Exact
  replies were generated for both explicit agents and both Alice and Bella synthesis requests entered
  the cancellable Read-aloud state.
- Dictate entered `Listening...`, stopped through the signed UI, and surfaced the explicit
  `No speech was detected` result when no human phrase was captured. Still requires a human at the
  release Mac: benign transcript insertion without auto-send, the microphone-deny path, and an
  audible Alice/Bella/Default comparison. The sentence-boundary/code-block cutoff and single-playback
  behavior remain regression-covered but should be heard once in the manual pass.

## Codex Computer Use status

`node_repl`/`@oai/sky` is working. Codex inspected the exact final artifact, completed the packaged
voice setup and playback check, created a uniquely titled benign Chrome window, and verified the
alarm email in the operator inbox. A disposable invited Sia identity completed email OTP in the exact
signed artifact. A separate temporary profile contains a disposable local agent and completed thread;
its deletion dialog was verified to keep the permanent button disabled until `DELETE ACCOUNT` is
entered. No deletion was submitted. The compact 960x640 Apps screen was inspected in both Light and
Dark appearances with no clipping or horizontal bleed; the Mac was returned to its original Light
setting and the ordinary Sia profile was restored. Continue using the `computer-use` skill; do not
silently substitute standalone Playwright, AppleScript, or another browser surface for the remaining
real setup. Computer Use policy requires confirmation immediately before granting OAuth access,
changing microphone privacy state, or permanently deleting the disposable Sia identity.

Packaged native CUA also passed a real ref-bound TextEdit mutation: the approval named the exact
trusted target/ref, the approved newline committed once, and the result was verified. A later
off-Space retry failed closed without mutation. During this pass a legitimate model turn exceeded
the former one-minute grant; the grant is now ten minutes with live-process/window/snapshot
revalidation and regression coverage. Chrome window choice, click/type mutation, explicit denial,
and fail-closed origin handling were verified in the operator's main `Lawrence (andrew.cmu.edu)`
profile. The exact final artifact then passed a localhost upload with its own approval and fresh
snapshot verification (`local-browser-download.txt (35 bytes)`), returned zero tabs after restart,
and returned zero tabs after explicit detach. Direct programmatic download was removed from the
advertised tool surface because the embedded driver cannot accept its MCP-host-only attestation.

## Remaining engineering/release sequence

1. Have a human complete the remaining microphone/audible voice checks and run the installer-level
   upgrade on a disposable macOS account using the confirmed intended prior v2 bundle. The contained
   same-profile prior-v2 -> final migration, provider detection, and post-upgrade read-only workflow
   pass; clean-profile first run, local escape, minimum size, and Light/Dark checks also pass.
2. Have the release operator complete the final signed-app admin password/TOTP/archive UI pass and
   the offline-outbox UI pass. Direct Cognito password → TOTP and archive access, the renderer state,
   and the packaged secure password field are independently verified.
3. Confirm the intended alpha recipient list outside the repository. Explain that Sia sign-in is raw
   research-release enrollment, **Continue locally** is available without sharing, and cloud
   connectors require separate provider consent and are internal-only pending the scope audit.
4. Finish connector OAuth scope replacement, Composio key reconciliation, and disposable-account
   provider acceptance before external distribution. Cloud research and account deletion remain
   release gates.
5. Commit or otherwise immutably identify the dirty release source before distribution; rebuild and
   refresh this evidence after any further packaged-source change.

## Important product boundaries

- Schedules/background tasks run while the Sia process is open and the Mac remains awake; this is
  not an OS login daemon or remote cloud workcell.
- Persistent terminals are user-operated and intentionally not exposed as an unrestricted model
  shell.
- Slack cloud OAuth is enabled for unlisted cross-workspace alpha distribution. Google Workspace
  connectors remain limited to approved test users until Google production publishing and
  verification complete. Local Chrome/native computer actions and connector operations are
  autonomous by default and exactly targeted and logged.
- Chrome consent and provider OAuth pages must remain provider-owned; never automate a CAPTCHA,
  browser security warning, or unsupported credential step.
- Grok remains policy-gated and production-disabled. Codex app-server is the supported release
  coding provider.

## Reference documents

- `docs/manual-acceptance.md`
- `docs/release.md`
- `docs/architecture.md`
- `docs/provider-policy.md`
- `docs/cloud-computer.md`
- `apps/cloud/README.md`
