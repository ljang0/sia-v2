# Sia private-alpha privacy notice

_Effective for 0.1.0-alpha.1. This notice describes the implemented product behavior; it is not a
substitute for organization-specific legal review._

## Local data

Sia stores agents, thread configuration, transcripts, approval history, connection identifiers,
tokens, and research state in a local SQLite database whose record payloads are encrypted with
macOS Keychain-backed `safeStorage`. Workspace files remain in their existing locations. Persisted
attachment records contain names, kinds, and sizes; temporary file capabilities expire and are not
reusable arbitrary-file access.

Sia can be used without a Sia account or configured cloud. Research collected in this mode is
marked local-only. Adding cloud later does not make an existing local batch eligible for upload;
only new eligible captures created after cloud sign-in may sync.

Provider prompts and responses are sent to the provider selected for the thread under that
provider's account, terms, and billing. Sia does not copy provider credential files or silently log a
provider in or out.

### Local trajectory log

By default Sia keeps a complete local log of each thread — every request, reply, notice, action it
took (tool name, arguments, outcome), every approval or automatic authorization decision, and every
screenshot or image an action returned — as plain files under the app's `trajectories/` folder
(`Settings → Computer → Keep a full local log → Show in Finder`). The log exists so a run can be
reviewed afterwards. It never leaves the Mac, is not part of research capture or cloud sync, and can
be turned off in Settings or deleted from disk at any time.

## Browser and computer access

By default Sia runs in **trusted local mode**: computer and browser actions execute without a
per-action approval, and Chrome is attached to the frontmost signed-in window automatically the
first time the browser is needed. Sia enables Chrome's own persistent remote-debugging toggle (visible and revocable at
`chrome://inspect/#remote-debugging`) when Chrome is closed at launch; recent Chrome versions
still show a one-time "Allow remote debugging?" consent that the person clicks (Sia never clicks
Chrome's own security prompts). The debugging endpoint is local-only, and turning trusted mode
off stops Sia from using it. Every action is still bound to a live window, tab, and fresh
snapshot, still refuses incognito, authentication, password, and secure surfaces, and is written to
the local trajectory log. `Settings → Computer → Ask before every action` restores per-action
approvals and explicit window selection. Sia does not copy cookies. Computer access requires macOS
Accessibility and Screen Recording, which Sia requests once at first launch. Browsers, terminals,
password managers, Sia itself, Keychain, and security settings are excluded from generic computer
targets.

Apple Messages support is local: with Full Disk Access granted to Sia, the `messages_search` and
`messages_read_thread` tools read recent rows directly from this Mac's own Messages database
(nothing is copied elsewhere or synced), and `messages_send` delivers through the signed-in
Messages app after an interactive approval showing the exact recipient and text — sends are never
auto-approved, in any mode. Without Full Disk Access, Sia cannot read the database; it opens System Settings at the Full Disk
Access pane so the one-time grant is a single switch flip (macOS does not allow apps to grant it
for themselves, and Sia will not use computer control to change its own permissions). If the user later grants a visible Messages window
to computer use, its contents are processed only for that task under the computer-access boundary;
in ask mode an outgoing action still requires explicit approval, and in trusted mode it is logged.

## Optional cloud data

The configured release control plane may process an invite-only email identity, opaque connected-app
identifiers, action previews and approval records, deletion state, quotas, and explicitly consented
research batches. Gmail, Drive, and Slack access is mediated by the configured connector provider;
exact writes require approval. The desktop receives no AWS credentials.

Research capture is off by default. Sia asks local users after they create their first agent and
asks cloud users after sign-in to review the current consent. Capture starts only after the user
explicitly joins, and a decline is remembered until the consent version changes. The v2 consent may
retain prompts and responses, content-free
coding trajectory metadata (tool name, phase, presentation kind, counts, and outcome), and at most
one size-bounded screenshot from an explicitly permitted, read-only, non-sensitive native-app
snapshot in an eligible completed turn. It excludes browser and connected-app turns,
authentication surfaces, mutations, provider reasoning, tool arguments/results, command text and
output, diffs, paths, and recognized bearer tokens, private keys, JWTs, and provider-style API keys.
Other secrets may not be detected; do not place secrets or capture private documents in a
research-consented conversation. Alpha research data is not used for training.

## Export, deletion, and retention

Research can be paused, exported, or deleted from Settings. Account deletion revokes connected apps,
removes the cloud identity and cloud research data, and clears Sia's local agents, threads, and auth
only after the cloud deletion job succeeds. Workspace files, provider CLI accounts, and macOS
permissions remain. Current cloud research objects expire after 90 days and non-current versions
after up to 30 days. Local-only and unsynced records are retained and never retroactively uploaded;
synced local copies expire after 90 days
or may be evicted oldest-first when encrypted research storage reaches 128 MiB or 500 batches. Logs
have 30-day retention. Deletion-queue failures remain for up to 14 days and raise an
operator-monitored alarm; backlog, Lambda errors/throttles, and DynamoDB throttling are also
monitored.

For access, deletion, or privacy questions, use the private alpha invitation/support channel in
`SUPPORT.md`. Never send passwords, API keys, tokens, Keychain exports, or private workspace files in
a support report.
