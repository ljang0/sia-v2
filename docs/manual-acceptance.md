# Manual alpha acceptance

Automated tests exercise the renderer, host policy, driver contracts, persistence, approvals, and the packaged CUA runtime. Before each external build, also run this local macOS pass with disposable test accounts and non-sensitive sample data.

The external invite alpha has two explicit paths. **Continue locally** remains a no-sharing mode.
Signing in enrolls the person in the research release and requires the current raw consent before a
task can start. Complete every local, research-cloud, archive, export, deletion, security, voice,
upgrade, connector, and artifact checks below before distribution. Gmail, Drive, Docs, Sheets,
Slides, and Slack are enabled for internal alpha acceptance; complete their provider-OAuth scope
review before inviting external users.

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
2. On the cloud-enabled profile, sign in with a disposable participant. Confirm raw-research consent
   is **Set up Sia · 1 of 2** and appears before any provider OAuth flow. Accept it, confirm
   **Connect your work apps** appears as step 2 with recording-on status and 0/6 progress, then start
   guided setup. Verify the flow advances only after each provider grant is confirmed and that **Set
   up later** reaches the app without hiding the individual Settings → Apps controls. Repeat with
   **Choose apps**, clear the default selection, select Docs and Slack, and confirm only those two
   grants open in canonical order. The onboarding dialog should finish after the selected set is
   connected, while the other four apps remain available in Settings.
3. Create an agent and confirm the research choice appears only after the agent is saved. Choose
   **Use without sharing**, create a thread, and verify Codex, files, Git, terminal, schedules,
   signed-in Chrome attachment, and granted computer use remain reachable.
4. Repeat with **Join research release**, complete one eligible local turn, and export it. Confirm it
   is encrypted locally, reports no pending cloud upload, and survives relaunch.
5. In a test build configured for the release cloud, sign in after step 4. Confirm the pre-existing
   local batch is still present in export but is never submitted by research sync; only a newly
   completed eligible post-sign-in turn may be uploaded.
6. Under Apps, confirm Gmail, Drive, Docs, Sheets, Slides, and Slack each have a distinct accessible
   connection button in addition to guided setup. Attach one signed-in Chrome window from its
   separate row. Open Messages from its row and confirm read tools request Full Disk Access before
   accessing bounded `chat.db` rows. In autonomous mode, computer actions and outgoing messages
   continue without an in-app prompt and appear in the activity log; **Confirm before changes**
   restores previews.
7. Inspect the local `app-lifecycle` trajectory and the participant's audited AWS archive. Confirm
   setup started, provider page opened, connected/failed/timed-out, guided completion, and disconnect
   events are organized and present. Search both stores for the exact test OAuth URL/code/token and
   confirm none is retained. Disable or block raw capture while signed in and confirm a new connector
   setup is rejected before the provider start call; disconnection must remain available.

## Scheduling

1. Ask an agent, “Check the web every hour and summarize meaningful changes.” Confirm it interprets
   the request through `schedule_create`, persists the exact task/cadence/first run/run limit, and
   creates no arbitrary shell command, crontab, or launch daemon.
2. Create once/hourly/daily/weekly fixtures, edit/pause/resume/delete them through both natural
   requests and Settings, and set a maximum run count. Confirm run count, last outcome, and next run
   remain correct after relaunch and the task pauses at its limit.
3. Run the crash-recovery fixture immediately before and after durable dispatch. Confirm the stable
   run id yields exactly one user turn. Quit Sia and sleep the Mac across a due time; confirm the UI
   accurately explains that local schedules run only while the process is open and the Mac awake.

## Authenticated Chrome

1. Open the intended signed-in Chrome window. Attach it from Sia, choose that window if more than
   one is open, approve Chrome's own **Allow remote debugging?** confirmation if shown, and confirm
   only top-level HTTP(S) origins from the selected window appear under Access. Sia must never
   automate that browser-owned confirmation. Quit any obsolete Sia build first, place the intended
   Chrome window on the same macOS Space as Sia, and begin from a Chrome process not already held by
   another automation/debugging client.
2. Snapshot and read a permitted page. Confirm Chrome does not move to the foreground and the result includes semantic state plus a current screenshot when Screen Recording is allowed.
3. Try an authentication route, password field, incognito window, cross-origin link, and a stale ref after navigation. Each must be absent or refused.
4. Request a click, type, and upload against benign fixtures. In autonomous mode, confirm they run
   without an in-app prompt and remain bound to the trusted element/window and exact outgoing
   text/files. Turn on **Confirm before changes** and repeat to verify the preview. Direct
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

