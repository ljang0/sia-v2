# `@sia/cloud`

Typed, dependency-injected services for the Sia alpha control plane. Domain tests use only in-memory adapters; production composition lives in `src/aws.ts`.

## Layout

- `src/router.ts` and `src/*lambda.ts` — HTTP routing and the four Lambda entry points bundled by
  `scripts/build-lambdas.mjs`.
- `src/services.ts` — `ServiceDependencies` and `createServices`; each service lives in
  `src/services/` (access checks, accounts, actions, connections, connector files, hosted models,
  voice, research, research admin, release manifests, background workers).
- `src/ports.ts` — interfaces the services depend on. `src/memory.ts` implements them in memory for
  tests; `src/aws.ts` wires the AWS implementations in `src/aws/` (one module per backing service).
- `src/google-workspace.ts`, `src/google-workspace/`, `src/hybrid-connector.ts`, and
  `src/connector-contract.ts` — the Google OAuth connector, the Composio contract, and routing
  between them.
- `src/responses-relay.ts` — the Responses-compatible stream for the desktop's Codex proxy.
- `src/contracts.ts` and `src/domain.ts` — request contracts, errors, and validation helpers.
- `test/` mirrors `src/`; run `pnpm --filter @sia/cloud test`.

Routes:

- `GET /v1/session` — authenticated operator feature policy for research uploads/archive,
  connectors, and schedules.
- `POST /v1/meta/turns` — authenticated OpenAI-compatible Meta relay as SSE. Prompt/tool payloads are streamed and never persisted or logged.
- `POST /v1/responses` — authenticated Responses-compatible stream consumed by the desktop's
  model-scoped Codex loopback proxy. The model-lab key remains server-side.
- `POST|GET|DELETE /v1/connections/{app}` — managed Gmail, Drive, Docs, Sheets, Slides, and Slack links.
- `POST /v1/actions/prepare` — executes reviewed reads immediately; mutation tools return an expiring preview and digest.
- `POST /v1/actions/commit` — resubmits the exact input. The digest must match and an atomic one-shot claim prevents automatic duplicate writes. No mutation body is stored.
- `POST /v1/connector-files/upload-request` — validates a Drive file descriptor and returns a short-lived Composio presigned `PUT` grant. The desktop uploads bytes directly; provider keys remain cloud-only.
- `POST /v1/research/batches` — accepts current-consent raw event bundles with canonical
  participant/thread/turn/sequence metadata and an idempotent content claim.
- `POST|GET /v1/research/export` — creates and polls a queued, integrity-checked multipart export;
  completed downloads use a 15-minute signed link.
- `POST|GET /v1/research/delete` — asynchronous research/account deletion.
- `GET /v1/admin/research/participants|batches|batch` — Cognito `Admins` plus software-token MFA;
  raw reads verify SHA-256/length and all allowed, denied, or failed attempts are immutably audited.
- `POST|GET /v1/admin/invites` — `Admins` Cognito group only, capped at 20 invitations.

Connector execution results are returned to the authenticated caller in the response and then discarded. Durable connector state is limited to account/tool/timestamp/outcome metadata and opaque provider IDs.

## Pinned connector contract

The control plane accepts Sia's canonical connector fields, rejects unknown or out-of-bounds fields, and explicitly maps them to Composio. It never forwards a canonical input object wholesale. This release is fail-closed to the per-tool Composio versions and exact slugs listed in `src/connector-contract.ts`; changing either requires a schema audit and code update. Google editor writes expose bounded, purpose-built fields rather than a raw Google batch-update request surface.

Two intentional alpha limits are worth calling out:

- `mail.send` does not accept `thread_id` because the pinned `GMAIL_SEND_EMAIL` tool cannot preserve thread semantics. Drafts may still include `thread_id`.
- `slack.read_thread.resource_id` is the search-result channel ID and root message timestamp joined by a colon, for example `C012ABCDEF:1723500000.000100`.
