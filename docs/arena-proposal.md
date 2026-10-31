# Computer Use Arena: a Mac pilot with Sia

Draft for Arena technical review · October 31, 2026 · Not approved for distribution

Sia proposes a small invited pilot for evaluating agents on useful Mac tasks: researching a plan,
preparing documents and working across desktop apps. Sia supplies the client and computer-use
integration; Arena would help choose models, evaluation design and the initial cohort. The first
ask is a joint technical review and task rehearsal, followed by a bounded pilot if acceptance passes.

Arena's [Agent Mode](https://help.arena.ai/articles/5432423882-how-to-use-agent-mode) already measures
multi-step agent work. Sia's proposed addition is a personal Mac execution surface, where the
person can keep working while the agent uses an authorized browser or desktop window.

## What the reviewer gets

- A Mac-first app for macOS 14+, with sign-in, guided permission setup, visible task progress,
  Stop and result feedback. iPhone follows separately.
- Vision-only computer control by default: screenshots in, pointer/keyboard actions out. Explicit
  file and connector tools are recorded separately. Background use and simultaneous tasks must
  pass the real-work gate before handoff.
- A repository that runs with fake services for UI review without cloud credentials or model spend.
  The [README](../README.md) covers setup; the [architecture walkthrough](./architecture.md#reviewing-the-computer-use-path)
  traces model request → authorization → driver → result and names each module's owner.
- Once verified, the signed universal installer, checksums, a short [demo guide](./demo.md) and an
  acceptance record containing outputs, interventions, timings and failures.

Codex App Server is the initially admitted engine. Compatible sponsored models can use the existing
[model relay](./arena-model-harness.md), subject to a live compatibility check. Additional engines
are not part of the first distribution commitment.

## Evaluation contract

Sia currently supports **pick and rate**: the person chooses a visible model. Feedback records the
model/engine, outcome, duration and tool-step count. Ratings exclude prompts, replies, files and
screenshots; optional comments are previewed before submission. Trace sharing requires separate
consent and release approval. See the [ratings contract](./arena-ratings.md).

These self-selected sessions provide descriptive product feedback, not a blind comparison or
causal ranking. Any randomized assignment or integration with Arena's rankings needs an agreed
design and separate implementation verification. For the first rehearsal, use the same disposable
inputs, fresh agent/workspace state and fixed learning configuration. Verify saved deliverables
independently; count operator rescue and failed attempts rather than accepting completion claims.

## Rehearsal and rollout

1. Run three useful workflows: a source-checked research comparison, a native document prepared
   from project material, and a practical household or outing plan. Verify citations, arithmetic,
   saved files and reopening. Repeat with another app active and with two Sia tasks running.
2. Measure time to result, UI responsiveness, Stop, recovery and clipboard preservation. Agree on
   supported tasks/models, a sponsor spending cap, cohort size and success criteria.
3. After the exact signed artifact passes acceptance, invite the agreed cohort and review failures
   and aggregate feedback before expanding. Lawrence Jang owns support and incidents.

## Current evidence and remaining work

Signed universal alpha.59 passed signing, notarization, installation verification and the full
local pilot gate. Its repaired background browser clicks worked in a real outing; Chrome setup
and recovery from a restaurant network error still prevented completion. A prior visual meal
plan produced independently checked files after operator recovery. Native TextEdit Save remains
unresolved. These are useful failure records, not unattended acceptance passes.

Exact-artifact workflow repeats, concurrency, Stop/recovery, clipboard, restart/expiry and physical
acceptance remain open. A fresh Mac account is currently unavailable. Background new tabs and
Finder file drag are unsupported. Earlier assisted-mode results do not validate the visual default.
The [release status](./release-status.md) and [artifact record](./public-release.md) are authoritative.
No partnership, public release, invitation or leaderboard claim is implied by this proposal.
