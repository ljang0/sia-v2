# Sponsored models across harnesses

What Sia needs to run a sponsor's models (for example, LM Arena's) in several agent harnesses, and
the operator steps that make it live. Configuration details live in
[model lab integration](./model-lab-integration.md); harness admission rules in
[harness policy](./harness-policy.md).

## What the source supports

- **Supported model protocols.** A sponsor lab can speak OpenAI Responses, OpenAI Chat Completions, or
  Anthropic Messages (`apiProtocol`). The cloud relay translates each to the format the harness
  speaks. The sponsor key stays in AWS Secrets Manager. On the Mac, harnesses receive only a
  loopback, model-scoped capability.
- **Admitted engines.** Codex App Server (released), plus Claude Code, OpenCode, OpenHands, and Pi for
  included models. The last four are complete adapters held behind a signed `previewHarnesses`
  manifest until release admission. Each runs per session in a private home with only Sia's tools
  (OpenHands also keeps its own tools behind per-action approval). Each has an opt-in real-binary
  smoke test, and all four passed against Claude Code 2.1.299, OpenCode 1.19.0, OpenHands 1.16.0,
  and Pi 1.2.0.
- **Choosing.** The lab's `defaultHarnessId` picks the engine automatically. The agent dialog's
  Details → Engine lets a person pin any admitted engine for that model.
- **Attribution and budgets.** Usage is charged per lab per account per day, and to the lab's
  sponsor credit (`creditTokenLimit`, `availableUntil`). A daily report breaks it down by model and
  harness under `PK = LAB#<catalogId>` in the control table. The picker and composer name the
  funding lab (for example "Claude · Arena").
- **Ratings.** After each finished task the person can rate it (pick and rate,
  [`arena-ratings.md`](./arena-ratings.md)). Ratings roll up per day, model, and engine under the
  same `PK = LAB#<catalogId>` and are read with the admin-only `GET /v1/admin/ratings`.

## Make it live (operator)

The protocol routes and encrypted phone relay have recorded deployment evidence in
[handoff](./handoff.md); ratings and deletion have later evidence in
[public release](./public-release.md). An Arena sponsor entry and admission of preview engines
remain separate work. Inspect the live stack and prepare only missing changes; the checklist
below is not an instruction to redeploy already accepted infrastructure.

1. **Cloud.** Prepare a scoped change set for `sia-alpha` from the current source. It changes:
   - the `MetaFunction`, `ControlFunction`, and `DeletionFunction` code (deletion now also
     removes paired phones)
   - the new `/v1/messages` and `/v1/chat/completions` routes on the REST API
   - the new `POST /v1/ratings` and `GET /v1/admin/ratings` routes on the REST API (both on
     `ControlFunction`; no new table, index, or permission)
   - optionally `EnablePhoneRelay`

   Review it against the live stack as `docs/release.md` requires; do not deploy the template
   wholesale. Per-account daily counters reset once when this deploys.

2. **Sponsor lab.** Add an `additionalLabs` entry to the hosted-model secret with the sponsor's
   endpoint, key, `apiProtocol`, `allowedModels`, `catalogId` (for example `arena`),
   `displayName`, limits, `creditTokenLimit`, and `availableUntil`. Add `harnessRoutes` with
   `credentialSource: "sia_managed"` for each engine to offer (`claude_code` with
   `anthropic_messages`; `opencode_acp`, `pi_rpc` with `openai_responses`; `openhands_acp` with
   `openai_chat_completions`). Confirm `GET /v1/catalog` lists the lab as available.
3. **Preview manifest.** Sign a manifest listing the engines to preview:
   `{ "harnesses": [], "previewHarnesses": ["claude_code", "opencode_acp", "openhands_acp", "pi_rpc"] }`
   with `apps/desktop/scripts/sign-lab-harness-manifest.mjs --days 14`.
4. **Demo Mac.** Install the harness CLIs in a private location (not global). Start the signed app
   with `SIA_LAB_HARNESS_MANIFEST`, and with `SIA_OPENCODE_COMMAND`, `SIA_OPENHANDS_COMMAND`, and
   `SIA_PI_COMMAND` pointing at them; Claude Code is found on PATH. Run the four
   `*_ENDPOINT_SMOKE` tests on that Mac first.
5. **Rehearse.** For one sponsor model, run the same fictional task in each engine. Confirm in the
   lab report that each run is attributed to its harness. Record results with their exact
   source, artifact hash, and date.
6. **Ratings report.** Rate each rehearsal task with the thumbs, then, signed in as an admin with
   an authenticator, call `GET /v1/admin/ratings?lab=<catalogId>&from=YYYY-MM-DD&to=YYYY-MM-DD`
   and confirm one row per day, model, and engine with the expected good, bad, reasons, and
   outcomes. Share only that report with the sponsor; it holds no account or conversation data.

## Not yet done

Release admission for the four preview engines needs the signed-app run of the remaining harness
policy checks (workspace confinement and adversarial tests, crash cleanup, network policy). Arena's
endpoint, models, credit amount, expiry, and branding permissions are still open. The current demo
still uses the operator's Codex plan.
