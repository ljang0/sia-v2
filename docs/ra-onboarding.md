# RA onboarding

This is the shortest path from a fresh clone to a useful first contribution. It uses fake services,
so it does not need AWS access, a model API key, a CMU account, or a paid model turn.

## 1. Prepare the Mac

Install macOS 14 or newer, Node 24+, pnpm 11+, Git, and Xcode command-line tools. Then clone the
repository and run:

```sh
pnpm install --frozen-lockfile
pnpm onboard:check
```

Do not create a personal `.env` for the normal fake-services path. Never copy a credential from chat,
email, a bug report, or another developer's machine into this repository.

## 2. Run Sia locally

```sh
SIA_FAKE_SERVICES=1 pnpm dev
```

In this mode, walk through first-run setup, create an agent with a name and a short instruction, send
a read-only prompt, and open Settings → Apps and Settings → Computer. A local build without cloud
configuration intentionally skips email sign-in and labels cloud features unavailable. Fake services
are deterministic; they are for UI and lifecycle development, not proof that an external provider is
healthy.

Read these files in order when you need more context:

1. [`AGENTS.md`](../AGENTS.md) — scope, boundaries, repository map, and definition of done.
2. [`architecture.md`](./architecture.md) — process and trust boundaries.
3. [`cmu-pilot-runbook.md`](./cmu-pilot-runbook.md) — the tester experience we are shipping.
4. The focused policy for your change, usually [`provider-policy.md`](./provider-policy.md),
   [`harness-policy.md`](./harness-policy.md), or [`ui-quality.md`](./ui-quality.md).

## 3. Make and verify a change

Keep the first contribution narrow: one bug, one visible behavior, and its focused test. Search before
adding a new helper or component; this repository favors a small canonical path over parallel
abstractions.

```sh
pnpm --filter @sia/desktop test
pnpm check
```

For a change that affects first run, sign-in, agents, providers, connections, computer access,
background behavior, or persisted state, finish with:

```sh
pnpm test:pilot
```

`test:pilot` is deterministic and may take several minutes. It does not replace the manual checks on
the signed artifact in [`manual-acceptance.md`](./manual-acceptance.md).

## 4. Test real capabilities safely

Only a named pilot tester should use real Codex, Google Workspace, Slack, Chrome, or macOS computer
access. Use a disposable account and non-sensitive fixtures. Provider-owned OAuth and macOS
permission prompts must always be completed by the tester, never automated or bypassed.

The opt-in no-turn probe checks only the capabilities named in its environment flags:

```sh
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn
```

Do not enable browser probing unless a dedicated Chrome test window is open and uniquely selected.
Do not run real connector sends, edits, shares, or deletes as an onboarding exercise.

## Bug report template

Include:

- Sia version and commit
- macOS version and Mac architecture
- fake or real service path
- feature/provider and exact action
- expected result, visible result, and exact visible error
- smallest reproducible sequence

Attach a screenshot only after checking it contains no private data. Never attach tokens, OAuth
codes or URLs, cookies, Keychain content, API keys, real workspace content, incident bundles, or
private release links.

If a sign-in wall is bypassed, a secret appears, an unapproved side effect occurs, or account deletion
reports success before cloud completion, stop testing and notify the pilot owner immediately.

## Optional phone remote

In **Settings → More → Phone remote**, choose an assistant and enable remote access. If macOS asks for
**Local Network**, choose **Allow**. Connect your phone to the same Wi-Fi, scan the QR code with
its camera, and open the private link. No phone app, connector, or additional account is required.
The phone page shares Sia's colors and typography, with three thumb-accessible views:

- **Chat**: choose an editable suggestion or write your own request, follow progress, send a
  follow-up, stop a task, and download results from SiaOutbox (up to 20 MB). Drafts survive switching
  views. While Sia is working, a follow-up stays in the composer until the task finishes or asks
  for input; it is not silently queued.
- **Tasks**: see the requests in the current chat, their actual status, and tasks with downloadable
  files. Tap a card to return to its reply. The Mac retains older chat history.
