# Sia private-alpha privacy notice

_Effective for 0.1.0-alpha.5. This notice describes the implemented product behavior; it is not a
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
provider in or out. Codex uses the person's official ChatGPT Codex or API authentication. The
optional Meta provider sends prompts and responses through Sia's AWS relay to the Sia-owned Meta
provider account; no participant Meta credential is collected.

### Local trajectory log

By default Sia keeps a complete local log of each thread — every request, reply, notice, action it
took (tool name, arguments, outcome), every approval or automatic authorization decision, and every
screenshot or image an action returned — as plain files under the app's `trajectories/` folder
(`Settings → Computer → Keep a full local log → Show in Finder`). The log exists so a run can be
reviewed afterwards. The same local log records connected-app setup, provider-page opening, success,
failure, timeout, and disconnection. Those exact files are not uploaded and can be turned off in
Settings or deleted from disk at any time. If the current research consent is accepted, equivalent
observed turn and connection-lifecycle events are also written into separate encrypted research
bundles and queued for cloud sync as described below; disabling the local trajectory files does not
disable consented research capture. Complete local thread directories roll off after 90 days or
when this local store exceeds 128 MiB, oldest first. That cap does not delete the separate encrypted
research outbox, whose acknowledged-upload retention is described below.

## Browser and computer access

By default Sia runs in **trusted local mode**: computer and browser actions execute without a
per-action approval, and Chrome is attached to the frontmost signed-in window automatically the
first time the browser is needed. Sia enables Chrome's own persistent remote-debugging toggle (visible and revocable at
`chrome://inspect/#remote-debugging`) when Chrome is closed at launch, then attaches to the
Chrome process that owns that local-only endpoint. Chrome must have restarted at least once since
the toggle was enabled for the endpoint to serve; turning trusted mode off stops Sia from using
it. Every action is still bound to a live window, tab, and fresh
snapshot, still refuses incognito, authentication, password, and secure surfaces, and is written to
the local trajectory log. `Settings → Computer → Confirm before changes` restores per-action
previews and explicit window selection. Sia does not copy cookies. Computer access requires macOS
Accessibility and Screen Recording, which Sia requests once at first launch. Browsers, terminals,
password managers, Sia itself, Keychain, and security settings are excluded from generic computer
targets.

Apple Messages support is local: with Full Disk Access granted to Sia, the `messages_search` and
`messages_read_thread` tools read recent rows directly from this Mac's own Messages database
(Sia does not upload the database itself), and `messages_send` delivers through the signed-in
Messages app with an exact recipient and text. In autonomous mode the send continues without an
in-app prompt; confirmation mode shows the full preview first. Without Full Disk Access, Sia cannot read the database; it opens System Settings at the Full Disk
Access pane so the one-time grant is a single switch flip (macOS does not allow apps to grant it
for themselves, and Sia will not use computer control to change its own permissions). If the user later grants a visible Messages window
to computer use, its contents are processed only for that task under the computer-access boundary;
in ask mode an outgoing action still requires explicit approval, and in trusted mode it is logged.
Under the v3 raw research consent, Messages tool requests and results observed during a turn are
included in that turn's research bundle.

## Optional cloud data

The configured release control plane may process an invite-only email identity, opaque connected-app
identifiers, action previews and approval records, deletion state, quotas, and explicitly consented
research batches. Gmail, Drive, Docs, Sheets, Slides, and Slack access is mediated by the configured connector provider;
exact writes are bound to their complete input and either run automatically in autonomous mode or
require confirmation when that setting is enabled. The desktop receives no AWS credentials.

Research capture is off by default in local-only mode. Sia asks local users after they create their
first agent. A Sia cloud sign-in is a research-release enrollment: the person must explicitly accept
the current versioned consent to remain signed in, or decline and sign out. After acceptance, Sia
offers one guided connection step for the six work apps. Connection lifecycle records include the
app, status, opaque connection identifier, and provider account label when available; OAuth URLs,
authorization codes, and tokens are not retained in the local trajectory or research bundles.

The `alpha-research-v3-raw` consent retains the raw JSON events Sia observes during every completed,
failed, or cancelled turn. This includes prompts, responses, surfaced reasoning, provider events,
commands and output, tool names and arguments, tool results, approvals and answers, browser and
computer events, Google Workspace/Slack/Apple Messages results, paths and diffs, usage, errors, and
captured images. Large events are split into reconstructable chunks and batches are organized by
participant, thread, turn, sequence, and event kind before upload to AWS. Authorized members of the
AWS `Admins` group can list and inspect the archive in Sia; participant lists, bundle lists, and raw
bundle reads are audited.

Sia's action boundaries still refuse private browser windows, password and secure fields, Keychain,
password managers, known authentication surfaces, and sensitive credential paths. Sia does not copy
provider credential stores, Chrome cookies, Keychain contents, or hidden credentials outside the
surface needed for the task. These controls cannot guarantee that raw task content is secret-free:
prompts, pages, files, command output, messages, or connected-app results may themselves contain
private data or credentials. Do not join the research release or run a task unless that raw upload is
acceptable. Alpha research data is not used for training.

## Export, deletion, and retention

Local-only research can be paused; signed-in participants must sign out to stop new capture.
Research can be exported or deleted from Settings. Account deletion revokes connected apps,
removes the cloud identity and cloud research data, and clears Sia's local agents, threads, and auth
only after the cloud deletion job succeeds. Workspace files, provider CLI accounts, and macOS
permissions remain. Current cloud research objects expire after 90 days and non-current versions
after up to 30 days. Local-only records are never retroactively uploaded. Unsynced signed-in records
remain encrypted on the Mac until AWS acknowledges them; they are not evicted to satisfy the local
cache target, and sign-out refuses to erase them silently. The participant can reconnect and retry or
explicitly delete them. Synced local copies expire after 90 days and may roll off earlier when the
encrypted cache exceeds its 128 MiB or 500-batch target.

Signed-in exports are assembled by a bounded-memory queue worker and exposed through a 15-minute
download link. Archive reads and exports verify each object's recorded SHA-256 and byte length.
Research-admin access requires Cognito `Admins` membership plus software-token MFA. Metadata-only
archive access records are KMS-encrypted, versioned, and protected by S3 Object Lock in governance
mode for 365 days, then expire after 400 days. API access logs retain 30 days. Upload, export,
archive-access, queue, Lambda, and DynamoDB failures raise operator-monitored alarms.

For access, deletion, or privacy questions, use the private alpha invitation/support channel in
`SUPPORT.md`. Never send passwords, API keys, tokens, Keychain exports, or private workspace files in
a support report.
