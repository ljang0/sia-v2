# Workflow robustness

Source review of `codex/codex-setup`: robustness checkpoint `1fa1528`, incorporating
the three subsequent `origin/romir` commits through `148b452`.
This is a source and deterministic-test audit of the major user workflows. It is not an
all-app live acceptance result. The public release remains gated by [public-release.md](./public-release.md).

## Responsiveness and compact UI

The local Codex reference was inspected read-only at
`/Applications/ChatGPT.app/Contents/Resources/app.asar`: package
`openai-codex-electron` version `26.915.31945`. Its bundled shared CSS defines a 46px
toolbar, 14px base text and a 4px spacing unit. This is an implementation reference, not a
measured speed comparison. No Codex account data or application state was exported.
The [official App Server lifecycle](https://learn.chatgpt.com/docs/app-server) uses a persistent
connection and thread with streamed turns. Sia already reuses matching sessions; it does not
restart a provider for each follow-up.

- **Codex startup:** concurrent callers now wait for the same complete handshake. Failed
  initialization disposes its peer and the next request starts a fresh one. Session reset remains
  reusable; a late pre-reset factory cannot install its old connection over the replacement.
  Linked JSON-RPC peer tests reproduce both original failures and exercise reset recovery.
- **Streaming:** renderer snapshots still publish at a 50ms cadence; full encrypted state is
  checkpointed at most every 500ms for text deltas. Completion, actions, non-streaming changes and
  shutdown persist immediately. In the same deterministic 30-delta / 20ms fixture, full-state
  writes fell from 13 to 4 while 13 snapshots reached subscribers. SQLite plus an actual
  AES-GCM test cipher exercises storage; this measures local write work, not model or network
  latency. An abrupt process/OS failure can lose up to roughly 500ms of unfinished streamed text.
  Graceful shutdown preserves the partial response and cancels both pending timers.
- **Task preparation:** initialize the provider before acquiring the GUI lease, and acquire fresh
  screen context after ownership. A competing-turn regression proves preparation can proceed
  while another task owns the screen, without permitting an early action. Duplicate memory-vault
  initialization was removed. The whole action loop remains exclusive; this is not parallel GUI
  control or a guarantee that an app never activates itself.

| Before                                                                   | After                                                                          | Why                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 284px sidebar and 76px chat header                                       | 260px sidebar and 58px header                                                  | More room for the task without shrinking the conversation text.                            |
| 54px top gap, 30px event gaps and 28px composer bottom padding           | 28px, 22px and 16px respectively; smaller composer padding                     | Less chrome and scrolling at the minimum 960×640 window.                                   |
| Large empty-thread artwork with automatic bottom scrolling               | Compact artwork; an empty conversation starts at the top                       | The welcome and suggested starts remain accessible instead of opening clipped.             |
| Failure reason repeated in the answer, banner and timeline notice        | Keep the answer, status and Continue control; suppress identical repeated text | Preserve the reason and recovery action with less clutter. Distinct errors remain visible. |
| Smooth scrolling on every keyboard find match                            | Immediate keyboard search navigation                                           | Repeated find commands do not queue animations.                                            |
| Oversized Settings header/navigation/content padding                     | Reduced shell and content spacing                                              | Expose more settings while retaining category labels and row control spacing.              |
| Scotty’s oversized welcome artwork placed its main action below the fold | Compact preview and copy, followed immediately by the main action              | The primary button is visible at 960×640, with size and animation controls directly below. |
| Four always-visible icons for Goal, Changes, Command and Schedules       | One labelled Tools menu with the same actions                                  | Keep occasional utilities out of the everyday chat path.                                   |
| Send feedback occupies a permanent sidebar row                           | Feedback lives in Settings → More → About and the existing quick switcher      | Keep help reachable without a competing primary navigation item.                           |

The refreshed visual baselines cover light/dark conversation, Settings, connections, quick switcher,
agent dialog and Activity. The minimum-window check asserts usable conversation height, visible
composer and an unclipped empty state. Screenshots wait for idle rather than the transient completion
animation. The Tools menu uses labelled, keyboard-accessible items and returns focus to its trigger
when a utility closes. Chat, attachments, voice and Stop remain direct controls. No additional
product feature, permission or service was introduced. Full verification status is recorded below.

The deterministic Electron harness disables background animation throttling only in fake-service
fixtures and bounds page-close cleanup before terminating its own test process. Real app probes
retain production window behavior. The launcher-result screenshot stalled again after its functional
assertions passed. The launcher hides on blur; its result artifacts now use Electron's native
`capturePage` with `stayHidden`, which supports hidden windows, and reject empty images. The complete
launcher fixture passed afterward (3.0s), and both light/dark artifacts were visually inspected.
The production launcher and its blur behavior are unchanged. The earlier timeout is retained as a
failed gate; its exact window visibility at the timeout was not recorded.

The real profile was visibly checked: Codex plan connected; Use my Mac with Work in background,
Allow brief foreground control and Bypass action approvals enabled; Accessibility and Screen
Recording allowed. Sia opened after the earlier Keychain handoff. The initial two real, manually
submitted Codex turns exercised only public Example Domain/IANA pages:

| Test                                                       | Observed result                                                                                                                                                                                           | Timing from accepted user message                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Open example.com, inspect it and click Learn more          | Exact-window read returned Example Domain; background accessibility click reached Example Domains at `https://www.iana.org/help/example-domains`. Independently confirmed through the browser UI.         | 40.6s to completion; first browser inventory at 6.9s, first page snapshot at 13.8s. |
| Reuse the IANA tab and click IANA-managed Reserved Domains | Background click was delivered. Sia's next read refused the window as protected. Independent browser observation subsequently confirmed the correct reserved-domains page. This turn failed verification. | First assistant response at 7.7s; failed turn finished at 40.5s.                    |

Both turns used background action delivery. Chrome became active during the first open and was
already active during the follow-up. Neither is proof of uninterrupted background use while the
person works in another app. Chrome/Slack across Spaces, minimized/fullscreen windows and
cold/warm speed comparisons remain unverified. No real messages were sent or app permissions changed.
Exact diagnostic evidence: local trajectory `be1e1505-dcea-4a52-a5ec-95a948e1c5fc`, September 24,
21:00:53–21:06:14 UTC. This is a live development-build check, not signed-release acceptance.

The refusal investigation found a reproducible matcher defect: `sign.?in` matched the start of
“Signing,” and `log.?in` matched part of “Blogging.” The public
[IANA page](https://www.iana.org/domains/reserved) has “Root Key Signing Key (DNSSEC)” and
“Key Signing Ceremonies” links. Replaying those labels through the actual action backend reproduced
`protected_window`; word boundaries now permit them, while tests retain sign-in, login, signing-in
progress and secure-field protection. The recorded refusal does not include its matched label, so
this is a source-confirmed explanation consistent with the observed page, rather than a captured
native reason. After the user reported Keychain approval, Sia was confirmed open and three more
public-page turns ran on the corrected build:

- At 21:38:50 UTC, IANA reserved domains was read successfully, including a fresh exact page URL
  and the “Root Key Signing Key (DNSSEC)” text. The previous false protection block did not recur.
  The real UI showed Getting ready complete while the turn was still running. Chrome was inactive
  before opening, briefly active afterward, and inactive at the end. CUA returned `ax_unresolved`
  with all three background input routes refused; no click was sent. This failed turn took 50.7s.
- At 21:43:07 UTC, a follow-up targeting the existing page stopped with an expected-URL mismatch;
  the test window no longer showed IANA. It did not read the replacement page or click elsewhere.
  This demonstrates stale-target rejection, not successful foreground recovery.
- At 21:44:44 UTC, a continuous open/read/click attempt opened the public page but its first exact
  read failed with `session_ended`; no click was sent. The reusable provider conversation had also
  been used as the CUA session label. A terminal driver session then poisoned later requests.

The installed CUA 0.21.0 source was inspected at commit
`70db98d1bcd92890d778f4978e0eb107a4b66c1b`:
[`ax/exact_target.rs`](https://github.com/trycua/cua/blob/70db98d1bcd92890d778f4978e0eb107a4b66c1b/libs/cua-driver/rust/crates/platform-macos/src/ax/exact_target.rs)
requires the exact native id in fresh `AXWindows` membership. Its `get_window_state` deliberately
returns observation-only state when that identity is unresolved, because input could reach another
window owned by the same process. Sia's supplemental native reader resolving the page does not
establish a safe CUA input route. No driver guard was bypassed or dependency replaced.

Native computer sessions are now scoped to each active turn with a fresh opaque label, while Codex
conversation reuse and explicitly attached browser sessions retain their own lifetimes. New turns
revoke old refs before resolving targets; cancelled old callers cannot revoke current refs. The
regression simulates the prior session ending, proves fresh read/click success on the next turn,
and verifies old refs cannot post input. After the full gate passed, the idle app was quit and
reopened into the rebuilt source. A one-second process sample initially confirmed the main process
waiting in `SecItemCopyMatching` / `SecKeychainItemCopyContent`
(`/private/tmp/sia-session-startup.sample`). On the next continuation, Sia was confirmed open;
that Keychain handoff is no longer pending.

Two additional turns ran on the rebuilt app at 22:24:19 and 22:26:30 UTC. The first opened IANA,
but both exact-URL checks rejected the subsequently changed page and withheld its content; no
click was sent (32.3s). The second found no IANA-titled native window and stopped before reading
content (9.7s). An independently prepared public tab remained readable through the browser tool.
The operator then confirmed using Chrome during the test. These runs therefore do not isolate
window-matching behavior, nor do they exercise the corrected native capture session successfully.
After the operator confirmed readiness, a steady-window repeat at 23:11:43 UTC found the
IANA window after opening, but exact-page inspection returned `protected_window` (27.6s). No click
was sent. The recorded result contains no matched protection label, so the cause remains unresolved.
True background clicking in this case and brief foreground recovery remain unproven. Do not infer a native driver regression or a
successful session recovery from these two interrupted tests.

The same live run exposed a misleading progress label: `runtime.start` stayed running for the whole
turn, so the header fell back to “Getting ready” between browser actions. It now completes when the
provider first begins visible work; the tool activity remains running until its own result. A gated
runtime regression proves these two lifetimes separately. No new UI controls were added.

## Consumer UI cleanup

A second pass removes visual clutter from the ordinary chat and settings path:

| Before                                                                          | After                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent-colored header text and red failed-step text read like a persistent error | Neutral chat headers, activity labels, notices and composer errors; failure icons, explanatory text and Continue controls remain explicit      |
| Nine regular Settings categories, plus administrator pages                      | Scotty and Phone remote are primary; Appearance and About live under More. Connections also lives under More in Use my Mac.                    |
| Chrome attachment and website launch controls repeated in Computer              | Connections is the single browser attachment route; Computer links to it in Connected apps mode.                                               |
| Repeated implementation and access-mode explanations                            | Short descriptions alongside the controls they explain; permission status and setup stay visible                                               |
| Full local-log controls compete with everyday settings                          | Diagnostics disclosure, with the current local-log state visible in its summary                                                                |
| Voice setup and unavailable Fn controls remain prominent                        | Connected voice omits the setup button; unavailable Fn controls are absent unless already enabled; refresh/disconnect live under Manage voices |
| Long research policy text occupies the Privacy page                             | Research status and consent controls stay direct; the full explanation is available in a disclosure                                            |

Phone remote is explicitly labelled a preview on its page. This pass changes presentation and
navigation, not users' permissions, stored feature choices, research consent or automatic approvals.
Optional feature backends and existing saved data are retained. The assistant library remains
available under More; removing or graduating those capabilities is a separate product decision.
The existing recovery fixture now checks neutral failure text and distinct error icons in both
color schemes, while retaining its no-replay and stale-request checks. Keyboard menu navigation,
small-window layouts, zoom, onboarding, memory workflows and admin access are exercised through
the real renderer with deterministic services. Updated final gate results are recorded below.

## Defects corrected in this pass

| Priority | Failure                                                                                                                                         | Correction and regression evidence                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | A successful token refresh arriving after sign-out could restore the old account. A rejected old refresh could erase a newly signed-in account. | `identity.ts`: authentication generations, exact token ownership and ownership-aware refresh deduplication. `identity.test.ts` exercises delayed success after sign-out and delayed rejection after account switch.                                                           |
| P1       | Email verification arriving after sign-out could sign the person back in.                                                                       | Pending challenge ownership checks after network responses; generation checks around sign-in and MFA enrollment. A delayed email challenge regression exercises the real manager and repository. Password/MFA guards also typecheck; their existing normal-path tests remain. |
| P1       | Disconnecting voice while its catalog or token request was pending could enable voice again or send text/audio afterward.                       | `voice-service.ts`: abort the service lifetime, reject stale responses before provider I/O, and prevent use after disposal. Regression tests cover catalog, realtime STT, batch STT and TTS token races.                                                                      |
| P1       | Speech generation sockets survived disposal, and controller sign-out did not disconnect voice.                                                  | Track and close speech sockets. Disconnect voice at sign-out/account deletion. Regressions cover disposal and controller sign-out. The existing renderer tests cover ending listening/loading/playback.                                                                       |
| P1       | A fresh real Mac selected Apple speech even when shared ElevenLabs was configured.                                                              | `voice-factory.ts` makes cloud-configured builds use included ElevenLabs. Factory tests configure the actual service both with and without a device credential, and retain native fallback for local builds without cloud configuration.                                      |

Nine new regression cases failed before their corresponding fixes. Three additional service-selection
cases cover the new default. Pending review and test results are recorded below rather than inferred
from implementation.

## Remaining priorities

### P0 — Public distribution evidence

The candidate is signed, but is not notarized or a published installer. A new Sia profile on the
operator's Mac reuses existing OS grants, Keychain and Codex state. It cannot establish the experience
of an unrelated recipient. Complete the notarization, public email and clean-Mac gates in
[public-release.md](./public-release.md), then test that exact downloaded artifact and its upgrade
from the previous signed release. Keep blocked production login-lifetime/email changes separate.

### P1 — Shared voice capacity and lifecycle

- The server has authenticated minting, a per-user UTC-day limit and API Gateway throttling
  (`apps/cloud/src/services.ts`, `aws.ts`, `infra/template.yaml`). The current limit is 20 token
  requests per user per day. This is **not a global monetary ceiling**. Add an account-wide budget,
  concurrency limits and operator alerts before unrestricted public growth. A conversational
  exchange usually needs both a transcription and speech token; expose remaining usage and a
  useful reset/retry message in Settings rather than an unexplained failure.
- The provider catalog reads the first 50 name-sorted voices (`ElevenLabsHttpProvider.catalog`).
  An allowlisted voice outside that page disappears. Implement bounded pagination or exact voice
  lookup and regressions for later-page voices, duplicate cursors and an empty allowlist.
- A voice allowlist filters the catalog. It does not constrain arbitrary client use of a minted
  native token. A strict per-request audio/text/voice budget requires provider-enforced restrictions
  or a metered relay. Do not describe client character limits as server-side spend enforcement.
- The current refresh no longer restores a removed selected voice into a new server catalog.
  The removed-voice case has a regression; add empty-catalog and expired-token tests. An outage should preserve
  a usable saved preference while honestly displaying availability.
- Run physical microphone/Fn tests on the packaged app: rapid start/stop, quiet speech, denied
  microphone, unplugged headset, network loss, sleep/wake and quota exhaustion. The earlier live
  synthetic ElevenLabs round trip did not exercise the microphone or OS shortcut.

[ElevenLabs' token contract](https://elevenlabs.io/docs/api-reference/tokens/create) provides
single-use tokens for the three supported operations with a 15-minute expiry. Sia keeps the
long-lived operator key in AWS Secrets Manager; the renderer never receives it. Shared-service
activation and verification status are recorded below.

### P1 — Background computer use and uncertain writes

`cua-service.ts` bounds driver calls, cancels queued work, retires hung drivers, and renews only
unscoped read-only inventory. `action-backend.ts` checks exact window identity, supported delivery
routes and explicit foreground fallback. Preserve these restrictions.

The remaining gap is live acceptance across Spaces, minimized windows and multiple Slack/browser
windows. Test both “Pause and tell me” and permitted brief foreground recovery. Require a fresh
observation of the intended window and visible completion evidence. A driver reporting that input
was delivered does not prove a message was sent or the intended page changed.

`task-recovery.ts` asks the model to inspect before repeating writes; that instruction is not a
durable action deduplication system. Add a receipt keyed to an external write and verify the
remote result before offering a retry when the acknowledgement is lost. Test a crash immediately
after the remote write. Never automatically replay an uncertain send/upload.

### P1 — Phone remote transport

`phone-remote.ts` binds a local network address, checks origin/host/token, invalidates rotated links,
and deduplicates recent request IDs. Its pairing URL and traffic use HTTP. On an untrusted LAN,
transport confidentiality is not established. Add an authenticated encrypted channel (or confine
this preview to a trusted network) before marketing it as general remote access. Test a real phone
through network changes, link rotation, lock/unlock and a lost response. Existing HTTP fixture tests
do not establish transport secrecy or real Wi-Fi reliability.

### P2 — Recovery and consumer clarity

- **Authentication:** deployment still needs an approved session-lifetime decision. Keep offline
  refresh failures recoverable, and distinguish expired/revoked credentials from temporary outages.
  Test overlapping new sign-ins, delayed cloud feature responses and logout during account setup.
- **Onboarding:** a single setup entry can guide OS approvals, but cannot guarantee that macOS will
  collapse them into one dialog. Test each denial and cancellation on a fresh account, status changes
  after returning from Settings, and restart mid-setup. Verify Codex install/update with no existing
  binary, interrupted network and browser login cancelled/expired. Use the pinned admitted release.
- **Schedules/goals:** schedules persist a claim before dispatch, keep stable run IDs and optional
  run limits, but require Sia open and the Mac awake (`controller/schedules.ts`). Test wake across a due time,
  timezone/DST changes, overlapping long tasks and crashes on each side of dispatch. Day-based
  cadences (daily, weekdays, chosen days) step local calendar days, so 8:00 AM stays 8:00 AM across
  DST (`shared/schedule-cadence.ts`). A run missed while the Mac slept runs once on wake, then later
  missed runs are skipped rather than replayed; do not promise an offline cloud worker.
- **Connectors:** OAuth polling checks pending connection identity and tolerates temporary outages.
  Verify real Google token revocation and Slack workspace switching with disposable accounts.
  Cohort restrictions and Google verification remain separate public-release gates. Browser fallback
  availability is not proof that a connector request succeeded.
- **Updates:** the signed manifest verifies metadata, but `#openUpdateDownload` opens a DMG link.
  Sia app updates are not yet an install-and-relaunch flow. Keep this distinct from the existing
  one-button managed Codex installer, which verifies its archive and switches versions atomically.
- **Storage:** encrypted records and unreadable database preservation have fixtures. Test disk-full,
  locked Keychain and update continuity on a signed recipient build. Recovery must explain where
  preserved data lives; do not silently equate a fresh database with successful restoration.

## Workflow coverage and next acceptance

| Workflow                                      | Code paths examined / existing checks                                                                                                 | What remains to prove live                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Install, Codex setup and permissions          | `index.ts`, `codex-installer.ts`, discovery/probe, controller setup; archive tamper/wrong-version/idempotency and onboarding fixtures | Clean Mac download, browser sign-in, each denied OS permission, resumable interrupted setup      |
| Sia login, MFA and logout                     | `identity.ts`, controller identity boundary, encrypted repository; normal auth/MFA and new stale-response regressions                 | Fresh recipient email, revocation and upgrade continuity; approved long-lived session deployment |
| Typed chat, cancel and continue               | Controller turn loop, `runtime-coordinator.ts`, `task-recovery.ts`; leases, approval revocation, failed-turn recovery tests           | Provider exit mid-action, exactly-once recovery of external writes                               |
| Dictation, voice conversation and read aloud  | Renderer voice lifecycle, `voice-service.ts`, factory, push-to-talk/native helper; new lifecycle regressions                          | Physical audio devices and sleep/wake; authenticated synthetic shared-voice round trip passed    |
| Foreground/background desktop and browser     | CUA queue, action backend and native exact-window matching; bounded-call and synthetic geometry tests                                 | Chrome/Slack across Spaces, minimized/full-screen windows, no-op clicks and recovery             |
| Google, Slack and Messages                    | Controller connection polling/ownership, cloud services and typed action gateway; OAuth and scope fixtures                            | Disposable-account reconnect/revoke, Slack multiple workspaces, Messages Full Disk Access        |
| Files, attachments, Git and commands          | `workspace-operations.ts`; real Git fixtures, path/symlink guards, snapshots, bounded output and process-group cancellation           | Interrupted large file operations, disk pressure and packaged helper behavior                    |
| Schedules, goals and activity                 | Persisted schedule claims/history, optional run limits, thread completion and notification paths                                      | Sleep, restart, DST and long-running overlap                                                     |
| Phone remote                                  | `phone-remote.ts`; replay, stale-command, rotation, lock and path tests                                                               | Encrypted transport and physical-phone/network acceptance                                        |
| Memory, skills and Scotty                     | Controller/shared task routes and existing assistant/Scotty suites; no separate authority path                                        | Stale tray controls, multiple displays and fullscreen interactions on the packaged app           |
| Research export/deletion and account deletion | Controller generation-bound sync, cloud services; retryable outbox and deletion/export fixtures                                       | Partial AWS failures, actual alarms, operator-reviewed production evidence                       |
| Updates and public download                   | Signed manifest, release identity and public artifact staging guards                                                                  | Notarized recipient install/upgrade, published digest and download verification                  |

## Verification record

- Consumer UI cleanup: the complete `pnpm test:pilot` passed, including build, formatting,
  quality, type checks, **720 desktop tests (6 explicit skips), 52 runtime tests (6 explicit
  skips), 135 cloud tests**, other package/native gates, and **46 UI tests (4 explicit live
  skips)**. Log: `/private/tmp/sia-consumer-ui-pilot.log`. Earlier focused runs exposed a
  persisted-fixture status mismatch and a color assertion during a theme transition; the fixture
  now uses the actual failed-state schema and waits for the final color. Both themes retain
  explicit failure icons and recovery actions. Recovery, Computer, Voice, Assistant and Privacy
  screenshots were visually inspected. The idle real app was refreshed through View → Reload;
  the six primary Settings categories and More menu are present, ElevenLabs reports ready, and
  the enabled Fn controls remain visible. This was a read-only voice UI check, not a microphone
  or provider round trip. No permissions, voice preferences or account state were changed.

- Computer-session lifecycle: the new later-turn regression failed on the prior implementation,
  then the action-backend and CUA-service suites passed together (141 tests), including stale refs,
  no replay, and a late cancellation. Logs: `/private/tmp/sia-computer-session-before.log` and
  `/private/tmp/sia-computer-session-after.log`. The complete `pnpm test:pilot` passed: build,
  formatting, quality, type checks, **720 desktop tests (6 explicit skips), 52 runtime tests
  (6 explicit skips), 135 cloud tests**, other package/native gates, and **46 UI tests
  (4 explicit live skips)**. Log: `/private/tmp/sia-computer-session-pilot.log`. The new source
  is built locally; no signed candidate was replaced or published.

- Browser refusal and progress corrections: the regressions failed before the fixes. The full
  controller suite then passed (121 tests), and the full action-backend suite passed (120 tests,
  including 13 public-text/authentication cases). Logs: `/private/tmp/sia-progress-before.log`,
  `/private/tmp/sia-progress-after.log`, `/private/tmp/sia-signing-before.log`, and
  `/private/tmp/sia-signing-after.log`. The first complete pilot run passed all source gates
  (719 desktop tests, 6 explicit skips) and 45 UI tests, with 4 explicit live skips, but failed at the
  launcher-result screenshot. Log: `/private/tmp/sia-browser-progress-pilot.log`. The launcher capture
  correction passed its complete fixture (`/private/tmp/sia-launcher-native-capture.log`). The final
  complete `pnpm test:pilot` rerun passed: build, formatting, quality, type checks, **719 desktop tests
  (6 explicit skips), 52 runtime tests (6 explicit skips), 135 cloud tests**, other package/native
  gates, and **46 UI tests (4 explicit live skips)**. Log:
  `/private/tmp/sia-browser-progress-pilot-final.log`. The fixed source is built in `apps/desktop/out`;
  the signed public candidate still predates these changes. No deployment or release was made.

- Simplified navigation: the complete `pnpm test:pilot` passed before the latest browser/progress corrections, including
  build, formatting, quality, type checks, 705 desktop tests (6 explicit skips), 52 runtime tests
  (6 explicit skips), the cloud/native/package gates, and **46 UI tests (4 explicit live skips)**.
  The menu is exercised through actual clicks and keyboard navigation at 960×640, including focus
  return after closing each utility. Feedback opens from About; the sidebar no longer exposes it.
  Git changes, command execution, background terminals, goals and schedules remain covered through
  the Tools menu. Current light/dark conversation, Settings and Activity screenshots were inspected.
  Log: `/private/tmp/sia-simplify-pilot-final.log`. Earlier attempts exposed a test menu-name mismatch
  and an obsolete CSS assertion requiring icon-only toolbar labels; those tests were corrected,
  while the real viewport and keyboard assertions were retained. That deterministic run made no real
  provider turn or permission change; the subsequent real browser tests are recorded above.

- Responsiveness/compactness source: the final `pnpm check` portion passed, including build,
  formatting, quality guard, type checks, 705 desktop unit/component tests (6 explicit skips),
  52 runtime tests (6 explicit skips), the cloud, action-gateway, tool-bridge and native gates.
  That `pnpm test:pilot` invocation finished with 45 UI tests passed, 4 explicit real-service skips,
  and a launcher-result screenshot timeout. The isolated launcher rerun passed, followed by a
  complete UI rerun on the same product source: **46 passed, 4 explicit real-service skips**.
  Thus the final source checks and complete deterministic UI gate passed across those runs;
  the earlier timeout was not reclassified. Logs: `/private/tmp/sia-speed-pilot-verified.log`,
  `/private/tmp/sia-launcher-diagnostic.log`, and `/private/tmp/sia-speed-ui-final.log`.
  The new screenshots were inspected across the minimum-window Settings pages, conversation,
  Activity, switcher and agent dialog; Scotty’s primary action and the empty-thread heading are
  visible. Live acceptance remains incomplete for the reasons recorded above. These changes are
  built in `apps/desktop/out`; the previously signed candidate below predates this responsiveness pass.

- Merged Romir changes through `148b452` with the robustness checkpoint `1fa1528`.
  The combined `pnpm test:pilot` passed: 702 desktop unit/component tests (6 explicit skips),
  135 cloud tests, 46 desktop/phone UI tests (4 explicit live skips), and the runtime,
  action-gateway, tool-bridge, native, build, formatting and type gates.
  The UI harness now observes the real setup shutdown and reopens the same disposable profile;
  only Electron’s detached relaunch and process-local fake OS grants are controlled by the fixture.
  It verifies persisted setup completion, relaunch, replay without duplicate agents, and settings
  layouts. This is not a real macOS permission-dialog or OS relaunch acceptance result.

- Before fixes: eight focused identity/voice cases failed; controller sign-out added a ninth failure.
- After initial fixes: 22 focused identity/voice tests passed. Full `pnpm test:pilot` passed: 696 desktop unit/component tests (6 explicit skips),
  135 cloud tests and 46 desktop/phone UI tests (4 explicit live skips), plus runtime,
  action-gateway, tool-bridge, native, formatting, build and type checks. A subsequently added
  removed-voice regression is verified separately; no product source changed after that full gate.
- Shared voice: after destination-specific approval, the saved operator key was transferred to
  Sia AWS Secrets Manager in `us-east-1`. The approved change changed only `EnableHostedVoice`
  to `true`; the `sia-alpha` stack reached `UPDATE_COMPLETE` on September 24, 2026. The existing
  limit remains 20 token mints per signed-in user per day. No session-lifetime or email-sender
  configuration was changed.
- Authenticated shared voice passed using the existing encrypted Sia sign-in, with the original
  profile opened read-only and temporary auth state held only in an encrypted in-memory store.
  The deployed catalog returned 21 voices and all three token types. The actual desktop
  `CloudClient` and `ElevenLabsVoiceService` generated a synthetic sentence and recovered it
  through both batch and realtime transcription; recording cancellation passed. The speech
  round trip took 3.59 seconds. An anonymous catalog request returned HTTP 401. This proves
  the deployed account/broker/provider path, not physical microphone or packaged UI behavior.
- The merged universal signed candidate is
  `apps/desktop/release/robustness/mac-universal/Sia.app`. Strict nested code-signature verification
  passed; the app and native helper contain both x86_64 and arm64. Its `app.asar` SHA-256 is
  `3e7de63c0440e98adc55c4cc6ded13faecc739416f02cfd84eadb4c242e47412`.
  It was launched with a separate empty profile, stayed running beyond the startup/update-check
  window, and visibly reached the real email sign-in screen. The secure-storage page was shown
  during startup; this observation does not establish the absence of an OS Keychain prompt.
  No sign-in or physical-microphone action was performed in this candidate. It is not notarized
  or published; the existing walkthrough app/profile remains unchanged.
- Final focused identity/voice/factory suite: 26 tests passed, including the removed-voice regression.
- No model-backed turns, real messages, private microphone capture or public publication were run
  during this audit. The approved synthetic voice check made paid ElevenLabs requests. No third-party key is included in source, fixtures or documentation.
