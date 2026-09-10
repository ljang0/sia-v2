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
- The default macOS voice service uses installed system voices through `AVSpeechSynthesizer`,
  returning bounded WAV audio in memory. Dictation uses `SFSpeechRecognizer` with on-device
  recognition required and checked for the current locale. Read aloud works without cloud setup or
  microphone access; unsupported or denied dictation never silently falls back to a server.
  A separate `--speech` mode of the bundled helper receives PCM over private pipes and does not
  open a microphone or event tap. Disconnect invalidates pending native results and stops its process.
- The compatibility ElevenLabs speech service is not a model provider. Its restricted API key stays in
  AWS Secrets Manager; the main process requests a purpose-bound single-use token when needed. A
  legacy locally stored key is deleted during migration and no key-entry IPC remains.
  Recorded and generated audio stays in memory and is sent only after the user presses Dictate or
  Read aloud; it is not added to transcripts or persisted by Sia. Read aloud uses an optional
  per-agent voice with the global voice as fallback, permits only one playback session, omits code,
  and ends long narration at a sentence boundary with an explicit on-screen handoff.
- Optional Fn push-to-talk runs in a bundled Swift helper adapted from Notch. A main-process
  `PushToTalkService` owns its recording state, pins the destination at activation, and streams bounded
  16 kHz PCM into the selected voice service. Release commits; Escape, sign-out, sleep, and helper
  exit discard the session, including late transcription results. The helper has no provider
  credentials or model tools, communicates only over inherited pipes, and exits on parent EOF or
  heartbeat expiry. Normal Fn sessions show a thin green edge through recording, transcription, and task execution; the helper reserves its
  nonactivating status notice for errors. It uses no screenshot capture. Composer capture obtains an
  exclusive main-process lease before opening the microphone; window teardown releases the lease.
- Cmd+E opens an independent, compact command window on the pointer's display, adapted from
  Notch's HotkeyManager lifecycle through Electron globalShortcut. Its separate sandboxed preload
  exposes only display-state subscription, send, cancel, new request, dismiss and open; main
  validates the exact sender frame and bounded input.
  Agent lists use the sign-in-redacted snapshot. Sending uses canonical thread creation and dispatch;
  failures retain the draft. Typed requests stay in this panel for progress, results, Stop and follow-ups.
  Fn dispatch has no path to show the launcher or main window. A main-owned session binds each reply/cancel to its exact thread and latest turn;
  stale controls fail closed. The narrow preload receives bounded, redacted display state only.
  The explicit Review in Sia button opens the canonical conversation for approvals and questions.
  Escape or clicking away dismisses the box without canceling work. Sia → Ask Sia works if shortcut registration
  conflicts with another app. No voice helper or TCC grant is required for the launcher.
- Settings → Assistant owns an encrypted `assistant/library` record: user-authored per-agent memory,
  guided workflows with named inputs and expected results, context opt-in.
  Memories are injected only for their owning agent on new runtime turns; pausing/deleting affects
  future requests, not provider history. Workflows create a fresh canonical conversation and resolve
  live tool capabilities at execution time. They contain instructions, not shell scripts or cached
  native references. Library operations are strictly typed and release sign-in gated.
- Optional per-agent automatic memory records an encrypted operational journal (tool names/outcomes,
  task completion, and model-proposed lessons), never raw action arguments, message bodies, or screenshots.
  The current task's model extracts useful lessons through `memory_learn`. A local idle timer
  consolidates finished-turn lessons, deduplicates them, and caps learned memory at 40 entries per
  agent, at most once every six hours; Settings offers an immediate pass. This uses no extra model
  turn. Pausing stops collection/consolidation. Deletion suppresses identical lessons from being
  relearned. The journal retains at most 500 entries and remains separate from research capture.
