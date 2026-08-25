# Sia 0.1.0-alpha.11

Sia is a private macOS 14+ alpha for local-first agent work. This build supports Codex through the
official CLI already installed and authenticated on the Mac, plus hosted Meta access for signed-in
research-alpha participants.

## Alpha.11 changes

- Research account activation is now limited to named invitations. Unknown addresses receive the
  same generic registration response but no Cognito identity is created.
- Ordinary invited participants and connected-app acceptance testers are separate cohorts. Core
  research/Meta/schedule access requires `Participants`; Google and Slack setup/execution also
  requires `ConnectorTesters`. Existing grants can always be inspected and disconnected.
- The desktop has been rebuilt around persistent agent rooms: abstract living identity forms, a
  stronger room header, clearer conversation hierarchy, a more intentional composer, and a
  flatter settings control center.
- First run is explicitly local-first and keeps **Start in local mode** visible before the invited
  research form. Google Workspace is presented as one grant with five service switches.
- The light interface uses clean mineral-white and sage-neutral surfaces instead of the previous
  yellow paperback tint. The deep evergreen dock and four agent accent hues remain.
- The public home, research, support, privacy, and terms chrome now matches the desktop identity and
  consistently explains named invitations and the smaller connector-testing cohort.
- Nine real macOS screenshot baselines now protect workspace, quick switcher, settings, apps,
  activity, agent, dark/compact, sign-in, and local-first states.

## Alpha.10 changes

- Enabling Google editing now retires only Sia's superseded encrypted read credential. It no longer
  revokes the shared Google authorization grant and accidentally expires the verified editor token.
- The cloud verifies that the replacement is a connected editor grant for the same Sia user and
  Google account before removing the old credential. The normal Disconnect action still revokes
  Google access when a person intentionally disconnects Workspace.
- Alpha.10 carries forward the progressive Google connection, URL handling, connected-app UX, and
  site polish introduced in Alpha.9.

## Alpha.9 changes

- Google connects read-only by default. **Enable editing** opens a separate Google consent only
  when sending or file changes are needed, while the original read connection remains usable until
  the upgrade succeeds.
- The cloud enforces the exact scope required by every Google tool before approval or execution and
  removes the superseded encrypted read credential after a successful upgrade.
- Docs, Sheets, and Slides tools accept either the raw resource ID or a matching Google URL. This
  fixes the Sheets read failure caused by a full browser URL reaching the Values API as an ID.
- The connected-app settings explain read-only access, editing, provider consent, service switches,
  and recovery as one compact flow.
- `superintelligentagents.ai` now uses a minimal private-release identity, an original signal
  artwork, restrained motion, responsive editorial layouts, and a persistent light/dark appearance
  choice across the homepage, policy, research, and support surfaces.

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
- direct Gmail, Drive, Docs, Sheets, and Slides adapters use stable Google REST endpoints with
  bounded inputs and outputs; Slack continues through its audited Composio action schemas;
- named-invitation passwordless research-release sign-in, durable raw research sync, asynchronous complete export,
  and deletion when the signed release is configured for the deployed control plane. Research
  admins can still send and review participant invitations directly from the MFA-protected archive;
- public account bootstrap is enumeration-resistant and protected by API Gateway plus short-lived,
  privacy-preserving per-email and per-network throttles. The account form requires research-alpha
  acknowledgment, and the full research-data choice still appears before capture starts;
- one Google-owned read-only OAuth approval connects Gmail, Drive, Docs, Sheets, and Slides. The
  five service rows share that verified account grant while still allowing a person to choose which
  tools Sia may use. Editing and sending use a separate upgrade. Slack has its own one-click OAuth
  action. Google refresh tokens are KMS-encrypted in a credential vault separated from research data
  and are never returned to the desktop;
- the direct Google adapter uses a fixed API-origin allowlist, bounded responses, scoped file staging,
  PKCE, expiring one-time state, and server-side token refresh. Existing per-service Google grants are
  revoked when a person migrates through the single **Upgrade Google** action;
- expired connected-app authorization is now detected even when the provider wraps a Google 401 in
  a successful transport response. Sia marks only that exact grant as needing attention, explains
  the recovery in the task, and replaces the stale grant through one **Reconnect** click;
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

- Alpha.11 replaces the yellowed paper cast with mineral-white, faint sage-neutral rooms beside a
  deep-evergreen dock. Saffron, coral, sky, and mint remain agent identity accents rather than page
  backgrounds. Dark mode remains neutral charcoal rather than green-black.
- Bundled Bricolage Grotesque (OFL) carries the wordmark and selected display headings, while native
  text faces keep dense controls readable. Persistent room identity, abstract living agent forms,
  tighter radii, editorial settings tabs, and lighter outlines replace the prior generic shell.
- A `Cmd/Ctrl+K` quick switcher moves among threads, agents, and core actions. Standard desktop
  shortcuts expose transcript search, new-thread creation, Settings, and sidebar visibility; message
  copy is available directly from the transcript.
- Motion favors opacity and color with restrained 140/190/240ms timing. Buttons and navigation no
  longer lift or slide on hover, dialogs settle by six pixels without zooming, and neutral blur
  replaces the dramatic tinted overlay. Reduced-motion and visible keyboard-focus policies remain.
- The deterministic screenshot audit covers the core, quick switcher, settings, apps, agent,
  activity, sign-in, local-choice, compact, dark, keyboard-focus, overflow, font, transition, and
  reduced-motion states.

## Alpha boundaries

- Meta is included for signed-in research-alpha accounts through Sia's live-verified AWS relay. No
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
- Slack is enabled for unlisted cross-workspace alpha installation. Google OAuth is published in the
  production project, but sensitive/restricted-scope review and CASA remain external distribution
  gates; organization policies may also require administrator approval. Remote/offline execution is
  not part of this alpha.
- The `alpha.11` source candidate is locally verified, but its cohort-aware stack deployment,
  signed/notarized artifact, live service rehearsal, and named human approvals remain required in
  the release evidence before participant distribution.

Read `PRIVACY.md` before enabling research capture or connecting an app. Report problems through the
private alpha support channel described in `SUPPORT.md`.