- **Memory**: explore the selected agent's memory graph or switch to a searchable list of memories,
  journals, workflows, and saved scripts. Tap a note to read it.

Tap **Mac connected** for connection requirements and the current approval setting. The **More
options** menu includes **New chat**, which clears the remote view without deleting the Mac's
history, and an option to clear recent prompt suggestions on this phone. Your phone can also
follow the selected agent's current desktop/Fn conversation. The layout follows light/dark
appearance and keeps the composer visible as the phone keyboard opens. Animated emerald, cyan,
and violet aurora ribbons with a fine flowing shape texture fill the welcome screen and soften
behind conversations. Adapted from React Bits Shape Waves, the effect works over the existing
Wi-Fi link, pauses while the page is hidden, and becomes a still composition with reduced motion
enabled or graphics unavailable.
The connection and main action buttons use a gently moving metal rim with touch feedback.
Their labels, disabled states, and keyboard controls work with reduced motion or graphics disabled.
When the phone keyboard opens, the composer stays above it, navigation makes room for typing,
and the header follows the visible screen instead of sliding out of view. Closing the keyboard
restores the full layout and keeps your draft. Pinch-to-zoom remains available.
A dropped connection preserves unsent text; retrying a command with an uncertain acknowledgement
uses the same request identifier to avoid duplicate tasks.

Phone requests use the assistant's existing Codex route and the Mac's current **Use my Mac** /
**Connected apps** and **Full bypass** / **Ask first** settings. Approve pending computer actions
on the Mac. Dictate with your phone's keyboard microphone; browser speech APIs usually require
HTTPS, while this Notch-style local link uses HTTP. Keep the link private and use trusted Wi-Fi:
the local traffic is not encrypted. **Create a new link** revokes old links; **Turn off remote**
closes the listener. The listener binds a private LAN address on port 8738 and accepts only that
subnet. It stops on sleep/lock, follows network changes, and resumes when the Mac is available.
Sia must remain open and the Mac awake and unlocked. Scan again after a Wi-Fi address change.
Guest/campus Wi-Fi that isolates devices may prevent pairing; use a network that permits peers.

`pnpm --filter @sia/desktop test:remote` runs the isolated phone-browser checks in Chromium and
WebKit with simulated tasks. Install their test engines once with
`pnpm --filter @sia/desktop exec playwright install chromium webkit`. These checks cover sending,
retrying, stopping, task navigation, file downloads, searchable memory, accessible panels,
reduced motion, and compact/landscape layouts. It does not launch Electron, call a model, move the cursor, or open host apps.

## Optional Fn push-to-talk

On macOS, enable Mac voice in **Settings → Voice**, choose the agent for background voice
requests, then enable **Hold Fn to talk to Sia**. Allow the microphone and Accessibility permissions
requested by Sia Voice, plus Speech Recognition for on-device dictation. Read aloud requires none
of these permissions and no cloud configuration. If macOS lists the development helper separately, grant that helper access.
The Fn monitor retries Accessibility access every ten seconds. Screen Recording is not required.

Hold Fn (Globe) until the screen edges glow, speak, and release to send. Successful dictation uses
Notch's multicolor gradient border without opening a status popup, command box, or main window.
The gradient animates while recording, transcribing, and working on the Fn request. It becomes
steady while waiting for approval or an answer, then fades out on completion, cancellation, or failure.
Reduced Motion keeps the edge still. With Sia focused, the target
is the current conversation; in another
app, it is a new conversation with the selected voice agent. The destination stays fixed during the
recording. Press Escape to cancel, including while transcription is finishing. A tap, Fn-arrow,
Fn-click, or an empty/very short recording sends nothing. Speak after the glow appears: audio is not
captured during connection setup. Release during setup cancels.

Sia must remain running, though its window can be closed. Recordings stop after sixty seconds;
this limit cancels rather than sending an unfinished request. Sleep, screen lock, sign-out, disabling
voice, or quitting also cancels. The Mac speech service requires on-device recognition and does
not fall back to server recognition. Unsupported languages retain read aloud and typing. Audio is
not saved by the helper. Requests use normal Sia conversations and action approvals.
The composer microphone and Fn share exclusive recording ownership.

