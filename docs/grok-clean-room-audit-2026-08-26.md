# Grok Bot 0.18 clean-room interaction audit

_Reviewed 2026-08-26 KST_

## Boundary

The reference repository is an unofficial reconstruction and extension, not an official upstream
source tree. Its [NOTICE](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/NOTICE.md)
does not grant an upstream source-code license. Sia therefore uses it only as a behavioral research
reference. No source, CSS, copy, assets, character geometry, or packaged renderer was copied.

The reconstructed frontend builds and its tests pass, but it is a hybrid around a pinned shipped
renderer. The standalone conversation fixture is incomplete, and the project describes itself as a
research/hacking project. It is not a suitable code or release base for Sia.

A second, fresh-clone audit pinned the public repository at
`a9f633e09d49a85829b8236331b9e21f7e612634` (tree
`b68f24972427952c4934e4364736fec62661044f`). The clone lived outside the Sia worktree and remained
clean. This deeper pass confirms that the readable frontend is useful evidence, but the default
macOS package deliberately retains the checksum-pinned shipped renderer and is only ad-hoc signed.
The repository has no declared license. None of its source, CSS, text, binary archives, or assets may
enter Sia.

## Product read

The reference UI is visually conventional: charcoal desktop chrome, compact rows, panels, and
character avatars. Its advantage is interaction completeness rather than a stronger visual identity.
Sia should preserve its mineral surfaces, evergreen navigation, living forms, local-first continuity,
mutation previews, worktrees, snapshots, terminal, voice, and explicit research boundary.

## Feature comparison

| Pattern observed in the reference                                                   | Sia before this pass                                                    | Decision                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Global command palette and shortcut layer                                           | Sidebar search and direct navigation only                               | **Adopted now:** `Cmd/Ctrl+K` quick switcher plus `Cmd/Ctrl+F`, `N`, `B`, and `,` shortcuts                  |
| Copy/reply/thread/reaction message actions                                          | Read aloud, approvals, and transcript controls                          | **Adopted now:** copy with confirmation; defer reply, reactions, and nested threads                          |
| Find in chat with match navigation                                                  | Search across active and archived transcripts                           | **Adopted in alpha.13:** in-thread match count and next/previous navigation; global search remains available |
| Dense working/waiting/draft/unread sidebar state                                    | Working/waiting/error presence and Activity                             | **Adopted in alpha.12:** encrypted drafts, compact previews, recency, and explicit attention states          |
| Retryable diagnostic trays and feedback context                                     | Reconnect notice and action errors                                      | **Partly adopted in alpha.12:** dedupe, occurrence counts, support IDs, and copyable thread context          |
| Composer drop overlay and attachment chips                                          | File picker, attachment chips, dictation, send/stop                     | **Adopted in alpha.13:** bounded drop, image preview, external PDF open, and Finder reveal                   |
| Collapsible running/success/failure tool rows                                       | Structured, collapsible activity and approval cards                     | Already present; retain Sia's command, diff, search, plan, and subagent projections                          |
| Onboarding presets and starter tasks                                                | Local/research choice followed by agent creation                        | **Adopted:** alpha.12 roles plus alpha.13 contextual starts in an empty thread                               |
| Routines, plugins/MCP marketplace, shared rooms, VNC, teach recording, rich viewers | Schedules, governed tools, Chrome attach, native CUA, basic attachments | Defer. These materially expand security, support, and release scope                                          |

## Implemented in this pass

- A clean-room quick switcher searches active threads, agent rooms, and core destinations without
  introducing another navigation panel.
- Desktop shortcuts open the switcher, transcript search, a new thread, Settings, and the sidebar.
- Every user and assistant message has a copy action with brief success feedback.
- Unit coverage exercises switcher routing and exact-content copy; Electron visual coverage includes
  the palette at the release viewport.

## Implemented in the alpha.12 follow-up

- Composer drafts are scoped to threads and persisted through Sia's existing encrypted desktop
  repository. They survive thread changes and relaunch, remain after failed sends, and clear only
  after the controller accepts a turn. Renderer `localStorage` is not used.
- The sidebar adds draft previews, relative recency, and direct Working, Waiting for you, Unread,
  Queued, and Needs attention language while retaining stable accessible thread names.