- `memory_suggest` adapts Notch's PROMOTE/DISTILL pass into encrypted proposals to merge memories,
  retire contradicted guidance, or save an executable skill. Proposals retain exact before/after
  content, reasons and owning-agent completed-task evidence. Skills require evidence from two turns.
  UI acceptance validates the proposal revision and current memory contents; stale changes are
  rejected. Dismissal suppresses identical proposals, clearing the journal clears pending evidence,
  and no skill executes on acceptance. Ordinary tasks can propose improvements while learning is on.
  Find improvements starts a visible canonical review turn on the agent's pinned model route.
  A separate default-off background-review preference authorizes extra model turns, at most every
  six hours after new experience, while idle, awake and unlocked. Reviews do not change the active
  conversation, stack, or journal themselves. They stop after three minutes and are cancelled when
  learning/reviews are disabled. Gateway policy restricts review conversations to assistant_library
  and memory_suggest (also in trusted mode); provider-native approval requests are denied. Review
  sessions require the Codex harness, expose only those two dynamic tools, request a read-only
  sandbox, disable shell/unified-exec/image/multi-agent features and web search, and verify the
  returned sandbox and effective native feature flags before starting a model turn. This uses the
  [App Server session configuration](https://learn.chatgpt.com/docs/app-server) contract.
- Executable skills adapt Notch's Bash library with encrypted source, an owning agent, and a SHA-256
  revision. `skill_save` and `skill_run` always show exact-source approval, including in trusted mode.
  Runs revalidate the saved source after approval. A macOS kernel sandbox confines Bash and descendants
  to a private scratch directory plus system binaries/libraries, denies network and direct host/app
  access, and inherits no provider environment. `sia_action` brokers up to 32 sequential calls through
  the same gateway, turn cancellation, and fresh capability checks. Refused or unverified actions stop
  the script; timeout kills the process group and aborts outstanding approval. This restricted runner exposes no unchecked host shell
  or arbitrary AppleScript; native Mac mode uses its separate execution path below. Saving a script never runs it.
- `mac_automation` uses fixed Apple-event programs for Calendar list/read/create, Reminders
  list/read/create, and Finder selection metadata. Arguments are JSON data, targets are exact native
  identifiers, and creates read back their native object. An unconfirmed create is never reported as
  success. macOS Automation permission remains app-specific; scripts cannot bypass it.
  Onboarding and Computer settings share a typed, fixed-target permission route for System Events, Safari, Chrome, Calendar,
  Reminders, Finder, and Messages. The native helper's permission-only mode uses
  `AEDeterminePermissionToAutomateTarget`; background checks never prompt or launch apps.
  Explicit requests open only the selected app and may show its macOS consent prompt.
  Previously denied access opens Automation settings. No app content is read by setup, and
  action-gateway approvals remain unchanged. Status is checked again on return/restart rather
  than persisting a claimed grant; errors and closed apps remain unresolved in the checklist.
- Connected-app opt-in Fn context pins the frontmost app before showing the edge. The native helper reads only
  bounded window/selection metadata and a static accessibility outline, excludes protected app/field
  ancestry, and sends app identity alone for browsers. It never reads the clipboard or records a
  background journal. Context travels with the committed request as untrusted data.
  Only threads dispatched by Fn drive the click-through green working edge. Main-process thread
  updates keep it animated for running/queued work, steady during approval/input waits, and remove
  completed, failed, cancelled, or deleted threads. Overlapping Fn requests share the indicator;
  unrelated typed requests cannot activate it. Disable/sign-out/helper failure clear its bindings.
  Sleep hides it; wake rechecks remaining tasks. No task content is sent to the decorative overlay.
  The native view respects Reduced Motion and fades out without activating a window.
- `computer_list` also discovers installed apps from fixed application directories. Launch validates
  a currently installed bundle and excludes sensitive apps and script runners. These capability-bound computer tools also provide optional background control in Use my Mac. New profiles default to Use my Mac; existing preferences, including the Connected apps fallback for legacy profiles, are preserved. The mode is persisted independently of action confirmations. Safari’s system-owned Cryptex app link is recognized without admitting arbitrary symlinks. Native
  click/drag can use screenshot pixels bound to a recent host-owned window capability. The backend
  validates PNG dimensions, coordinates, live app/window ownership, and protected controls again
  before delivery; no global-coordinate tool is exposed. Windows with protected controls omit
  screenshots. Input delivery returns `accepted_unverified` plus fresh state for semantic review.
  Two failed control attempts stop further computer/browser mutations in that turn; read-only
  observations remain available to diagnose the blocker. Chrome attachment failures include an
  actionable connection repair instruction without changing trust mode. Connected apps returns a connection refusal for
  unattached `browser_tabs`.
  **Use my Mac now runs the Notch-style native execution path.** It uses the same Codex
  App Server harness and subscription login, with `baseInstructions` replacing the coding persona
  with the port of Notch's `ClaudeCodeInvoker` prompt. Native shell, file operations and image
  viewing are enabled in `danger-full-access`; provider web search, inherited plugins/MCPs,
  project instruction discovery and subagents are disabled. Connected-browser tools and
  the old `computer_task_complete` checklist are not exposed. The default native route exposes only
  Sia library/memory/schedule tools through ActionGateway, with no CUA tools. Its instructions require
  ordinary app navigation: for Canvas, observed course cards followed by People or actual course
  materials, rather than raw API pages or guessed course IDs. API navigation is reserved for explicit
  developer requests. Native input instructions require activating and checking the intended process
  before global input; screenshots of another app are not evidence for the requested page. These are
  model instructions, not a shell enforcement boundary. Clipboard reads also require freshness and
  page/content corroboration: an immediate `pbpaste` after Cmd+C can return the previous page.
  `SiaVoiceHelper --mac-screenshot` captures one display on demand and normalizes its Retina image
  to logical point dimensions, bounded to 1920×1200. It returns the display origin and exact
  points-per-image-pixel transform. The native prompt uses this command for observation and
  verification; it must not divide those image coordinates by Retina scale again. Pure native tests
  cover Retina/large/portrait geometry and PNG orientation without OS capture or input.
  **Background controls (experimental)** in Settings → Computer is separately persisted and off by
  default. Opting in adds built-in CUA `computer_list`, `computer_snapshot`, `computer_action`,
  `computer_open_app` and `computer_open_url` through ActionGateway and changes the session prompt.
  The experimental prompt directs GUI actions exclusively through window tools, with no mid-task
  fallback to global native input. Native shell remains available for file work; this separation is
  instructed rather than a command-level sandbox. Window actions default to background delivery;
  unsupported input returns `needs_foreground` without automatic input replay. A fresh observation
  precedes any explicit foreground attempt in the same window. URL opening requests `activate:false`
  by default; apps may still raise a window. No all-app background guarantee is made. Browser snapshots
  can require `expected_url`, including query filters, and refuse a mismatched page before returning
  content. `source_url` attributes the observed page without exposing query parameters or fragments.
  Native commands use Codex's execution boundary, **not** the
  per-window ActionGateway. This is an explicit architecture exception for the requested native
  Mac mode, not a claim that arbitrary commands can be confined to approved window capabilities.
  Confirmations use Codex `untrusted`; the user's existing full-bypass selection uses `never`.
  Mode/trust/background-control changes recreate the session on the next task, preserving encrypted
  Sia history.

  Notch's `ScreenContextProvider.swift` is copied with attribution and adds a 600 ms capture
  budget and secure-field exclusions. Fn Mac context includes the existing browser without an
  attachment. The host supplies display point/pixel geometry and a fixed helper command for fresh
  context. Native commands use AppleScript dictionaries first and screenshots plus System Events
  as fallback. Prompts require fresh observations, settling time, result verification and two
  recovery attempts; these are model instructions, not an enforced proof of success. Native mode
  cannot enforce Connected apps' password/window boundaries against arbitrary shell programs.
  macOS TCC still controls Accessibility, Screen Recording, Automation and Full Disk Access.
  The agent is instructed to leave credentials and authentication to the user.

  A whole-task `global_focus` lease prevents concurrent Sia tasks from driving the GUI. Fn audio
  capture can proceed while a task runs; new Mac tasks queue for the screen. Notch's progress-aware
  watchdog is ported (180 seconds without provider activity; one hour maximum, excluding approval
  waits). Cancellation interrupts the turn, declines pending approvals and cleans native background
  terminals before releasing the screen. No model/GUI probes run automatically at launch.
  Final structured results use Notch's response contract and balanced-object parser, translated to
  Sia's timeline, voice response and output-file link. Partial JSON is never streamed into speech.
  Native executable skills follow Notch's script format under each agent's `.sia-mac/skills/`;
  existing encrypted memory, journals and consolidation remain canonical. Native scripts and
  `~/SiaOutbox` files are normal local files. Detached Claude workers, Notch's Groq voice provider,
  private display APIs and self-relaunch code are not copied. Codex can still make different
  decisions than Claude: this port aligns execution mechanics, not model behavior or reliability.
  Conversations with a browser attempt after the latest user message offer an explicit
  Connect Chrome & continue control while detached in Connected apps mode. `browser.connectAndContinue` uses the same
  canonical attachment route as Settings, checks the latest user-message id before and after
  attachment, and sends a fixed continuation through the original thread's pinned execution route.
  It preserves drafts and rejects concurrent connections or stale/active/archived requests.
  No model turn starts until the user chooses a window and the host verifies an HTTP(S) grant.

- **Phone remote** is an optional, separate local web surface built into `out/remote`.
  `PhoneRemote` ports Notch's `/t/<token>/` command/state/cancel/outbox/vault/note flow, with
  a Core Image QR and Bonjour helper. Settings uses one validated `phone.remote` preload route;
  the HTTP server exposes no generic IPC, shell, approval, credential or filesystem API.
  It projects the chosen agent's current conversation into bounded text/progress snapshots;
  commands and cancellation call the existing controller, preserving the pinned execution route,
  action gateway where applicable, native Mac context, and selected approval mode. Task sessions
  reject stale cancel/follow-up requests, and request IDs deduplicate command retries.
  The 256-bit pairing token and enable preference use the encrypted repository. The listener
  binds a private LAN IPv4 address on port 8738, admits same-subnet clients only, validates Host
  and Origin, limits auth failures/body size/connections, sends no-store/no-referrer/CSP headers,
  and never logs its private URL. Rotation invalidates prior links. Account access is rechecked
  before requests and after asynchronous reads; lock, sleep and shutdown close the listener.
  Interface changes rebind it without launching applications or a model. Enable is opt-in.
  Output downloads must be named in the current conversation, stay in SiaOutbox, have no final
  symlink, and are bounded to 20 MB and forced to inert attachments. Native skill reads stay in
  the selected workspace's `.sia-mac/skills`, reject symlinks and are bounded to 60 small scripts.
  The memory graph reads the selected agent's encrypted library/journal and those scripts.
  Like Notch's Wi-Fi mode, this is HTTP, not a cloud relay or encrypted remote desktop. The UI
  explains trusted Wi-Fi, link privacy, keyboard dictation and awake/unlocked requirements.
  Sia retains its model/permission boundaries; Notch's Claude MCP permission endpoint and
  Tailscale address advertisement are not part of this same-Wi-Fi port. The phone stores only
  recent prompts locally, and offers a control to clear them. It never stores provider credentials.

- First-run guidance is gated by the same release sign-in check as the workspace. Its progress
  lives in encrypted desktop preferences, and starter creation uses `agents.save` plus the normal
  catalog/resolver and private workspace path. The guide records its agent and next step in the
  same commit as first-thread creation; repeated setup requests reuse that agent. Existing
  profiles are not enrolled automatically. Permission steps are optional and use the typed bridge;
  the animated cursor is only an illustration. Native voice readiness publishes actual microphone
  and Accessibility grants, including changes while returning from System Settings. Practice
  suggestions use the regular composer and never send themselves or replace an existing draft.
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