`pnpm dev` and `pnpm build` compile the bundled universal Swift helper automatically. Fake-service
runs disable the real global shortcut and microphone. `pnpm --filter @sia/desktop native:test`
exercises Fn behavior without installing an event tap or opening a microphone.

Before a pilot handoff, manually check Fn and Escape with the main window open and closed, a
fullscreen app, an external display, denied/revoked permissions, sleep/wake, and rapid release during
startup. Confirm the recording indicator appears only while the microphone is active and that
cancelling a pending transcript creates no message. Use a disposable account for live transcription.

### Desktop setup

At launch, Sia explains why macOS may ask for its Keychain encryption key: it protects saved
conversations and settings. This explanation is shown and focused before the first protected read.
If the macOS “Sia Safe Storage” prompt is hidden, select Sia in the Dock or use Command–Tab.
Choose **Always Allow** in macOS to retain this approval for the same signed app.
If Keychain access is declined, Sia offers restart or quit without
opening or changing the saved database. It does not start a temporary, unsaved workspace.

After any required email sign-in:

1. Click **Set up Sia**. This creates the default assistant and requests missing screen-control and voice permissions.
2. Follow the on-screen guide and approve each macOS prompt. Sia opens one missing permission at a
   time, waits for verified access, and advances automatically. **I don’t see the prompt** reopens
   the current step; denied access opens its System Settings pane.
3. Sia restarts after the completed permission pass and opens your conversation. If Screen Recording
   requires an earlier restart, choose **I enabled it — restart Sia**. Setup resumes the remaining
   permissions using your saved choice of apps. **Finish later** stops the pass; **Start using Sia**
   continues with the access already granted.

In Use my Mac, **Prepare everyday apps now** is selected by default. The same setup pass requests
missing Automation grants for System Events, Safari, Chrome, Calendar, Reminders, Finder and
Messages. Already allowed or unavailable apps are skipped; running apps are reused and missing
apps open hidden where macOS supports it. Uncheck the option to defer those app prompts until a
task needs them. Connected apps setup does not request these Automation grants.
**Settings → Computer → Grant all permissions** runs the same guided pass later.

The default is **Use my Mac + full bypass**: Sia uses signed-in Mac apps and may send messages or
change files without per-action approval. **Customize setup** contains the alternative
**Connected apps + confirmations** mode, agent name, and model choice. The starter uses a ready
model from the admitted catalog and an automatic private workspace. If no model is ready,
complete AI sign-in first. No API key is required.

Setup includes Accessibility, Screen Recording, microphone, Speech Recognition when using Mac
dictation, the Fn shortcut, and selected app Automation grants. Messages history (Full Disk Access)
remains a separate optional setup when needed. macOS still requires its
own approvals; a single Sia button cannot replace them with a single password prompt. Passwords
are entered only in macOS dialogs, never Sia or the agent. Sia skips grants already allowed and
never records during setup. Returning from System Settings only reads current status. A setup
restart resumes an explicitly active pass, while a paused pass stays paused. **Permission details**
shows which access is ready. You can start chatting
without optional permissions. A closed app may need to be opened before its Automation grant can
be checked.

**Connect Google or Slack** is optional. Both accounts are checked by default; uncheck unused
accounts and click **Connect selected apps** once. Complete each provider's sign-in in order.
Connected accounts are skipped. If a sign-in page was closed, **Cancel connection setup** cancels
the pending grant while keeping completed connections. Google begins with read access; edits and
sends require separate consent. In an unconfigured build, use your signed-in websites through
Mac access instead. Chrome window selection remains available in **Settings → Computer**.

Restart is no longer a required onboarding step. If macOS asks for one, open **Permission not
updating? → Restart Sia**. Progress is saved before relaunch; active tasks, recordings, or account
approvals block a restart. Development restarts keep the same profile and service configuration.
Older saved setup steps resume on the simplified screen. **Start using Sia** opens the existing
conversation without sending a message. To revisit setup, use **Settings → Voice → Walk me
through setup**; it reuses the existing agent. Research consent remains separate.