1. In local mode, create the first agent and confirm the v3 raw consent gate opens automatically.
   Confirm **Use without sharing** continues locally and the decision remains remembered for that
   version. Sign in with a fresh disposable identity and confirm the person must choose **Join
   research release** or **Decline & sign out** before signed-in use continues.
2. Join with disposable, non-sensitive fixtures and complete successful, failed, and cancelled turns
   containing a provider-native command, plan, usage, subagent event, Sia action, approval, and image.
   Inspect the local bundles and confirm exact prompts/replies, surfaced reasoning, arguments,
   command text/output, paths/diffs, action results, approvals, errors, and image bytes are present.
   Confirm large events reconstruct byte-for-byte from ordered `raw.event_chunk` rows.
3. Repeat with signed-in browser, all six cloud connectors, and Apple Messages fixtures containing
   only disposable test data. Confirm their observed action arguments and results are included. Then
   verify private windows, password/secure fields, Keychain, password managers, credential paths,
   and known authentication surfaces are still refused before Sia can capture their contents.
4. Verify an offline unsynced batch is retained and automatically uploads after reconnection. In the
   Research archive as a Cognito `Admins` user with software-token MFA, list participants, open a
   multi-batch turn, filter and paginate its reconstructed events, and render a captured image.
   Confirm incomplete chunks become visible integrity errors. Confirm participant, batch-list, and
   raw-read audit events were written to the Object-Locked audit bucket. Repeat as a non-admin and
   as an admin without MFA; every archive API must return 403 and emit a denied audit record.
5. After successful sync, confirm older synced local copies can roll off without deleting unsynced
   records. Attempt sign-out while an offline batch is pending and confirm Sia retains the outbox and
   refuses silent loss. Confirm S3 lifecycle expiration is 90 days and both export and
   account/research deletion still work.
6. Request a multi-participant-sized export. Confirm the desktop remains responsive while the job is
   queued, the worker can retry a failed attempt, the completed link expires after 15 minutes, and a
   byte-length/SHA mismatch fails without returning corrupt data.
7. Pause each server feature in a disposable stack. Confirm upload pause leaves a visible encrypted
   outbox, archive pause denies reads, connector pause denies connector operations, and schedule pause
   prevents new scheduled dispatches. Restore each switch and verify recovery.

## Provider, account, and optional connectors

1. Run `pnpm test:codex-isolation:real`; it must retain the current Codex account while reporting zero inherited apps, plugins, skills, hooks, or MCP tools.
2. With the release stack and designated disposable Google/Slack accounts, press **Connect work
   apps** once. Confirm Gmail, Drive, Docs, Sheets, Slides, and Slack open in that order and that each
   later service opens only after the prior grant is verified. Complete each provider-owned consent
   page with the intended disposable identity. Cancel once in the middle and confirm no later
   service opens; disconnect only the saved interrupted grant before retrying. Confirm completed
   grants remain unchanged when the same one-click flow resumes.
3. Confirm Settings reports the exact connected identity for all six apps and says that data remains
   in each service. Exercise search/read in Gmail, Drive, Docs, Sheets, Slides, and Slack, then create
   or append only non-sensitive fixtures with every write tool. Verify Sia creates no local content
   mirror, rejects raw Slides batch-update requests and over-5,000-cell Sheets writes, and records
   each exact action. Disconnect every grant and verify remote provider access is revoked.
4. From Settings → Apps, open Delete account. Confirm the destructive button stays disabled until the exact case-sensitive phrase `DELETE ACCOUNT` is entered. Submit with a disposable signed-in account and confirm the accepted account-scope job reaches `completed`, connected access and the cloud identity are gone, local Sia agents/threads/auth are cleared, and the deletion dead-letter alarm remains clear. Workspace files, provider CLI accounts, and macOS permissions must remain.
5. Repeat against a test deletion worker that fails or never completes. Confirm Sia reports the error, retains local Sia data and sign-in so the request can be retried, and never presents a local-only wipe as successful account deletion.

