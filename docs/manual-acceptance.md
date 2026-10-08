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
test. The source is `0.1.0-alpha.25`; the signed `0.1.0-alpha.25` candidate and its hashes are recorded in
[`public-release.md`](./public-release.md). The last published pilot artifact remains
`0.1.0-alpha.24`, recorded in [`release-evidence.md`](./release-evidence.md).

## Automated gate

From a clean checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:e2e
pnpm package:mac:dir
```

The opt-in no-turn probe may verify installed Codex login and macOS permission reporting without
consuming a model turn:

```sh
SIA_REAL_CODEX_E2E=1 SIA_REAL_CUA_E2E=1 pnpm test:e2e:real:no-turn
```

Run Chrome probing only with a dedicated visible test window and a unique
`SIA_REAL_BROWSER_WINDOW_MATCH` value.

## Integrated alpha.25 acceptance

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

## New-user setup and Keychain continuity

On a clean macOS test account, use the exact signed release artifact and an unlocked login
Keychain. **Set up Codex** must install or update the managed version, resume official browser
sign-in after any restart, and show **Connected** without terminal commands or a manual download.
On a slow connection, downloaded megabytes must advance beyond two minutes without aborting; a stalled
connection must offer an actionable retry and preserve the previous runtime.
While Sia shows **Waiting for sign-in…**, press **Cancel** once (or leave the browser tab closed) and
verify **Try again** starts a fresh sign-in in Sia; ordinary launches must not reopen it.
**Grant all** must show individual statuses, skip granted access, and refresh after returning
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

Run these tasks only when the tester explicitly requests live computer control. They are not
startup checks. Use **Use my Mac → On my screen**, a separate validation agent, a disposable folder,
and a model actually offered by the signed-in Codex plan. Keep existing documents and browser tabs.
With confirmations enabled, deliberately leave Sia's approval card in front when approving a
Calculator or TextEdit action. Sia must restore and inspect the authorized target before input,
then verify the result; an old screen coordinate must never land in the approval window.
Record the selected model, tool calls, outcome, and any missing macOS grant. The person must handle
permission prompts; full bypass does not grant macOS permissions.
Resetting reasoning to **Default** uses the selected model's advertised default; an explicit
reasoning choice stays in effect and does not inherit a separate CLI setting.
When a provider stops offering a pinned model, its picker must identify that choice as unavailable.
Select an offered replacement, run a task, and relaunch: the displayed model and the execution
route must agree, and the conversation must retain its harness and credential source.

| Task                                                                                                | Independent completion check                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculate quantities and costs from a small CSV and save JSON                                       | Read the saved file; compare every expected field. No screenshot or app activation is necessary.                                                                     |
| Open a public downloads page in a new Safari tab, follow its release link, and report compatibility | Compare both facts and links with the actual pages. Check that existing tabs survived. No web search or shell/network fetching substitutes for this navigation test. |
| Rename a disposable file using Finder                                                               | Verify the new name in Finder and on disk, and that the old path is absent. A missing Automation grant is a blocker, not a pass.                                     |
| Edit a disposable Unicode document in TextEdit and save                                             | Read the saved file and compare the requested edit and untouched text exactly.                                                                                       |
| Enter an expression in Calculator                                                                   | Read the actual displayed expression and result. A correct number in the assistant's answer alone does not pass.                                                     |
| Ask a follow-up about the previous task                                                             | Verify the referenced app/document is still the intended target, even with Sia frontmost.                                                                            |
| Cancel a task before its next action                                                                | Confirm the task stops, no later action runs, and another task can start.                                                                                            |

Foreground native control follows Notch’s screenshot verification after state-changing GUI steps,
with accessibility/app values as supporting evidence. Pure file/calculation work uses output readback.
Waiting for the expected state must be bounded; a command's exit code or a page title alone is not
verification. Compare equivalent tasks before claiming fewer calls or lower latency; one successful
run does not establish reliability across every app or model.

The opt-in [native learning smoke](../apps/desktop/src/main/assistant/native-learning.smoke.test.ts) uses a real
model and disposable files to check saved scripts, bidirectional memory recall between foreground
and background modes across controller restart, failure
reporting, continuing an interrupted task without repeating its completed write, and consolidation.
These checks passed with GPT-5.6-Sol. Existing agents keep their memory preferences: verify
**Settings → More → Assistant → Memory → Learn from Mac tasks** for the actual agent before expecting
automatic recall. This is separate from a fresh validation agent's successful memory test.
The [course investigation smoke](../apps/desktop/src/main/actions/course-investigation.smoke.test.ts)
uses a real model with **in-memory browser fixtures** to check coursework outside the calendar and
inaccessible-course reporting. Neither replaces the live GUI checks above. Background
window control (the Use my Mac default) must be validated separately, including its selected foreground fallback policy.

For the On my screen indicator, start a disposable On my screen task on a Mac with two displays and
a full-screen app. Verify the border and pill appear on every display and Space, never take focus or
clicks, are absent from `screencapture` and from Sia's own task screenshots, and vanish on finish,
Stop, an approval, lock, and sleep. Press ⌃Esc (Control+Escape) in another app mid-task: the task stops and
⌃Esc works normally again afterwards. Confirm a task that presses Escape itself (for example, to
close a menu) is not stopped. In the default background mode, verify nothing appears on screen and the Dock menu reads
“Sia is working quietly in the background.”

For composer voice, record a short disposable sentence with **Dictate message**, then click its
stop control. Verify the transcript enters the draft without sending. In **Start voice conversation**,
verify silence detection submits one utterance; **Finish speaking** must also submit quiet speech
without waiting for the recording limit. End the conversation during microphone startup,
transcription, and reply playback: no late request or microphone restart may occur. A disconnected
voice stream or empty transcript must show an error and stop hands-free mode until explicitly retried.

For a live instructor investigation, start a fresh conversation with a natural request such as
“Find my professors for this semester through my Canvas.” Verify the full Courses/All Courses list,
not only favorite dashboard cards. Each reported person needs a current course relationship and
role. When the request says “through Canvas,” follow its profiles, instructor pages, syllabus and
ordinary course links to resolve abbreviated names. If the reviewed `canvas-api` skill was
installed for the validation agent and the request permits API reads, check that its active-course
teacher inventory is paged and reconciled with course pages without opening raw JSON in Safari.
An explicit UI-only request must skip the skill. Do not search the web for an observed email
address or course data. Use broader public research only when the person requested it. Missing requested identities must not be reported as
complete. Check that report delivery does not repeatedly launch an editor, and record elapsed time
and tool calls alongside accuracy. With learning enabled, repeat in a new conversation and confirm
the agent uses dated navigation notes while rechecking current course facts.

Current foreground live check: the existing agent and its selected conversation were still on
GPT-5.6-Sol; changing a new-agent default had not migrated them. Set the existing agent to GPT-6
Astra and verify a new conversation inherits it. Older conversations retain their pinned model
unless explicitly changed. With Astra at Medium and the reviewed Canvas skill installed, the
instructor inventory completed in 28 seconds with three commands and no public search. It found
ten teacher-role entries across five semester courses, including a full name and two staff entries
missed by the previous run. This is a Canvas-role inventory, not proof of academic job titles.
The follow-up verified seven instructional roles and separated three contributor/support roles;
independent syllabus checks confirmed the distinction. The foreground adapter now explicitly
requires real-world role evidence before substituting a permissions inventory for an answer.
Repeat the original question in a new conversation after this change; the successful follow-up
alone does not establish that the first answer consistently performs that verification.

The live weekly-work investigation completed in 226 seconds with 20 commands, seven image reads
and no public search. It checked ten active courses and 103 assignment records, then continued
through syllabuses, announcements, modules and homework PDFs when the assignment feed contained
no deadlines that week. Independent UI checks confirmed the syllabus-only homework deadline and
the neighboring homework PDF dates. Its report distinguished optional homework, assessments,
undated activities and external-only coverage limits. These are individual successful checks,
not a reliability percentage or evidence that background control has the same performance.

For Fn, ask a short task with Sia's window closed. Verify the multicolor border, one dispatch,
a brief spoken result, and no opened Sia window. Hold Fn again or press Escape during speech;
playback must stop and late audio must not restart it. Repeat with **Speak Fn replies** off and
confirm completion stays silent. A typed task must never trigger Fn narration. Automated state
tests cover these races; they do not replace checking the physical shortcut and audio device.
For recovery, interrupt a disposable multi-step task after its first write, restart Sia, and choose
**Continue task**. Inspect the output to confirm the completed write was not repeated. The phone
must show the new result rather than the previous blocker.

For background changes, keep another app frontmost and explicitly select **Pause and tell me**.
Check a Calculator result, a native text edit, and ordinary browser navigation against fresh app
state. Also create/read a Unicode workspace report, preserve an existing same-name file unless its
fresh revision is provided for an edit, refuse a stale revision, and reuse
a saved gateway skill in a new task. Verify results independently and record any foreground change
or blocker; never count delivery or an assistant's answer alone as a pass. Exercise image capture
when text is insufficient, context menus and screenshot double-clicks where supported. A foreground
refusal must stop the affected skill/action without replay. These checks are opt-in; none run when
Sia launches.

The opt-in [background workflow smoke](../apps/desktop/src/main/actions/background-workflows.smoke.test.ts)
uses a real Codex model and real workspace files/sandboxed Bash, with GUI calls denied. Run it with
`SIA_CODEX_REAL_SMOKE=1 SIA_BACKGROUND_WORKFLOWS_SMOKE=1` and an offered `SIA_SMOKE_MODEL`.
It checks report creation, saving/running a gateway skill, unchanged reuse after restart, and
repairing an existing report with a fresh revision.
This test approves generated skills only inside its disposable fixture; normal exact-source
approval remains in the app. It does not validate live window input.

The opt-in [background recovery smoke](../apps/desktop/src/main/actions/background-recovery.smoke.test.ts)
uses real Codex with an in-memory browser and no real account or host actions. Run it with
`SIA_CODEX_REAL_SMOKE=1 SIA_BACKGROUND_RECOVERY_SMOKE=1` and an offered `SIA_SMOKE_MODEL`.
It checks a spoken campus abbreviation against saved institution context, reports an unavailable
window without inventing a login blocker, and finds a dictated workplace through an account
switcher with eight accounts rather than guessed Google account slot URLs. These cases passed with
GPT-6 Astra; they validate model behavior in controlled fixtures, not live browser reliability.

Current background validation: Astra completed the disposable file/skill workflow. Sol created the
report but stalled in the skill workflow. A live Calculator attempt produced the correct displayed
result despite an unconfirmed driver delivery; the host now observes that result instead of treating
an escalation suggestion as proof of failure. Regression tests cover that distinction, automatic
image capture for empty accessibility, cancelled queue waiters, late driver initialization and
read-only recovery from an expired implicit session. The subsequent live Calculator/TextEdit
checks remained blocked by off-Space/unresolved windows. The full live GUI matrix is still
unverified; do not describe this as all-app parity or equal reliability across models.
The source gate is `pnpm check`; the desktop GUI suite is separate and must not run at startup.

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
      (turn off **Bypass action approvals**), and confirm host-side changes ask before running.
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

- [ ] Attach one dedicated signed-in Chrome window. Approve Chrome's own remote-debugging prompt if
      it appears; Sia must not automate that prompt. Read a permitted page, then verify an incognito
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
  voice/app and optional Full Disk Access steps before one final **Relaunch Sia** action appears.
  Relaunch: setup must reopen on Mac access, retain grants and skips, and finish without requesting
  already completed permissions again. Also pause before the last step and verify resume.
- Skip **Talk with Fn** and one app. Finish setup, then start a task that needs the skipped app and
  confirm macOS asks once, in its own words.
- Repeat from **Settings → Computer → Grant all**. Verify unavailable apps and existing grants are
  skipped. For Screen Recording changes, quit and reopen Sia when the row says **Reopen Sia**.
- Launch while another app is foreground. The secure-workspace explanation must appear before
  any Keychain wait, with instructions for bringing Sia’s native prompt forward. Confirm no
  saved conversation or encrypted state is reset if access is declined.