`SIA_FAKE_SERVICES=1` simulates computer and Automation permission setup, leaves dictation
unavailable, and never opens Full Disk Access settings. Use the real signed app for live OS
permission checks.

### Continue a task that needs Chrome

In Connected apps mode, when the latest request attempted browser tools and Chrome is detached, the conversation shows
**Connect Chrome & continue** beneath the response. Open the task's website in Chrome, use that
button, and choose the correct window if several are open. Accept Chrome's own remote-debugging
prompt if it appears. Sia continues the same conversation after the attachment is verified; the
user does not have to retype the request. Failed connections show their repair detail in place.
The original request remains in history, and an unsent draft is preserved.

This control does not turn off action confirmations. It rejects stale requests and duplicate clicks,
and it does not repeat a request automatically on startup. Restarting Sia revokes live browser
capabilities, so this recovery control can reconnect when needed. Settings → Computer still offers
standalone Chrome setup. A successful attachment grants the sites open in the chosen window; it
does not prove the user is signed in to every site or grant all sites on the web.

### Built-in Mac voice

`pnpm dev` and desktop `preview` add Sia’s microphone, Speech Recognition, and Accessibility
usage descriptions to the installed development Electron bundle. To test actual Mac voice, run
`pnpm build` followed by `pnpm --filter @sia/desktop preview`. The preview launches through macOS
LaunchServices so permission requests belong to the development app instead of the IDE that
started the shell. A directly spawned dev process can inherit the IDE’s permission identity;
missing speech usage descriptions in that responsible app cause macOS to terminate the helper.
Development permission prompts may name Electron. No permissions are granted or reset by startup.
After a helper exits, retrying voice setup reconnects automatically; an interrupted recording
must be recorded again.

By default, macOS runs use `MacVoiceService` independently of Sia cloud configuration. Enable voice
in Settings → Voice to enumerate installed system voices and choose a default. Read aloud renders
bounded WAV audio in memory using `AVSpeechSynthesizer`; it neither opens the microphone nor requests
Speech Recognition access. Existing per-agent voice overrides must name an installed Mac voice.

Fn and composer dictation use the same live PCM stream and permission boundary. The microphone
button appends its transcript to the current draft without sending; voice conversation and Fn
submit only after their explicit recording controls are used. Mac dictation never uses the
file-upload transcription path. Enabling Fn requests
Speech Recognition before the shortcut is enabled. Apple’s recognizer must report on-device support
for the current Mac locale; requests always set `requiresOnDeviceRecognition = true`. Denied grants
point to System Settings; unsupported recognition leaves read aloud available. The compatibility
ElevenLabs service remains covered by deterministic tests, but is not the default Mac engine.

To explicitly use a personal ElevenLabs account, build Sia and pipe the key from a hidden prompt
or secret manager into `pnpm --filter @sia/desktop voice:configure`. Never put it in an argument,
source file or log. Allow Sia's Keychain prompt, restart, then enable voice in Settings → Voice.
Both Fn/composer transcription and spoken replies then use ElevenLabs; Sarah is preferred when
available. Audio leaves the Mac only when voice is used. Turn off disables voice. See the
[voice implementation](../apps/desktop/native/voice/README.md) for encrypted storage and removal.
An optional real round trip generates one synthetic sentence and verifies batch transcription,
realtime transcription and cancellation, without opening the microphone or running a model task:
`SIA_VOICE_REAL_SMOKE=1 pnpm --filter @sia/desktop voice:configure --verify`.

## Assistant library and broader Mac control

Press **Cmd + E** from another app to open **Ask Sia**. Choose an agent, type a request,
and press Enter; Shift+Enter adds a line and Escape dismisses. Progress and results stay in the
floating panel; **Review in Sia** opens the full conversation for approvals. No microphone or Accessibility grant is
needed to type. If another app owns
Cmd+E, use **Sia → Ask Sia**; Settings → More → Assistant shows shortcut availability.

