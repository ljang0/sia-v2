# Computer Use Arena: a Mac pilot with Sia

Draft for Arena technical review · November 5, 2026 · No partnership or rollout agreed

Sia proposes a small invited pilot for evaluating agents on useful personal Mac tasks: researching plans, preparing documents and working across apps. The first ask is a technical review and task rehearsal. Sia supplies the Mac client, computer-use integration, recording and support; the proposed Arena role is to help select models, evaluation design and the initial cohort. The review should decide three things: which tasks and models to rehearse, what data/report access Arena needs, and what success criteria and spending cap would permit a cohort. No cohort size or rollout is committed before that review and the remaining acceptance gates.

Arena's [Agent Mode](https://help.arena.ai/articles/5432423882-how-to-use-agent-mode) already evaluates multi-step work using session feedback and traces. Sia proposes an additional personal Mac execution surface, with the goal of letting the person keep working while agents use authorized windows. Background and simultaneous-use reliability must be demonstrated before making that promise to a cohort.

## What is available

- An internal signed Mac client with email sign-in, guided permission setup, task progress, Stop and feedback. **RA distribution is held:** the current Apple-silicon build has unresolved native background-input failures. The older notarized universal alpha.122 DMG lacks subsequent fixes and must not be handed out. Exact artifact identities and checks are in the [acceptance record](./public-release.md). Mac first; iPhone follows.
- Vision-only computer control by default: screenshots in, pointer/keyboard actions out. Explicit workspace-file and connector tools are labeled separately. macOS access remains person-approved.
- An [installed-app walkthrough](./ra-onboarding.md#use-the-installed-mac-app) that needs no checkout, AWS credentials or API key, practical [demo prompts](./demo.md), [artifact evidence](./public-release.md) and a [repository walkthrough](./architecture.md#reviewing-the-computer-use-path). The [README](../README.md) also supports local UI review without model spend; actual evaluation uses a real admitted model.

Codex App Server is the initially admitted engine. Sponsored models can use the existing [relay](./arena-model-harness.md) after a live compatibility check. Additional engines are outside the first distribution commitment.

## Recording and evaluation

First-run setup selects cloud recording by default and explains what it saves before Continue. Eligible prompts, replies, provider-reported usage, actions/results and screenshots then upload automatically to Sia's encrypted private AWS archive. Existing opt-outs remain off; pause/export/delete controls are available. Active records expire after 90 days and are not used for model training. Google Workspace connector turns are excluded. Real installed-app uploads have been independently verified. Recording in Sia does not grant Arena archive access; any transfer, reviewer access and data-use terms must be agreed separately.

The current [ratings](./arena-ratings.md) are **pick and rate**: people see the selected model and rate the outcome. Rating records contain model/engine, outcome, duration and step counts; optional comments are previewed. Raw trajectories use the separate recording path. Self-selected sessions support descriptive feedback, not a blind comparison or causal ranking. Randomized assignment or leaderboard integration requires an agreed design and implementation.

For rehearsal, use disposable inputs, fresh workspaces and fixed learning settings. Independently verify saved outputs, citations and arithmetic. Record failed attempts and operator rescue. Measure end-to-end time, Stop/recovery, responsiveness and focus/clipboard preservation while another app is in use, then repeat with two Sia tasks running.

## Evidence and rollout gate

Public Mac 1.0 is the current goal; distribution and invitations remain held. A bounded RA rehearsal
is an intermediate step, not a waiver of the [five release gates](./release-status.md#public-mac-10-goal).
The final installer must complete useful browser and native-document tasks, preserve concurrent
personal input, recover from first-use and lifecycle interruptions, and verify recording controls
and task scope. Working-folder file writes alone do not establish native desktop control.

Earlier signed builds completed an errands/lunch checklist through Finder/TextEdit (207 seconds),
a sourced outing plan (457 seconds), and museum research after restart (496 seconds). Their outputs
were independently checked and originals preserved. These are feasibility evidence, not current
repeatability or responsiveness claims.

An ordinary native task inserted all four requested checklist items in TextEdit, but could
not change the filename in Save. It stopped after 86 seconds with an unsaved draft. A subsequent
save-only request also failed after 76 seconds; its driver trial was reverted. Open-panel
navigation and duplicate-window capture also remain unreliable. Sia's own rendering has been
repaired, but startup, isolation and concurrent-use acceptance are incomplete. Unsuccessful driver
trials were removed; the [acceptance record](./public-release.md) includes failures and exact builds.

Automatic AWS archives match prompts, usage, actions, screenshots and outcomes for useful and failed
runs. Recording-control regressions are repaired in source and installed, with live verification
pending. A navigation-only Slack test captured unintended content; authorized deletion is complete,
but the scope defect remains a release blocker. These limits must be resolved before participant use.

A fresh Mac/account is currently unavailable and Intel runtime is unverified. Lawrence Jang owns
support and incidents. No invitation, public release or Arena outreach has been sent.
