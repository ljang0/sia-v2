# Workflow robustness

Source review of `codex/codex-setup`, based on `afb0c53` plus the current working tree.
This is a source and deterministic-test audit of the major user workflows. It is not an
all-app live acceptance result. The public release remains gated by [public-release.md](./public-release.md).

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
- **Schedules/goals:** schedules persist a claim before dispatch, keep stable run IDs and finite
  limits, but require Sia open and the Mac awake (`controller.ts`). Test wake across a due time,
  timezone/DST changes, overlapping long tasks and crashes on each side of dispatch. Decide explicitly
  whether missed runs should be skipped or run once on return; do not promise an offline cloud worker.
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
| Dictation, voice conversation and read aloud  | Renderer voice lifecycle, `voice-service.ts`, factory, push-to-talk/native helper; new lifecycle regressions                          | Physical audio devices, sleep/wake and authenticated shared-voice round trip                     |
| Foreground/background desktop and browser     | CUA queue, action backend and native exact-window matching; bounded-call and synthetic geometry tests                                 | Chrome/Slack across Spaces, minimized/full-screen windows, no-op clicks and recovery             |
| Google, Slack and Messages                    | Controller connection polling/ownership, cloud services and typed action gateway; OAuth and scope fixtures                            | Disposable-account reconnect/revoke, Slack multiple workspaces, Messages Full Disk Access        |
| Files, attachments, Git and commands          | `workspace-operations.ts`; real Git fixtures, path/symlink guards, snapshots, bounded output and process-group cancellation           | Interrupted large file operations, disk pressure and packaged helper behavior                    |
| Schedules, goals and activity                 | Persisted schedule claims/history, finite limits, thread completion and notification paths                                            | Sleep, restart, DST and long-running overlap                                                     |
| Phone remote                                  | `phone-remote.ts`; replay, stale-command, rotation, lock and path tests                                                               | Encrypted transport and physical-phone/network acceptance                                        |
| Memory, skills and Scotty                     | Controller/shared task routes and existing assistant/Scotty suites; no separate authority path                                        | Stale tray controls, multiple displays and fullscreen interactions on the packaged app           |
| Research export/deletion and account deletion | Controller generation-bound sync, cloud services; retryable outbox and deletion/export fixtures                                       | Partial AWS failures, actual alarms, operator-reviewed production evidence                       |
| Updates and public download                   | Signed manifest, release identity and public artifact staging guards                                                                  | Notarized recipient install/upgrade, published digest and download verification                  |

## Verification record

- Before fixes: eight focused identity/voice cases failed; controller sign-out added a ninth failure.
- After initial fixes: 22 focused identity/voice tests passed. Full `pnpm test:pilot` passed: 696 desktop unit/component tests (6 explicit skips),
  135 cloud tests and 46 desktop/phone UI tests (4 explicit live skips), plus runtime,
  action-gateway, tool-bridge, native, formatting, build and type checks. A subsequently added
  removed-voice regression is verified separately; no product source changed after that full gate.
- Shared voice: destination-specific approval received; transfer is waiting for local Keychain access.
  The hosted-voice-only production change set is prepared but has not been executed. An anonymous
  request to the deployed voice catalog returned HTTP 401. No authenticated shared-voice result
  is claimed yet.
- A separate universal signed candidate was built at
  `apps/desktop/release/robustness/mac-universal/Sia.app`; strict nested code-signature verification
  passed. Its `app.asar` SHA-256 is `cae4fdbdaf984940af39dc23862dc79806c19dd2ea738030bf3a3a44b1f29785`.
  It is not notarized, published or launched for live acceptance. The existing open app was preserved.
- Final focused identity/voice/factory suite: 26 tests passed, including the removed-voice regression.
- No model-backed turns, real messages, private microphone capture or public publication were run
  during this audit. No third-party key is included in source, fixtures or documentation.