Open **Settings → More → Assistant** to opt into current-window context for Fn requests
and manage your agent's memory and workflows. Context includes app identity,
window title, selected text, and a bounded outline of visible static text and controls when available. Browser content is inspected separately through the chosen access mode;
protected fields and apps are excluded. It defaults off and does not capture a screenshot.

Save a preference under Memory, edit or pause it, and delete it when it is no longer useful. Each
entry belongs to one agent and is stored encrypted. Deletion prevents future injection; it does not
remove earlier conversations or information already sent to the provider.

Turn on **Learn from completed tasks** for an agent to keep its task journal and learn reusable
lessons. The task's model suggests lessons; Sia consolidates them locally while idle, at most every
six hours, without spending another model turn. **Consolidate now** runs the same local pass.
Learned entries appear beside your saved memory and can be edited, paused, or deleted. The journal
contains task completion, tool names/outcomes, and proposed lessons, with a 500-entry retention
limit. **Clear journal** also discards pending lessons. Collection is off by default and separate
from research capture. Sia must remain open for background consolidation.

**Suggested improvements** adds reviewable memory merges, retirement of outdated guidance and Bash
skill proposals. Enable learning, finish a few tasks, then use **Find improvements**. This uses a
model turn on the selected agent's existing plan and opens a review conversation. Ordinary tasks can
also propose improvements. Each suggestion shows a reason, completed-task evidence and exact changes
(or the full script). Accept saves the change; Dismiss leaves the library alone. Saving never runs a
script. If you edited a referenced memory, the old suggestion is rejected rather than overwriting it.

**Review memory in the background** is separately off by default. Enabling it allows an extra review
turn when Sia is idle and has new completed-task evidence, at most once every six hours. Sia must be
open and the Mac awake/unlocked. These reviews cannot access apps or run scripts, and stop after three
minutes. Turn the setting off to cancel a running review. Model quality should be checked on your
real tasks; deterministic tests verify the routing and review protections without consuming a plan.

In **Connected apps** or **Use my Mac → Background**, under **Executable skills**, save or edit
Bash source, or ask your agent to make a task reusable.
Each skill belongs to an agent. **Run skill** accepts up to 12 text inputs as JSON and starts a
conversation that requests approval for the current source. Saving does not execute it. Even
trusted mode asks for source review. `SIA_INPUT` contains input JSON; `sia_action TOOL JSON_ARGS`
returns JSON in `SIA_RESULT`. For example:

```bash
sia_action computer_list '{}'
printf '%s\n' "$SIA_RESULT" >&2
```

Scripts run in an isolated scratch directory with system shell utilities. They have no direct
access to user files, apps, AppleScript, or network; host operations use approved Sia tools.
A run stops on refused or unverified results, after 32 actions, on cancellation, or after three
minutes. Completed external actions are preserved, so inspect them before retrying. This is a
curated adaptation of Notch's executable skills, not unrestricted host Bash.

In **Use my Mac → On my screen**, native skills use Notch's filesystem implementation. Sia discovers
`.sia-mac/skills/*.sh` in the agent workspace before every request and shows them under
**Settings → More → Assistant → Skills**. Scripts have `#!/bin/bash`, `# skill: <name>` and
`# description: <when to use it>` headers. They use ordinary Bash/AppleScript and script
arguments. A matching task can reuse a script after reading its current source; each result
still needs verification. Saving never executes a script, and native runs follow the selected
action approval mode. The skill name is preserved in the header; the filename uses a slug.
Skills for a different execution mode remain listed with instructions for switching modes.

Enable **Settings → More → Assistant → Memory → Learn from Mac tasks** to complete the automatic
learning cycle. Both foreground and background Mac tasks use the same agent-scoped Notch vault:
brief activity, failures, lessons, linked notes and the skill registry are supplied on future requests.
Background tasks can read and update those notes through a scoped vault tool, including preferences
learned on screen; foreground tasks can recall notes learned in background mode after restarting.
Native scripts remain workflow references in background mode, whose executable skills use the
window-action sandbox instead of native AppleScript.
The agent can save a reusable procedure during a task, and idle consolidation uses one model
turn after new experience, at most every six hours, to distill lessons and promote repeated
successes into native skills. Supported improvements are saved automatically. Consolidation
never executes a script, opens an app or takes a screenshot. New skill names cannot overwrite
existing files; collisions stay as suggestions. Turning the setting off pauses learning and
reviews. Existing records/scripts stay available until deleted. This is separate from research
capture. Conversations and manually saved preferences remain encrypted; the native vault's notes
and scripts are local plaintext files with private filesystem permissions.

