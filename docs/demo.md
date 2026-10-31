# Useful work to try in Sia

Latest candidate: **alpha.42**, exact source `c50782a`. Its signed setup fixed the missing direct-capture
approval and real Finder screenshots now arrive. A fresh clipboard-free filing run still failed
before moving files (about 84 seconds); all six hashes and the clipboard canary remained unchanged.
Chrome reconnection failed with native `consent_not_settled`. Neither a completed clipboard-safe
workflow nor parallel GUI use is accepted. See [exact evidence](./public-release.md).

Use the exact signed candidate recorded in [release status](./release-status.md) and
[artifact evidence](./public-release.md). Distribution is not approved. The examples below use
actual public project documents and a real admitted model; they are not fake-service demos.

## Start here

1. Open the signed Mac app with the designated QA or invited account. Connect an actual admitted
   model through the normal AI setup. Record the app version, installer hash and selected model.
2. Keep research sharing off. Choose **Use my Mac → Work in background**. Record the action
   confirmation setting; do not change it mid-run or mix results from different settings.
3. Create an assistant with its default folder. Use **Add files** beside the composer to attach
   the source documents listed for the chosen demo. A path typed in a message does not grant
   access to a source file elsewhere on the Mac. Download public files from this repository if
   reviewing without a checkout; verify they contain Markdown text, not a saved HTML page.
4. Use a fresh conversation and new output filenames for every repeat. Inspect the actual saved
   files and their previews, rather than accepting the model's completion claim.

Chrome connection is part of alpha.38's default Mac setup, with a deliberate opt-out. macOS and
Chrome still require their own permission decisions. Existing profiles can use the conversation's
**Connect Chrome & continue** control when the host reports missing browser access. These new
paths require signed-candidate acceptance; unit tests do not establish live consent behavior.

## Demo 1: prepare a reviewer packet

Attach [README](../README.md), [Arena proposal](./arena-proposal.md),
[release status](./release-status.md), [artifact evidence](./public-release.md) and
[architecture](./architecture.md).

> Prepare a useful technical-review packet from the five attached Sia documents. Save
> reviewer-brief.md, first-hour.md and open-decisions.md in this conversation's folder.
> Keep the brief under 700 words. Explain the request-to-result code path, exact candidate
> evidence, and remaining distribution gates. Make the first-hour walkthrough use the signed
> Mac app, an actual ChatGPT plan, and useful work on these public documents. Include a complete
> copyable task prompt and output checks. Keep fake-service developer setup in a separate optional
> note. Prioritize unresolved decisions without inventing agreements or passed tests. Use portable
> source links to https://github.com/ljang0/sia-v2/blob/main/. Read back every saved file and link
> all three. Do not modify source files, publish anything, or contact anyone.

Check the exact version/hash against the attached evidence; verify every factual claim and linked
source path. Count the brief's words. Follow the first-hour instructions literally and record any
missing input or manual correction. All three results must have working Preview/Open controls.

**Recorded alpha.37 outcome:** the initial path-only request stopped after 18 seconds without
outputs. Attaching the five documents produced three files in 39 seconds, but only one preview.
The first-hour guide used fake services incorrectly and had nonportable citations. Two corrective
requests were needed to obtain an actual-plan, real-document walkthrough. This is assisted partial
coverage, not a first-run pass.

**Signed alpha.38 outcome:** with the five sources attached before the initial request, GPT-6-Astra
produced all three files without corrective input. The brief was 484 words, cited paths existed,
the first-hour path used the real signed app and ChatGPT plan, and all three previews opened.
UI work segments were 5 seconds and 3 minutes 3 seconds. The attached evidence predated alpha.38
acceptance; correctly reporting alpha.37 evidence was required. This was one fresh-conversation run,
not proof of repeatability or a fresh recipient completing the walkthrough.

## Demo 2: make a practical release-week plan

Attach [release status](./release-status.md), [manual acceptance](./manual-acceptance.md) and
[Arena proposal](./arena-proposal.md).

> Plan my next five working days preparing the real Sia Mac app for an Arena technical review.
> Use only the attached evidence. Save release-week-plan.md and release-work.csv in this
> conversation's folder. Prioritize at most 12 concrete tasks with dependencies, owner Lawrence
> Jang, effort estimates explicitly labeled as estimates, measurable acceptance evidence, and
> separate go/no-go conditions for technical review and distribution. Keep Mac-first scope.
> Distinguish unavailable clean-account testing from work that can happen now. Do not invent
> access, passed tests, or permissions to distribute. Read back and link both saved files.

