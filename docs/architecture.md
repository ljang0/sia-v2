# Architecture

```text
Renderer (sandboxed)
        |
 typed contextBridge
        |
Electron main -------------- Sia cloud API
  |       |       |             |-- base account + optional research entitlements
  |       |       |             |-- Model-lab catalog/relay + per-user daily quotas
  |       |       |             |-- managed voice catalog + one-time token broker
  |       |       |             |-- connector gateway
  |       |       |             |-- consented raw research sync + queued export
  |       |       |             `-- MFA-gated, audited admin research archive
  |       |       |
  |       |       `-- ActionGateway -- CUA / authenticated Chrome
  |       |                         |-- Apple Messages read/send capabilities
  |       |                         `-- authorized schedule mutations
  |       `---------- encrypted local SQLite + macOS Keychain
  |                    |-- app-open schedules + Activity
  |                    |-- scoped Git/worktree/terminal operations
  |                    `-- user-invoked ElevenLabs speech via one-time tokens
  `------------------ supervised provider utility processes
                         |-- Codex app-server + dynamic tools
                         |    |-- included Meta via model-scoped loopback Responses relay
                         |    `-- user's native ChatGPT Codex plan
                         |-- Grok ACP protocol tests (production-disabled)
                         |-- Gemini ACP protocol tests (production-disabled)
                         `-- legacy included-model direct adapter (persisted threads only)
```

The provider runtime can propose a Sia action, but only the main-process ActionGateway can authorize it. Confirmation mode (`computer.trust === 'ask'`, the default) renders a request tied to the exact action digest. A person can explicitly enable autonomous mode (`computer.trust === 'auto'`), where the controller authorizes eligible computer, browser, connector, message, upload, and schedule actions after capability and input validation. Eligible action results, timeline items, and automatic authorizations are appended to the always-on local `TrajectoryRecorder` (`<userData>/trajectories/<threadId>/events.jsonl` plus image files). A Google Workspace invocation atomically removes earlier diagnostic rows for that turn and suppresses later rows; only the normal local user-facing transcript remains. Complete thread directories roll off after 90 days or when the local trajectory store exceeds 128 MiB, oldest first; this is separate from the encrypted consented-research outbox. New schedules are bounded to one run for `once` or ten runs for recurring cadences unless the person explicitly chooses another limit. The model-visible schedule surface is limited to create/list/update/delete for controller-owned once/hourly/daily/weekly tasks in the current thread; it cannot write an OS crontab or arbitrary shell schedule. Codex provider-native work uses `approvalPolicy: never` inside the verified workspace-write sandbox, while host-side effects still cross the ActionGateway.

There is no generic renderer IPC, generic connector catalog, raw CUA server, arbitrary CDP/JavaScript route, cookie API, visualization tool, or cross-provider subagent abstraction.

The cloud shown above is a control plane only. The alpha has no remote provider runtime, persistent
cloud filesystem/browser, or offline cloud scheduler. Local schedules are persisted by the desktop
app and are evaluated only while Sia is running and the Mac is awake. The acceptance boundary for
always-on remote capabilities is defined in [cloud-computer.md](./cloud-computer.md).

## State ownership

- SQLite stores agents, immutable thread snapshots, normalized events, approval history, connection identifiers, Sia tokens, and capture/sync records as payloads encrypted by macOS Keychain-backed `safeStorage`.
- Browser/tab capabilities, one-shot action grants, and turn/resource leases are process-local and are never restored after Sia restarts.
- Chrome and Messages reuse accounts already configured by their owning Mac applications. Chrome
  attaches to a signed-in window without copying cookies. Messages read capabilities access bounded
  local `chat.db` rows only with Full Disk Access, and exact sends follow the autonomous/confirmation setting.
- Provider authentication stays in each official CLI. Sia does not inspect, copy, or store provider API keys or consumer-login files.
- ElevenLabs is an included speech service, not a model provider. Its restricted API key stays in
  AWS Secrets Manager; the main process requests a purpose-bound single-use token when needed. A
  legacy locally stored key is deleted during migration and no key-entry IPC remains.
  Recorded and generated audio stays in memory and is sent only after the user presses Dictate or
  Read aloud; it is not added to transcripts or persisted by Sia. Read aloud uses an optional
  per-agent voice with the global voice as fallback, permits only one playback session, omits code,
  and ends long narration at a sentence boundary with an explicit on-screen handoff.
- The renderer permission handler admits only an audio-only microphone request from Sia's own main
  frame. Camera, display capture, Bluetooth, and unrelated renderer permissions remain denied.
- Under v3 raw research consent, eligible provider protocol frames and connected-app/browser/
  computer/action events observed during a turn are copied into encrypted local research batches
  and synced to AWS. A turn that invokes Gmail, Drive, Docs, Sheets, or Slides is excluded in full;
  Google Workspace action results remain only in the normal local user-facing transcript, and the
  diagnostic trajectory excludes the entire turn. Without
  consent, other events remain within their normal runtime/transcript boundaries.
- AWS stores invite, consent, connection, preview, quota, deletion, and KMS-encrypted raw research
  objects behind the Sia API. Raw objects are organized by participant and batch, metadata carries
  thread/turn/sequence/event-kind scope, and only Cognito `Admins` can list or read the archive;
  those reads are integrity-checked and audited to an Object-Locked metadata bucket. Participant
  exports run asynchronously through SQS and multipart S3 so the API request is not responsible for
  buffering the full archive. Electron receives no AWS credential.
- The desktop research outbox is fail-closed: only AWS-acknowledged batches can be pruned, pending
  byte count/age/errors are visible, and a durable-write failure blocks new signed-in turns. Cloud
  kill switches can pause uploads, archive reads, connectors, or schedules independently without
  weakening server authorization.
- Full account deletion is initiated by the signed-in user. The main process accepts only the exact `DELETE ACCOUNT` confirmation, stops active turns, and waits for the same account-scope cloud job to reach `completed` before it clears encrypted local Sia records and the local cloud session. A failed, mismatched, or timed-out cloud job leaves local records available for a safe retry.
- Native attachment paths are held in expiring, process-local grants. Persisted transcripts keep
  attachment names, kinds, and sizes, not a reusable capability to arbitrary files.
- User-invoked terminal commands are one-shot child processes with a fixed workspace, sanitized
  environment, deadline, and output cap. Git operations use validated argv/path boundaries and
  disable repository hooks and file-system monitors. Neither surface is model-visible through Sia's
  added gateway.

## Concurrency

The turn scheduler admits at most four turns. A thread has one active turn; workspace writers,
browser tabs, and app windows are exclusive; foreground takeover is one global lane. Conflicts
remain visible and queued rather than racing. Closing the renderer window does not stop the main
process on macOS, so admitted work continues and appears in Activity after the window reopens.