To validate native learning with real Codex turns and disposable local files, opt in explicitly:

```sh
SIA_CODEX_REAL_SMOKE=1 SIA_NATIVE_LEARNING_SMOKE=1 pnpm --filter @sia/desktop exec vitest run src/main/native-learning.smoke.test.ts
```

Set `SIA_SMOKE_MODEL=gpt-6-astra` to run this check with Astra. The test resolves the same
installed Codex binary as the desktop and uses its live model catalog.

This uses the signed-in Codex plan to check file creation/readback, native `.sh` skill discovery,
reuse and memory recall after restarting the controller, bidirectional recall between foreground
and background modes, missing-input reporting, and isolated consolidation in background mode.
It removes its temporary agent workspace and encrypted database afterward.
It is skipped in ordinary tests and never runs at app startup. The prompts restrict work to synthetic
local files; this does not validate GUI clicks, macOS permissions, or account websites.

Ask Sia to list Calendar calendars or Reminders lists, then read or create an item in an exact
returned calendar/list. Calendar creates have no attendees. Finder can report selected item names
and types. These actions use native Apple events and may ask for **System Settings → Privacy &
Security → Automation** access for Sia and the target app. They cannot enable macOS permissions
on your behalf. Verify live writes only with disposable test content.

Create a workflow or start with Morning briefing. Name inputs such as `focus` and `timeframe`, use
`{{focus}}` in a step, and describe the result Sia should check. **Run** asks for input values and
starts a new conversation with the owning agent. These are guided agent routines using available
Sia tools and ordinary approvals, not recorded click sequences or background shell scripts.
Unavailable connections or uncertain results still require help. Sia and the Mac must remain awake.

Cmd+E opens a compact command box for typed requests, progress, and results.
Fn requests run in the background without opening the command box or the main Sia window.
Approvals still wait for your review; a notification can take you to the conversation when needed.
In the command box, **Stop** cancels the displayed task. **Review in Sia** opens its conversation for questions or approvals;
**Open conversation** shows the full history. Follow-ups stay in the same conversation once it is
idle. **New request** lets you choose an agent for a separate conversation. Closing the panel or
starting a new request does not cancel existing work. Fn still uses the voice agent selected in
Settings → Voice (or the active conversation when the main window is focused).

The main conversation shows **Ready when you are** while idle. Model and reasoning controls are
inside **Agent settings**, with workspace details collapsed underneath. Activity rows use plain
language; expand a row for technical details. A single-agent sidebar shows recent conversations
without repeating the agent header. Settings → More → Assistant has separate General, Memory, Workflows,
Skills and Suggestions sections with per-agent counts. Suggestions still require review before
changing memory or saving a skill.

Computer tools can discover and launch ordinary installed apps, including Preview, TextEdit,
Calendar, Reminders and Finder when present in the standard application directories. Accessibility
controls remain preferred. A fresh unprotected screenshot also permits window-local clicks and
drags for canvas controls, using the Cua Driver cursor. Password managers, authentication surfaces,
script runners, terminals, and browser access outside the browser connection remain blocked.
Input delivery alone is not success: Sia receives a new snapshot and must inspect the result.
Two failed control attempts stop further control retries in that turn.

The deterministic pilot tests exercise the library, workflow dispatch, context ownership and opt-in,
pixel bounds/protected-window rejection, and retry limits without reading your screen or posting
real input. Live Fn microphone use and action reliability in individual third-party apps still need
manual acceptance with disposable content.

### Scotty desktop companion