Parse the CSV independently. Check unique task IDs, valid dependencies, owner, estimate labels,
daily workload, dates, and agreement between the two outputs. Clean-account testing must remain
blocked while no suitable account or second Mac is available. No invitation should be sent.

**Recorded alpha.37 outcome:** a real GPT-6-Astra run using the attached documents produced both
outputs without corrective input. Independent checks found 12 unique tasks, no missing dependency
IDs, the requested owner, and estimated daily workloads of 6–8 hours; the unavailable clean-account
check remained unscheduled. UI work segments were 16 seconds and 2 minutes 50 seconds. Only one
result had a preview. This verifies document planning, not browser or native-app control.

**Signed alpha.38 outcome:** a fresh conversation produced both files without corrective input,
while Demo 1 was working in its separate folder. Both previews opened. The CSV had 12 unique tasks,
valid dependencies, Lawrence Jang as owner, and 35 estimated task-hours over November 2–6, plus
separately described contingency. Clean-account execution stayed blocked. UI work segments were
17 seconds and 2 minutes 36 seconds; a task-tracking step failed and recovered automatically.

## Demo 3: explain the actual codebase

Attach [AGENTS](../AGENTS.md), [README](../README.md), [architecture](./architecture.md),
[ratings](./arena-ratings.md) and [model/harness integration](./arena-model-harness.md).

> Create codebase-reading-guide.md from the five attached project documents. Explain how a user
> request reaches a model, performs actions, persists results, and produces a rating. Include a
> table mapping each stage to source paths named in the documents, a prioritized 45-minute reading
> sequence, and five technical-review questions. Distinguish documented behavior from facts that
> need code inspection or live verification. Use portable repository links. Save, read back and
> link the guide; do not modify the source repository.

Check each source path exists and that the summary preserves the separate provider-native and
Sia-hosted action boundaries. Verify the reading times total 45 minutes. A prose summary is not a
verified call graph, deployment audit, or model-comparison result.

**Recorded alpha.37 outcome:** the path-only attempt stopped after 38 seconds. Adding the five
actual documents let the retry finish in 45 seconds. The saved guide was inspected and all linked
repository paths existed. Record the attachment intervention; this was not an unassisted first run.

## Background work, concurrency and responsiveness

