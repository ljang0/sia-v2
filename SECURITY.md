# Security policy

Sia controls shell processes, local files, signed-in browser sessions, and connected applications. Treat a renderer compromise and model prompt injection as expected threat boundaries, not exceptional cases.

## Product invariants

- The Electron renderer has no Node.js access and cannot invoke shell, filesystem, Keychain, CUA, connector, or cloud APIs directly.
- All Sia-hosted browser, computer, and connector actions pass through the ActionGateway. Provider-native shell, file, public-web, image-inspection, and subagent tools remain inside each official CLI's sandbox and approval boundary; Sia does not claim to enforce those native tools.
- Sia credentials remain in macOS Keychain-backed storage or AWS Secrets Manager; provider authentication remains inside each official CLI. Credentials are never placed in a transcript, tool result, provider-visible environment variable, or renderer state.
- AWS CLI credentials are release-operator credentials only. The desktop never reads the AWS shared
  credentials/config files, receives IAM keys, or exposes the operator's AWS profile through IPC.
- Browser mutations are bound to an attached profile, native window, tab capability, and fresh snapshot (plus an approved origin in ask mode). Ambiguity and stale references refuse. In the default trusted local mode the interactive approval step is skipped for computer/browser actions and each action is written to the local trajectory log instead; connector writes always keep their approval. Trusted mode also enables Chrome's persistent remote-debugging toggle (chrome://inspect) while Chrome is closed so attachment needs no per-session prompt; Chrome's in-session security prompts themselves are never automated.
- Sia itself, detected credential/password-manager apps, Keychain, protected credential fields, known dedicated authentication routes/origins, incognito/private windows, and security settings are denied Sia-hosted computer/browser targets. These are layered deny rules, not a universal classifier for every third-party login UI.
- Connected-app mutations are prepared, previewed, and committed using an expiring digest and idempotency key.
- Raw Gmail, Drive, and Slack payloads are memory-only and excluded from research capture.
- Apple Messages is launched through one dedicated host capability. Sia never reads `chat.db` or
  treats the user's Apple account as an application credential.

## Reporting

Do not open public issues containing credentials or private task data. For the invite alpha, report security concerns directly to the maintainer address supplied with the invitation. Rotate any exposed provider credential immediately.
