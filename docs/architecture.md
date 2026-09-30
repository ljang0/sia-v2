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

The provider runtime can propose a Sia action, but only the main-process ActionGateway can authorize it. Confirmation mode (`computer.trust === 'ask'`) renders a request tied to the exact action digest. Its card can also answer **Allow for this task**: the controller keeps a per-turn grant for the same action kind on the same app, site, account, recipients, or item (never saved skills or uploads, and never phone turns), and the grant ends with the turn. Hard safety denials run before any grant. Autonomous mode (`computer.trust === 'auto'`) is the default whenever the person has not explicitly chosen confirmations; in it the controller authorizes eligible computer, browser, connector, message, upload, and schedule actions after capability and input validation. Eligible action results, timeline items, and automatic authorizations are appended to the always-on local `TrajectoryRecorder` (`<userData>/trajectories/<threadId>/events.jsonl` plus image files). A Google Workspace invocation atomically removes earlier diagnostic rows for that turn and suppresses later rows; only the normal local user-facing transcript remains. Complete thread directories roll off after 90 days or when the local trajectory store exceeds 128 MiB, oldest first; this is separate from the encrypted consented-research outbox. New schedules are bounded to one run for `once` or ten runs for recurring cadences unless the person explicitly chooses another limit. The model-visible schedule surface is limited to create/list/update/delete for controller-owned once/hourly/daily/weekly tasks in the current thread; it cannot write an OS crontab or arbitrary shell schedule. Codex provider-native work uses `approvalPolicy: never` inside the verified workspace-write sandbox, while host-side effects still cross the ActionGateway.

There is no generic renderer IPC, generic connector catalog, raw CUA server, arbitrary CDP/JavaScript route, cookie API, visualization tool, or cross-provider subagent abstraction.

The cloud shown above is a control plane only. The alpha has no remote provider runtime, persistent
cloud filesystem/browser, or offline cloud scheduler. Local schedules are persisted by the desktop
app and are evaluated only while Sia is running and the Mac is awake. The acceptance boundary for
always-on remote capabilities is defined in [cloud-computer.md](./cloud-computer.md).

## State ownership

- SQLite stores agents, immutable thread snapshots, normalized events, approval history, connection identifiers, Sia tokens, and capture/sync records as payloads encrypted by macOS Keychain-backed `safeStorage`.
- Streaming text publishes UI snapshots at 50ms while encrypted desktop-state checkpoints run
  at 500ms. Composer drafts use the same 500ms checkpoint and push no snapshot. Other
  non-streaming changes, completion and graceful shutdown persist immediately. An abrupt
  termination may lose the last checkpoint interval of an unfinished response or draft.
- Settled approvals that no transcript row refers to (such as computer-use requests) are dropped
  at launch a week after they expired.
- UI snapshots pushed to the renderer, and snapshots returned by its bridge calls, carry only the
  open thread's history and approvals plus a one-line preview per thread. In-process callers
  (Scotty, the launcher, phone remote, tests) read the full state from the controller.

- Browser/tab capabilities, one-shot action grants, and turn/resource leases are process-local and are never restored after Sia restarts.
- Chrome and Messages reuse accounts already configured by their owning Mac applications. Chrome
  attaches to a signed-in window without copying cookies. Messages read capabilities access bounded
  local `chat.db` rows only with Full Disk Access, and exact sends follow the autonomous/confirmation setting.
- Provider authentication stays in each official CLI. Sia does not inspect, copy, or store provider API keys or consumer-login files.
- Local macOS builds without cloud configuration use installed system voices through `AVSpeechSynthesizer`,
  returning bounded WAV audio in memory. Dictation uses `SFSpeechRecognizer` with on-device
  recognition required and checked for the current locale. Read aloud works without cloud setup or
  microphone access; unsupported or denied dictation never silently falls back to a server.
  A separate `--speech` mode of the bundled helper receives PCM over private pipes and does not
  open a microphone or event tap. Disconnect invalidates pending native results and stops its process.