Open **Settings → More → Scotty → Bring Scotty to my desktop**, or **Sia → Show Scotty** in the
Mac menu bar. Scotty is Sia's pixel Scottish terrier: he floats above other apps while Sia is
open. Drag him to move, click him or his badge to open the task tray, and use Escape to close
the tray. Right-click → **Hide Scotty** hides the pet; your position and preferences are saved.
Settings also offers small/medium/large sizes, an animation switch and Reset position.

The task tray shows your existing Sia conversations. Select a task to read progress/results,
answer a pending question, review and approve/deny an action, send a follow-up, or stop it.
**Ask Sia** starts a request using the existing agent you select. These use the same model,
permissions and task history as the main app. The pet never invents task updates or runs a
separate assistant. New input, failed work, new results and running work have distinct states.
The tray stays closed until you open it, and includes buttons for moving Scotty without dragging.

Scotty's windows and artwork live entirely inside Sia. The Codex/ChatGPT pet UI need not run.
He hides when your Mac locks or Sia signs out, respects macOS Reduced Motion, and requires no
additional permissions or connection. Closing Sia closes Scotty too.

### Use my Mac

New profiles default to **Use my Mac**. Existing profiles keep their chosen mode. Change it in
**Settings → Computer → App access mode**, or select it during setup.
Sia uses Notch's native operating approach: shell commands, AppleScript, file access, screenshots,
and accessibility context, with Codex as the model backend and results in Sia. Hold Fn to dictate;
release to send. Fn keeps the app in the background and shows the multicolor gradient screen edge. Cmd+E opens
Sia's compact command box.

Allow Accessibility and Screen Recording, then use **Set up all Mac apps** to request System Events,
Safari, Chrome and the other listed Automation grants. macOS asks separately. Apps that are absent
are skipped. No Chrome window attachment or individual service connection is required. Restart at
setup's end, and finish website sign-ins yourself. Other apps may require their own Automation grant
when first used; macOS cannot grant permission to every possible future app in advance.

Mac tasks use native Codex execution outside the workspace sandbox. **Bypass action approvals**
runs commands without per-action prompts, including sends, uploads, file changes and native scripts.
Turn it off to use Codex's command confirmations. The change applies to the next task; cancel an
active task first to stop its current access. Native shell access is broader than Connected apps'
window grants: its secure-surface exclusions and executable-skill review are not an enforcement
boundary for arbitrary commands. macOS permissions still apply. The agent is instructed not to read
credentials or operate authentication surfaces.

The default route follows Notch's observe–act–verify loop with native commands and screen images.
Its instructions require ordinary app navigation: open Canvas, click an observed course card, then
read People, instructor information or the actual syllabus. Raw API pages and guessed course IDs
are not substitutes; API work requires an explicit developer request. Before global clicks or keys,
the agent must activate and check the intended app. Native screenshots normalize Retina pixels to
screen points and supply an explicit coordinate mapping to avoid clicks landing on the wrong control.
This route may take foreground focus. Provider
web search and connected-browser tools remain unavailable. Only one Sia Mac task controls the screen
at a time; others queue. Long results can be written to `~/SiaOutbox`, and reusable native scripts live
in the agent's `.sia-mac/skills/`. Your existing memory and conversation history remain available.

**Settings → Computer → Where Sia works** offers **On my screen** (the default native route)
and **Work in background** (experimental). The choice applies to the next typed or Fn request.
Background control uses the native Cua Driver SDK with tools tied to individual windows, without
a VM or a Chrome connection. Accessibility is needed for semantic controls; Screen Recording is
needed for window images and pixel actions. Check both under **Settings → Computer → Set up**.
Native shell commands are disabled in these sessions so they cannot take over the desktop through
AppleScript or global input. Background tasks use their own window-control instructions and inspect
the target window directly. Executable scripts and arbitrary file output require the normal native
route; answers and source links still appear in Sia. Both Mac modes share saved preferences and,
when learning is enabled, the same detailed request/result/steps journal and failure history.
Background turns can learn lessons and contribute evidence to idle consolidation; they do not
receive instructions to execute native scripts.

