# Sia 0.1.0-alpha.4

Sia is a private macOS 14+ alpha for local-first agent work. This build supports Codex through the
official CLI already installed and authenticated on the Mac, plus hosted Meta access for signed-in
invited alpha participants.

## Included

- a complete local mode with no Sia account or cloud credits required; Codex, workspaces, Git,
  terminals, schedules, signed-in Chrome attachment, and granted computer use remain available;
- persistent agents, threads, transcript search, archive, rename, fork, and interruption recovery;
- per-thread model and reasoning controls, native attachment metadata, goals, and app-open schedules;
- agent-callable schedule create/list/update/delete tools, so natural requests such as “check the
  web every hour” can become persisted Sia schedules directly in autonomous mode;
- background Activity while Sia remains open and the Mac remains awake;
- scoped Git review, one-shot terminal commands, and detached worktrees;
- one-time granted Chrome and macOS computer access with autonomous actions and a reviewable log;
- native computer-use grants remain valid for a legitimate long model turn while exact live
  process/window/snapshot checks remain mandatory; confirmation before mutations is optional; Chrome detach and
  explicit reattach now use distinct driver sessions without requiring an app restart;
- configured builds offer Sia account sign-in before first-agent setup with a visible local escape;
  signed-in onboarding then requires the raw-research choice and opens the core app immediately;
  work-app connections remain optional under Settings;
- separate Gmail, Drive, Docs, Sheets, Slides, Slack, signed-in Chrome, and Apple Messages controls.
  The agent has bounded native tools to create/read/append Docs, create/read/update/append Sheets,
  and create/read/append Slides from Markdown. Messages opens the
  existing macOS account without database access, while Chrome still requires one explicit window;
- invite-only research-release sign-in, durable raw research sync, asynchronous complete export,
  and deletion when the signed release is configured for the deployed control plane;
- one guided work-app connection action that advances through provider-owned Gmail, Drive, Docs,
  Sheets, Slides, and Slack consent pages only after each prior grant is verified. Connection
  lifecycle events are written locally and to the consented encrypted AWS stream, while OAuth URLs,
  codes, and tokens are excluded. People can keep the one-click default or open **Choose apps** to
  connect any subset and add or disconnect individual apps later;
- versioned v3 raw research consent for every observed completed, failed, or cancelled turn,
  including prompts, responses, surfaced reasoning, commands/output, action arguments/results,
  approvals, browser/computer and connected-app events, paths/diffs, errors, and images. Signed-in
  users must join the research release or sign out; local users may decline and continue locally.
  Raw events are chunked into organized AWS bundles by participant/thread/turn/sequence, and an
  audited admin-only Research archive can list participants and inspect reconstructed turn streams;
- fail-closed raw capture: unsynced bundles are never evicted, outbox storage failures pause new
  tasks, sign-out cannot silently discard pending records, and upload health is visible in Settings;
- crash-safe scheduled-run claims, run counts, latest outcomes, and optional maximum-run limits;
- software-token MFA for research administrators, integrity checks on archive reads and exports,
  immutable KMS-encrypted audit records, service kill switches, and monitored upload/export/archive
  failures. MFA-enrolled bootstrap administrators use a password-first flow followed by their
  authenticator code; participant accounts remain passwordless by email code.

## Visual identity

- Alpha.4 replaces the high-contrast dark shell in light mode with a warm-neutral workspace rail,
  quiets agent colors into mineral identity accents, removes colorful provider tiles, and uses one
  muted evergreen action color. Dark mode remains neutral charcoal rather than green-black.
- Native display typography now carries names and headings; bundled Bricolage Grotesque (OFL) is
  reserved for the Sia wordmark. Tighter radii, editorial settings tabs, quieter avatars, lighter
  outlines, and a smaller brand mark replace the prior rounded, game-like component language.
- Motion favors opacity and color with restrained 140/190/240ms timing. Buttons and navigation no
  longer lift or slide on hover, dialogs settle by six pixels without zooming, and neutral blur
  replaces the dramatic tinted overlay. Reduced-motion and visible keyboard-focus policies remain.
- The deterministic screenshot audit covers the core, settings, apps, agent, activity, sign-in,
  local-choice, compact, dark, keyboard-focus, overflow, font, transition, and reduced-motion states.

## Alpha boundaries

- Meta is included for invited signed-in alpha accounts through Sia's live-verified AWS relay. No
  participant Meta key is needed; shared preview limits and upstream availability apply. It is not
  represented as permanently free API access.
- Codex uses the participant's existing ChatGPT Codex plan—including Free when available—or their
  OpenAI API account. Sia detects official CLI authentication and never imports credentials.
- Grok, Gemini, and Claude are not enabled shipping providers.
- Schedules do not run while Sia or the Mac is offline.
- The terminal is not an interactive persistent PTY.
- Attachments do not have a general artifact-preview viewer.
- Direct programmatic browser downloads are not available in this alpha; downloads remain a normal
  Chrome action. Sia supports autonomous browser click, type, and upload, with optional confirmation.
- Updates are manual; there is no automatic-update feed.
- A Sia sign-in is explicitly a research-release enrollment. The person must accept the raw consent
  or decline and sign out. Local-only use remains available without sharing.
- Slack is enabled for unlisted cross-workspace alpha installation. Google OAuth is externally
  published; organization policies may still require administrator approval. Remote/offline
  execution is not part of this alpha.
- The release stack rehearsal and fresh signed/notarized artifact are complete. Distribution still
  requires the named human approvals and final artifact-only checks in the release evidence.

Read `PRIVACY.md` before enabling research capture or connecting an app. Report problems through the
private alpha support channel described in `SUPPORT.md`.
