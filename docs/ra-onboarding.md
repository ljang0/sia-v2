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

## Optional Fn push-to-talk

On macOS, enable Mac voice in **Settings → Voice**, choose the agent for background voice
requests, then enable **Hold Fn to talk to Sia**. Allow the microphone and Accessibility permissions
requested by Sia Voice, plus Speech Recognition for on-device dictation. Read aloud requires none
of these permissions and no cloud configuration. If macOS lists the development helper separately, grant that helper access.
The Fn monitor retries Accessibility access every ten seconds. Screen Recording is not required.

Hold Fn (Globe) until the screen edges glow, speak, and release to send. Successful dictation uses
a thin green edge without opening a status popup, command box, or main window. A soft mint highlight
travels around the edge while recording, transcribing, and working on the Fn request. It becomes
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

### Guided desktop setup

The welcome screen offers **Use my Mac + full bypass** as the fastest setup. Selecting it and
pressing Set up Sia saves Mac access and bypass approvals together before continuing. This route
skips service connections and reviews only Mac permissions, optional Fn dictation, browser window
access, and bypass status. Existing signed-in apps and websites are used through computer tools.
AI access, macOS permissions, and any website sign-in are still needed; bypass does not grant them.
**Connected apps + confirmations** retains the individual connection steps and action approvals.

After any required email sign-in, a new profile opens the Sia guide: meet Sia, create an
everyday agent, enable voice, grant Mac access, connect apps, restart, verify access, and try a
request. The starter uses a ready model from the same admitted catalog as the custom agent
form and gets an automatic private workspace. No provider key or connected app is required.
If neither AI access option is ready, complete its sign-in/setup or retry before creating
an agent. Both included access and the existing Codex plan use the Codex App Server harness.

The Fn illustration demonstrates hold → glow → speak → release; it does not record audio
or move the real pointer. Enable Mac voice and the Fn shortcut explicitly, then allow
Sia Voice in macOS Speech Recognition, Microphone, and Accessibility settings. Permission indicators reflect
native checks, including denial or revocation. Continue with typing at any point.
Computer permissions are separate; grant individual windows as tasks need them.
Setup requests app-specific Automation access for Calendar, Reminders, Finder, and Messages,
then walks through Google Workspace, Slack, and Messages Full Disk Access before restarting.
Use **Set up all Mac apps** to request each app in sequence, or choose an individual Allow button.
Permission checks use Apple's [Automation permission API](https://developer.apple.com/documentation/coreservices/3025784-aedeterminepermissiontoautomatet)
without reading personal content. A request may open its app. Previously denied access opens
Privacy & Security → Automation; the user must enable the switch. Recheck app access does not prompt
or launch apps. A closed app whose permission cannot be checked remains **Open app to check access**,
not falsely marked ready. The final checklist lists each app separately. Existing users have the
same controls in **Settings → Computer**. macOS access does not approve individual Sia actions;
review any pending action approval separately before it expires.
Google starts with read access and offers a separate edits/sends consent. Unconfigured builds
explain the cloud limitation and offer Use my Mac for signed-in websites. Connections and permission
grants remain optional, with missing access explicitly listed before finishing.

The Restart Sia button saves the verification step before a graceful quit/relaunch. It refuses
while a task or recording is active. On return, permission status is checked again. **Use my Mac**
works through the existing Safari or supported browser window without Chrome attachment.
**Connected apps** offers the existing Chrome window picker. Browser grants are process-local, so they are created
after the restart rather than revived from disk. Buttons for Gmail, Drive, Docs, Sheets, Slides,
and Slack open the chosen site through the existing origin-grant route. Users complete website
sign-ins themselves; an attached window is not presented as proof of an authenticated inbox. Setup does not change the default action-confirmation policy or research consent.

Progress is saved with encrypted local preferences and resumes after relaunch. Creating
the starter and advancing the guide are saved together. The practice prompt fills an empty
composer without replacing a draft or sending a request automatically. To revisit the guide
with your existing agent, open Settings → Voice → Walk me through setup. Exit setup finishes
the guide without changing agents or permissions.

The pacing and practice pattern are informed by [Wispr Flow’s documented setup guide](https://docs.wisprflow.ai/articles/3152211871-setup-guide).

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

Production macOS runs use `MacVoiceService` independently of Sia cloud configuration. Enable voice
in Settings → Voice to enumerate installed system voices and choose a default. Read aloud renders
bounded WAV audio in memory using `AVSpeechSynthesizer`; it neither opens the microphone nor requests
Speech Recognition access. Existing per-agent voice overrides must name an installed Mac voice.

Fn and composer dictation use the same PCM stream and permission boundary. Enabling Fn requests
Speech Recognition before the shortcut is enabled. Apple’s recognizer must report on-device support
for the current Mac locale; requests always set `requiresOnDeviceRecognition = true`. Denied grants
point to System Settings; unsupported recognition leaves read aloud available. The compatibility
ElevenLabs service remains covered by deterministic tests, but is not the default Mac engine.

## Assistant library and broader Mac control

Press **Cmd + E** from another app to open **Ask Sia**. Choose an agent, type a request,
and press Enter; Shift+Enter adds a line and Escape dismisses. Progress and results stay in the
floating panel; **Review in Sia** opens the full conversation for approvals. No microphone or Accessibility grant is
needed to type. If another app owns
Cmd+E, use **Sia → Ask Sia**; Settings → Assistant shows shortcut availability.

Open **Settings → Assistant** to opt into current-window context for Fn requests
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

Under **Executable skills**, save or edit Bash source, or ask your agent to make a task reusable.
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
without repeating the agent header. Settings → Assistant has separate General, Memory, Workflows,
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

### Use my Mac

Choose **Settings → Computer → App access mode → Use my Mac**, or select it during setup.
Allow Accessibility and Screen Recording. Sia can then discover your existing Safari or supported
browser window and use visible webpages without attaching Chrome or connecting each service. It can
open an ordinary website in the default browser and continue the same task; sign-in and security
pages still pause for the user.
It prefers the browser already showing the task’s signed-in website. In this mode the Codex agent
gets only Sia’s Mac, library, skill, and schedule tools. Public web search, provider shell tools,
and connected-service tools are disabled. Switch to Connected apps to use direct integrations or
structured Chrome access. Switching modes does not turn off action confirmations.

To run tasks without approving each click, enable **Settings → Computer → Bypass action approvals**.
This saved preference applies to subsequent actions, including clicks, typing, sends, uploads, and
schedules. Turn it off to restore per-action confirmation. It does not grant macOS permissions,
expose protected fields, or bypass executable-skill source review. A previously pending approval
still needs a decision; expired actions need a fresh request.

Sia may bring the browser forward when macOS hides its accessibility tree on another Space.
Password fields, private windows, authentication and security pages remain unavailable. Finish
logins yourself and continue the same conversation. Page changes invalidate earlier action targets;
Sia observes fresh state rather than replaying a potentially completed write. The agent is instructed
to wait for loaded content, verify results, and distinguish completed, partial, and needs-input
outcomes. After using Mac tools, it must submit a task checklist with citations to observations from
that turn, or explicit blockers. Sia withholds unchecked final answers and allows up to two
verification continuations. Citation matching cannot prove the model interpreted the page correctly
or listed every requirement; the agent still must check both. Mac access is not
a guarantee that a website is signed in or that every task can finish unattended.
