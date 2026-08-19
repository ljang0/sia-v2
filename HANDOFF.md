# Sia release handoff

_Updated: 2026-08-19 KST_

## Read this first

Sia is functionally mature, the local desktop harness is implemented, the connector lifecycle fix is
deployed, a newly signed/notarized artifact exists, and the exposed Composio and ElevenLabs
credentials have been rotated. The operator has narrowed this release to local mode: Codex,
workspaces, Git, terminal, app-open schedules, signed-in Chrome, and explicitly granted macOS
computer use. Gmail/Drive/Slack OAuth, research sync, and cloud-account deletion remain implemented
but are deferred cloud features and are not local-mode alpha blockers. The packaged Chrome and
native-computer acceptance is complete. The remaining local release blockers are human
microphone/audible voice checks, the intended prior-v2 upgrade account, and the intended alpha
recipient list. Do not restart the project from first principles or redo completed hardening work.

This directory is **not a Git checkout**. Preserve existing files carefully; there is no local Git
history to recover from.

Never copy credentials from conversation history into this file, source code, logs, shell history,
or test fixtures. Several earlier Composio and ElevenLabs keys were exposed during setup; all exposed
Sia keys have been revoked or disabled and direct API checks now reject them. Their replacements were
created with least-privilege scopes and were not written to this repository. Secret pointers are
documented below; secret values are not.

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

## 2026-08-19 UI identity pass (artifact now stale)

The renderer received a deliberate visual-identity pass on 2026-08-19. Source changed, so the
notarized artifact below is **stale**: rebuild with `pnpm package:mac`, notarize, re-run the
compact 960x640 Light/Dark, first-run, and presence reduced-motion checks, and refresh the hashes
below before distributing.

What changed (see `docs/ui-quality.md` for the rule set):

- "An agent is a room." A deep green shell (`--shell-*`) holds the agents; the room of the agent
  whose thread is open sits inside it with a rounded corner, and that agent's hue (`--hue-0..3`,
  persisted as `AgentView.hue` and picked in the agent dialog; new agents default via
  `src/renderer/agentIdentity.ts`) tints its avatar, thread dot, topbar dot, presence chip,
  streaming caret, empty-state badge, and approval header band. The collapsed sidebar shows the
  same hue avatars.
- Fixed a pre-existing bug also present in the shipped alpha: the Goal / Changes / Schedules
  thread-tool panel was absolutely positioned inside the 44px tool bar and rendered as a clipped
  20px sliver; it now opens as a popover above the bar. Also fixed activity rows / approval cards
  overflowing the thread column at 960px, doubled focus rings on inputs, and the stray identity
  dot when no agent is selected. Controls are
  ink pills with 1.5px outlines. Bricolage Grotesque (OFL; `apps/desktop/src/renderer/fonts/`,
  license in `THIRD_PARTY_LICENSES.txt`) is the bundled display face for names and headings.
- Token consolidation in `tokens.css` (`--text-*`, `--display-*`, `--weight-*`, `--radius-*`,
  `--shell-*`, `--hue-*`, `--agent-*`); no literal sizes/weights/radii remain in `ui.module.css`.
- Messages carry avatars (person: ink circle; agent: hue square with initials); the composer
  placeholder names the agent; hover transitions on all interactive rows/buttons; Activity page
  flattened (no nested cards, 4-up display metrics); research-consent facts restructured into a
  labeled list (all copy kept).
- Parity e2e is now strict by default (`SIA_PARITY_ALLOW_INCOMPLETE=1` opts out); plain
  `pnpm test:e2e` can no longer silently skip contract checks.
- Fourteen superseded build directories were moved to `apps/desktop/_old-builds/` (see its README);
  `apps/desktop/release/` and `apps/desktop/release-signed-current-20260816-final/` are untouched.
- Gates on the changed source: `pnpm check` (build, prettier, quality guard, typecheck, 215 desktop
  unit tests + package suites) passed; `pnpm test:e2e` 23/23; parity strict 13/13.

## Current release state

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
- Native computer use is ref-bound, snapshot-bound, approval-gated, background-capable, and excludes
  auth/security surfaces and unsafe targets.
- Real model turns can retain their host-minted native app/window grant for up to ten minutes;
  every action still revalidates the live process, exact window, latest snapshot ref, and explicit
  approval. This replaces the one-minute grant that expired during legitimate model reasoning.
- Every Chrome attachment now receives a fresh opaque CUA session id. Detach still revokes all
  origins/refs and ends the driver session, while a later explicit reattach no longer reuses a
  terminal session name.
- Optional ElevenLabs voice supports realtime dictation, read-aloud, per-agent voices, interruption,
  bounded narration, in-memory audio, and Keychain-backed secret storage. It is not a free-running
  voice-agent loop.
- Gmail, Drive, and Slack remain optional cloud gateway features. Do not authorize them in the
  local-focused alpha; signed-in Chrome and native computer use operate the user's existing local
  sessions instead. Provider-owned OAuth consent remains mandatory if the cloud gateway is resumed.
