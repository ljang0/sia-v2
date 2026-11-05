# Sia 0.1.0-alpha.122

Signed and notarized evaluation DMG for macOS 14+, Apple silicon and Intel. The exact DMG was installed and checked on Apple silicon; Intel received static package checks. This build is for supervised RA evaluation. Broad distribution and Arena acceptance remain open; see the [evidence and known blockers](./release-status.md).

## Start using Sia

1. Drag Sia from the DMG into Applications and open it.
2. Sign in with your own email and review the cloud-recording notice.
3. Connect your ChatGPT plan in **Settings → AI**. No source checkout or API key is needed.
4. Follow **Set up Sia** and approve the macOS permissions. Choose the Chrome window Sia should use.
5. Start with public research or a document in the agent's working folder. Ask Sia to save the result; click its result attachment to open Preview. Keep Sia open and the Mac awake.

Computer use is vision-only by default: the model observes screenshots and chooses pointer and keyboard actions. Background work and automatic action approval are the defaults. **Ask before each action** and **On my screen** are explicit alternatives in Settings → Computer. Initial macOS and Chrome grants still need your approval; Sia reuses granted access and silently checks the target before acting. Use Stop to end a task and review the result before relying on it.

## What changed

Background browser input can continue while a different Chrome window is active when Sia proves the exact window identities before and after input. If identity is unavailable or the task window is active, Sia pauses. Automated checks pass; reliable live coexistence is still under evaluation.

Chrome setup returns to Sia before continuing. If the chooser cannot distinguish windows, resize the intended window to a different size and choose it again. Duplicate pages in another window's background tabs can cause ambiguity. This build successfully attached a resized public test window.

This build also includes native-sheet recognition, a fix for memory reviews repeatedly scheduling themselves, and clearer guidance distinguishing temporary request limits from exhausted plan quota.

## Cloud recording

First-run setup selects **Save prompts, usage, and trajectories to AWS** and explains the choice before Continue. Eligible prompts, replies, provider-reported token usage, actions/results and task screenshots then upload automatically to Sia's encrypted private AWS archive. Authorized administrators can inspect them for evaluation and debugging. Active cloud records expire after 90 days; they are not used for model training.

**Settings → Privacy** shows recording status, queued uploads and errors, with pause/export/delete controls. Existing declines and pauses remain off. Local historical records are not uploaded retroactively. Google Workspace connector turns and internal operator/model-tester-only accounts are excluded. Real installed-app uploads have been independently verified; see the [recording evidence](./public-release.md#recording-and-voice-baseline).

## Voice

ElevenLabs voice runs through Sia's authenticated AWS service; no shared key is bundled. In **Settings → Voice**, choose **Enable voice**, select an agent for **Hold Fn to talk to Sia**, and grant microphone access. Hold Fn until the screen edges glow, speak, then release; Escape cancels. **Manage voices → Refresh voices** refreshes an existing setup.

The reported credential outage was repaired server-side. Speech-service checks pass and the owner confirmed the microphone works. Physical Fn and a complete spoken-command round trip have not been independently verified by CUA. Avoid enabling the Fn shortcut in two Sia installations at once.

## Current limits

These limits describe this DMG. Later internal QA completed additional personal tasks, but those
corrections are not in this installer; see [current evidence](./release-status.md#current-evidence-and-open-gates).

- A visitor pocket guide was saved and read back, then opened in Preview by the operator after sleep recovery. Browser meal research stopped on an access-check failure before saving a complete plan.
- Native filename entry is unreliable. Unexpected pending text appeared during an earlier test; its origin remains unresolved. The original filename and document contents were restored and verified. Rename/move/reopen acceptance remains open.
- Chrome restart/error recovery, two completed concurrent tasks, continuous foreground/clipboard preservation, off-Space capture, and lock/sleep recovery remain unverified or unreliable. Two document tasks overlapped but both paused on sleep.
- A fresh Mac/account has not been tested. iPhone distribution follows the Mac pilot.

Lawrence Jang owns pilot support. Report the version, task, time and visible error; avoid private content in screenshots or feedback.
