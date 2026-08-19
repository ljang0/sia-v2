# Cloud workcell provider decision

Status: architecture decision, 2026-08-13. No remote workcell is enabled in the alpha.

## Decision

Do not copy OpenMausBot's hosted Box deployment for a US launch. Keep the current local execution path while running a gated E2B Desktop spike in a contractually confirmed US region. If E2B cannot meet the residency, verified-deletion, tenant-isolation, and persistent-browser requirements, use an AWS-isolated EC2/EBS workcell even though it carries more operational work.

This decision does not change the product surface. A future remote thread will use the same curated action tools, approval rules, provider adapters, and connector gateway as a local thread. It will not gain a generic VM, cookie, raw browser-protocol, or visualization tool.

## What OpenMausBot demonstrates

[OpenMausBot](https://github.com/milind-soni/OpenMausBot) combines local provider CLIs, Composio, and a hosted [Box](https://box.ascii.dev/) computer. A Box is not a blank image created for every task: it is a preconfigured persistent Ubuntu environment with Chrome and development tools. Stopping it preserves its filesystem and installed services, while ordinary foreground processes must be restarted after resume.

That is a strong interaction model, but not the current Sia backend. Box advertises EU locations, while this product needs a reviewed US execution boundary. Its published default is four shared vCPUs and 8 GB RAM; the current account minimum is $20 per month and includes roughly 555 default-Box hours. Those economics are attractive, but geography and lifecycle controls are release gates rather than pricing tradeoffs.

## Shortlist

| Option                                                        | Persistence and desktop                                                                         | US fit                                                                                               | Cost shape                                                   | Decision                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Box                                                           | Persistent preconfigured Ubuntu, Chrome, and desktop                                            | Hosted regions are EU-only                                                                           | $20/month account minimum; default Box currently $0.036/hour | Do not use for the US alpha                                |
| [E2B Desktop](https://e2b.dev/docs/template/examples/desktop) | Desktop template plus VNC; pause preserves filesystem and process state                         | Require written confirmation and enforcement of the selected US region for every workcell and backup | Usage-based; paid plan may also be required                  | First architecture spike only                              |
| [Modal Sandboxes](https://modal.com/products/sandboxes)       | Persistent volumes are available; persistent personal-desktop lifecycle needs more product work | [US regions are documented](https://modal.com/docs/guide/region-selection)                           | Usage-based with regional multipliers                        | Keep as a compute alternative, not the first desktop spike |
| AWS EC2/EBS                                                   | Full control over instance, encrypted disk, network, snapshots, and browser streaming           | Explicit US-region deployment                                                                        | Compute, EBS, snapshots, streaming, egress, and operations   | Production fallback                                        |

## Cost model

The UI must show separate estimates for active compute, retained disk and snapshots, browser streaming, egress, connector calls, and model/provider usage. A paused machine is not the same as a deleted account.

For example, using [E2B's published usage rates](https://e2b.dev/pricing), a two-vCPU, 4 GiB workcell is approximately:

```text
CPU:  2-vCPU rate                 = $0.1008 / active hour
RAM:  4 GiB x $0.0000045/GB-sec  = $0.0648 / active hour
Total compute                    = $0.1656 / active hour
60 active hours / month          = $9.94 usage
```

This example excludes any plan minimum, storage beyond the included amount, browser streaming, egress, connectors, and model usage. Sia must calculate from the provider's live rates before a paid preview; these numbers are not a customer quote.

## Required spike evidence

Before a **Cloud computer** control appears in the product, the spike must prove:

1. The instance, persistent disk, snapshots, backups, logs, and browser stream stay in an approved US region.
2. Each user has an isolated encrypted workcell and a dedicated cloud browser profile. Local Chrome cookies are never copied; the user signs into approved sites through a short-lived authenticated viewing session.
3. Pause and resume retain the expected filesystem and browser sessions. Delete removes the workcell, snapshots, profile, logs, and backups within a documented window and produces auditable completion.
4. Credentials remain in a host-side broker. The provider CLI and model-visible tools receive expiring capabilities, not infrastructure keys, OAuth refresh tokens, cookies, or a secret-reading API.
5. Scheduled work can use connectors and verified background browser actions. Any step requiring visible foreground takeover waits for the user and sends a notification.
6. Per-user budgets, automatic idle pause, absolute turn TTLs, egress policy, abuse controls, and emergency revocation work under failure testing.
7. Prompt-injection, cross-tenant, backup-restore, deletion, and reconnect tests pass before an external preview.

## Product sequence

- **Now:** local provider runtime, explicitly selected local workspace, approved local Chrome attachment, cloud connector gateway, and exact approvals. The Mac must remain awake.
- **Remote preview:** a manually started US workcell with persistent files and a separately authenticated cloud browser.
- **Scheduled work:** constrained schedules, budgets, notifications, and a user-presence queue for foreground-only steps.
