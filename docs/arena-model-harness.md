# Sponsored models across harnesses

What Sia needs to run a sponsor's models (for example, LM Arena's) in several agent harnesses, and
the operator steps that make it live. Configuration details live in
[model lab integration](./model-lab-integration.md); harness admission rules in
[harness policy](./harness-policy.md).

## What the source supports

- **Any model API.** A sponsor lab can speak OpenAI Responses, OpenAI Chat Completions, or
  Anthropic Messages (`apiProtocol`). The cloud relay translates each to the format the harness
  speaks. The sponsor key stays in AWS Secrets Manager. On the Mac, harnesses receive only a
  loopback, model-scoped capability.
- **Any harness.** Codex App Server (released), plus Claude Code, OpenCode, OpenHands, and Pi for
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

## Make it live (operator)

Each step is a separate, reviewed action. Nothing here has been deployed.

1. **Cloud.** Prepare a scoped change set for `sia-alpha` from the current source. It changes:
   - the `MetaFunction`, `ControlFunction`, and `DeletionFunction` code (deletion now also
     removes paired phones)
   - the new `/v1/messages` and `/v1/chat/completions` routes on the REST API
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

## Not yet done

Release admission for the four preview engines needs the signed-app run of the remaining harness
policy checks (workspace confinement and adversarial tests, crash cleanup, network policy). Arena's
endpoint, models, credit amount, expiry, and branding permissions are still open. The current demo
still uses the operator's Codex plan.