- Repeated action failures collapse into one tray with a stable support ID, occurrence count, time,
  active-thread context, and copyable support bundle. Existing thread-level retry remains the only
  automatic retry because blindly replaying arbitrary mutations would be unsafe.
- Four original starter roles prefill the existing agent name and instruction fields without
  changing provider, model, workspace, voice, or identity controls.
- Unit coverage exercises storage, clearing, thread-switch flushing, sidebar states, diagnostics,
  and role selection. Electron persistence and visual baselines cover relaunch and layout behavior.

## Implemented in the alpha.13 follow-up

- Room actions now cover pin/unpin, clean duplication, notification policy, and manual read/unread
  state. Notification clicks open the exact thread, repeated notices are throttled, and macOS Dock
  badge state follows unread non-archived work.
- Empty threads offer original, role-aware starter tasks. `Cmd/Ctrl+F` opens a real in-thread finder
  while Activity retains cross-thread and archived search.
- The quick switcher searches matching messages, attachment names, and HTTPS links in addition to
  rooms and commands.
- Provider-reported token totals are aggregated by completed turn and labeled as activity rather
  than billing data.
- Native file drag/drop uses the same 20-file, 25 MB per-file, and 100 MB combined controller
  limits as the picker. The renderer receives no filesystem paths. Common images have bounded
  in-app previews; PDFs and other files open in the system handler; grants expire after one hour
  and are never persisted.
- Feedback opens a reviewed draft addressed to the verified support mailbox. Optional diagnostics
  include version, provider states, and thread ID, never transcript or file contents.
- Update settings report the real current build state. Checking remains disabled until a clean
  HTTPS release-manifest URL is configured; automatic installation is deliberately not implied.

## Fresh-clone verification

- The isolated clone was clean at upstream `main`; both preserved installer objects matched the
  repository's documented SHA-256 values.
- Under the repository's pinned Node `26.5.0`, frontend and runtime typechecking passed, all **18**
  focused Node tests passed, and the editable frontend built from 342 modules.
- The frontend build emitted a 1.51 MB main JavaScript chunk and warnings that several nominally
  lazy transcript-card views are also imported eagerly. This is useful cleanup evidence, not a
  pattern Sia should adopt.
- Its publication check proved that a clean-history export preserves 2,111 tracked files and the
  exact Git tree.
- The lockfile audit currently reports **29 advisories: 5 high, 20 moderate, and 4 low**. The
  repository's own security note calls the project a small-club reconstruction rather than a
  supported distribution.
- The checked-in CI runs typechecking, 18 focused tests, the frontend build, and the publication-tree
  check on Linux. It does not run Electron interaction/visual tests, signed packaging, notarization,
  or a clean-install release matrix. Sia's release evidence is materially stronger.

## Additional product gaps found in the deeper pass

These are behavioral observations only. “Missing” does not mean “safe to add before release.”

