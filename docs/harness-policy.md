# Harness routing and release policy

Sia treats a model provider and an execution harness as separate choices. An agent stores either
`automatic` or an explicit harness preference. A new thread resolves that preference once and
persists the complete `resolvedExecutionTarget`: provider, canonical model, harness, harness model
selector, credential source, and resolution source. Existing threads never silently change route.

The resolver precedence is pinned thread → explicit user preference → authenticated backend default
→ legacy default. Every candidate must also appear in the desktop release allowlist and report ready;
a backend response alone cannot authorize a new executable or credential path. Runtime events carry
the pinned harness and model for audit attribution.

## Current matrix

| Harness          | Protocol                   | Release state        | Credential rule                    |
| ---------------- | -------------------------- | -------------------- | ---------------------------------- |
| Codex App Server | official app-server        | enabled              | included Sia relay or ChatGPT plan |
| Sia direct       | authenticated cloud stream | legacy threads only  | Sia-managed, server-side lab key   |
| Claude Code      | isolated CLI stream        | legacy compatibility | provider-owned Claude subscription |
| OpenCode         | ACP over nd-JSON           | hidden, fail-closed  | no route approved yet              |
| Pi               | JSONL RPC over stdio       | hidden, fail-closed  | no route approved yet              |

OpenCode documents `opencode acp` as an nd-JSON stdin/stdout server and supports explicit permission
configuration, but it also merges global, project, and plugin configuration. Pi documents a strict
LF-delimited RPC mode; its security documentation also states that it has no built-in sandbox and
that non-interactive sessions do not show a trust prompt. Those are useful integration seams, not
release approval by themselves.

## Beta admission checks

Codex compatibility is protocol-specific: a custom model must expose the OpenAI Responses API to
run through Codex app server. OpenCode and Pi support Responses and Chat Completions and document
ChatGPT Plus/Pro login, but each harness owns that OAuth session; Sia does not copy Codex tokens.
See [model lab integration](./model-lab-integration.md) for the catalog and adapter extension path.

OpenCode or Pi can move from disabled Beta to an allowed route only after all of these pass against a
pinned version in a clean macOS profile and an isolated lab worker:

1. Exact model selection, streamed text/reasoning/usage, cancellation, and request correlation.
2. Fresh and resumed session behavior with Sia-owned transcript persistence only.
3. No inherited user/project plugins, extensions, skills, MCP servers, system prompts, or auto-update.
4. Provider credentials remain in their owning service; Sia-managed credentials are short-lived and
   audience-bound. One provider/model route cannot read another route's credential.
5. All model-visible tools are either disabled or cross the same ActionGateway capability and
   approval checks as native harnesses.
6. Workspace confinement, sanitized environment, bounded output, process-tree cancellation, network
   policy, and crash cleanup pass adversarial tests.
7. Normalized events preserve provider/model/harness attribution and contain no tokens or private
   configuration.
8. A real-provider smoke test passes without relying on an interactive trust prompt.

The current release has no admitted OpenCode or Pi adapter. They remain absent from the UI, and the
main process independently rejects a crafted or migrated unapproved route.

## Lab-hosted proprietary harnesses

A backend catalog may recommend a proprietary harness only after its exact route is present in the
signed desktop harness registry. Before first use, Sia must disclose that prompts, selected files/tool
results, and generated output cross the named lab service; what is retained; the retention period;
the subprocess/cloud region; and how deletion works. The user must explicitly accept that disclosure.
The worker receives a task-scoped workspace and expiring capabilities, not a home-directory mount,
browser cookies, provider refresh tokens, AWS credentials, or a generic secret-reading API.

References:

- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode configuration](https://opencode.ai/docs/config)
- [OpenCode permissions](https://opencode.ai/docs/permissions/)
- [Pi RPC mode](https://pi.dev/docs/latest/rpc)
- [Pi security boundary](https://pi.dev/docs/latest/security)
