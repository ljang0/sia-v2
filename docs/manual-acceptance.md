# Manual alpha acceptance

Automated tests exercise the renderer, host policy, driver contracts, persistence, approvals, and the packaged CUA runtime. Before each external build, also run this local macOS pass with disposable test accounts and non-sensitive sample data.

The 2026-08-17 operator decision narrows the immediate alpha to local mode. Complete **Local mode**,
**Authenticated Chrome**, **Computer use**, the applicable privacy checks, voice checks, upgrade, and
artifact checks before distribution. The **Provider and cloud** section and its OAuth/deletion items
are preserved as deferred gates for a future connector-enabled release; do not authorize connected
apps in the local-focused alpha.

## Automated local parity gate

Run `pnpm test:e2e:parity:strict`. It must pass all thirteen inventory and workflow checks: attachments;
per-thread model/reasoning; archive, search, and fork; background Activity after closing/reopening the
window; interruption recovery without duplicate input; goals and schedules; Git stage/restore in a
real temporary repository; scoped terminal execution; and two concurrent detached worktrees. Then
run `pnpm test:e2e` to cover both the parity suite and the baseline Electron lifecycle/security suite.

The optional `pnpm test:e2e:real:no-turn` suite is enabled with
`SIA_REAL_CODEX_E2E=1`, `SIA_REAL_BROWSER_ATTACH_E2E=1`, and/or `SIA_REAL_CUA_E2E=1`.
It observes real authentication/attachment/permission state without starting a model turn. It does
not replace the mutation checks below. When several Chrome windows are open, set
`SIA_REAL_BROWSER_WINDOW_MATCH` to a unique part of the intended window title.

## Local mode

1. Launch a cloud-enabled build with a fresh profile. Confirm **Sign in to Sia** appears before
   first-agent setup, email-code sign-in works, and **Continue locally** reaches agent setup without
   creating an account. Then launch a cloud-disabled build with a fresh profile and confirm it does
   not request a Sia
   account, cloud configuration, or billing information and that Settings → Apps says **Local mode
   is ready** without disabled connection buttons.
2. Create an agent and confirm the research choice appears only after the agent is saved. Choose
   **Use without sharing**, create a thread, and verify Codex, files, Git, terminal, schedules,
   signed-in Chrome attachment, and granted computer use remain reachable.
3. Repeat with **Join research**, complete one eligible local turn, and export it. Confirm it is
   encrypted locally, reports no pending cloud upload, and survives relaunch.
4. In a test build configured for the release cloud, sign in after step 3. Confirm the pre-existing
   local batch is still present in export but is never submitted by research sync; only a newly
   completed eligible post-sign-in turn may be uploaded.
5. Under Apps, confirm Gmail, Drive, and Slack each have a distinct accessible connection button in
   addition to guided setup. Attach one signed-in Chrome window from its separate row. Open Messages
   from its row and confirm Sia does not request Full Disk Access or read `chat.db`; computer access
   and any outgoing change must remain separately permissioned and approval-gated.

## Authenticated Chrome

1. Open the intended signed-in Chrome window. Attach it from Sia, choose that window if more than
   one is open, approve Chrome's own **Allow remote debugging?** confirmation if shown, and confirm
   only top-level HTTP(S) origins from the selected window appear under Access. Sia must never
   automate that browser-owned confirmation. Quit any obsolete Sia build first, place the intended
   Chrome window on the same macOS Space as Sia, and begin from a Chrome process not already held by
   another automation/debugging client.
2. Snapshot and read a permitted page. Confirm Chrome does not move to the foreground and the result includes semantic state plus a current screenshot when Screen Recording is allowed.
3. Try an authentication route, password field, incognito window, cross-origin link, and a stale ref after navigation. Each must be absent or refused.
4. Request a click, type, and upload against benign fixtures. Confirm the approval names the trusted
   element label/role, target, and exact outgoing text/files before anything changes. Direct
   programmatic browser downloads are intentionally unavailable in this alpha because the embedded
   driver API cannot carry the MCP-host-only download attestation; use Chrome normally for downloads.
5. Cancel once while approval is pending and once while a driver request is running. Confirm no later action is committed and the approval expires.
6. Detach Chrome and explicitly reattach without restarting Sia; it must use a fresh CUA session and
   no old origin/ref may work. Then restart Sia and confirm the reattached origins and refs are gone
   again. Reattachment must always be explicit.