| Reference capability                                                                           | Sia now                                                                                                     | Value and decision                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reply anchors, quoted-message previews, and nested message threads                             | Message copy, thread fork, and find, but no reply target                                                    | **Good next interaction:** add lightweight quoted replies first; nested threads require a larger transcript model change                                                                             |
| Message reactions with quick and full emoji pickers                                            | None                                                                                                        | Useful mainly after shared rooms or multi-person collaboration; defer until reactions have more than one meaningful author                                                                           |
| Conversation outline with separate subagent tabs and expandable activity                       | Subagent events appear in collapsible Activity rows                                                         | **High-value next slice:** build an original task outline from Sia's existing plan/subagent/activity events without adding new execution authority                                                   |
| Rich attachment gallery, video/audio preview, inline PDF, spreadsheet table, Mermaid, and math | Bounded image preview; PDF and other files open in the system handler; safe Markdown is intentionally small | Add original text/code/diff/CSV viewers first. Keep PDF external and avoid embedded active documents until renderer isolation is separately reviewed                                                 |
| Rich connector, email-draft, Slack-draft, link, widget, secret-request, and cloud-agent cards  | Generic activity rows plus explicit approval previews                                                       | **High-value next slice:** add typed read-result cards and richer exact-recipient mutation previews using Sia's existing action schema; do not introduce secret-request cards                        |
| User-created sidebar sections with rename, reorder, collapse, and agent assignment             | Agent → thread hierarchy, pinning, archive, and sidebar collapse                                            | Useful once internal users have many agents; medium effort and low authority risk                                                                                                                    |
| Routine editor with trigger forms, test run, pause, and per-run history                        | Persisted schedules with create, run now, enable/disable, and delete                                        | **Smallest material gap:** expose bounded per-run history and last/next outcome in the existing schedule UI                                                                                          |
| Rich-text composer with MCP/file/PR references                                                 | Plain-text composer with attachments, dictation, and persisted drafts                                       | Defer rich editing. File or thread reference chips can be added independently without adopting a large editor dependency                                                                             |
| Per-agent auto-review rules                                                                    | Global confirm/auto approval posture with typed mutation previews                                           | Do not add free-form “allow automatically” rules before the current approval model has policy-backed scopes and audit coverage                                                                       |
| Custom/generated avatars and channel controls                                                  | Original hue-based living agent forms; connected apps are account-level                                     | Keep Sia's identity system. Custom avatars are cosmetic; agent-specific external channels would broaden account and support scope                                                                    |
| Shared-room invitation links, group membership, and multi-agent org chart                      | Single-user local rooms; subagent execution is visible but not a social graph                               | Defer. This changes authentication, authorization, abuse, retention, and privacy boundaries                                                                                                          |
| Plugin/MCP marketplace and user-published skills                                               | Curated, capability-scoped tool bridge and governed connected apps                                          | **Explicitly reject for this release.** An open marketplace conflicts with Sia's isolation and research-data guarantees                                                                              |
| Remote VNC computer, teach-by-recording, and owned Docker/forever-box runtime                  | Explicit local Chrome attachment, native computer use, schedules, worktrees, and snapshots                  | Defer to the separately designed remote-workcell track; do not smuggle a general VM into the internal release                                                                                        |
| Cursor, Claude Code, Codex, and OpenRouter inference router                                    | Codex and isolated Claude Code ship; Meta is cloud-gated; Grok/Gemini remain policy-disabled                | Claude now uses JSON auth status, non-persistent CLI sessions, empty inherited settings, strict MCP, and only Sia's short-lived capability; keep other providers gated until they meet that boundary |
| Update channels and idle auto-install                                                          | Honest disabled state until a signed HTTPS manifest exists                                                  | Finish Sia's signed manifest and access policy first; channel selection is unnecessary for the internal cohort                                                                                       |

## Implementation patterns worth re-creating

- Separate asynchronous feature state into small `snapshot`/`subscribe`/`dispose` controllers with
  explicit `loading`, `ready`, `unavailable`, and `failed` states. This would help split Sia's large
  desktop controller without changing behavior.
- Keep rich transcript cards behind typed projectors and capability-specific action adapters. Sia's
  existing discriminated activity and approval models are the right foundation.
- Use progressive disclosure: terse timeline rows, expandable detail, and secondary panes for dense
  history. The reference's interaction density is useful; its dark generic styling is not.
- Preserve Sia's stronger release properties: sandboxed renderer, narrow preload, encrypted local
  state, explicit research boundary, deterministic Electron E2E, universal Developer ID signing,
  notarization, and private cohort distribution.

## Next small, high-value slice

1. Establish and secure a persistent release manifest before enabling update checks in packaged
   builds; keep signed/notarized artifact verification in the release gate.
2. Add schedule run history and last/next outcome to the existing schedule surface.
3. Add an original conversation-outline pane powered only by existing plan, activity, and subagent
   events.
4. Add typed connector-result cards plus safe text/code/diff/CSV artifact viewers; keep PDFs and
   active documents outside the renderer.
5. Add lightweight quoted replies if internal use shows that find, fork, and message copy are not
   enough for long threads.
6. Consider user-created sidebar sections only after internal accounts accumulate enough agents to
   make the current hierarchy hard to scan.

Useful behavioral references include the repository's
[command palette](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/production/CommandPalette.tsx),
[keyboard shortcuts](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts.ts),
[find-in-chat](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/conversation/workspace/find-in-chat.tsx),
[message actions](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/conversation/cards/transcript-card/message-actions.tsx),
and [notification host](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/window-chrome/notification-host.tsx).