- Research capture is opt-in, locally encrypted, retention-bounded, and excludes reasoning, secrets,
  commands/output, diffs, paths, browser/connector/auth data, and mutations.
- The UI has completed the premium/minimal polish pass, compact-width checks, light/dark inspection,
  motion/reduced-motion coverage, accessibility work, and asset audit. No known clipping or
  horizontal bleed remains in the tested sizes.

### Settled-source automated baseline

These passed on the settled source on 2026-08-17 after the local CUA fixes.

- `pnpm check`: build, formatting, quality guard, typecheck, and 321 unit tests passed; the one
  explicitly opt-in real isolation smoke remained skipped in this aggregate invocation.
- `pnpm test:e2e`: 23/23 enabled Electron Playwright tests passed; four opt-in real tests skipped as
  expected in the baseline invocation.
- `pnpm test:e2e:parity:strict`: 13/13 passed.
- `pnpm test:codex-isolation:real`: passed without sending a model turn.
- `pnpm test:e2e:real:no-turn`: real Codex auth, selected-window Chrome attachment, and macOS CUA
  probes passed 3/3 against a uniquely titled benign Chrome window.
- `pnpm test:e2e:real:capabilities`: a constrained Codex turn called `browser_tabs` and
  `computer_list` without mutating state; 1/1 passed.
- Prior live walkthroughs at normal and 960x640 sizes reported zero renderer/page errors.

### Signed macOS artifact

- Current artifact: `apps/desktop/release/mac-universal/Sia.app`
- Distribution files:
  - `apps/desktop/release/Sia-0.1.0-alpha.1-universal.dmg`
  - `apps/desktop/release/Sia-0.1.0-alpha.1-universal.zip`
- Installed signing identity:
  `Developer ID Application: Lawrence Jang (DXYJ578DD4)`
- Notary profile: `notarytool-profile`
- The current app was rebuilt from the settled source and rechecked on 2026-08-17:
  - `codesign --verify --deep --strict`: pass
  - Gatekeeper `spctl --assess`: accepted, Notarized Developer ID
  - `xcrun stapler validate`: pass
  - app notary submission `ad5e47eb-2d98-4e85-b72b-7f4e98eb0eb5`: accepted at
    `2026-08-17T08:27:05.209Z`
  - DMG notary submission `d794111d-1966-448e-a573-918d8f7be8cf`: accepted at
    `2026-08-17T08:29:03.034Z`
  - DMG SHA-256: `e7f4a91d158bf88bbc6aac06af22daa3fd5f0aa62d560f57c34f68dd6aa14603`
  - ZIP SHA-256: `bc6f34fdb4b1324705c403f7025f8b6a66e98484fbf7728f667fe590370740c6`
- The obsolete `/Applications/Sia.app` is not this product build and was quit during acceptance. Do
  not relaunch or distribute it; use only the artifact paths above.
- Rollback artifact: `apps/desktop/release-signed-current-20260816-final/`
- Contained upgrade simulation: the notarized
  `apps/desktop/_old-builds/release-signed-ux-final-v2/mac-universal/Sia.app` created an `Upgrade fixture v2`
  agent and completed thread in a fresh temporary profile. Opening the final signed artifact against
  that same profile preserved the agent, thread, provider/model settings, and original reply; Codex
  remained installed/authenticated and a new read-only exact-reply workflow completed. This is strong
  migration evidence but does not replace the final installer pass under a disposable macOS account.
- Do not distribute this artifact until the open microphone, upgrade-account, and recipient-list
  gates below pass. Rebuild and notarize again after any further source change.

## AWS release stack

- AWS account: `677513020767`
- Region: `us-east-1`
- Stack: `sia-alpha`
- Stack status checked 2026-08-17: `UPDATE_COMPLETE`
- API base URL: `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha`
- Cognito region: `us-east-1`
- Desktop Cognito client ID: `331ej6ep7pojlil9k944v4fn7d`
- Alarm email subscription for `superintelligentagents@gmail.com` is confirmed.
- All nine `sia-alpha-*` alarms are currently `OK` with actions enabled.
- The real account-deletion API -> SQS -> deletion-Lambda success path previously passed and left no
  synthetic Cognito user behind.
- A controlled synthetic deletion message failed five worker deliveries, reached the DLQ, triggered
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

**Local-release decision (2026-08-17):** Composio is not required for the local-focused alpha. Keep
the deployed connector control plane dormant, do not grant the remaining managed Slack config, and
do not treat connector verification, provider identities, or public OAuth branding as local-mode
release gates. The history below is retained so cloud connector work can resume without repeating
security discovery.

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
  - Slack managed, pending replacement: `ac_hobLkrc2crrm`
- The AWS secret contains the reviewed 11-action canonical-to-provider allowlist.
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
  the provider returned `404` for the synthetic connection. Current Gmail/Drive/Slack connection
  counts are all zero.
