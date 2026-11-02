# Sia 0.1.0-alpha.121

Signed and notarized evaluation DMG for macOS 14+, Apple silicon and Intel. Installed directly from the DMG and checked on Apple silicon; Intel received static package verification. Exact evidence is tracked in [release status](./release-status.md). This is an alpha, not a claim that every desktop workflow is reliable.

This build explicitly returns Sia to the front after direct Chrome setup and verifies that handoff before resuming the saved task. If macOS does not confirm it, the request stays stopped. The successful live recovery path remains unverified; the signed-app trial reached an ambiguous Chrome-window refusal.

It also recognizes an exactly identified native sheet, such as Finder's Go to Folder dialog, without accepting sibling windows. It also prevents memory reviews from scheduling themselves and distinguishes temporary request limits from exhausted subscription quota. Vision-only native clicks retain pointer-event delivery, exact-window ownership, protected-field and stale-image checks. Live rename/move/reopen acceptance remains incomplete.

## Cloud recording

After email sign-in, first-run setup selects **Save prompts, usage, and trajectories to AWS**. Review the notice, then Continue with recording on or turn it off. Recording includes eligible prompts, replies, provider-reported token usage, actions/results and task screenshots. It uses Sia's private encrypted AWS archive for evaluation and debugging; authorized administrators can inspect it. Active cloud records expire after 90 days. It is not used for model training.

Settings → Privacy shows recording, queued uploads and errors, with pause/export/delete controls. Existing declines and paused recording stay off. Local-only historical records are not uploaded retroactively. Turns using Google Workspace connectors are excluded in full. Internal operator/model-tester-only accounts remain excluded.

Ordinary signed-in user accounts can now upload through the existing encrypted outbox. Uploads retry until acknowledged, and repeated batches do not create duplicate records. The live AWS transport check verified exact prompt, usage and screenshot bytes, retry acknowledgement, and deletion of every object version using a disposable account. That check used synthetic data. Separately, two real tasks on the installed app automatically uploaded prompts, reported token usage and action results; the computer-use task included three actual screenshots. Independent reads verified the encrypted S3 objects and their hashes.

## Getting started

1. Drag Sia from the DMG into Applications and open it.
2. Sign in with your own email and review cloud recording.
3. Connect your ChatGPT plan in Settings → AI. A source checkout or API key is not needed.
4. Follow **Set up Sia** and approve macOS permissions yourself. Choose the Chrome window you want Sia to use.
5. Try a research-and-writing task with public sources and ask Sia to save its result. Keep Sia open and the Mac awake.

Vision-only computer use is the default. The model observes screenshots and chooses coordinates and keys. Background work is the default; **On my screen** is an explicit alternative.

If Chrome setup cannot distinguish your window from another, resize the intended Chrome window to a different size and choose it again. Duplicate pages in another window's background tabs can also cause ambiguity. This recovery path still needs a successful live check.

## Voice

ElevenLabs voice is included through Sia's authenticated AWS service. The shared API key stays server-side. In **Settings → Voice**, choose **Enable voice**, select an agent for **Hold Fn to talk to Sia**, and grant microphone access when macOS asks. Hold until the screen edges glow, speak, then release to send; Escape cancels. If voice is already enabled, **Manage voices → Refresh voices** refreshes its choices.

The November 2 credential outage was repaired server-side. Authenticated speech generation and batch/realtime transcription pass with synthetic audio. Alpha.118 refreshed its voice catalog and entered Speaking during a CUA playback check. On alpha.119, CUA started microphone dictation, observed Listening, stopped recording and received “No speech was detected.” After the competing development copy’s Fn shortcut was disabled, the owner confirmed that the microphone now works. CUA cannot send physical Fn; a complete spoken-command round trip has not been independently verified.

## Known limitations

- Two useful planning tasks completed on alpha.115 with setup and review interventions. Alpha.118 also saved/read/reopened a prep checklist derived from the dinner plan. Two completed simultaneous tasks have not been verified.
- Native document Name popovers previously misdirected input. Alpha.119 stopped at Finder’s Go to Folder dialog because background input could not resolve the exact window; the original and copy stayed unchanged. Alpha.120 reached TextEdit through Finder’s parent window, but filename input did not complete reliably. Later operator inspection found unexpected pending filename text. The owner confirmed they did not type it; its origin remains unresolved. The original copy name was restored and contents verified. Rename/move acceptance remains incomplete.
- Chrome may require reconnection after restarting Sia. The five-dinner test hit a browser timeout and required operator tab selection; its later continuation paused on sleep and foreground-app guards without saving the plan. Background input pauses whenever Chrome is your active app, even if you are using a different Chrome window.
- Off-Space native capture and keep-awake behavior remain unreliable on the release Mac. Lock/sleep recovery and a fresh macOS account have not been accepted.
- iPhone distribution follows the Mac pilot.

Lawrence Jang owns pilot support. Include the version, task, time and visible error in a report. Avoid private content in screenshots or feedback.
