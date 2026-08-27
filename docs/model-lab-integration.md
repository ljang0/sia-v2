# Model lab and harness integration

Muse Spark is an example catalog entry. Sia's product contract is a catalog of model labs whose
access is funded by the lab and brokered by Sia. A person never pastes a lab API key into the app.

## Compatibility contract

For the broadest upstream compatibility, a lab should expose the OpenAI Responses API, streaming,
tool calls, and `GET /v1/models`. Chat Completions labs also work because Sia normalizes their
stream into Responses before Codex sees it:

| Model API               | Sia direct | Codex app server | OpenCode | Pi  |
| ----------------------- | ---------- | ---------------- | -------- | --- |
| OpenAI Responses        | yes        | yes              | yes      | yes |
| OpenAI Chat Completions | yes        | no               | yes      | yes |
| Anthropic Messages      | no         | no               | yes      | yes |

Codex custom model providers accept the Responses wire API only. OpenCode and Pi accept both
OpenAI Responses and Chat Completions. OpenCode and Pi also document their own ChatGPT Plus/Pro
sign-in, so a Codex subscription can be used by those harnesses without Sia copying the credential.
Each harness must own its login and token refresh.

Sia-managed, long-lived lab keys stay in AWS Secrets Manager. The release default is
`codex_app_server`: Codex calls a loopback `/v1/responses` proxy with a random capability scoped to
one model, and the desktop attaches Sia identity only while forwarding that request to the cloud.
The Codex process receives neither Cognito identity nor the lab key. `sia_direct` remains only as a
compatibility route for already-persisted threads.

## Add a lab model without changing code

The existing hosted-model secret is the primary lab. Add more entries under `additionalLabs`:

```json
{
  "apiKey": "primary-secret",
  "endpoint": "https://api.primary.example/v1",
  "model": "primary/spark",
  "allowedModels": ["primary/spark"],
  "catalogId": "primary-lab",
  "displayName": "Primary Lab",
  "apiProtocol": "openai_responses",
  "enabled": true,
  "additionalLabs": [
    {
      "apiKey": "second-secret",
      "endpoint": "https://api.second.example/v1",
      "model": "second/fast",
      "allowedModels": ["second/fast"],
      "catalogId": "second-lab",
      "displayName": "Second Lab",
      "apiProtocol": "openai_chat_completions",
      "enabled": true
    }
  ]
}
```

Model ids and lab ids must be globally unique. Catalog responses contain names, capabilities,
limits, protocols, and admitted routes only; endpoints and API keys are never returned.

Every model automatically receives a managed `codex_app_server` Responses route. Optional
`harnessRoutes` add lab-specific routes without removing that baseline. Every route must name an
allowed model. `defaultHarnessId` chooses between routes in the same lab entry.

## Add a harness

1. Implement the small `ProviderAdapter` contract, including probe, account, session, turn,
   cancellation, and disposal behavior.
2. Add one `HarnessDefinition` in `packages/runtime/src/harness-registry.ts`. Declare exact model
   protocols, credential sources, and keep `productionEnabled: false` until conformance passes.
3. Register the adapter with `RuntimeCoordinator` using `{ provider, harnessId, adapter }`.
4. Add the route to the lab catalog and run resolver, adapter, credential-isolation, cancellation,
   tool, and packaged-app tests.

Harness ids are safe lowercase catalog identifiers rather than a closed persistence enum. This
means adding a lab harness does not require a data migration. Catalog presence alone never grants
execution: an unknown, incompatible, unavailable, or non-release registration fails closed.

## Required conformance

- exact model selection and confirmation;
- streaming text, reasoning, tool-call, usage, completion, and error mapping;
- cancellation and process cleanup;
- workspace containment and no inherited plugins, skills, MCP servers, or hooks;
- no long-lived lab or Sia credential in arguments, logs, events, or child environments;
- immutable provider/model/harness attribution on every thread;
- a real-binary no-turn smoke and representative tool loop in the signed application.

OpenCode ACP and Pi RPC remain registered as non-release routes until their real binaries pass this
matrix in the release environment. They are not shown in the initial release UI.

## Primary compatibility references

- [Codex custom model providers](https://developers.openai.com/codex/config-advanced/)
- [Codex app server](https://developers.openai.com/codex/app-server/)
- [OpenCode providers](https://opencode.ai/docs/providers)
- [OpenCode CLI](https://opencode.ai/docs/cli)
- [Pi providers](https://pi.dev/docs/latest/providers)
- [Pi custom models](https://pi.dev/docs/latest/models)
- [Pi RPC](https://pi.dev/docs/latest/rpc)
