# Local and cloud execution

The current alpha deliberately ships one complete execution path: an agent runs on the user's Mac, against an explicitly chosen workspace, while Sia and the Mac remain awake. Chrome attachment reuses the user's approved, signed-in Chrome profile. Background-capable actions do not steal focus; actions that cannot prove background delivery stop and ask before any foreground takeover.

The Sia cloud is currently a control plane, not a computer. It provides passwordless invite-only sign-in, managed Gmail/Drive/Slack connections, a Meta relay implementation that is disabled in the alpha client pending authenticated live verification, and opt-in research sync. It does not run a provider CLI, keep project files, retain a browser profile, or schedule turns after the desktop goes offline. The desktop can evaluate persisted local schedules while Sia is open and the Mac is awake.

| Capability                | Local alpha                                       | Sia cloud alpha                                                   |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| Provider runtime          | Codex; Gemini/Grok protocol tests remain disabled | Meta relay implemented, client-disabled pending live verification |
| Project files and tools   | Chosen local workspace                            | Not stored                                                        |
| Authenticated browser     | Approved local Chrome profile                     | Not available                                                     |
| Connected apps            | Invoked through the cloud gateway                 | Managed OAuth and action execution                                |
| Runs after the Mac sleeps | No                                                | No agent runtime                                                  |
| Scheduled turns           | While Sia is open and the Mac is awake            | No offline/always-on scheduler                                    |

## Persistent cloud computer gate

Remote execution is a separate product boundary, not a deployment toggle. The first remote preview must satisfy all of these gates before a UI control is exposed:

- Run in a US region and isolate every user's compute, disk, browser profile, network policy, and runtime credentials.
- Preserve one encrypted workcell per user across tasks. A task may stop compute, but stopping must not silently erase project files or the approved browser profile.
- Give the cloud browser its own profile. It must never copy cookies or credentials from local Chrome. The user signs into each approved site once through a short-lived, authenticated viewing session.
- Keep credentials behind a host-side broker. Providers and model-visible tools receive scoped capabilities, never cloud credentials, cookie stores, or a generic secret API.
- Reuse the same 20 canonical action tools and approval semantics. Do not expose a VM shell, raw browser protocol, cookie API, arbitrary JavaScript execution, or visualization tool as a Sia action.
- Make background and foreground behavior explicit. Scheduled work may use connectors and verified background browser actions; a step that needs visible takeover waits for the user instead of guessing.
- Provide pause, resume, export, and verified deletion for the workcell, disk snapshots, browser profile, logs, backups, connected apps, and identity.
- Meter compute time, persistent storage, browser streaming, egress, connector calls, and model usage separately. Show an estimated ceiling before enabling an always-on or scheduled workcell.
- Pass abuse controls, prompt-injection tests, tenant-isolation tests, backup/deletion restoration tests, and an external security review.

OpenMausBot is useful evidence that a persistent box can make the product feel simple. Its current hosted-box choice is not copied into this alpha because the US-region, tenant-isolation, secret-inheritance, and deletion gates must be independently satisfied. The Sia runtime and ActionGateway are kept host-neutral so a reviewed US workcell can be added without changing the model-visible tool surface.

The dated provider comparison, cost model, and current recommendation are recorded in [cloud-provider-decision.md](./cloud-provider-decision.md).

## Intended routing

When remote execution is ready, an agent will have an explicit location: **This Mac** or **Cloud computer**. Threads pin that location together with the provider, model, workspace, and instructions. Connected-app tools can run from either location. Local Chrome is available only to a local thread; the cloud browser profile is available only to a cloud thread. There is no automatic cookie or workspace synchronization between them.

The release sequence is:

1. Current alpha: local runtime, local authenticated Chrome, cloud connectors, and explicit approvals.
2. Remote preview: manually started US workcell with persistent files and a separately authenticated browser.
3. Cloud-scheduled work: constrained schedules, budgets, notification delivery, and a user-presence queue for foreground steps. This is separate from the app-open local schedules already available in the desktop alpha.
