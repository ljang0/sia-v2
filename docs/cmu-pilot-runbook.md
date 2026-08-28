# CMU pilot runbook

This runbook is for the controlled `0.1.0-alpha.24` CMU pilot. It keeps the first session short,
safe, and easy to support. It is not approval for public distribution or a research launch.

## Five-minute first session

1. Install the signed Sia build and sign in with the invited CMU email. Sia sends a one-time code;
   there is no password or signed-out access to the app.
2. Open **Settings → AI**, choose **Sign in with ChatGPT**, and complete OpenAI's browser flow.
   Codex is the recommended pilot provider. Do not paste an OpenAI API key into Sia.
3. Create an agent with a name and one short instruction, for example: “Help me compare sources.
   Ask before changing files or sending anything.” Sia chooses its color and private folder.
4. Start with a read-only task. Confirm that Sia shows progress and the completed result in the
   same thread.
5. Add Google Workspace, Slack, Chrome, or macOS computer access only when the test requires it.

## Safe pilot defaults

- Computer actions ask for confirmation by default. A tester must explicitly choose autonomous
  actions, and should do so only for a bounded disposable test.
- New one-time schedules stop after one run. New recurring schedules stop after ten runs unless the
  tester selects another finite limit. Sia must remain open for local schedules to run.
- Google begins read-only. The initial pilot does not include Gmail send, file editing, sharing, or
  Slack posting.
- Account details and optional local connections stay collapsed until needed.
- The included Meta model is not part of the pilot happy path. Its upstream endpoint must pass a
  fresh live sentinel before operators describe it as available; use Codex meanwhile.

## Optional connector checks

The tester must complete every provider-owned OAuth or macOS permission screen personally.

- Google Workspace: connect, search/read one disposable Gmail thread and one disposable Drive
  file, disconnect, restart Sia, and reconnect. If an administrator must approve the app, stop and
  record only the visible error.
- Slack: connect an approved test workspace, search a unique disposable phrase, read one thread,
  disconnect, restart Sia, and reconnect. Do not send a message during the first pass.
- Computer use: check the permission status in **Settings → Computer**, grant only the requested
  macOS permission, and keep confirmation enabled. Secure and authentication fields stay
  user-controlled.

Never copy OAuth codes, tokens, cookies, Keychain content, model credentials, private download
links, or real workspace content into a bug report.

## What to report

For any failure, record the Sia version, macOS version, feature/provider, attempted action, local
time, and exact visible error text. Include a screenshot only if it contains no private data.

The pilot owner must maintain the approved recipient list and support contact. Research collection
stays off unless the tester separately opts in after reviewing Privacy and the required research,
privacy, and security approvals are complete.