## External alpha release gates

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
- [ ] On a fresh isolated profile of the newly signed artifact, verify cloud first run, **Continue
      locally**, first-agent setup, the 960x640 Apps and archive layouts, and Light/Dark appearance.
      Confirm the restrained palette, tighter controls, MFA setup, outbox states, event pagination,
      reduced motion, keyboard focus, and no clipping. Restore the original system appearance and
      ordinary Sia profile afterward. On 2026-08-22 the final signed artifact passed isolated cloud
      first run and reached the live administrator's password step with a secure text field; no
      credential was entered through automation. The immediately preceding notarized build passed
      Continue locally, required workspace selection, first-agent creation, Providers, Apps, and
      Privacy in Light appearance. Automated final-source E2E passed 960x640, 200% zoom, keyboard,
      and reduced-motion coverage. Exact-final-artifact Dark, admin MFA/archive completion, and
      outbox states remain open.
      The exact final artifact also completed Continue locally and rendered Providers, Apps,
      Computer, the selective connector chooser, and the 90-day/128-MiB trajectory policy in Light
      appearance without clipping.
- [ ] Run the upgrade-account install on a disposable macOS account that has the intended prior v2
      build, and confirm agents, threads, provider detection, and one read-only workflow survive.
      A contained temporary-profile simulation from the notarized `_old-builds/release-signed-ux-final-v2` bundle
      to the final signed artifact already preserved the agent/thread/settings, retained Codex
      detection, and completed a post-upgrade exact-reply workflow; the separate-account installer
      pass remains.
      The exact final artifact additionally preserved the ordinary prior-build profile's agents,
      threads, Sia sign-in, Gmail/Drive grants, and completed a read-only Gmail workflow after the
      one-time guided-setup migration. A separate disposable macOS account remains required.
- [ ] Confirm the intended alpha recipient list outside the repository. Tell recipients that sign-in
      is research-release enrollment with raw task-surface upload, that **Continue locally** remains
      available without sharing, and that every Google Workspace/Slack connector requires separate
      provider consent. Do
      not offer connectors to external recipients until the scope audit below is complete.
- [ ] Deploy this source template, complete `docs/release.md`'s live research rehearsal, and attach
      the private evidence record to the release decision. The 2026-08-22 stack deployment,
      multipart export, admin MFA enforcement, raw fixtures, kill switches, alarm paths, deletion,
      cleanup, completed export-DLQ cycle, and signed artifact are recorded in
      `docs/release-evidence-2026-08-22.md`; the exact signed-app outbox/UI pass and human-only gates
      remain open.

## Deferred connector release gates

The complete fresh-account, provider-publication, failure-recovery, and evidence contract is in
[`connector-distribution-readiness.md`](./connector-distribution-readiness.md). Do not call the
connectors out-of-the-box ready until that checklist passes.

- [x] Rotate the exposed Composio key, verify its least-privilege scope, update the KMS-encrypted
      `AWSCURRENT` secret, revoke the exposed predecessor, and smoke the deployed cutover.
- [x] Deploy and validate the release cloud, deletion worker, dead-letter queue, and monitored
      alarms. Confirm every alarm subscription, exercise a synthetic alarm, and verify recovery
      before treating deletion as release-ready.
- [ ] Replace the remaining managed Slack OAuth config and scope-audit the managed Docs, Sheets, and
      Slides configs, then validate all six connectors with designated disposable credentials. Never
      use a maintainer's personal Google account, Drive, workspace, the RLC Slack workspace, or the
      operator alarm mailbox as a provider fixture. The previous three-connector build returned to
      0/3 after cancellation; the current six-connector build must return to 0/6.
- [ ] Reconcile and revoke, after operator handoff, the dashboard-listed full-access Composio keys
      `sia_production_runtime` and `Getting Started` if their consumers are no longer required.
- [ ] Submit successful and user-visible failed/stalled deletion with the prepared disposable Sia
      identity. A fresh disposable account completed the live API → SQS → deletion-worker path on
      2026-08-22 and was removed from Cognito and research S3. The user-visible failed/stalled desktop
      case still remains.

Historical operator status (2026-08-17; does not certify the 2026-08-21 source): `sia-alpha` is
deployed and its deletion event-source mapping
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
cancelled, Slack was denied and disconnected, and the earlier build returned to 0/3 connected. The
current build must return to 0/6. Treat OAuth scope
replacement and hosted-link re-audit as gates for external distribution. Connector links are enabled
only for invited internal alpha acceptance until that audit is signed off.