- ElevenLabs speech is not a model provider. Included voice keeps its restricted API key in
  AWS Secrets Manager. An explicitly configured personal account instead encrypts its key with
  macOS Keychain-backed safeStorage in the device's Sia application-support directory, outside
  agent workspaces and profile exports. Its windowless setup command accepts the key only on stdin;
  no key-entry IPC exists. Either gateway mints purpose-bound single-use tokens in the main process.
  Cloud-configured builds use included ElevenLabs for every signed-in account, including Macs
  with an older personal credential. Local builds can use personal voice ahead of Apple speech.
  Voice preferences are independent. Disconnect, sign-out, account deletion and shutdown cancel
  pending token/catalog requests and active speech sockets; late results cannot restart voice.
  Recorded and generated audio stays in memory and is sent only when the user invokes dictation, Read aloud, or a voice conversation; it is not added to transcripts or persisted by Sia. Read aloud uses an optional
  per-agent voice with the global voice as fallback, permits only one playback session, omits code,
  and ends long narration at a sentence boundary with an explicit on-screen handoff.
- Composer dictation shows an explicit stop control and finishes when clicked. Hands-free voice
  also offers **Finish speaking** if silence detection does not end an utterance. Streaming errors
  and empty transcripts stop automatic listening and show an error instead of silently retrying.
  Ending voice mode cancels startup and pending transcription, discards late results, and stops
  a loading or playing reply without re-enabling the microphone.
- Optional Fn push-to-talk runs in a bundled Swift helper adapted from Notch. A main-process
  `PushToTalkService` owns its recording state, pins the destination at activation, and streams bounded
  16 kHz PCM into the selected voice service. Release commits; Escape, sign-out, sleep, and helper
  exit discard the session, including late transcription results. The helper has no provider
  credentials or model tools, communicates only over inherited pipes, and exits on parent EOF or
  heartbeat expiry. Normal Fn sessions show Notch's multicolor gradient border through recording, transcription, and task execution; the helper reserves its
  nonactivating status notice for errors. It uses no screenshot capture. Composer capture obtains an
  exclusive main-process lease before opening the microphone; window teardown releases the lease.
  Fn replies use Notch's AVAudioPlayer lifecycle in `ReplySpeaker`, with a main-process generation
  token and bounded audio pipe frames. The exact Fn turn supplies a brief spoken result; typing
  elsewhere never triggers speech. A new Fn hold, Escape, composer recording, disable, sign-out,
  sleep or shutdown invalidates pending audio and stops playback. Settings → Voice → Speak Fn
  replies can mute this behavior. Audio stays in memory, and neither completion nor speech raises
  Sia's windows.
- Continue task resumes a failed request through the existing retry route. It rebuilds a bounded
  recovery summary from the encrypted timeline, including partial progress and the blocker, even
  after restarting Sia. The agent must inspect current state before repeating uncertain writes.
  Continuing never auto-runs at startup or re-adds the user's message. Phone status reflects the
  latest attempt, so an old blocker does not override a subsequently verified completion.
- Scotty is an optional Sia-owned desktop pet. Its transparent Electron window, generated
  pixel-terrier atlas, animation, position and task tray are bundled in Sia; it never loads
  Codex pet assets or calls Codex's pet UI. Settings → Scotty and the Sia menu control visibility.
  On macOS both surfaces use nonactivating native panels at status level, joining all Spaces
  including other apps' full-screen Spaces without changing Sia's Dock/activation policy.
  Position, size and motion preferences use the encrypted local repository. Task updates reuse
  the controller subscription with a bounded projection; no second transcript or model session
  is created. Pending input, unread failures, unread results and running tasks drive its state.
  The tray replies, starts requests, cancels tasks and resolves reviewed approvals through the
  canonical controller routes. Main validates the exact sender frame, request schema, current
  task token and approval identity; replacement turns/questions invalidate old controls.
  Oversized approval details require review in the main app. Passive updates never open the tray
  or focus a window. Transparent space passes mouse events through. Display changes clamp the
  saved position to a usable screen, and lock/sleep/sign-out clear task bindings and hide both
  surfaces. Reduced Motion (or disabling animation) holds the sprite still. No startup probes,
  microphone, screen capture, network connection or additional permissions are needed for the pet.
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
- Settings → More → Assistant owns an encrypted `assistant/library` record: user-authored per-agent memory,
  guided workflows with named inputs and expected results, context opt-in.
  Memories are injected only for their owning agent on new runtime turns; pausing/deleting affects
  future requests, not provider history. Workflows create a fresh canonical conversation and resolve
  live tool capabilities at execution time. They contain instructions, not shell scripts or cached
  native references. Library operations are strictly typed and release sign-in gated.