Choose **Pause and tell me** to stop when foreground control is needed, or **Allow brief foreground
control** to permit that fallback. Pause is the default and is enforced by the host before an action
approval or dispatch. Settings changes apply to the next request, not one already running. App/site
opening requests no activation, though apps may raise their own windows. Some controls require focus;
background mode cannot guarantee every action works across every app.

Account answers require fresh, course-by-course source evidence. Canvas checks must distinguish
current courses, instructors and TAs, with missing evidence reported explicitly. Clipboard reads
need a freshness check: a completed Copy command can still leave the previous page's text on the
clipboard. In the experimental route, browser snapshots can require the expected page URL before
returning content, preventing a mismatched course or query from being accepted as that page.

Both Mac modes also distinguish successful navigation from a complete investigation. For coursework,
the agent must establish the current course inventory and actual date range, then inspect each
course's Assignments, relevant Modules, syllabus schedule and recent deadline announcements. The
calendar is an overview, not evidence that no work exists. Relevant linked course materials must be
followed; conflicting deadlines, undated work and inaccessible sources must be reported. Answers
include source links and a short coverage statement. Concise speech does not shorten this research.
These are model instructions, not a guarantee that the model will inspect every source correctly.

The opt-in course investigation regression uses real Codex with only in-memory browser fixtures.
It checks an empty calendar with work in Modules/syllabus, an instructor deadline update, submitted
work, a course absent from dashboard favorites, and an inaccessible course. It never opens apps,
reads a real account or runs native commands; it is skipped by normal checks and never runs at startup:

```sh
SIA_CODEX_REAL_SMOKE=1 SIA_COURSE_INVESTIGATION_SMOKE=1 pnpm --filter @sia/desktop exec vitest run src/main/course-investigation.smoke.test.ts
```

GPT-6 Astra is available in the model picker when the connected Codex account lists it. Use my
Mac setup selects it by default when available; an explicit model choice takes precedence. Sia
checks both PATH and the official installed Mac app for a supported Codex version. Existing
conversations keep their selected model; change an existing agent's model for new conversations.
Cmd+E captures the source app before taking focus, so requests
like “summarize this selection” retain that context. Partial or blocked task results show that
the task needs attention instead of announcing completion.

The Fn monitor and accessibility reader derive from Notch's source; the operating prompt, response
parser and watchdog are ports. Sia keeps its own Mac speech service, storage and UI. Codex's decisions
and reliability can differ from Claude Code, and neither engine guarantees every task finishes.

## Stable development permissions

`pnpm dev` and `pnpm --filter @sia/desktop preview` use a signed copy of Electron at
`~/Library/Application Support/Sia Development/Sia Development.app`, with bundle ID
`ai.sia.desktop.dev`. Sia pins one local certificate in that directory's `signing.json` and uses
it for the voice helper too. It prefers an existing Sia/Notch development certificate. On a new
Mac, run `pnpm --filter @sia/desktop signing:setup` once, or select your existing identity with
`SIA_DEV_SIGN_IDENTITY`. The private key stays in Keychain. A missing pinned key is an error,
not a silent switch to ad-hoc signing. Quit the development app before upgrading Electron itself.
Before replacing an existing signed Electron bundle, the updater compares the old and new
designated requirements and refuses an identity-changing replacement. The development bundle
includes the same permission descriptions as the release, including Screen Recording.
An explicit missing-screen setup request also registers the Electron app through a one-pixel
screen-source request before opening System Settings. That result is discarded; it is never
saved or sent to a model. Status checks and startup do not run this request. Approvals already
granted are skipped, and selected app permissions that were denied remain visible instead of
automatically finishing the setup screen.

Moving from old generic/ad-hoc Electron to this stable identity may require one final permission
grant. Later rebuilds retain the certificate and designated requirement; byte hashes necessarily
change with code. macOS can still request newly introduced permissions or revoke grants itself.
The staged development bundle removes Finder/resource-fork metadata that [Apple disallows in
signed apps](https://developer.apple.com/library/archive/qa/qa1940/_index.html); other attributes,
including quarantine, are preserved. No script resets TCC or grants privacy access. Release builds retain the separate Developer ID
pipeline. See [Apple’s designated requirement documentation](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).