The document demos establish useful output generation. They do not establish GUI input delivery.
Before presenting background computer use, complete the real-source browser and ordinary-app
scenarios in [manual acceptance](./manual-acceptance.md#real-work-and-concurrent-use):

- Source a technical comparison and a practical outing plan from current official websites.
  Independently check facts, dates, costs, links and saved outputs.
- Keep a separate TextEdit document active and type while Sia works in the prepared public browser
  window. Verify foreground ownership, text and clipboard preservation, and the exact browser result.
- Run two useful requests in separate default assistant folders. Record actual overlapping work,
  cancellation of one without stopping the other, correct output ownership, and recovery.
- Also try the same folder and target: safe queueing or an explicit pause is a valid conflict
  outcome, but it must not be reported as parallel execution.
- Measure cold/warm startup, send feedback, ten thread switches, stop latency and total duration.
  Preserve failures and manual interventions; repeat each main workflow in two fresh conversations.

Alpha.37 serialized independent document tasks behind a whole-task GUI lease. Alpha.38 defers that
lease until the first GUI tool call. Alpha.39 introduces per-window ownership, but its signed real GUI tasks failed; parallel control of
different physical windows is not accepted. Background browser new-tab creation is also unsupported.
Do not promise these capabilities or silently enable foreground fallback to make a test pass.

On alpha.38, ten conversation switches during a real evidence-review task measured median 762.5 ms
and worst 868 ms from CUA click to fresh accessibility state. Stop returned a separate task to Ready
with a cancellation message in 807 ms while the evidence-review task kept working. These measurements
include automation overhead; they do not instrument the internal dispatch cutoff. Exact foreground
TextEdit text was retained during document work. GUI input concurrency and clipboard preservation
remain open. The alpha.37 baseline was median 809 ms / worst 1,073 ms with a full test gate also running;
the differing conditions do not support a performance-improvement claim.
Native Chrome inspection through the operator CUA tool timed out during browser preparation;
no real-source browser demo was completed by that attempt.

## Developer regression fixtures

The [nine fictional scenarios](./demo-fixtures/demo-cases.json) and
[100-task reliability manifest](../apps/desktop/tests/fixtures/reliability/cases.json) are useful
regression inputs. Preserve them, but keep their results separate from real-world acceptance.
A fake-service reply, a real model analyzing fictional data, and real native-app work are different
kinds of evidence. Historical walkthroughs remain in Git history and private evidence records.

Run the opt-in fictional-data model suite with an admitted, signed-in test model:

```sh
SIA_CODEX_REAL_SMOKE=1 SIA_PERSONAL_DEMOS_SMOKE=1 \
SIA_SMOKE_MODEL=gpt-5.6-sol SIA_DEMO_EVIDENCE_DIR=/private/tmp/sia-demo-evidence \
pnpm --filter @sia/desktop exec vitest run src/main/actions/personal-demos.smoke.test.ts
```

For the model/host reliability matrix, simulated driver observations must be labeled simulated:

```sh
SIA_CODEX_REAL_SMOKE=1 SIA_RELIABILITY_SIMULATED_CUA=1 \
SIA_SMOKE_MODEL=gpt-6-astra SIA_RELIABILITY_EVIDENCE_DIR=/private/tmp/sia-background-matrix \
pnpm --filter @sia/desktop exec vitest run src/main/actions/background-reliability.smoke.test.ts
node apps/desktop/scripts/summarize-background-tasks.mjs --evidence /private/tmp/sia-background-matrix
```

To prepare the separate disposable native-driver lab:

```sh
SIA_RELIABILITY_REAL_CUA=1 node apps/desktop/scripts/background-task-lab.mjs start --config /private/tmp/sia-task-lab.json
SIA_RELIABILITY_DRIVER_PROBE=1 SIA_RELIABILITY_REAL_CUA=1 SIA_RELIABILITY_LAB=/private/tmp/sia-task-lab.json \
pnpm --filter @sia/desktop exec vitest run src/main/actions/reliability/driver.smoke.test.ts
```

Only after that no-input probe passes, replace `SIA_RELIABILITY_SIMULATED_CUA=1` in the matrix
command with `SIA_RELIABILITY_REAL_CUA=1 SIA_RELIABILITY_LAB=/private/tmp/sia-task-lab.json` and use
a new evidence directory. Close the lab with the launcher’s `stop --config` command. This is a
controlled lab, not ordinary-app acceptance; follow [manual acceptance](./manual-acceptance.md)
for that separate gate. Never convert a blocked native run into a simulated pass. Keep prompts, transcripts, screenshots, timings and file hashes outside Git; retain failed
attempts when a later retry succeeds. Only exact-candidate acceptance supports a release decision.

## Alpha.39 real GUI attempts

The signed candidate attempted a real-source browser comparison alongside Finder filing of six
actual handoff documents. Neither completed. Finder left all input hashes unchanged and created no
folders. The browser read Cua's documentation, then navigation/authorization failed; restarting Sia
and reconnecting the same approved window did not restore reads. No report was saved. TextEdit
text survived, but foreground ownership and clipboard preservation were not verified. These are
failed acceptance attempts, not successful demos. Historical exact evidence remains in Git history and the private alpha.39 artifact folder.

## Alpha.40 real GUI results

The same useful browser comparison passed in one fresh conversation: three official sources,
a saved 751-word report, verified readback and a working preview, in about 120 seconds. The
operator prepared a new ordinary Chrome window in the existing profile before the request; no
corrective prompt followed. TextEdit was confirmed active during browser input and its typed
canary survived. Both the driver and window setup changed, so the cause of recovery is unproved.

Finder filing still failed after an operator-assisted resume. Navigation and folder creation
worked, but exact-field rename and pixel typing did not. Six input files remained unchanged in
Inbox and one empty untitled folder was left behind. The two requests overlapped, but their GUI
input did not; do not present this as concurrent computer-use acceptance. Clipboard preservation
and a second fresh-conversation run remain open. See [exact results](./public-release.md#prior-alpha40-browser-result).

## Alpha.41 real filing and recovery

Finder organized all six actual project deliverables into the requested 3/2/1 folders, left Inbox
empty, and passed independent hash checks without a corrective prompt. TextEdit was confirmed
active and foreground typing survived. The app reported 5m27s / 67 steps with six problem steps;
do not call that fast or frictionless. Clipboard preservation failed: copying/moving in Finder
replaced the canary with three filenames. A fresh run that forbade shared-clipboard commands stopped before filing: requested snapshots
supplied no usable pixel targets, and all six input files remained unchanged.

Browser research stopped before source reading. The inline connection control showed the picker,
but the approved public window still failed after Chrome consent. There was no overlapping browser
input and no research report. See [exact results](./public-release.md#alpha41-real-gui-results).