- In Connected apps, optional per-agent automatic memory records an encrypted operational journal (tool names/outcomes,
  task completion, and model-proposed lessons), never raw action arguments, message bodies, or screenshots.
  The current task's model extracts useful lessons through `memory_learn`. A local idle timer
  consolidates finished-turn lessons, deduplicates them, and caps learned memory at 40 entries per
  agent, at most once every six hours; Settings offers an immediate pass. This uses no extra model
  turn. Pausing stops collection/consolidation. Deletion suppresses identical lessons from being
  relearned. The journal retains at most 500 entries and remains separate from research capture.
- The Connected apps / legacy opt-out `memory_suggest` route adapts Notch's PROMOTE/DISTILL pass into encrypted proposals to add lessons, merge memories,
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
- Connected-app executable skills adapt Notch's Bash library with encrypted source, an owning agent, and a SHA-256
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
  Onboarding and Computer settings share `SetupMacAccess`, a sequential, user-started permission
  guide with typed, fixed-target requests for System Events, Safari, Chrome, Calendar,
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
  Only threads dispatched by Fn drive the click-through multicolor working edge. Main-process thread
  updates keep it animated for running/queued work, steady during approval/input waits, and remove
  completed, failed, cancelled, or deleted threads. Overlapping Fn requests share the indicator;
  unrelated typed requests cannot activate it. Disable/sign-out/helper failure clear its bindings.
  Sleep hides it; wake rechecks remaining tasks. No task content is sent to the decorative overlay.
  The native view respects Reduced Motion and fades out without activating a window.
