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

Alpha.42 is signed and notarized, with full local gates and exact-source CI passing. It repairs
missing direct-capture setup and provides real Finder screenshots, but a fresh clipboard-free
filing task still stopped before moving files. Chrome recovery reports a native consent timeout.
Alpha.41 previously filed six real documents with matching hashes in 5m27s, but changed the shared
clipboard. Alpha.40 completed one sourced browser report with TextEdit active; alpha.38 produced
five checked document/planning outputs concurrently. These results support technical review,
not general desktop readiness. Reliable filing, clipboard preservation, Chrome recovery,
repeatability, parallel GUI control, clean macOS-account setup/provider retry, and physical
voice/lock/sleep acceptance remain open. Background browser new-tab creation is unsupported.
A subsequent native-driver engineering probe recovered Chrome and completed a useful visitor
plan from official museum/transit sources while TextEdit stayed active; saved output, arithmetic,
preview and clipboard were independently checked. That patch is being prepared for a reproducible
candidate build and still needs repeat/restart and simultaneous GUI acceptance.
Distribution remains blocked on these gates and the owner's release decision.
The owner confirmed the relevant native source rights; Lawrence Jang is the pilot support/incident
owner. See [release status](./release-status.md) for exact-version evidence and remaining gates.

Try the [real-work demo guide](./demo.md), which preserves failures and corrective interventions.
Start with the [README setup and task path](../README.md), then
[architecture](./architecture.md), [ratings](./arena-ratings.md) and
[sponsor integration](./arena-model-harness.md). The initial handoff is the repository, a verified
installer with checksums, a short task rehearsal, and an explicit acceptance record.
