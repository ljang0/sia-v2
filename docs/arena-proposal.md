# Computer Use Arena: a Mac pilot with Sia

Draft for Arena technical review · November 2, 2026 · No partnership or rollout agreed

Sia proposes a small invited pilot for evaluating agents on useful personal Mac tasks: researching plans, preparing documents and working across apps. The first ask is a technical review and task rehearsal. Sia supplies the Mac client, computer-use integration, recording and support; Arena would help select models, evaluation design and the initial cohort. Cohort size, spending cap and rollout depend on that review and the remaining acceptance gates.

Arena's [Agent Mode](https://help.arena.ai/articles/5432423882-how-to-use-agent-mode) already evaluates multi-step work using session feedback and traces. Sia proposes an additional personal Mac execution surface, with the goal of letting the person keep working while agents use authorized windows. Background and simultaneous-use reliability must be demonstrated before making that promise to a cohort.

## What is available

- A signed, notarized universal **alpha.122 DMG** for macOS 14+, with email sign-in, guided permission setup, task progress, Stop and feedback. The exact DMG was installed and checked on Apple silicon; Intel received static package verification. Mac first; iPhone follows.
- Vision-only computer control by default: screenshots in, pointer/keyboard actions out. Explicit workspace-file and connector tools are labeled separately. macOS access remains person-approved.
- A short [setup guide](./release-notes.md), practical [demo prompts](./demo.md), [artifact evidence](./public-release.md) and a [repository walkthrough](./architecture.md#reviewing-the-computer-use-path). The [README](../README.md) supports local UI review without AWS credentials or model spend; actual evaluation uses a real admitted model.

Codex App Server is the initially admitted engine. Sponsored models can use the existing [relay](./arena-model-harness.md) after a live compatibility check. Additional engines are outside the first distribution commitment.

## Recording and evaluation

First-run setup selects cloud recording by default and explains what it saves before Continue. Eligible prompts, replies, provider-reported usage, actions/results and screenshots then upload automatically to Sia's encrypted private AWS archive. Existing opt-outs remain off; pause/export/delete controls are available. Active records expire after 90 days and are not used for model training. Google Workspace connector turns are excluded. Real installed-app uploads have been independently verified. Recording in Sia does not grant Arena archive access; any transfer, reviewer access and data-use terms must be agreed separately.

The current [ratings](./arena-ratings.md) are **pick and rate**: people see the selected model and rate the outcome. Rating records contain model/engine, outcome, duration and step counts; optional comments are previewed. Raw trajectories use the separate recording path. Self-selected sessions support descriptive feedback, not a blind comparison or causal ranking. Randomized assignment or leaderboard integration requires an agreed design and implementation.

For rehearsal, use disposable inputs, fresh workspaces and fixed learning settings. Independently verify saved outputs, citations and arithmetic. Record failed attempts and operator rescue. Measure end-to-end time, Stop/recovery, responsiveness and focus/clipboard preservation while another app is in use, then repeat with two Sia tasks running.

## Evidence and rollout gate

Signed app trials have produced source-checked outing plans, dinner/grocery plans and checklists. The latest internal signed app completed dairy-free recipe research and a separate outing checklist with 68 seconds of overlapping successful turns and interleaved work. Stopping the checklist left research running; continuation completed it. Both saved outputs were independently checked and opened in Preview, and 11 source files were preserved. Recipe research took four minutes after browser reconnection; the resumed checklist took 68 seconds. Operator setup, cancellation and continuation remain part of the evidence. This is one browser-plus-file-work trial, not two simultaneous native-app workflows or an unattended reliability claim. Real prompts, usage, action results and screenshots have also been independently verified in AWS. Automated pilot gates passed; the latest correction is internal QA, not the notarized alpha.122 DMG.

Native document rename/move, repeatable Chrome restart/idle recovery, two native-app tasks and contention, continuous focus/clipboard preservation, off-Space capture and physical lock/sleep/voice acceptance remain open. A fresh Mac/account is unavailable. The [release status](./release-status.md) is authoritative. Keep the first handoff a bounded technical evaluation until these gates pass. Lawrence Jang owns support and incidents; no invitation, public release or Arena outreach has been sent.