- After the key cutover, a direct invocation of the deployed control Lambda created a Gmail hosted
  link (`201`), cancelled it (`200`), and confirmed the provider-side account was gone (`404`).
- After the custom Google config cutover, fresh deployed control-Lambda invocations created hosted
  Gmail and Drive links (`201` for each) and cancelled both (`200` for each). Composio then reported
  no remaining Gmail or Drive connections.
- In the exact signed artifact, the disposable Sia identity reached the provider-owned Gmail, Drive,
  and Slack OAuth pages. Gmail and Drive were cancelled from Sia; Slack was denied on Slack's page
  and its failed placeholder was disconnected. Sia returned to `0 of 3 connected`, and guided setup
  did not advance to a later provider after cancellation.

### Deferred cloud connector work

Do not authorize the remaining managed Slack config for release users. A Computer Use inspection of
the original managed provider URLs on 2026-08-17 found:

- Gmail requests 11 scopes, including full `https://mail.google.com/` access plus unrelated contacts,
  addresses, birthday, phone-number, language, and profile/email scopes.
- Google Drive requests full `https://www.googleapis.com/auth/drive` access plus `userinfo.email`.
- Slack requests dozens of user scopes, including calls, files, reminders, reactions, pins, links,
  profile/workspace writes, and other capabilities outside Sia's three allowlisted Slack actions.
  Slack also labels the managed Composio app as not approved by Slack.

The overbroad managed Gmail and Drive configs have now been replaced. The managed Slack config must
still be replaced before any future cloud-connector tester grants Slack access. The server-side
action allowlist limits what Sia can execute, but it does not narrow the access users grant at a
provider consent screen. None of this is required for local Chrome/native computer use.

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
- A separate `Sia` app `A0BQQJLG328` now exists in the intended `Russ Lab` workspace. It has the two
  reviewed Composio callbacks, exactly the six user scopes `search:read`, `channels:history`,
  `groups:history`, `im:history`, `mpim:history`, and `chat:write`, and no bot scopes. It was installed
  once during setup; the generated user OAuth token appeared in browser inspection output and was
  immediately revoked. Slack now offers **Install to Russ Lab** again, so no live user OAuth token
  remains from that installation.
- The Russ Lab client ID and client secret were captured only in the browser-control process and were
  not written to this repository, printed, or sent to Composio. A custom Composio Slack config was
  staged with exactly six scopes, then canceled before credential entry or creation. The AWS runtime
  mapping therefore still points to managed config `ac_hobLkrc2crrm`.
- Deprecated Slack verification-token values appeared during inspection. Neither Slack app has
  triggers enabled, and neither app is used by local mode. If cloud Slack work resumes, rotate those
  values before use and delete the unused RLC/Russ Lab records only after fresh permanent-deletion
  confirmation.
- Public Slack distribution remains deferred and would require the operator-controlled homepage,
  privacy/support, and terms URLs plus a custom Composio config. It is not a local-mode release gate.

The Composio dashboard also currently lists `sia_production_runtime` and `Getting Started` as **Full
access** project keys alongside the scoped `sia-alpha-runtime-20260817-release` key. The dashboard offers a
permanent **Revoke** action for both. Reconcile their consumers and revoke them with an operator
handoff before distribution; do not assume that the earlier rejected predecessor-token probe proves
these two dashboard rows are harmless.

## Deferred cloud-connector acceptance

This section is not required for the local-focused alpha. Run it only when the optional cloud
connector gateway returns to release scope. Use designated disposable accounts and benign fixtures;
never substitute an operator or maintainer account. The current Composio configs have zero
connections. Do not continue past a provider consent screen until the overbroad OAuth configs above
have been replaced.

1. Launch the cloud-enabled signed Sia build with a disposable profile.
2. Sign into Sia with the disposable email and complete the Cognito email OTP.
3. In Settings -> Apps, choose **Connect work apps**.
4. Complete Gmail consent, then Drive, then Slack using the intended disposable identities.
5. Verify the UI shows the exact connected identity for all three.
6. Run one read per provider.
7. Approve one exact write per provider using non-sensitive fixtures.
8. Disconnect all three and verify provider-side revocation and no remaining Composio account.
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
2. Confirm the intended alpha recipient list outside the repository and tell recipients this is a
   local-mode alpha: continue locally and do not authorize Gmail, Drive, or Slack connected apps.
3. Keep connector OAuth, Composio key reconciliation, provider acceptance, and cloud-account deletion
   in the deferred cloud backlog. They become release gates only if those features return to scope.
4. If any source changes, rebuild, notarize, repeat artifact verification, and update the artifact
   hashes in this handoff.

## Important product boundaries

- Schedules/background tasks run while the Sia process is open and the Mac remains awake; this is
  not an OS login daemon or remote cloud workcell.
- Persistent terminals are user-operated and intentionally not exposed as an unrestricted model
  shell.
- Gmail/Drive/Slack cloud connectors are outside this local release; local Chrome/native computer
  actions use the user's existing sessions and remain explicitly approval-gated.
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
