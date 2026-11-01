# Manual pilot acceptance

Use this checklist on the exact signed artifact before adding a tester. Automated checks cover the
code and deterministic flows; these checks cover provider-owned login screens, macOS permissions,
and real accounts. Use disposable, non-sensitive fixtures and keep research sharing off.

Run automated Electron tests and manual Mac input in separate phases. Automated launches can
change keyboard focus. Before sending a real message, inspect the recipient and complete draft
after typing, then send in a separate action. Never combine recipient entry and Return, and do not
send from an existing personal draft. If focus moves unexpectedly, stop and re-establish the
target before any more input.

Record the result in the private pilot log with the exact Sia version and artifact hash under
test. Use the current signed candidate and hashes in [`public-release.md`](./public-release.md),
and update that record when a new candidate is built. The last published pilot artifact remains
`0.1.0-alpha.24`, recorded in [`release-evidence.md`](./release-evidence.md).

## Current handoff scope

The owner selected Mac first, with iPhone following later. For this handoff, complete the signed
Mac signup/permissions, provider login, Chrome, file/result, native input, cancellation/restart,
lock/sleep and voice checks. Record the exact artifact and any unsupported feature clearly.
The physical iPhone, TestFlight, phone relay and texting sections below remain follow-on acceptance;
they are not claimed as passed or required for the first Mac-only handoff. Public connectors and
additional model engines retain their own admission gates.

## Real work and concurrent use

These are release requirements, not optional demos. Run through the signed app with a live
provider and real public sources or explicitly designated user material. Do not replace them with
seeded replies, tiny invented data, or direct operator work that bypasses Sia. Keep private source
material and recordings outside Git. Calculator and small CSV checks remain useful smoke tests.

| Workflow                 | Useful deliverable                                                                                                                                                                                                                     | Independent verification                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arena technical research | Compare Cua, Browser Use and Playwright from their current official documentation; produce a concise decision brief covering native vs browser control, background behavior, setup, limitations and what Arena would need to evaluate. | Open cited sources, check every consequential comparison, verify file contents and links, and distinguish documented capability from observed behavior.               |
| Document preparation     | Use the actual Sia proposal and release notes to prepare a reviewer brief, installation checklist and unresolved-questions list, without overstating readiness.                                                                        | Compare outputs with source files, verify exact version/hash and remaining gates, open every saved deliverable in its normal app.                                     |
| Personal planning        | Research a real upcoming outing or work trip from current official schedules and venue information; produce a usable itinerary, alternatives, budget assumptions and source links. Do not book or message anyone.                      | Independently verify dates, opening/transport times, feasibility and arithmetic. Record any clarification needed rather than inventing preferences.                   |
| Household planning       | Prepare five practical weekday dinners and one consolidated grocery list from real published recipes, with portions, ingredient reuse and a prep schedule. State household/diet assumptions; do not order groceries.                   | Check recipe sources, serving multipliers, consolidated quantities, pantry assumptions and realistic preparation times. Verify the saved plan and list independently. |

For each run record the original natural-language request, artifact version/hash, provider/model,
start/end time, tool calls, failures/retries, operator interventions and independently inspected
outputs. A reviewer should be able to repeat it from the documented setup without terminal fixes.
Run each selected demo twice from a fresh conversation; a successful edited retry is not a first-run pass.

Exercise concurrency while a real workflow runs: type and edit an unrelated disposable document
in TextEdit, then verify every character and the foreground app. Sia must not steal focus, change
the person's clipboard, type into their document or silently fall back to foreground control.
Run two independent Sia tasks concurrently against separate designated files/windows; verify both
results and isolation. Repeat with the same target window and verify safe serialization or an
explicit pause, never interleaved input or a silent hang. Cancel one task while the other continues.

