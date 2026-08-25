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

## Product read

The reference UI is visually conventional: charcoal desktop chrome, compact rows, panels, and
character avatars. Its advantage is interaction completeness rather than a stronger visual identity.
Sia should preserve its mineral surfaces, evergreen navigation, living forms, local-first continuity,
mutation previews, worktrees, snapshots, terminal, voice, and explicit research boundary.

## Feature comparison

| Pattern observed in the reference                                                   | Sia before this pass                                                    | Decision                                                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Global command palette and shortcut layer                                           | Sidebar search and direct navigation only                               | **Adopted now:** `Cmd/Ctrl+K` quick switcher plus `Cmd/Ctrl+F`, `N`, `B`, and `,` shortcuts                        |
| Copy/reply/thread/reaction message actions                                          | Read aloud, approvals, and transcript controls                          | **Adopted now:** copy with confirmation; defer reply, reactions, and nested threads                                |
| Find in chat with match navigation                                                  | Search across active and archived transcripts                           | Keep the broader search for this release; add in-thread next/previous only if research sessions prove the need     |
| Dense working/waiting/draft/unread sidebar state                                    | Working/waiting/error presence and Activity                             | Keep current warmth; add draft persistence and clearer unread recency next                                         |
| Retryable diagnostic trays and feedback context                                     | Reconnect notice and action errors                                      | High-priority release follow-up: dedupe errors, expose request IDs, and attach optional thread context to feedback |
| Composer drop overlay and attachment chips                                          | File picker, attachment chips, dictation, send/stop                     | Drop overlay and failed-send recovery are useful; avoid expanding the composer before freeze                       |
| Collapsible running/success/failure tool rows                                       | Structured activity and approval cards                                  | Compact/collapsible results are a good post-freeze refinement                                                      |
| Onboarding presets and starter tasks                                                | Local/research choice followed by agent creation                        | Add small starter-task suggestions later; do not copy characters or presets                                        |
| Routines, plugins/MCP marketplace, shared rooms, VNC, teach recording, rich viewers | Schedules, governed tools, Chrome attach, native CUA, basic attachments | Defer. These materially expand security, support, and release scope                                                |

## Implemented in this pass

- A clean-room quick switcher searches active threads, agent rooms, and core destinations without
  introducing another navigation panel.
- Desktop shortcuts open the switcher, transcript search, a new thread, Settings, and the sidebar.
- Every user and assistant message has a copy action with brief success feedback.
- Unit coverage exercises switcher routing and exact-content copy; Electron visual coverage includes
  the palette at the release viewport.

## Next small, high-value slice

1. Persist composer drafts by thread and restore them after send/provider failure.
2. Add a compact diagnostic tray with Retry, occurrence count, and a copyable request ID.
3. Add in-app feedback with app version, cohort flags, and optional thread ID.
4. Add explicit unread/draft markers without putting live relative timestamps into screenshot
   baselines.
5. Add in-thread match navigation if participant transcripts make global search feel too coarse.

Useful behavioral references include the repository's
[command palette](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/production/CommandPalette.tsx),
[keyboard shortcuts](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/window-chrome/global-keyboard-shortcuts.ts),
[find-in-chat](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/conversation/workspace/find-in-chat.tsx),
[message actions](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/conversation/cards/transcript-card/message-actions.tsx),
and [notification host](https://github.com/b-nnett/grok-bot-0.18-reconstructed/blob/main/frontend/src/recovered/features/window-chrome/notification-host.tsx).
