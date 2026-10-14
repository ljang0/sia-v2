# Model lab and harness integration

Muse Spark is an example catalog entry. Sia's default product contract is a catalog of model labs
whose access is funded by the lab and brokered by Sia, with no key in the app.

A person or a lab tester can also use **Settings → AI → Your own API key** for any model behind an
OpenAI Responses-compatible endpoint. That route is the `byok` provider with the `user_byok`
credential source on Codex App Server; the key stays in Sia's main process (see
[architecture](./architecture.md)). Chat Completions-only endpoints are not supported on that
path, because the Chat Completions → Responses conversion lives in Sia cloud.

## Compatibility contract

A hosted lab may expose any of three wire protocols, set per lab with `apiProtocol`. The cloud
relay (`apps/cloud/src/aws/meta-provider.ts`, one `UPSTREAMS` entry per protocol) translates each
into the same bounded stream, so Codex App Server always sees the Responses API:

| Lab `apiProtocol`         | Request path / auth                            | Codex app server via Sia relay |
| ------------------------- | ---------------------------------------------- | ------------------------------ |
| `openai_responses`        | `/responses`, `Authorization: Bearer`          | yes                            |
| `openai_chat_completions` | `/chat/completions`, `Authorization: Bearer`   | yes                            |
| `anthropic_messages`      | `/messages`, `x-api-key` + `anthropic-version` | yes                            |

Each lab must also serve `GET /models` (Anthropic: `/models?limit=1000`) listing its allowed
models, which is the live readiness check. Adding a protocol means adding one `UPSTREAMS` entry with
its request translation and stream reader; nothing outside the relay changes.

Natively, harnesses differ: OpenCode and Pi speak all three protocols directly, while Codex custom
model providers accept Responses only.

OpenCode and Pi also document their own ChatGPT Plus/Pro
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
    },
    {
      "apiKey": "sponsor-secret",
      "endpoint": "https://api.sponsor.example/v1",
      "model": "sponsor/claude",
      "allowedModels": ["sponsor/claude"],
      "catalogId": "sponsor",
      "displayName": "Sponsor",
      "apiProtocol": "anthropic_messages",
      "enabled": true,
      "dailyTokenLimit": 500000,
      "creditTokenLimit": 50000000,
      "availableUntil": "2027-01-01T00:00:00Z"
    }
  ]
}
```

Model ids and lab ids must be globally unique. Catalog responses contain names, capabilities,
limits, protocols, and admitted routes only; endpoints and API keys are never returned.

Every model automatically receives a managed `codex_app_server` Responses route. Optional
`harnessRoutes` add lab-specific routes without removing that baseline. Every route must name an
allowed model. `defaultHarnessId` chooses between routes in the same lab entry.

## Sponsored credit and usage reports

Each lab is metered on its own. Its `dailyRequestLimit` and `dailyTokenLimit` apply per account
per UTC day to that lab only, so a sponsor's allowance never consumes another lab's.

- `creditTokenLimit` caps the lab's tokens across every account for the life of the grant. It is
  checked before each turn, so turns already running may finish slightly past it. Once spent, the
  catalog reports the lab unavailable and new turns fail with `hosted_lab_credit_exhausted`.
- `availableUntil` (ISO-8601) withdraws the lab from the catalog and relay at that instant.

The control table keeps account-free aggregates under `PK = LAB#<catalogId>`: `SK = CREDIT` holds
the lab's running request and token totals, and `SK = USAGE#<day>#<model>#<harnessId>` holds a
daily per-model, per-harness report retained for about 400 days. The harness id comes from the
desktop's loopback relay (`x-sia-harness`); it is client-reported, used for attribution only, and
never authorizes anything. Per-account counters stay under the account and are deleted with it.

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

## Test a lab's own harness without a release

A lab can test its own agent harness in Sia before it passes release admission. Codex App Server
stays the default; the lab harness is added next to it only on the tester's Mac.

1. The lab provides an ACP v1 stdio command (`session/new`, `session/prompt`, model selection, and
   cancellation) that prints a semantic version for `--version`. Sia's tools reach it through the
   same capability-scoped MCP bridge as other ACP harnesses. It cannot use Codex's native Use my Mac
   tools.
2. The release owner lists it in a JSON array with `id` (lowercase, not a built-in harness id),
   `name`, absolute `command`, optional `args`/`versionArgs`, `models` (`id`, `label`), and a
   plain-language `disclosure` of what leaves the Mac and how long the lab keeps it. They sign it
   with the release manifest key:

   ```sh
   SIA_RELEASE_MANIFEST_PRIVATE_KEY_FILE=… SIA_RELEASE_MANIFEST_KEY_ID=… \
     node apps/desktop/scripts/sign-lab-harness-manifest.mjs harnesses.json lab-manifest.json --days 14
   ```

   The script records each command's SHA-256, so sign on the machine with the exact binary.

3. The tester starts Sia with `SIA_LAB_HARNESS_MANIFEST=/path/to/lab-manifest.json`.

Sia verifies the signature against the same pinned key as update manifests, the expiry, and every
command hash before registering anything. Any failure is logged as `[sia:lab-harness]` and ignored.
The harness then appears as **Lab harness: <name>** in Settings → AI, with its disclosure, and its
models appear in the agent model picker as **· Lab test**. New threads pin `provider: lab` and the
lab's harness id. The lab owns its authentication; Sia passes no Sia or model credential to it.

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