Measure cold/warm startup, send-to-first-progress, thread-switch/composer responsiveness, stop-to-idle,
total workflow duration and tool latency separately from model/network time. Initial acceptance
targets are visible local feedback within one second and Stop disabling new action dispatch within
two seconds; record instrumentation and sampling limits. Check at least ten UI interactions while
work runs and report observed median/worst time. A task with no progress for 30 seconds needs a
visible explanation and working cancel control. Do not call performance acceptable without measurements.

On the default setup path, include background Chrome readiness when Chrome is installed. The
person approves macOS prompts and selects the intended Chrome window during setup, with a clear
way to decline browser access. Verify a fresh background read, repeat across tasks, and relaunch.
After revocation/expiry, show a plain-language recovery action that resumes the original request
after reconnection without replaying completed input. Never count access to a different window as
recovery. A raw `browser_consent_required` response is not a usable first-run experience.

## Automated gate

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm test:pilot
pnpm package:mac:dir
```

The opt-in no-turn probe may verify installed Codex login and macOS permission reporting without
consuming a model turn:

```sh
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn
```

Run Chrome probing only with a dedicated visible test window and a unique
`SIA_REAL_BROWSER_WINDOW_MATCH` value.

## Integrated candidate and native iPhone acceptance

Use one exact candidate for all four workstreams. Record its commit, app.asar SHA-256, bundle
identifier, signing team, macOS version, test time, observed result, and evidence location.
Passing development fixtures or the older installed Sia does not complete these checks.

With a signed-in account eligible for research, leave sharing off and complete a disposable task.
It must finish without a consent prompt or research upload. In a separately consented test profile,
pause research and repeat: the account stays signed in and the task completes without new capture.

| Area                     | Required live check                                                                                                                                                                                   | Completion evidence                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and permissions | Open the exact signed candidate; complete Accessibility, Screen Recording, each installed app's Automation, and Messages Full Disk Access. Deny once, resume, and relaunch.                           | Candidate reports the grants; a disposable Calculator or TextEdit task changes the intended window and the result is read back. A checked box for another Electron copy is insufficient. |
| Signup and upgrade       | Fresh-recipient email signup, wrong/expired code, resend, provider login cancel/retry; upgrade a disposable alpha.24 profile and reopen twice.                                                        | Sign-in wall holds; encrypted conversations, result files, grants, and schedules survive without repeated Keychain prompts.                                                              |
| GitHub and Notion        | Tester completes official provider consent; read a designated disposable repository/page, disconnect, cancel reconnect once, then reconnect and relaunch.                                             | Correct account and fresh read after relaunch; disconnected tools disappear; cancellation recovers without leaking tokens.                                                               |
| iMessage                 | Add only the designated tester's number and explicitly turn on texting. From the physical phone send a unique read-only task, then STATUS, STOP, and NEW; send one synthetic image and a voice note.  | Correct conversation and result on both ends; stopped work stays stopped; attachment and voice paths complete.                                                                           |
| Text approvals           | In a disposable fixture request one reversible action, inspect the exact request, answer NO; retry and answer YES. Repeat YES and try an untrusted sender.                                            | NO prevents the action; YES authorizes exactly one shown request; stale/repeated or untrusted replies cannot authorize more work.                                                        |
| Telegram and Discord     | Tester supplies their disposable bot through the app's clipboard flow, pairs with the displayed code, then repeats the phone task/approval/attachment checks.                                         | Linked account works, unlinked account cannot start work, disconnect stops delivery, and credentials do not appear in renderer state or diagnostics.                                     |
| BYOK and lab harness     | With an explicitly selected test provider, save a key through Settings and complete one read-only task. For lab evaluation, use a release-signed manifest and verify a tampered manifest is rejected. | BYOK survives relaunch without exposing its key; invalid lab admission keeps the default Codex route usable. Do not paste credentials into evidence.                                     |
| Responsiveness           | Launch cold and warm, stream a long reply, switch threads, cancel, reopen, and test reduced motion.                                                                                                   | Window and progress remain usable; cancellation completes; saved thread and results remain correct. Record measured times rather than borrowing PR #17's earlier measurements.           |

For this candidate, the operator deferred Notion live acceptance and telephone calling. Record
Notion as deferred, not passed; the remaining existing phone channels still need live verification.

For iMessage, verify exact message text for short commands, multiline/Unicode text and messages
longer than 127 bytes. In a self-chat, the sent and received copies must start only one task;
Sia's reply must never create another task. Leave the relay running for two polling intervals after
the reply and confirm the task count stays unchanged. Internal attributed-string metadata must
never appear as a message or approval response.
Approve two consecutive harmless steps by texting YES to each within one minute. Each new YES
must approve only its currently displayed request, and the mirrored copy must not approve the next.
After completion, STOP, and NEW, send YES again: Sia must say no approval is waiting and must not
start or resume work. YES must still answer an actual pending follow-up question.

For desktop input recovery, dismiss the agent editor with Cancel and Escape, select a Settings
menu item, and close Access and the terminal drawer after another app covered Sia. The surface
must disappear and the composer must accept input without waiting for an exit animation.

Google/Slack public distribution retains its separate
[connector gates](./connector-distribution-readiness.md). Calendar, Tasks, and Outlook remain off.
Complete physical voice, lock/sleep, and clean-user checks below before public distribution.

## Chrome connection

Use a disposable Chrome window with a public test page. In Settings → Connections, read the
setup disclosure and choose Connect Chrome or that exact window. Chrome may appear briefly;
the disclosure must explain that choosing a window lets the native setup flow confirm Chrome’s
exact connection prompt. Task tools must not operate permission dialogs. A successful connection must be followed by a
fresh browser read before Sia reports it as attached. Denying permission must leave a clear error
with no usable browser grant.

Then run a background task against the connected public page, navigate an observed safe link,
and read back the destination. Verify other tabs remain unchanged. Restart Sia and repeat;
if Chrome requires setup again, automatic attachment must stop without bringing Chrome forward.
Only an explicit connection may start foreground setup. Background new-tab creation remains
unsupported by the bundled driver; record it as unavailable, not passed.

## New-user setup and Keychain continuity

On a clean macOS test account, use the exact signed release artifact and an unlocked login
Keychain. **Connect ChatGPT** must install or update the managed version, resume official browser
sign-in after any restart, and show **Connected** without terminal commands or a manual download.
On a slow connection, downloaded megabytes must advance beyond two minutes without aborting; a stalled
connection must offer an actionable retry and preserve the previous runtime.
While Sia shows **Waiting for sign-in…**, press **Cancel** once (or leave the browser tab closed) and
verify **Try again** starts a fresh sign-in in Sia; ordinary launches must not reopen it.
With the managed version missing and no ChatGPT account, Included AI's **Finish setup** must install
it and restart Sia without opening ChatGPT sign-in.
**Allow all** must show individual statuses, skip granted access, and refresh after returning
from System Settings without a restart. The tester completes any macOS approval dialogs.

Check both a fresh install and an upgrade from the previous signed release. Create a disposable
conversation, quit/reopen twice, then update and reopen. Conversations and settings must remain
readable without repeated Keychain password requests. Record any initial authorization and whether
it persists; do not infer this from signing verification or mocked storage tests.

macOS owns Keychain prompts and the Mac password never enters Sia. If an authorization is needed,
**Allow** covers one access; **Always Allow** can retain access for the identified app. An unlocked
Keychain and consistent signing identity are prerequisites, not proof of this acceptance check.
Never clear a Keychain item, reset saved data, or weaken encryption to make this check pass. See
[Apple's Keychain guidance](https://support.apple.com/guide/keychain-access/if-youre-asked-for-access-to-your-keychain-kyca1243/mac)
and [Electron's signing guidance](https://www.electronjs.org/docs/latest/api/safe-storage).

## Use my Mac task validation

Use the exact signed candidate, a fresh validation conversation, designated disposable windows and
files, and a model actually offered by the signed-in plan. Start with the default **Use my Mac → Work
in background** route. Validate **On my screen** separately; its success cannot establish background
acceptance. Keep existing documents and personal browser tabs out of scope.

Both routes are vision-only: the model observes screenshots and chooses coordinates, literal text
and keys. Inspect the trajectory to confirm it receives no AX/DOM tree, semantic element reference,
extracted text, OCR helper or provider-native UI/shell escape hatch. Host ownership, focus, protected
surface and stale-image checks are required, but their internal metadata is not model evidence.
Explicit file/connector tasks remain separate and must not be presented as GUI-input passes.

### Useful work and input checks

Complete the real workflows above, including a native document written from actual project material,
saved, closed and reopened. Independently compare its complete contents and verify the reopened
window's title and text from fresh images. A successful Save click, event-post acknowledgement,
correct answer in chat or file-tool write does not prove this native workflow.

During diagnosis, these smaller checks help isolate failures. They are not substitutes for useful
work or the repeated concurrent-work gate.

| Diagnostic                         | Required observation                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coordinate click in a native field | The intended field visibly gains focus; no sibling window or approval card receives input.                                                       |
| Type Unicode and use a shortcut    | The exact text and selection change appear in a fresh image; preserve untouched document contents.                                               |
| Use an Open/Save dialog or menu    | The model reads the actual visible panel and operates it by coordinates/keys. Save and reopen the designated file; preserve unrelated documents. |
| Navigate a public browser page     | Verify the destination and useful page content visually. Existing tabs survive; no DOM/read-links helper substitutes for visual navigation.      |
| Cancel during a multi-step task    | New input stops, late work cannot mutate the target, and a subsequent task starts normally.                                                      |

Reject input from stale screenshot geometry, a moved/replaced target or an unproven window. A fresh
observation can establish a new target; never replay an unverified write merely to test delivery.
When an action is reported as unverified, compare the fresh result before deciding what to do next.
Permission failures must identify the missing access or recovery step without inventing sign-out.
Task tools must not approve macOS/Chrome permission prompts. Bypass mode does not grant OS access.
Protected sign-in screens, password managers and secure fields must remain unavailable to task
observation/input. An unavailable window does not establish that an account is signed out.

With confirmations enabled, leave the Sia approval card in front while approving one designated
native action. Input must still reach the exact authorized target, not the approval window. In the
background mode, changing the person's foreground app must not trigger silent foreground takeover.
Use a separate disposable document and clipboard canary for the concurrency checks above.

### Stop, restart, lock and sleep

Interrupt a disposable multi-step task after its first write, restart Sia and choose **Continue
task**. Verify the completed write is not repeated and the original request/checkpoint is retained.
Queued cancellation must send no input. Stop, pause and failure release the keep-awake assertion
without waiting for optional cleanup. Confirm the assertion actually works on the test Mac; the
current host's failure is recorded in the release evidence, not treated as a pass.

Lock or sleep the Mac during a task. It must pause and resume only with fresh observations and valid
authority after unlock/wake; it must not type into a login screen or reuse old coordinates. Check
revoked access, closed/replaced windows and a browser network-error page. Recovery must use the
intended window and preserve completed work. Run automated Electron tests in a separate phase.

### Foreground indicator and voice

For **On my screen**, use two displays and a full-screen app. The border and pill appear on every
display/Space without taking focus or clicks, are absent from Sia's own screenshots, and disappear
on completion, Stop, approval, lock and sleep. Press Control+Escape from another app: the task stops
and the shortcut works normally afterward. A task's own Escape must not cancel it. In background
mode, no indicator appears and the Dock menu reports background work.

With **Dictate message**, stopping a recording adds a draft without sending. In **Start voice
conversation**, silence detection and **Finish speaking** each submit one utterance. Ending during
microphone startup, transcription or playback must prevent late requests and microphone restarts.
Disconnected streams and empty transcripts stop hands-free mode with an actionable error.

For Fn, request a short task with Sia's window closed. Verify one dispatch, the configured spoken
reply and no opened Sia window. Hold Fn again or press Escape during speech: playback stops and
late audio stays stopped. Repeat with **Speak Fn replies** off. Typed tasks must not start Fn
narration. Physical shortcut/audio checks are required; state-machine tests alone do not prove them.

### Model continuity and internal regression evidence

An unavailable pinned model must be identified in the picker. Select an offered replacement, run
a task and relaunch: displayed model, execution route, harness and credential source must agree.
**Default** reasoning uses that model's advertised default. Existing agents retain their memory
preferences; verify **Learn from Mac tasks** for the actual agent before testing recall.

Opt-in file/learning smoke tests, in-memory course/browser fixtures and earlier assisted-control
checks remain useful engineering regressions. They do not establish vision-only, private-account,
background or concurrent GUI acceptance. The [previous checklist and exact regression recipes](https://github.com/ljang0/sia-v2/blob/5dec1f196cdd1f63f817aff578d040ac29a8ca93/docs/manual-acceptance.md#use-my-mac-task-validation)
preserve their commands, interventions and historical results. Do not use its semantic selectors,
link extraction, accessibility setters or brief foreground recovery as substitutes for the current
visual default. Current source/artifact evidence belongs in [release status](./release-status.md)
and the [distribution acceptance record](./public-release.md).

## Fifteen-minute pilot pass

- [ ] Install the exact signed DMG on a fresh macOS profile. Gatekeeper accepts it and Sia shows
      email sign-in before every private surface.
- [ ] Complete email one-time-code sign-in with an invited CMU address. Sign out and relaunch; no
      agent, thread, provider, connection, schedule, browser, or computer control is visible until
      sign-in succeeds again.
- [ ] In **Settings → AI**, complete **Sign in with ChatGPT** in the provider-owned browser flow.
      Cancel once, retry, and confirm Sia becomes connected without displaying or storing an OAuth
      URL, code, token, or API key.
- [ ] Create an agent using only a name and one short instruction. Confirm Sia chooses its color and
      private folder and selects Codex first when it is available.
- [ ] Run one read-only Codex task, close and reopen the window, and confirm the thread and Activity
      state remain intact.
- [ ] If Included Meta is shown, run one short read-only prompt and one tool-capability smoke. If it
      is unavailable, confirm the UI explains the state and Codex remains usable.
- [ ] Open **Settings → Computer**. Grant only the requested macOS permission, turn on confirmations
      (turn off **Act without asking**), and confirm host-side changes ask before running.
      Secure fields, authentication windows, password managers, Keychain, terminals, and Sia itself
      must remain unavailable as generic computer targets.
- [ ] Create one schedule of each kind. Confirm a one-time schedule stops after one run and a
      recurring schedule keeps repeating until it is paused or deleted (no run limit unless one is
      set). Quit Sia across a due time and confirm the UI does not claim it ran while the app was
      closed.
- [ ] Create a **Weekdays** schedule and one **On certain days** schedule. Open **Scheduled** in the
      sidebar: both appear with their agent, conversation, plain cadence and next run. Edit one's
      task and time, confirm the next run moves, and select its name to open the conversation.

## Optional Google Workspace and Slack pass

Only named connector testers should run this section. The tester must complete every provider-owned
OAuth or administrator screen personally.

- [ ] Connect Google once and confirm the grant covers Gmail, Drive, Docs, Sheets, and Slides while
      individual service switches still control what Sia may use.
- [ ] Search/read one disposable Gmail thread and one disposable Drive file. Do not send, edit,
      share, or delete during the first pilot pass.
- [ ] Disconnect Google, restart Sia, reconnect, and confirm the selected service switches and
      visible account identity are correct.
- [ ] Connect an approved Slack test workspace, search a unique disposable phrase, and read one
      thread. Do not post during the first pass.
- [ ] Disconnect Slack, restart Sia, reconnect, and confirm the Google grant is unaffected.
- [ ] Deny or cancel each provider once. Sia must show a recoverable error and must not retain OAuth
      URLs, codes, tokens, cookies, or a local content mirror.

Public connector distribution additionally requires the independent evidence in
[`connector-distribution-readiness.md`](./connector-distribution-readiness.md).

## Browser, deletion, and recovery

- [ ] Attach one dedicated signed-in Chrome window through the disclosed setup flow. Only that
      explicit flow may confirm its exact Chrome connection prompt; task tools must not. Read a
      permitted page, then verify an incognito
      page, password field, authentication route, stale element reference, and unapproved origin are
      refused.
- [ ] Detach and reattach Chrome. Old origins and element references must remain invalid. Restart Sia
      and confirm attachment is not silently restored.
- [ ] Enter account deletion but stop before confirmation. The action must remain disabled until the
      exact phrase `DELETE ACCOUNT` is entered.
- [ ] With a disposable Sia identity, complete deletion and confirm cloud completion occurs before
      local Sia account state is cleared. Workspace files, provider CLI login, and macOS permissions
      must remain untouched. A failed or timed-out deletion must preserve local state for retry.
- [ ] Install over the intended previous build on a disposable account. Agents, threads, provider
      detection, and one read-only workflow must survive the upgrade.

## Evidence and stop conditions

Record the Sia version, macOS version, local time, feature/provider, action, and exact visible error.
Include a screenshot only when it contains no private data. Never include credentials, OAuth
material, cookies, Keychain content, private download links, or real workspace content.

Stop distribution if any sign-in wall can be bypassed, a credential appears in logs or UI, an
unapproved side effect occurs, deletion reports success before cloud completion, the signed artifact
fails Gatekeeper, or the current included-model sentinel fails without a clear Codex fallback.

Research recruitment is a separate release. It requires every approval in
[`research-release-signoff.md`](./research-release-signoff.md) and the deployed rehearsal in
[`release.md`](./release.md); completing this pilot checklist does not satisfy those gates.

### Guided Mac permission setup

- On a clean signed install, start **Set up Sia** with Use my Mac. Verify Accessibility opens first;
  Screen Recording must not open until Accessibility is granted. Allow access and confirm the
  guide advances automatically through screen, available voice, and selected app permissions.
- Deny an app permission. Confirm setup remains incomplete, and **I don’t see the prompt** opens
  the relevant settings without replaying already granted permissions. No password entry exists
  in Sia; any authentication stays in the native macOS dialog.
- Choose **Finish later** while a prompt is pending. Complete or dismiss that prompt and confirm
  no subsequent permissions open. Chat remains available with the access already granted.
- At Screen Recording, choose **Later** in macOS’s quit prompt. Within a few seconds the row must
  read **Reopen Sia** (real-Mac check of the fresh-process probe). Finish or skip the remaining
  voice/app and optional Full Disk Access steps before one final **Reopen Sia** action appears.
  Relaunch: setup must reopen on Mac access, retain grants and skips, and finish without requesting
  already completed permissions again. Also pause before the last step and verify resume.
- Skip **Talk with Fn** and one app. Finish setup, then start a task that needs the skipped app and
  confirm macOS asks once, in its own words.
- Repeat from **Settings → Computer → Allow all**. Verify unavailable apps and existing grants are
  skipped. For Screen Recording changes, quit and reopen Sia when the row says **Reopen Sia**.
- Launch while another app is foreground. The secure-workspace explanation must appear before
  any Keychain wait, with instructions for bringing Sia’s native prompt forward. Confirm no
  saved conversation or encrypted state is reset if access is declined.
