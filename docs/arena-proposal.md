# Computer Use Arena: a Mac pilot with Sia

Draft for Arena technical review · November 5, 2026 · No partnership or rollout agreed

Sia proposes a small invited pilot for evaluating agents on useful personal Mac tasks: researching plans, preparing documents and working across apps. The first ask is a technical review and task rehearsal. Sia supplies the Mac client, computer-use integration, recording and support; the proposed Arena role is to help select models, evaluation design and the initial cohort. The review should decide three things: which tasks and models to rehearse, what data/report access Arena needs, and what success criteria and spending cap would permit a cohort. No cohort size or rollout is committed before that review and the remaining acceptance gates.

Arena's [Agent Mode](https://help.arena.ai/articles/5432423882-how-to-use-agent-mode) already evaluates multi-step work using session feedback and traces. Sia proposes an additional personal Mac execution surface, with the goal of letting the person keep working while agents use authorized windows. Background and simultaneous-use reliability must be demonstrated before making that promise to a cohort.

## What is available

- A signed, notarized universal **alpha.122 DMG** for macOS 14+, with email sign-in, guided permission setup, task progress, Stop and feedback. It is held from RA handoff pending the gates below and lacks later internal native, browser and capture fixes. Installation and package/runtime checks passed on Apple silicon; Intel received static package verification. Mac first; iPhone follows.
- Vision-only computer control by default: screenshots in, pointer/keyboard actions out. Explicit workspace-file and connector tools are labeled separately. macOS access remains person-approved.
- An [installed-app walkthrough](./ra-onboarding.md#use-the-installed-mac-app) that needs no checkout, AWS credentials or API key, practical [demo prompts](./demo.md), [artifact evidence](./public-release.md) and a [repository walkthrough](./architecture.md#reviewing-the-computer-use-path). The [README](../README.md) also supports local UI review without model spend; actual evaluation uses a real admitted model.

Codex App Server is the initially admitted engine. Sponsored models can use the existing [relay](./arena-model-harness.md) after a live compatibility check. Additional engines are outside the first distribution commitment.

## Recording and evaluation

First-run setup selects cloud recording by default and explains what it saves before Continue. Eligible prompts, replies, provider-reported usage, actions/results and screenshots then upload automatically to Sia's encrypted private AWS archive. Existing opt-outs remain off; pause/export/delete controls are available. Active records expire after 90 days and are not used for model training. Google Workspace connector turns are excluded. Real installed-app uploads have been independently verified. Recording in Sia does not grant Arena archive access; any transfer, reviewer access and data-use terms must be agreed separately.

The current [ratings](./arena-ratings.md) are **pick and rate**: people see the selected model and rate the outcome. Rating records contain model/engine, outcome, duration and step counts; optional comments are previewed. Raw trajectories use the separate recording path. Self-selected sessions support descriptive feedback, not a blind comparison or causal ranking. Randomized assignment or leaderboard integration requires an agreed design and implementation.

For rehearsal, use disposable inputs, fresh workspaces and fixed learning settings. Independently verify saved outputs, citations and arithmetic. Record failed attempts and operator rescue. Measure end-to-end time, Stop/recovery, responsiveness and focus/clipboard preservation while another app is in use, then repeat with two Sia tasks running.

## Evidence and rollout gate

The immediate deliverable is a supervised Apple-silicon RA evaluation: one exact installer,
scoped background browser and native-desktop workflows, checked outputs, recording verification
and explicit limitations. Working-folder file writes alone do not establish native desktop control.
The first handoff must pass those bounded workflows; broader native-app coverage and unattended
concurrency remain prerequisites for a later rollout that promises those capabilities.

Signed internal builds completed three useful workflows without task-time rescue: a personal
errands/lunch checklist through background Finder/TextEdit (207 seconds), a sourced outing plan
including recovery from a failed website (457 seconds), and museum research after visible app
restart with automatic restoration of the chosen Chrome connection (496 seconds). Independently
checked outputs and unchanged originals support these results. Unrelated drafts survived at
observed points; continuous focus/clipboard isolation and two simultaneous native workflows
remain unproved. The museum run on `1269df9` has matching AWS records for 45 actions, 36 screenshots
and 94 usage events. A roughly 91-second interval between tool calls, earlier intermittent input
and observation failures, and hidden-startup recovery remain open. These are useful workflow
results, not evidence of general responsiveness or arbitrary-app reliability.
A subsequent ordinary request on the same candidate to create a printable comparison through
Finder/TextEdit failed at background keyboard input in Go to Folder (143 seconds, no output).
Its sources and unrelated draft were preserved and AWS matched the failed run. Native
repeatability remains a distribution blocker despite earlier successful document workflows.
The follow-up `e1bebca` repaired that keyboard step in the ordinary task, but the run then failed
at Finder's file menus (168 seconds, no output). Sources remained unchanged and automatic AWS
records matched all 19 actions, 15 screenshots and the failed outcome. Native menu reliability
is the next evidenced blocker; this is not a completed document workflow.

Automatic AWS archives matched the useful runs' prompts, results, actions and screenshots. A
subsequent Stop test exposed duplicate capture finalization; the repaired signed candidate then
produced one matched cancelled-task archive, including a late in-flight action result. The earlier
failed runs remain in the evidence. Exact identities, timings and limits are in the
[acceptance record](./public-release.md); these internal repairs are newer than the held DMG.

Repeatable Chrome recovery, input isolation and exact-installer acceptance remain RA handoff
gates. Two native-app tasks, contention, off-Space behavior and physical lock/sleep/voice acceptance
remain requirements for broader reliability claims. A fresh Mac/account is unavailable. Lawrence
Jang owns support and incidents; no invitation, public release or Arena outreach has been sent.
