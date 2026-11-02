# Sia 0.1.0-alpha.118

RA evaluation candidate for macOS 14+, Apple silicon and Intel. The universal DMG passed Developer ID signing, notarization, stapling and Gatekeeper, and was installed directly from the DMG. Exact evidence is tracked in [release status](./release-status.md). This is an alpha, not a claim that every desktop workflow is reliable.

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

## Known limitations

- Two useful planning tasks completed on alpha.115 with setup and review interventions. Alpha.118 also saved/read/reopened a prep checklist derived from the dinner plan. Two completed simultaneous tasks have not been verified.
- Native document Name popovers previously misdirected input. This candidate includes a narrow popup routing correction, but the signed-app attempt stopped before reaching that field: clicking the document title did not expose it. Rename/move acceptance remains incomplete.
- Chrome may require reconnection after restarting Sia. The foreground-input guard can pause a background task when Chrome is active.
- Off-Space native capture and keep-awake behavior remain unreliable on the release Mac. Lock/sleep recovery and a fresh macOS account have not been accepted.
- iPhone distribution follows the Mac pilot.

Lawrence Jang owns pilot support. Include the version, task, time and visible error in a report. Avoid private content in screenshots or feedback.
