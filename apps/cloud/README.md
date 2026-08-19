# `@sia/cloud`

Typed, dependency-injected services for the Sia alpha control plane. Domain tests use only in-memory adapters; production composition lives in `src/aws.ts`.

Routes:

- `POST /v1/meta/turns` — authenticated OpenAI-compatible Meta relay as SSE. Prompt/tool payloads are streamed and never persisted or logged.
- `POST|GET|DELETE /v1/connections/{app}` — managed Gmail, Google Drive, and Slack links.
- `POST /v1/actions/prepare` — executes reviewed reads immediately; mutation tools return an expiring preview and digest.
- `POST /v1/actions/commit` — resubmits the exact input. The digest must match and an atomic one-shot claim prevents automatic duplicate writes. No mutation body is stored.
- `POST /v1/connector-files/upload-request` — validates a Drive file descriptor and returns a short-lived Composio presigned `PUT` grant. The desktop uploads bytes directly; provider keys remain cloud-only.
- `POST /v1/research/batches` — accepts only untainted `research_allowed` events under the current consent version.
- `POST /v1/research/export` and `POST|GET /v1/research/delete` — short-lived export and asynchronous research/account deletion.
- `POST|GET /v1/admin/invites` — `Admins` Cognito group only, capped at 20 invitations.

Connector execution results are returned to the authenticated caller in the response and then discarded. Durable connector state is limited to account/tool/timestamp/outcome metadata and opaque provider IDs.

## Pinned connector contract

The control plane accepts Sia's canonical connector fields, rejects unknown or out-of-bounds fields, and explicitly maps them to Composio. It never forwards a canonical input object wholesale. This release is fail-closed to Composio toolkit version `20260721_00` and the exact slugs listed in `src/connector-contract.ts`; changing either requires a schema audit and code update.

Two intentional alpha limits are worth calling out:

- `mail.send` does not accept `thread_id` because the pinned `GMAIL_SEND_EMAIL` tool cannot preserve thread semantics. Drafts may still include `thread_id`.
- `slack.read_thread.resource_id` is the search-result channel ID and root message timestamp joined by a colon, for example `C012ABCDEF:1723500000.000100`.
