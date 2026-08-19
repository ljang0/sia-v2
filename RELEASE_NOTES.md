# Sia 0.1.0-alpha.1

Sia is a private macOS 14+ alpha for local-first agent work. This build supports Codex through the
provider CLI already installed and authenticated on the Mac.

## Included

- a complete local mode with no Sia account or cloud credits required; Codex, workspaces, Git,
  terminals, schedules, signed-in Chrome attachment, and granted computer use remain available;
- persistent agents, threads, transcript search, archive, rename, fork, and interruption recovery;
- per-thread model and reasoning controls, native attachment metadata, goals, and app-open schedules;
- background Activity while Sia remains open and the Mac remains awake;
- scoped Git review, one-shot terminal commands, and detached worktrees;
- explicitly granted Chrome and macOS computer actions with visible approvals;
- native computer-use grants remain valid for a legitimate long model turn while exact live
  process/window/snapshot checks and per-mutation approval remain mandatory; Chrome detach and
  explicit reattach now use distinct driver sessions without requiring an app restart;
- configured builds offer Sia account sign-in before first-agent setup with a visible local escape;
- separate Gmail, Drive, Slack, signed-in Chrome, and Apple Messages controls. Messages opens the
  existing macOS account without database access, while Chrome still requires one explicit window;
- optional invite-only cloud sign-in, Gmail/Drive/Slack connections, and consented research sync
  when the signed release is configured for the deployed control plane;
- one guided work-app connection action that advances through provider-owned Gmail, Drive, and
  Slack consent pages only after each prior grant is verified;
- v2 research consent for prompts/responses, bounded coding trajectory metadata, and an eligible
  read-only native-app screenshot, with private surfaces and action contents excluded. Signed-in
  users see the decision automatically, while local users see it after creating their first agent.
  Capture stays off until they join, a decline is remembered for the reviewed consent version, and
  local-only captures remain local if cloud is added later.

## Visual identity (2026-08-19 source; requires a fresh notarized build)

- An agent is a room. Your agents live in a deep green shell; the agent you select opens as a
  room, and its own color follows it everywhere it acts — its avatar, its threads, its presence
  in the composer, and the header of anything it asks you to approve. Your own controls are
  plain ink pills, so what is Sia's and what is yours is never ambiguous.
- Names and headings use a bundled display face (Bricolage Grotesque, OFL); the interface stays
  on the system font. Interactive rows and buttons give hover feedback; the Activity page is flat
  and legible; the research-consent dialog presents the same facts as a short labeled list.

## Alpha boundaries

- Grok and Meta are not enabled shipping providers.
- Schedules do not run while Sia or the Mac is offline.
- The terminal is not an interactive persistent PTY.
- Attachments do not have a general artifact-preview viewer.
- Direct programmatic browser downloads are not available in this alpha; downloads remain a normal
  user-controlled Chrome action. Sia still supports approval-gated browser click, type, and upload.
- Updates are manual; there is no automatic-update feed.
- This is a local-focused alpha. Recipients should choose **Continue locally** and must not authorize
  Gmail, Drive, or Slack connected apps; those optional cloud connectors are deferred.
- The release cloud, deletion worker, monitored alarms, rotated least-privilege Composio runtime key,
  and restricted ElevenLabs key are deployed or vaulted as appropriate and live-smoke verified. The
  signed app passes fresh-profile first run, compact Light/Dark layout, voice persistence, and
  cancellable in-memory Read aloud. Alice/Bella/Default agent assignment and the Dictate
  allow/start/stop/no-speech path also pass. A contained prior-v2-to-final profile migration preserved
  its agent/thread and completed a post-upgrade read-only workflow. The real managed OAuth requests
  were found to be broader than Sia's connector action surface, so Gmail, Drive, Slack, cloud research
  sync, and cloud-account deletion are outside this local release. A successful human dictation
  transcript, audible per-agent voice comparison, and the separate macOS-account installer pass remain
  local release gates. Packaged Chrome click/type/upload, cancellation, restart capability loss, and
  explicit detach capability loss now pass. Remote/offline execution is not part of this alpha.

Read `PRIVACY.md` before enabling research capture or connecting an app. Report problems through the
private alpha support channel described in `SUPPORT.md`.