## Computer use

1. Grant Accessibility and Screen Recording to the packaged build. List and snapshot a disposable app such as TextEdit without moving focus.
2. Confirm Sia, browsers, terminals, password managers, authentication/secure fields, Keychain, and system security settings never appear as generic computer targets.
3. Approve a ref-bound edit in the disposable app. Confirm the approval has a human-readable trusted label and that the previously active app is not displaced.

## Voice

1. Create a disposable ElevenLabs API key restricted to speech-to-text, text-to-speech, and voice
   reading, with a low credit limit. Connect it under Settings → Voice, select a voice, restart Sia,
   and confirm the selected voice remains while the key is never displayed again.
2. Press Dictate, grant microphone access, speak a benign phrase, and stop. Confirm the transcript
   is inserted into the composer but is not sent until Enter or the send button is pressed. Deny
   microphone access once and confirm Sia gives a clear recovery message.
3. Send the phrase, then press Read aloud on the assistant reply. Confirm playback can be stopped,
   no audio file appears in the workspace or Sia data directory, and disconnecting ElevenLabs
   removes both voice controls. Check the ElevenLabs usage page for only the actions you invoked.
4. Edit two agents and assign different Voice choices, leaving a third on Default. Confirm each
   explicit voice is used for Read aloud, Default follows Settings → Voice, starting a second reply
   stops the first, and a long reply ends with “remaining details on screen” instead of stopping
   mid-sentence or reading code blocks and the entire response.

## Privacy and research capture

1. In local mode, create the first agent and confirm the v2 consent gate opens automatically. Also
   sign in with a fresh disposable identity in the cloud-enabled fixture and confirm the same gate.
   Confirm neither choice is preselected and it names prompts/responses, bounded coding trajectory
   metadata, the one-screenshot limit, 90-day retention, and every excluded surface. Decline once,
   verify no research batch is created, and relaunch to confirm that consent version is not shown
   again.
2. Enable capture and complete a synthetic coding turn with a provider-native command, plan, usage,
   and subagent event. Export local records and confirm tool name/phase/count metadata is present,
   while reasoning, arguments, command text/output, diffs, file paths, and secrets are absent.
3. Snapshot a disposable non-sensitive native app and verify at most one bounded screenshot is
   retained. Repeat with signed-in browser, connected-app, authentication, mutation, and
   secret-shaped fixtures; each entire turn must be excluded from research capture.
4. Verify an offline unsynced batch is retained. After successful sync, confirm older synced local
   copies can roll off without deleting unsynced records. Confirm S3 lifecycle expiration is 90 days
   and both export and account/research deletion still work.

## Provider and cloud

1. Run `pnpm test:codex-isolation:real`; it must retain the current Codex account while reporting zero inherited apps, plugins, skills, hooks, or MCP tools.
2. With the release stack and designated disposable Gmail/Drive/Slack accounts, press **Connect
   work apps** once. Confirm Gmail opens first, Google Drive opens only after the Gmail grant is
   verified, and Slack opens only after Drive is verified. Complete each provider's own consent
   page with the intended disposable identity. Cancel once in the middle and confirm no later
   provider opens; use **Cancel setup** or disconnect the saved grant before retrying.
3. Confirm Settings reports the exact connected identity for all three apps and says that data
   remains in each service. Execute one live read from each app and verify Sia does not create a
   local mailbox, Drive, or Slack mirror. Then approve one exact write per app, disconnect each
   grant, and verify the remote provider access is revoked.
4. From Settings → Apps, open Delete account. Confirm the destructive button stays disabled until the exact case-sensitive phrase `DELETE ACCOUNT` is entered. Submit with a disposable signed-in account and confirm the accepted account-scope job reaches `completed`, connected access and the cloud identity are gone, local Sia agents/threads/auth are cleared, and the deletion dead-letter alarm remains clear. Workspace files, provider CLI accounts, and macOS permissions must remain.
5. Repeat against a test deletion worker that fails or never completes. Confirm Sia reports the error, retains local Sia data and sign-in so the request can be retried, and never presents a local-only wipe as successful account deletion.

## External local-mode release gates

