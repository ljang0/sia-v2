# Computer Use Arena distribution proposal

Proposed partnership between Sia and Arena. Prepared for technical review, October 30, 2026.

Sia proposes a small invited pilot that lets people evaluate AI by completing real tasks on
their Macs. Arena would help select models, define the evaluation and recruit the initial
cohort. Sia would provide the signed desktop app, computer-use integration and task feedback.
The first decision is whether to run a joint technical review and bounded pilot; this is not
an announcement of an Arena partnership or a request for unrestricted distribution.

## The experience

Install Sia, sign in, choose an admitted model and ask it to complete a task. Sia works with
local files and Mac apps, shows progress, and supports stopping a task. Afterward, the person
rates the result and can add a reason or optional comment. Start the pilot with explicit
action confirmations and disposable tasks; expand access only after acceptance.

The owner selected a Mac-first handoff, with iPhone following later. The proposed first cohort
uses macOS 14+ and one admitted engine, Codex App Server. A sponsor
can supply compatible hosted models through Sia's existing relay; each model still needs a
live compatibility check. The iPhone companion and additional engines have separate acceptance
gates. A reviewer can explore the UI with fake services without cloud credentials or model spend.

## What Arena would learn

Feedback is tied to the exact model and engine, task outcome, duration, tool-step count, and
whether computer or browser tools were used. The aggregate report groups these by model and
engine. Rating payloads exclude prompts, replies, files and screenshots; users preview optional
comments before sending them. Research trace collection requires separate consent and approval.

This is **pick and rate**: people see and choose the model. Self-selection and different task
difficulty limit comparisons, so these ratings are descriptive feedback, not a blind battle
or a causal model ranking. For the initial evaluation, agree on a shared disposable task set,
fresh agent/workspace state and a fixed learning configuration. Report observed completion
separately from a model's claim that it finished.

Arena's [Agent Mode](https://help.arena.ai/articles/5432423882-how-to-use-agent-mode) already
evaluates multi-step work. Sia's proposed contribution is a Mac execution surface with local
app interactions and explicit model/engine attribution. Evaluation design and any integration
with Arena's existing rankings would be agreed together.

## A small first engagement

1. Review the repository and rehearse real work: a sourced technical comparison, a reviewer packet
   prepared from actual project documents, and a practical plan using current public information.
   Verify the saved outputs while the person keeps working in another app. Check simultaneous
   tasks, responsiveness, failure recovery and cancellation as well as success.
2. Agree on a small invited cohort, supported tasks/models, a sponsor spending cap, support owner,
   data handling and success criteria. Sia operates the client; Arena's role and infrastructure
   responsibilities remain proposals until agreed.
3. Complete the release gates, distribute the exact verified artifact to that cohort, then review
   aggregate feedback and failure cases before expanding. No public leaderboard is required to start.

## Readiness and review

Alpha.38 is signed and notarized, with its full local pilot gate and artifact-source CI passing.
Two real GPT-6-Astra tasks overlapped in separate folders: a three-document technical-review packet
and a five-day release plan with a CSV tracker. All five saved outputs and previews were independently
checked; neither task needed a corrective prompt. Cancelling a later planning task left the separate
evidence-review task running. These results establish useful document work, not general desktop
reliability. Real-source browser research, default Chrome setup/recovery, foreground-user coexistence
during GUI input, clean macOS-account setup/provider retry, and physical voice/lock/sleep acceptance
remain open. GUI loops still serialize, and background browser new-tab creation is unsupported.
The installer and review packet are prepared locally; distribution still requires these gates
and the owner's release decision.
The owner confirmed the relevant native source rights; Lawrence Jang is the pilot support/incident
owner. See [release status](./release-status.md) for exact-version evidence and remaining gates.

Try the [real-work demo guide](./demo.md), which preserves failures and corrective interventions.
Start with the [README setup and task path](../README.md), then
[architecture](./architecture.md), [ratings](./arena-ratings.md) and
[sponsor integration](./arena-model-harness.md). The initial handoff is the repository, a verified
installer with checksums, a short task rehearsal, and an explicit acceptance record.
