# Architecture

```text
Renderer (sandboxed)
        |
 typed contextBridge
        |
Electron main -------------- Sia cloud API
  |       |       |             |-- invite auth
  |       |       |             |-- Meta relay (client-disabled pending live verification)
  |       |       |             |-- connector gateway
  |       |       |             `-- consented research sync
  |       |       |
  |       |       `-- ActionGateway -- CUA / authenticated Chrome
  |       |                         `-- explicitly opened Apple Messages window
  |       `---------- encrypted local SQLite + macOS Keychain
  |                    |-- app-open schedules + Activity
  |                    |-- scoped Git/worktree/terminal operations
  |                    `-- user-invoked ElevenLabs speech
  `------------------ supervised provider utility processes
                         |-- Codex app-server + dynamic tools
                         |-- Grok ACP protocol tests (production-disabled)
                         |-- Gemini ACP protocol tests (production-disabled)
                         `-- Meta streaming tool loop (production-gated)
```

The provider runtime can propose a Sia action, but only the main-process ActionGateway can authorize it. The renderer renders approval requests and returns a decision tied to the request digest. Provider-native shell, files, public web, and subagents retain their provider protocol and approvals.

There is no generic renderer IPC, generic connector catalog, raw CUA server, arbitrary CDP/JavaScript route, cookie API, visualization tool, or cross-provider subagent abstraction.

The cloud shown above is a control plane only. The alpha has no remote provider runtime, persistent
cloud filesystem/browser, or offline cloud scheduler. Local schedules are persisted by the desktop
app and are evaluated only while Sia is running and the Mac is awake. The acceptance boundary for
always-on remote capabilities is defined in [cloud-computer.md](./cloud-computer.md).

## State ownership

- SQLite stores agents, immutable thread snapshots, normalized events, approval history, connection identifiers, Sia tokens, and capture/sync records as payloads encrypted by macOS Keychain-backed `safeStorage`.
- Browser/tab capabilities, one-shot action grants, and turn/resource leases are process-local and are never restored after Sia restarts.
- Chrome and Messages reuse accounts already configured by their owning Mac applications. Chrome
  requires an explicit window attachment; Messages is only launched by Sia and is not mirrored or
  read from its private database.
- Provider authentication stays in each official CLI. Sia does not inspect, copy, or store provider API keys or consumer-login files.
- ElevenLabs is an optional speech service, not a model provider. Its restricted API key is encrypted
  in the Keychain-backed repository, never returned to the renderer, and never exposed to an agent.
  Recorded and generated audio stays in memory and is sent only after the user presses Dictate or
  Read aloud; it is not added to transcripts or persisted by Sia. Read aloud uses an optional
  per-agent voice with the global voice as fallback, permits only one playback session, omits code,
  and ends long narration at a sentence boundary with an explicit on-screen handoff.
- The renderer permission handler admits only an audio-only microphone request from Sia's own main
  frame. Camera, display capture, Bluetooth, and unrelated renderer permissions remain denied.
- Provider protocol frames and raw connected-app payloads stay in memory.
- AWS stores invite, consent, connection, preview, quota, deletion, and encrypted research objects behind the Sia API. Electron receives no AWS credential.
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
