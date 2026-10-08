# From Sia episodes to Harbor tasks

This folder is an isolated research prototype. It does not change Sia's desktop capture, upload, or agent behavior. It contains one complete synthetic browser task in [`tasks/semester-instructors`](./tasks/semester-instructors/) and a metadata-only intake tool in [`tools/trace_candidates.py`](./tools/trace_candidates.py). No participant trace, credential, screenshot, or private account state belongs in Git.

## What a trace gives us—and what it does not

Sia's consented `raw_v1` episodes contain the request, observed tool events, foreground/native or background CUA route, task-visible snapshots/action results, and a capture-finished marker. They show **what the agent saw and attempted**. They do not provide a resettable application state, a privileged final-state oracle, proof that a user-facing answer is true, or a right to train a model. Current research consent explicitly excludes model training. Treat `turn.capture_finished.outcome = completed` as capture lifecycle, never as reward.

The practical conversion is:

1. **Triage locally.** Export consented research data through Sia's Privacy controls, keep the export outside Git, and run the tool below. It handles split raw events and emits only route/action counts and anonymous episode keys. Reviewers use the original export only within the approved research boundary.
2. **Write a task specification.** Describe the goal and observed failure pattern in general terms. Decide what starting app state, distractors, allowed actions, and exact success conditions are needed. Do not copy personal names, schedules, messages, screenshots, login state, or URLs into a task.
3. **Synthesize a resettable environment.** Seed fictional accounts and records in an isolated web app or Mac image. The agent should see only its normal app UI; the state generator and grading oracle live outside its container/session. For the same scenario, build both foreground and background CUA adapters against the same seed.
4. **Write an independent verifier.** Grade authoritative post-task state or a strictly specified output artifact, including negative checks for extra/wrong changes. No agent message, screenshot alone, or captured “verified” label may set the reward. Run no-op, reference-solution, stale-data, partial-answer, wrong-target, and tampering trials.
5. **Run repeated trials.** Reset each environment, vary seeds and distractors, and evaluate both CUA routes separately. Split task families and templates between development and held-out evaluation; do not train on the evaluation oracle or participant data under current consent.

| Trace pattern                                     | Candidate environment                                   | Authoritative reward                                                                          |
| ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Finds instructors/assignments across Canvas pages | Synthetic course portal with current and archived terms | Exact course-to-person or assignment mapping from a separate oracle                           |
| Copies office hours into a calendar               | Synthetic LMS plus calendar account                     | Exact event set, calendar ID, recurrence, time zone, and absence of extras from backend state |
| Moves a document between apps                     | Synthetic drive/editor pair                             | Post-task object IDs, content hashes, permissions, and no unintended writes                   |
| Manages a native Mac app                          | Resettable macOS image with test accounts               | Privileged app-state API outside the agent's UI/session                                       |

Browser tasks can use Harbor's Docker/Compose environment. Native macOS tasks need a Harbor custom environment backed by disposable Mac hosts or snapshots; a Linux browser container is not equivalent to Sia's full Mac CUA. A dedicated CUA runner must also restrict the action surface if the study is measuring mouse/keyboard control rather than outcome alone.

## Local intake

```sh
python3 research/rl-environments/tools/trace_candidates.py \
  /private/path/to/sia-research-export.json \
  --output research/rl-environments/local/candidates.json \
  --review-index research/rl-environments/local/private-review-index.json
```

`local/` is ignored by Git. The tool refuses malformed/incomplete chunk sets, uses a fresh random salt to pseudonymize episode IDs, creates output mode `0600`, and never puts prompts, page text, screenshots, action arguments, thread IDs, or turn IDs in the candidate file. The optional private review index maps candidate keys back to raw thread/turn IDs for an authorized reviewer; it must stay with the original export and never be published. It does not turn any trace directly into a public benchmark or training sample.

## Example task and validation

[`semester-instructors`](./tasks/semester-instructors/) follows Harbor's task layout. Its portal is a Compose sidecar, its answer artifact is transferred to a **separate verifier image**, and `tests/test.sh` writes `0` or `1` to `/logs/verifier/reward.txt`. The reference solution discovers current courses from the portal rather than containing the expected answer. Local tests exercise the solution and reject no-op, incomplete, stale, and unsupported-source answers:

```sh
python3 -m unittest discover -s research/rl-environments/tests -v
```

With a Docker daemon and Harbor installed, validate the full container trial with both the reference solution and a no-op agent:

```sh
harbor run -p research/rl-environments/tasks/semester-instructors -a oracle -n 1 -o research/rl-environments/local/oracle-jobs
harbor run -p research/rl-environments/tasks/semester-instructors -a nop -n 1 -o research/rl-environments/local/noop-jobs
```

The oracle should earn `1`; no-op should earn `0`. The agent and portal share a Docker **internal** network; the separate verifier uses `network_mode: none`. This Compose isolation works on Mac Docker backends that lack Harbor's optional kernel egress-control support. Docker is required for this boundary; local unit tests alone do not establish that Harbor can launch the images or that an actual CUA agent can operate the UI. Pin built image digests and run repeated randomized trials before using this as a published benchmark.

