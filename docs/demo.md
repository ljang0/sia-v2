# Sia demo runbook

A ~10-minute live demo in three acts: Sia sees your Mac, does real work, and keeps going —
goals, schedules, background agents. No approval prompts; everything on the record. Every beat
was executed live with real Codex on 2026-08-21; the illustrated version (screenshots, timings)
is the "Sia Demo Runbook" artifact.

## Pre-flight (5 min)

- `cd ~/sia_new && pnpm dev` (don't demo the stale notarized DMG).
- `codex --version` signed in; accepted range `>=0.147.0 <0.149.0`; no auto-updates demo morning.
- One signed-in Chrome window on the presenting Space (auto-attach picks the frontmost visible).
- One-time forever setup: in Chrome open `chrome://inspect`, tick **Allow remote debugging**
  (port 9222), restart Chrome. After that Sia connects to Chrome silently — no prompts, ever.
  (Without the toggle, Chrome shows its one-time "Allow remote debugging?" prompt on first
  attach each Chrome session — click Allow.)
- Accept macOS Accessibility + Screen Recording prompts on first launch, then relaunch.
- Workspace: a small real repo. One dry run first.

## Act I — It can see

Create **Scout** (sky) live — name, color, repo; the room takes its hue.

- "What's open on my Mac right now? Just look, don't touch anything." → it lists the real
  desktop: apps, window titles, visible vs. merely running. (Verified: 9 s, zero prompts.)
- "What am I looking at in Chrome right now?" → auto-attaches to the frontmost Chrome window
  and reads the page. Say: "my focus never moved." (If Chrome is on another Space it says so —
  drag a window over, re-send.)

## Act II — It does real work

- "Fix the TODO in todo.py: greet should return 'Hello, stranger' when name is empty or None.
  Keep the change minimal, do not run anything." Then open **Changes** → the diff,
  stage/restore. (Verified: file edited in 12–21 s.)
- "What's the latest stable version of Node.js right now? Give me your source." (Verified:
  v26.7.0 + nodejs.org link, 3 s; transcript shows the real queries.)

## Act III — It keeps going

- **Goal** tool: "Keep me posted on what changes on this machine." (Pause/resume; failed goal
  turns pause safely.)
- **Schedules** tool → New schedule: "Check the Node.js blog for a new release and summarize
  anything new in two sentences", repeat daily → **Run now** so it fires on stage. (Verified:
  searched nodejs.org, two-sentence 26.7.0 summary with link, 15 s.)
- Create **Janitor** (mint): "Add a short docstring to every function in todo.py." Switch back
  to Scout's room and keep talking; then open **Activity** → finished work across agents, 2
  unread. Say: "These agents are permanent. The schedule runs every day this app is open, and
  everything they did while I wasn't looking is in the log."

## Closer — The receipts

Settings → Computer → Show in Finder → the thread folder: `events.jsonl` plus the screenshots
actions captured. "Nothing asked permission, and everything is on the record."

## Troubleshooting

| Symptom                                                | Fix                                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| "Bring a Chrome window onto this Space"                | Drag a Chrome window onto the current Space (not minimized), re-send.                                                  |
| "Chrome refused this window / Allow remote debugging?" | One-time consent: Settings → Computer → Choose window, then click **Allow** on Chrome's prompt. Do this in pre-flight. |
| "Codex (incompatible)"                                 | CLI auto-updated past the pin; widen `provider-probe.ts` + `providers/codex.ts`.                                       |
| Red "Provider error" card                              | Card shows the real reason (sign-in, usage limits). Fix account, Retry.                                                |
| Turn hangs                                             | Stop, re-send. First turn after launch is slowest.                                                                     |

Sia must stay open and the Mac awake; Gmail/Drive/Slack connectors stay untouched in the local
alpha.