- [x] In the exact signed artifact, connect the restricted ElevenLabs key, select a default voice,
      restart and refresh, exercise cancellable Read aloud, and verify no audio file is persisted.
- [x] Rotate/disable the exposed ElevenLabs predecessors and verify the replacement is restricted,
      KMS-vaulted for operator handoff, and stored locally only through Keychain-backed encryption.
- [x] Complete the packaged local computer-use mutation pass: native ref-bound edit, foreground
      restoration, Chrome click/type/upload, cancellation, detach, and restart capability loss. The
      exact final artifact independently passed the approved 35-byte localhost upload plus zero-tab
      restart and post-detach checks; click/type/denial passed in the immediately preceding signed
      acceptance build before the download-surface and detached-state corrections.
- [ ] Complete Dictate transcript insertion with a human speaker, the microphone-deny path, and the
      audible two-agent/default-voice comparison. The allow/start/stop/no-speech path passes, and
      Alice/Bella/Default agent assignments plus Alice/Bella synthesis have been verified.
- [x] On a fresh isolated profile of the exact signed artifact, verify cloud first run, **Continue
      locally**, first-agent setup, the 960x640 Apps layout, and Light/Dark appearance. Restore the
      original system appearance and ordinary Sia profile afterward.
- [ ] Run the upgrade-account install on a disposable macOS account that has the intended prior v2
      build, and confirm agents, threads, provider detection, and one read-only workflow survive.
      A contained temporary-profile simulation from the notarized `_old-builds/release-signed-ux-final-v2` bundle
      to the final signed artifact already preserved the agent/thread/settings, retained Codex
      detection, and completed a post-upgrade exact-reply workflow; the separate-account installer
      pass remains.
- [ ] Confirm the intended alpha recipient list outside the repository and tell every recipient to
      choose **Continue locally** and not authorize Gmail, Drive, or Slack connected apps.

## Deferred connector/cloud release gates

- [x] Rotate the exposed Composio key, verify its least-privilege scope, update the KMS-encrypted
      `AWSCURRENT` secret, revoke the exposed predecessor, and smoke the deployed cutover.
- [x] Deploy and validate the release cloud, deletion worker, dead-letter queue, and monitored
      alarms. Confirm every alarm subscription, exercise a synthetic alarm, and verify recovery
      before treating deletion as release-ready.
- [ ] Replace the remaining managed Slack OAuth config, then validate Gmail, Drive, and Slack with
      designated disposable credentials. Never use a maintainer's personal mailbox, Drive,
      workspace, the RLC Slack workspace, or the operator alarm mailbox as a provider fixture.
      Pending Gmail/Drive cancellation and Slack denial/disconnect already return the UI to 0/3.
- [ ] Reconcile and revoke, after operator handoff, the dashboard-listed full-access Composio keys
      `sia_production_runtime` and `Getting Started` if their consumers are no longer required.
- [ ] Submit successful and user-visible failed/stalled deletion with the prepared disposable Sia
      identity. OTP, the isolated local agent/thread fixture, the confirmation phrase gate, and the
      disabled destructive-button state have been verified; no permanent deletion has been submitted.

Current operator status (2026-08-17): `sia-alpha` is deployed and its deletion event-source mapping
is enabled; all nine alarms target the confirmed release SNS subscription. A synthetic identity
completed the real account-deletion path and was removed from Cognito. A controlled failing message
was retried five times, reached the DLQ, triggered the alarm and operator email, and was removed by
exact body match. The alarm recovered naturally to `OK`, both queues are empty, and the source queue
visibility timeout is restored to 360 seconds. Both provider secrets use the active customer-managed
Sia KMS key and their recorded versions are `AWSCURRENT`. The separate user-visible stalled/failing
desktop case in step 5 remains part of disposable-account acceptance.

Computer Use scope audit (2026-08-17): the real hosted Gmail request included full-mail and unrelated
contacts/profile scopes, Drive requested full-drive access, and Slack requested dozens of read/write
scopes outside the three Sia Slack actions. No provider grant was approved. Gmail and Drive were
cancelled, Slack was denied and disconnected, and Sia returned to 0/3 connected. Treat OAuth scope
replacement and hosted-link re-audit as gates for a connector-enabled release, not for the current
local-mode alpha.
