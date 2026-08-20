# Sia demo runbook

A ~7-minute live demo showing coding, web search, and computer use on a real Mac — no approval
prompts, full local trajectory log. Every beat was executed live with real Codex on 2026-08-21;
the illustrated version of this script (screenshots, timings) is the "Sia Demo Runbook" artifact.

## Pre-flight (5 min, before anyone watches)

- `cd ~/sia_new && pnpm dev` (don't demo the stale notarized DMG).
- `codex --version` works and is signed in; accepted range `>=0.147.0 <0.149.0`. Don't let the
  CLI auto-update the morning of.
- One signed-in Chrome window on the presenting Space (frontmost visible window is what
  auto-attach picks).
- Accept the macOS Accessibility + Screen Recording prompts on first launch, then relaunch.
- Workspace: a small real repo where "fix a TODO" is plausible.
- One dry run; the first turn after launch is slowest.

## Script

1. **Empty room (30 s).** Create an agent live — name, color, repo. Say: "Every agent is a room;
   its color follows everything it does."
2. **Coding (2 min).** "Fix the TODO in todo.py: greet should return 'Hello, stranger' when name
   is empty or None. Keep the change minimal, do not run anything." Then open the **Changes**
   tool → show the diff, stage/restore. (Verified: file edited on disk in 12–21 s.)
3. **Web search (1 min).** "Search the web: what is the latest stable version of Node.js right
   now? Reply with the version and your source." The transcript shows the real query; the reply
   links its source. (Verified: v26.7.0 + nodejs.org link, 3 s.)
4. **Computer use (2 min).** "Call browser_tabs, then browser_snapshot on the granted tab and
   tell me the page heading. Also call computer_list. Do not click, type, or modify anything."
   Say, while it works: "No approval popup — it attached to my Chrome itself, read the page in
   the background, and my focus never moved." (Verified: auto-attach + heading + 12 apps/15
   windows, zero prompts.)
5. **Receipts (1 min).** Settings → Computer → Show in Finder → the thread folder:
   `events.jsonl` plus the screenshots the actions captured. "Nothing asks permission,
   everything is on the record."
6. **Optional:** second agent in another color (room hue follows), Activity view, voice
   read-aloud.

## Troubleshooting

| Symptom                                    | Fix                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| "No visible Chrome window was found"       | Bring a Chrome window onto the current Space (not minimized) and re-send. #1 live-demo failure.  |
| "Codex (incompatible)" in the agent dialog | CLI auto-updated past the pin; widen `provider-probe.ts` + `providers/codex.ts` (one line each). |
| Red "Provider error" card                  | The card shows the real reason (sign-in, usage limits). Fix the account, hit Retry.              |
| Turn hangs                                 | Stop, re-send. First turn after launch is slowest.                                               |

Sia must stay open and the Mac awake; Gmail/Drive/Slack connector buttons stay untouched in the
local alpha.