- `computer_list` also discovers installed apps from fixed application directories. Launch validates
  a currently installed bundle and excludes sensitive apps and script runners. These capability-bound computer tools also provide Use my Mac's default background control. New profiles default to Use my Mac, working in the background, with automatic action approval. Existing access modes and an explicit confirmation choice are preserved; profiles without a saved approval preference use automatic approval. macOS permissions remain separate. The access mode is persisted independently of action confirmations. Safari’s system-owned Cryptex app link is recognized without admitting arbitrary symlinks. Native
  click/drag can use screenshot pixels bound to a recent host-owned window capability. The backend
  validates PNG dimensions, coordinates, live app/window ownership, and protected controls again
  before delivery; no global-coordinate tool is exposed. Windows with protected controls omit
  screenshots. Input delivery returns `accepted_unverified` plus fresh state for semantic review.
  Two failed control attempts stop further computer/browser mutations in that turn; read-only
  observations remain available to diagnose the blocker. Chrome attachment failures include an
  actionable connection repair instruction without changing trust mode. Connected apps returns a connection refusal for
  unattached `browser_tabs`.
  **On my screen runs the Notch-style native execution path.** It uses the same Codex
  App Server harness and subscription login, with `baseInstructions` replacing the coding persona
  with the port of Notch's `ClaudeCodeInvoker` prompt. Native shell, file operations and image
  viewing are enabled in `danger-full-access`; provider web search, inherited plugins/MCPs,
  project instruction discovery and subagents are disabled. Connected-browser tools are not exposed.
  The native route exposes only Sia library/memory/schedule tools through ActionGateway,
  with no CUA tools. Its foreground operating prompt comes from the pinned Notch source, followed
  by the Codex tool-name, screenshot-coordinate, presentation and permission adapters. It does not
  append the separate background window-control recipe or a hardcoded Canvas investigation plan.
  While an On my screen turn is running (not waiting on the person, paused, or ended),
  `screen-control-indicator.ts` shows one click-through, non-focusable, content-protected panel
  per display and registers a global `Escape` that cancels those turns; both are released as soon
  as no such turn runs, on lock/sleep, and at quit. The panels live in Sia's own process, which the
  host-pid exclusion already keeps out of window control. The route is pinned when the turn starts.
  Background turns show no overlay, only a Scotty/Dock status.
  Matching saved skills can use the already signed-in apps; an explicit UI-only/no-API request
  takes precedence. Private account data and observed email addresses must not go to public search.
  A separately installed, reviewed `canvas-api` skill reads active CMU courses/teachers or a course's
  assignments through Safari. It accepts only those GET routes and validated page/course numbers;
  it does not navigate to JSON pages, read credentials, or run in background window-control mode.
  Both routes require verified outcomes and honest coverage gaps. The background prompt separately
  guides course inventories, per-course materials, account switchers and destination verification.
  These are model instructions, not a shell enforcement boundary or a guarantee of completion.
  Report files are verified by readback and linked in Sia/phone, without repeatedly activating an
  external editor. Native learning uses the same indexed vault for later verification.
  Every Mac turn receives the current local date/time and timezone, including after a session
  resumes. While any Use my Mac turn runs, the main process holds one Electron
  `prevent-display-sleep` power-save blocker (display sleep would lock the session and block
  window capture and input on both routes); the last turn to end, fail or be cancelled releases it.
  `powerMonitor` lock-screen or suspend stops running Mac turns as failed with a plain
  "Your Mac locked/went to sleep" message and the Continue task banner. New or continued Mac turns
  stay queued until unlock or resume. A structured unsuccessful task result ends as needing attention across desktop,
  phone, schedules, journal and notifications, even when Codex completed its response normally.
  Cmd+E captures source context before its panel takes focus and delivers it through the host
  send route, without placing private context in renderer IPC or the displayed user message.
  `--mac-apps` lists running application names, bundle IDs and PIDs. `--mac-context <pid>`
  reads the chosen app without taking focus or substituting another app; it has a bounded
  1,200-node, 28-level, 12,000-character, two-second budget. Truncated or timed-out reads
  are explicitly partial evidence. Fn retains its shorter capture budget.
  Browser page identity, when exposed by accessibility, precedes the bounded outline so truncation
  does not erase the observed origin/account path. Queries and fragments are omitted; authentication
  paths are reduced to their origin. Missing identity still requires fresh app inspection.
  `SiaVoiceHelper --mac-screenshot` captures one display on demand and normalizes its Retina image
  to logical point dimensions, bounded to 1920×1200. It returns the display origin and exact
  points-per-image-pixel transform. The native prompt uses this command for observation and
  verification; it must not divide those image coordinates by Retina scale again. Pure native tests
  cover Retina/large/portrait geometry and PNG orientation without OS capture or input.
  **Work in background** under Settings → Computer → Where Sia works is the Use my Mac default:
  profiles without a saved choice use it, and an explicit **On my screen** choice selects the native
  route and is kept. Onboarding does not change this choice. Before a background turn starts, the host
  rereads driver permissions; if the driver cannot load or Accessibility/Screen Recording is missing,
  the turn fails before any model call with a plain next step (allow access, or choose On my screen)
  and the Continue task banner. The background route uses
  `@trycua/cua-driver` through `CuaService` in the Electron main process, without a VM or driver daemon.
  Native computer calls use a fresh opaque CUA session for each active turn, separate from the
  reusable Codex conversation and explicitly attached browser sessions. A new turn revokes prior
  app/window/snapshot refs and discovers fresh ones; an aborted old call cannot clear current refs.
  Ended driver sessions are never revived and uncertain input is never replayed. Window ids stay
  stable across inventory refreshes within the same turn.
  Background control adds built-in CUA `computer_list`, `computer_snapshot`, `computer_action`,
  `computer_open_app` and `computer_open_url` through ActionGateway and changes the session prompt.
  It uses a distinct `mac-background` Codex session with verified native-tool disablement and a
  workspace-write sandbox with no additional writable roots, temporary-directory grant or process
  network access. Shell/image tool gates remain disabled and are verified before the turn. Read-only
  memory reviews retain their read-only sandbox. Workspace permission matches the explicit file-output
  tools, avoiding a contradictory read-only instruction that caused a real model to decline reports.
  Its standalone window-control prompt contains no native command instructions;
  foreground native context is not injected. Mac response formatting and the progress watchdog remain active.
  Background also exposes `computer_list_files`, `computer_read_file` and `computer_write_file`
  through ActionGateway. They read bounded UTF-8 data files and create new txt/md/csv/tsv/json
  reports in the host-pinned task workspace. Updating an existing file requires the SHA-256 from
  its latest read; stale revisions are refused, and concurrent Sia writes are serialized. Creation
  never replaces an existing file. They cannot traverse subdirectories, follow file links, read
  hidden/credential files or open apps. Writes return disk readback and a
  SHA-256 digest; arbitrary filesystem and native script operations still use the native route.
  Both Mac routes record the structured
  result in the encrypted task journal and inject recent activity, failures and memory topics on later
  requests. Background uses the encrypted gateway skill registry and `skill_save`/`skill_run` with
  exact-source approval. Its Bash sandbox has no direct GUI, user-file, Apple-event or network access;
  `sia_json_get` and `sia_json_object` wrap the system JSON utility to avoid hand-escaped arguments.
  `skill_run` takes the saved id, SHA-256 revision and input, rather than asking the model to resend
  the entire script. The host loads and hashes the current source for the approval preview, before
  execution, and before each nested action. Editing or deleting the skill invalidates a pending run.
  `sia_action` calls retain the original turn's tool allowlist, cancellation and foreground policy.
  Scripts with no progress between host actions stop after 30 seconds with a recovery diagnostic;
  pending host actions suspend that inactivity check, within the existing overall skill deadline.
  A delivered UI action with fresh, settled state may continue so the script can inspect that state.
  Missing/loading observations, stale targets and refusals stop the run without replay. Runs containing
  UI delivery remain `accepted_unverified` until the agent inspects semantic evidence. Native scripts
  remain on the native route; both routes share journal evidence for consolidation.
  Background native observations default to accessibility/text, with `include_image:true` for visual
  evidence and pixel targeting, or `read_text:true` for screenshot OCR. Browser observations keep
  images by default; text edits also capture an image to cross-check unreliable AX echo. Pixel input always receives a
  fresh post-action image and cannot use a text-only snapshot. Right-clicks use a current element or
  screenshot target; double-clicks require screenshot coordinates. Dropdown selection uses the
  driver's `set_value` support. Browser tab shortcuts are restricted to ordinary navigation.
  A missing browser window in the supplemental native helper triggers one exact-window CUA
  observation before Sia gives up. The host then rechecks browser metadata and the expected page;
  captured content and input capabilities remain withheld until those checks pass. Known protected
  pages never enter recovery. If both observations fail, the result distinguishes the CUA attempt
  from the helper failure without exposing page content or switching to foreground control.
  The supplemental native helper resolves the same requested window by native window ID when
  available, with process ownership checked separately. WindowServer and accessibility titles can
  disagree during browser navigation. Systems without that optional macOS SPI retain strict geometry
  and title matching; a known conflicting native ID never falls through to that heuristic.
  Empty background accessibility automatically requests one image unless the caller explicitly
  selected text-only output. Protected/refused reads never use this fallback, and unavailable
  screenshots never grant pixel input. Sia preserves the driver’s exact-window `background_input`
  report, including separate accessibility, pointer and keyboard availability. An off-Space or
  AX-unresolved window may provide observation pixels without accepting any background input;
  those snapshots no longer advertise pixel actions. Input checks the relevant route, and pixel
  delivery rechecks it after the fresh capture. Driver-side target checks remain authoritative.
  An unconfirmed delivery with a foreground escalation
  suggestion still receives post-action observation: the input may already have worked. The model
  inspects that result before declaring failure or choosing another observed control; Sia never
  automatically retries the input in the foreground.
  Driver calls have a deadline covering queue wait and execution. Cancelled waiters return promptly
  without overtaking the active call; late initialization cannot replace a recovered driver.
  An expired implicit SDK session renews once for unscoped read-only app/window inventory. Named
  sessions, permission refusals and writes are never replayed by that recovery path.
  **Pause and tell me** is the default fallback. RuntimeCoordinator pins `backgroundOnly` in the
  host's turn context; ActionGateway rejects explicit foreground input/opening before approval or
  dispatch. A model cannot change that context with tool arguments. The optional **Allow brief
  foreground control** setting permits an explicit foreground attempt after fresh observation,
  with ordinary action approvals still applying. Changing the fallback creates a new session on
  the next request and cannot relax a running turn. No automatic input replay occurs.
  With foreground recovery enabled, `computer_open_app` accepts explicit `delivery:"foreground"`
  to activate the installed app, followed by a fresh observation of the intended exact window.
  The task then prefers background routes again where available; no uncertain write is replayed.
  App launching uses `open -g` by default in Use my Mac; URL opening requests `activate:false` by default. These avoid
  requesting activation, but apps may still raise their own windows. No all-app background guarantee
  is made. Browser snapshots
  can require `expected_url`, including query filters, and refuse a mismatched page before returning
  content. `source_url` attributes the observed page without exposing query parameters or fragments.
  Native commands use Codex's execution boundary, **not** the
  per-window ActionGateway. This is an explicit architecture exception for the requested native
  Mac mode, not a claim that arbitrary commands can be confined to approved window capabilities.
  Confirmations use Codex `untrusted`; bypass (the default) uses `never`. **Allow for this task** on a
  native request answers Codex `accept` and keeps Codex's `acceptForSession` matching (the same
  command in the same folder, or the same files) inside Sia for the rest of that turn only, so it
  never outlives the task; requests for extra permissions, network access, terminal input, or a
  whole folder always ask.
  Mode/trust/background-control/fallback changes recreate the session on the next task, preserving encrypted
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

  Provider preparation finishes before acquiring GUI ownership; foreground screen context is
  captured after the lease is held, immediately before sending the turn.
  A whole-task `global_focus` lease prevents concurrent Sia tasks from driving the GUI. Fn audio
  capture can proceed while a task runs; new Mac tasks queue for the screen. Notch's progress-aware
  watchdog is ported (180 seconds without provider activity; one hour maximum, excluding approval
  waits). Pending host tool calls suspend the inactivity timer while their own bounded timeouts apply;
  the one-hour task limit remains. Completion/cancellation wins over a late start-request failure,
  preventing duplicate terminal events or writes to a closed event queue.
  Cancellation interrupts the turn, declines pending approvals and cleans native background
  terminals before releasing the screen. No model/GUI probes run automatically at launch.
  Final structured results use Notch's response contract and balanced-object parser, translated to
  Sia's timeline, voice response and output-file link. Partial JSON is never streamed into speech.
  Both Mac control modes execute the copied Swift `JournalStore`, `SkillLibrary` and
  `AgentResponse` from `native/notch/engine/` through the helper's headless `--notch-engine` mode. The foreground operating
  prompt and PROMOTE/DISTILL/INDEX recipe are generated from pinned Notch source literals, with
  explicit Codex/Sia adapters. See [the source and adaptation map](../apps/desktop/native/notch/README.md).
  The canonical learned vault is `<workspace>/.sia-mac/<agent id>/`: journal, failures, bullet
  lessons, the complete MOC, linked topic notes and executable `skills/*.sh`. Swift supplies the
  original 1,200-character journal tail and 1,000-character lesson tail, plus a bounded
  1,200-character unresolved-failure tail so new conversations can avoid repeating a failed approach. The desktop and phone
  share the sorted script registry and metadata from the first eight nonempty lines. Ordinary
  kebab-name files are bounded to 16 KB and 100 scripts; links are excluded. Saving never executes.
  These native memory/script files are local plaintext, with private permissions. Encrypted
  conversations/manual preferences remain intact; enabled preferences project into read-only
  `preferences.md`; up to 16,000 characters are included in every native request, even when
  learning is paused. Existing task history/scripts migrate once. Both modes prepare and record
  requests against the same vault. Background tasks read linked notes through the scoped
  `memory_vault` tool, and may write notes only while automatic learning is enabled. Native scripts
  are exposed as read-only workflow references; executable background skills still use the
  sandboxed `skill_save`/`skill_run` route. No credentials or browser profiles are copied: background
  window control operates on the same already-signed-in Mac apps.
  New Mac agents in either mode enable Notch-style learning. Existing opt-outs remain unchanged.
  Native consolidation uses the source recipe on the agent's pinned Codex model after new
  experience, at most every six hours while idle; explicit review/trigger can request it sooner.
  The review has only `memory_vault` list/read/write/append: no native shell, GUI, accounts or
  network tools. Every call rechecks the current learning preferences, Mac access mode and pinned
  workspace. Revisions prevent overwriting concurrent edits; read paging and append preserve long
  journals. Scripts are saved, never executed, during review. Disabling learning/reviews cancels it.
  Legacy suggestion review remains available to existing opt-outs; Connected apps retains reviewed
  gateway-skill proposals. Settings exposes the actual native notes and the phone graph reads them.
  Sia's GUI lease, Codex transport, UI, on-device speech and background CUA remain adapters.
  Detached Claude workers and app self-modification are excluded. Matching source mechanics does
  not establish equal model behavior or reliability.
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
  Turn-start failures return a safe, actionable error to the phone. A model-readiness check runs
  before creating a conversation, and an empty conversation is removed if dispatch still fails.
  If an older conversation has a pinned model that is no longer available, the phone asks for a
  new chat rather than silently changing that conversation's execution route.
  The 256-bit pairing token and enable preference use the encrypted repository. The listener
  binds a private LAN IPv4 address on port 8738, admits same-subnet clients only, validates Host
  and Origin, limits auth failures/body size/connections, sends no-store/no-referrer/CSP headers,
  and never logs its private URL. Rotation invalidates prior links. Account access is rechecked
  before requests and after asynchronous reads; lock, sleep and shutdown close the listener.
  Interface changes rebind it without launching applications or a model. Enable is opt-in.
  Output downloads must be named in the current conversation, stay in SiaOutbox, have no final
  symlink, and are bounded to 20 MB and forced to inert attachments. Native skill reads stay in
  the selected workspace's `.sia-mac/skills`, reject symlinks and are bounded to 60 small scripts.
  The memory graph reads the selected agent’s native vault, manual memories and scripts; legacy encrypted journal entries remain a fallback.
  Like Notch's Wi-Fi mode, this is HTTP, not a cloud relay or encrypted remote desktop. The UI
  explains trusted Wi-Fi, link privacy, keyboard dictation and awake/unlocked requirements.
  Because the link is plain HTTP, phone turns always confirm native, computer and connector actions
  on the Mac, even when full bypass is on. Sia retains its model/permission boundaries; Notch's Claude MCP permission endpoint and
  Tailscale address advertisement are not part of this same-Wi-Fi port. The phone stores only
  recent prompts locally, and offers a control to clear them. It never stores provider credentials.
  Its decorative aurora is the React Bits Dither background (three.js, @react-three/fiber and
  postprocessing), shared with the desktop and launcher and loaded lazily. It renders at up to
  30 fps, stops on hidden pages, in Calm appearance and under reduced motion, and never handles
  pointer input. Without WebGL, or after initialization failure or graphics context loss, a gently
  moving CSS fallback remains; returning pages retry the renderer. On the desktop it animates only
  on the welcome scene while the window is focused; conversations keep the static CSS veils.
  Main action buttons adapt Joly UI's Liquid Metal Button with a lazily loaded Paper Shaders
  effect, capped at 30 fps and 16,000 pixels per button. Hidden, offscreen, disabled and reduced-motion
  states stop continuous rendering; disposal releases the graphics context. Button actions remain
  ordinary native buttons and use the same remote command routes even when graphics are unavailable.
  The phone shell follows visual viewport height and vertical offset on both resize and scroll;
  keyboard mode eases the welcome content and navigation out of the way without changing composer
  layout or resizing the wave field. Collapsing controls become inert immediately; the decorative
  headline/composer gradients share the field's hidden-page pause and reduced-motion behavior.
  Pinch zoom keeps the layout unchanged. Programmatic
  composer focus prevents document scrolling. Tests simulate keyboard resize/pan separately from
  window resizing; physical iOS keyboard behavior still requires device acceptance.