## Real Sia background smoke test

On an awake, unlocked Mac with the signed Sia Development runtime, Mac permissions, an authenticated Codex provider, and a current desktop build:

```sh
SIA_REAL_RL_BACKGROUND=1 node research/rl-environments/tools/test_background.mjs
```

This deliberately consumes one real model turn. It opens a **new disposable Safari window**, serves only the fictional portal on a random loopback port, creates a fresh Sia test profile/workspace, enables consented capture only in that profile, selects background control with foreground fallback disabled, and sends the course-instructor task through Sia's typed bridge. It closes its own Safari window and test process afterward. It does not attach Chrome, change the person's Sia settings, sign into a real account, or upload research. The isolated test profile uses plaintext test storage; all output stays in a private, ignored `local/background-*` directory. Inventory events can contain unrelated window titles, so even these smoke-test exports must stay private.

`tools/evaluate_background.py` evaluates the exported episode and the **unaltered final answer**. It separately checks the independent answer oracle and the execution route: all three supporting pages were observed, delivered input was background, and no unexpected action/provider tool or outside origin was used. Guarded refusals before any observation or input count as recovery costs; uncertain input still fails the route check. `clean_execution` distinguishes a successful recovery from a run with no refusals. A completed capture, invented reward, correct answer without observations, foreground delivery, or native web search cannot pass this smoke test. This is evidence for a specific synthetic task, not proof of unrestricted background reliability.

For the reported output directory, replay the captured answer through Harbor's separate verifier, then attempt to forge its reward:

```sh
PYTHONPATH="$PWD/research/rl-environments/tools" harbor run \
  -p research/rl-environments/tasks/semester-instructors \
  -a harbor_replay:CapturedOutputAgent \
  --ak answer_path="$PWD/research/rl-environments/local/background-REPLACE/answer.json" \
  -n 1 -o research/rl-environments/local/captured-jobs

PYTHONPATH="$PWD/research/rl-environments/tools" harbor run \
  -p research/rl-environments/tasks/semester-instructors \
  -a harbor_replay:ForgedRewardAgent \
  -n 1 -o research/rl-environments/local/forgery-jobs
```

The captured-output agent also checks that the oracle/reference solution are absent from the agent container and that an external TCP connection is blocked. It replays the **answer artifact**, not the Mac CUA actions. The real Mac probe checks actions separately. The forgery probe writes a fake `reward.txt` and a self-reported success artifact in the agent container; the separate verifier must still return `0`.

This test uses the already reviewed synthetic task template. The intake tool still performs triage, **not automatic synthesis of arbitrary environments from traces**. A trace alone does not reconstruct a resettable app or an authoritative reward function. For a new task family, the specification, synthetic seed, independent oracle, and reset behavior still need to be authored and reviewed.

### Checked behavior

Local validation used Harbor 0.20.0 and real Sia background turns with GPT-5.6-Sol (the default advertised by this Sia installation). Both turns used new workspaces and fictional portal data; the second also used a fresh profile and randomized local port.

| Check                          | Result                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| First real Mac background turn | Exact answer reward `1`; all three sources observed; 10 delivered actions; about 204 s                                                             |
| Fresh Mac background turn      | Exact answer reward `1`; all three sources observed; 10 delivered actions; about 367 s; recovered from one refused snapshot and one refused action |
| Harbor reference solution      | Separate verifier reward `1`, no trial exception                                                                                                   |
| Harbor captured-answer replay  | Separate verifier reward `1`; oracle absent from agent image; external TCP blocked                                                                 |
| Harbor forged-reward attempt   | Separate verifier reward `0` despite fake agent-side `reward.txt` and claimed success                                                              |
| Focused Python checks          | 16 tests passed, including stale/partial answers, chunked capture, duplicate keys, route violations, and safe refusal accounting                   |

The Harbor no-op control also returned reward `0` with no trial exception.

These results cover one fixed information-extraction task. They do not establish seed generalization, mutable-app rollback, resistance to every exploit, or replay of native Mac actions inside Harbor. The extra recovery and latency in the second turn are real limitations to measure, rather than hide with a completion label. Raw traces, screenshots, profiles, and Harbor job files remain private under `local/`.

## Research gate before RL training

This prototype supports environment design and evaluator testing. Using participant traces or derived personal content for model training would require updated consent and research approval. The current task uses fictional data only. Any future task release needs a source review, privacy review, leak check, canary/contamination check, and evidence that the verifier is independent of the agent's available files and tools.

Format references: [Harbor task overview](https://docs.harborframework.com/tasks/overview), [multi-container environments](https://docs.harborframework.com/tasks/multi-container), [separate verifier](https://docs.harborframework.com/tasks/separate-verifier), and [Terminal-Bench 2.1 tasks](https://github.com/harbor-framework/terminal-bench-2-1/tree/main/tasks).