- First-run guidance is gated by the same release sign-in check as the workspace. Its progress
  lives in encrypted desktop preferences, and starter creation uses `agents.save` plus the normal
  catalog/resolver and private workspace path. The guide records its agent and next step in the
  same commit as first-thread creation; repeated setup requests reuse that agent. Existing
  profiles are not enrolled automatically. Codex setup uses a single action for the managed installer
  and official ChatGPT browser sign-in. A one-use, expiring continuation resumes after the installer
  restarts Sia; progress is sent through typed provider snapshots without login URLs or credentials.
  A connected account is checked before setup completes. Core permission statuses remain visible,
  and the permission pass reads fresh grants before configuring voice.
  Permission steps are optional and use the typed bridge.
  The guide waits for observed grants before advancing and never treats a request returning as consent.
  Passive focus/poll checks do not replay prompts. A persisted `permissionSetup` records the app
  choice, skipped optional rows, and whether an authorized pass should resume after the one
  **Relaunch Sia** (offered only when a short-lived child process reads a grant the running app
  cannot see yet); pausing prevents
  further steps even if an outstanding native request completes. Accessibility and Screen Recording
  are requested separately so one Settings pane cannot hide the other. Protected macOS approval
  dialogs remain user-operated, with no credential entry or model turn in setup. Explicit Fn setup
  requests microphone consent from the signed Electron app, not the background voice helper;
  previously denied access opens the Microphone pane. The helper only observes the grant. Native voice readiness publishes actual microphone
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
- **Undo changes** under a finished reply plays back the `fileChange` items Codex reported for that
  reply (an added file's content, a deleted file's content, or an edit's line diff), which the
  thread already stores; no folder copy or Git snapshot is taken. `main/turn-changes.ts` applies the
  record backwards or forwards only when every file still matches it exactly, writes all files or
  none, stays inside the thread's folder or the home folder (never through a symlink, into `.git`,
  `~/.ssh`, `~/.gnupg` or `~/Library/Keychains`), and refuses while a task runs in that thread.
  Changes made by shell commands, and anything sent or done in other apps, are not undone.

## Concurrency

The turn scheduler admits at most four turns. A thread has one active turn; workspace writers,
browser tabs, and app windows are exclusive; foreground takeover is one global lane. Conflicts
remain visible and queued rather than racing. Closing the renderer window does not stop the main
process on macOS, so admitted work continues and appears in Activity after the window reopens.
